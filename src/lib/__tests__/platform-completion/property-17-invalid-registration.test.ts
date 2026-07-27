/**
 * Feature: platform-completion, Property 17: Invalid registration is side-effect free
 *
 * For every registration payload carrying a duplicate normalized address, a
 * reserved development identity, or a field outside its required bounds, the
 * Account_Service returns the specified code and creates no user, workspace,
 * membership, or verification token.
 *
 * The real domain service runs against the in-memory account repository and the
 * shared provider fakes with a deterministic clock and a deterministic random
 * source. No test here opens a network connection, sends an email, reaches a
 * database, or mutates a schema.
 *
 * Validates: Requirements 1.2, 1.3, 1.11
 */
import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import {
  REGISTRATION_FIELD_BOUNDS,
  REGISTRATION_FIELD_ORDER,
  createAccountService,
  normalizeAccountEmail,
  validateRegistrationPayload,
  type AccountService,
  type RegistrationFieldPath,
} from "../../account-service";
import {
  isProductionBlockedDevelopmentIdentity,
  isReservedDevelopmentIdentity,
  type IdentityRuntimeEnvironment,
} from "../../production-identities";
import {
  COMPLETION_PROPERTY_MIN_RUNS,
  COMPLETION_PROPERTY_SEED,
  DeterministicClock,
  DeterministicRandomSource,
  completionPropertyOptions,
  createFakeAccountEmailProvider,
  createFakeAccountRepository,
  createRecordingAccountAuditSink,
  permissiveAccountRateLimiter,
  type AccountStoreSnapshot,
  type FakeAccountEmailProvider,
  type FakeAccountRepository,
  type RecordingAccountAuditSink,
} from "../support";

const PROPERTY_TAG =
  "Feature: platform-completion, Property 17: Invalid registration is side-effect free";

const BASE_URL = "https://app.arabclue.test";
const CLOCK_INSTANT = "2026-04-01T08:30:00.000Z";

const DEVELOPMENT_RUNTIME: IdentityRuntimeEnvironment = Object.freeze({
  NODE_ENV: "development",
});

/**
 * Runtimes that `src/lib/production-identities.ts` classifies as production, so
 * a reserved development identity is blocked (criterion 1.3).
 */
const PRODUCTION_RUNTIMES: readonly IdentityRuntimeEnvironment[] = Object.freeze([
  Object.freeze({ NODE_ENV: "production" }),
  Object.freeze({ NODE_ENV: "production", VERCEL: "1" }),
  Object.freeze({ NODE_ENV: "development", VERCEL: "1" }),
]);

/** Reserved development domain owned by `production-identities.ts`. */
const RESERVED_DEVELOPMENT_DOMAIN = "arabclue.local";

/** Address grammar limit enforced by the service on the local part. */
const EMAIL_LOCAL_PART_LIMIT = 64;

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

type Harness = Readonly<{
  service: AccountService;
  repository: FakeAccountRepository;
  email: FakeAccountEmailProvider;
  audit: RecordingAccountAuditSink;
}>;

function createHarness(
  identityEnvironment: IdentityRuntimeEnvironment = DEVELOPMENT_RUNTIME
): Harness {
  const repository = createFakeAccountRepository();
  const email = createFakeAccountEmailProvider({ kind: "sent" });
  const audit = createRecordingAccountAuditSink();
  const service = createAccountService({
    repository,
    email,
    audit,
    rateLimiter: permissiveAccountRateLimiter,
    clock: new DeterministicClock(CLOCK_INSTANT),
    randomness: new DeterministicRandomSource(0x17c0de),
    randomUuid: new DeterministicRandomSource(0x17aa).randomUUID,
    identityEnvironment,
    baseUrl: BASE_URL,
  });

  return { service, repository, email, audit };
}

/**
 * Asserts the rejection left no trace: the four collections are identical to the
 * pre-call snapshot, the transactional write was never attempted, no message was
 * produced, and no audit entry was appended.
 */
function expectNoSideEffect(harness: Harness, before: AccountStoreSnapshot): void {
  const after = harness.repository.snapshot();

  expect(after).toEqual(before);
  // Serialized comparison catches a mutated timestamp or a reordered row that a
  // structural comparison of cloned records could otherwise tolerate.
  expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  expect(after.users).toHaveLength(before.users.length);
  expect(after.workspaces).toHaveLength(before.workspaces.length);
  expect(after.members).toHaveLength(before.members.length);
  expect(after.tokens).toHaveLength(before.tokens.length);

  expect(harness.repository.createAccountCalls).toHaveLength(0);
  expect(harness.email.messages).toHaveLength(0);
  expect(harness.audit.entries).toHaveLength(0);
}

/* -------------------------------------------------------------------------- */
/* Payload shaping                                                            */
/* -------------------------------------------------------------------------- */

/** A submitted field is either absent from the payload or carries a value. */
type SubmittedField = Readonly<{ omit: true }> | Readonly<{ value: unknown }>;

const OMITTED: SubmittedField = Object.freeze({ omit: true });

function submitted(value: unknown): SubmittedField {
  return { value };
}

function buildPayload(
  fields: Readonly<Record<RegistrationFieldPath, SubmittedField>>
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of REGISTRATION_FIELD_ORDER) {
    const submittedField = fields[field];
    if ("value" in submittedField) payload[field] = submittedField.value;
  }
  return payload;
}

/* -------------------------------------------------------------------------- */
/* Generators                                                                 */
/* -------------------------------------------------------------------------- */

const LOWER_ALPHANUMERIC = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
const LATIN_LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
const ARABIC_LETTERS = "ابتثجحخدذرزسشصضطظعغفقكلمنهوي".split("");
const PASSWORD_CHARACTERS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&*-_".split(
    ""
  );
const WHITESPACE_PADS = ["", " ", "  ", "\t", "\n", " \t "] as const;

const joined = (characters: readonly string[]): string => characters.join("");

const emailLocalPart = fc
  .array(fc.constantFrom(...LOWER_ALPHANUMERIC), { minLength: 1, maxLength: 12 })
  .map(joined);

const emailDomain = fc
  .tuple(
    fc
      .array(fc.constantFrom(...LOWER_ALPHANUMERIC), {
        minLength: 1,
        maxLength: 10,
      })
      .map(joined),
    fc.constantFrom("com", "net", "sa", "example", "test")
  )
  .map(([label, suffix]) => `${label}.${suffix}`);

/** Well-formed, in-bounds address that is never a reserved identity. */
const validEmailAddress = fc
  .tuple(emailLocalPart, emailDomain)
  .map(([local, domain]) => `${local}@${domain}`)
  .filter(
    (address) =>
      address.length >= REGISTRATION_FIELD_BOUNDS.email.min &&
      address.length <= REGISTRATION_FIELD_BOUNDS.email.max
  );

const reservedEmailAddress = emailLocalPart.map(
  (local) => `${local}@${RESERVED_DEVELOPMENT_DOMAIN}`
);

/**
 * Case and surrounding-whitespace variant of one address, so the normalization
 * the uniqueness and reserved checks rely on is genuinely exercised.
 */
function addressVariant(address: string): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }),
      fc.constantFrom(...WHITESPACE_PADS),
      fc.constantFrom(...WHITESPACE_PADS)
    )
    .map(([mask, leading, trailing]) => {
      const cased = [...address]
        .map((character, index) =>
          mask[index % mask.length] ? character.toUpperCase() : character
        )
        .join("");
      return `${leading}${cased}${trailing}`;
    });
}

const validPassword = fc
  .array(fc.constantFrom(...PASSWORD_CHARACTERS), {
    minLength: REGISTRATION_FIELD_BOUNDS.password.min,
    maxLength: 40,
  })
  .map(joined);

const validDisplayText = fc.oneof(
  fc
    .array(fc.constantFrom(...LATIN_LETTERS), { minLength: 2, maxLength: 40 })
    .map(joined),
  fc
    .array(fc.constantFrom(...ARABIC_LETTERS), { minLength: 2, maxLength: 40 })
    .map(joined)
);

/** `locale` is optional: absent and null both select the Arabic default. */
const validLocaleField = fc.constantFrom<SubmittedField>(
  submitted("ar"),
  submitted("en"),
  submitted(null),
  OMITTED
);

const sourceAddress = fc.constantFrom<string | null | undefined>(
  "203.0.113.5",
  "198.51.100.24",
  "2001:db8::1",
  null,
  undefined
);

const nonStringValue = fc.constantFrom<unknown>(7, true, 3.5, {}, [], null);
const blankText = fc.constantFrom("", " ", "   ", "\t", "\n  ");

/** Addresses inside the length bounds that fail format validation. */
const MALFORMED_ADDRESSES: readonly string[] = Object.freeze([
  "no-at-symbol",
  "double..dot@example.com",
  "@example.com",
  "user@",
  "user@.example.com",
  "user@example..com",
  "user@exam ple.com",
  "us er@example.com",
  "user@example.com.",
  "user@-example.com",
  "user@example",
  `${"l".repeat(EMAIL_LOCAL_PART_LIMIT + 1)}@example.com`,
]);

/** Well-formed address of an exact total length, used for the 254-character bound. */
function wellFormedAddressOfLength(totalLength: number): string {
  const local = "a".repeat(EMAIL_LOCAL_PART_LIMIT);
  const suffix = ".example";
  const labelLength = totalLength - local.length - 1 - suffix.length;
  return `${local}@${"b".repeat(labelLength)}${suffix}`;
}

const overLongAddress = wellFormedAddressOfLength(
  REGISTRATION_FIELD_BOUNDS.email.max + 1
);

const invalidEmailField = fc.oneof(
  fc.constant(OMITTED),
  nonStringValue.map(submitted),
  blankText.map(submitted),
  fc.constant(
    submitted("a".repeat(REGISTRATION_FIELD_BOUNDS.email.min - 1))
  ),
  fc.constant(submitted(overLongAddress)),
  fc.constant(submitted(`  ${overLongAddress}\t`)),
  fc.constantFrom(...MALFORMED_ADDRESSES).map(submitted)
);

const invalidPasswordField = fc.oneof(
  fc.constant(OMITTED),
  nonStringValue.map(submitted),
  fc
    .array(fc.constantFrom(...PASSWORD_CHARACTERS), {
      maxLength: REGISTRATION_FIELD_BOUNDS.password.min - 1,
    })
    .map((characters) => submitted(joined(characters))),
  fc
    .array(fc.constantFrom(...PASSWORD_CHARACTERS), {
      minLength: REGISTRATION_FIELD_BOUNDS.password.max + 1,
      maxLength: REGISTRATION_FIELD_BOUNDS.password.max + 8,
    })
    .map((characters) => submitted(joined(characters)))
);

/** Shared by `name` and `workspaceName`, whose bounds are identical. */
function invalidTrimmedTextField(
  bounds: Readonly<{ min: number; max: number }>
): fc.Arbitrary<SubmittedField> {
  return fc.oneof(
    fc.constant(OMITTED),
    nonStringValue.map(submitted),
    blankText.map(submitted),
    fc
      .array(fc.constantFrom(...LATIN_LETTERS), {
        minLength: 1,
        maxLength: bounds.min - 1,
      })
      .map((characters) => submitted(joined(characters))),
    fc.constant(submitted("n".repeat(bounds.max + 1))),
    // Padded so the offence exists only after trimming.
    fc.constant(submitted(`  ${"n".repeat(bounds.max + 1)}  `)),
    fc.constant(submitted(` \t${"n".repeat(bounds.min - 1)}\n `))
  );
}

const invalidLocaleField = fc.oneof(
  fc
    .constantFrom("fr", "AR", "EN", "en-US", "ar-SA", "arabic", " ar ", "", "en ")
    .map(submitted),
  fc.constantFrom<unknown>(7, true, 1.5, {}, []).map(submitted)
);

type FieldPlan = Readonly<{ offending: boolean; field: SubmittedField }>;

function fieldPlan(
  valid: fc.Arbitrary<SubmittedField>,
  invalid: fc.Arbitrary<SubmittedField>
): fc.Arbitrary<FieldPlan> {
  return fc.oneof(
    valid.map((field) => ({ offending: false, field })),
    invalid.map((field) => ({ offending: true, field }))
  );
}

const validEmailSubmission = validEmailAddress.chain((address) =>
  addressVariant(address)
);

/** Every field independently valid or invalid, with at least one offender. */
const invalidPayloadPlan = fc
  .record({
    email: fieldPlan(validEmailSubmission.map(submitted), invalidEmailField),
    password: fieldPlan(validPassword.map(submitted), invalidPasswordField),
    name: fieldPlan(
      validDisplayText.map(submitted),
      invalidTrimmedTextField(REGISTRATION_FIELD_BOUNDS.name)
    ),
    workspaceName: fieldPlan(
      validDisplayText.map(submitted),
      invalidTrimmedTextField(REGISTRATION_FIELD_BOUNDS.workspaceName)
    ),
    locale: fieldPlan(validLocaleField, invalidLocaleField),
  })
  .filter((plan) =>
    REGISTRATION_FIELD_ORDER.some((field) => plan[field].offending)
  );

const validSupportingFields = fc.record({
  password: validPassword.map(submitted),
  name: validDisplayText.map(submitted),
  workspaceName: validDisplayText.map(submitted),
  locale: validLocaleField,
});

/** Payloads that are not objects at all, so every required field is missing. */
const nonObjectPayload = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.string({ maxLength: 20 }),
  fc.integer(),
  fc.boolean(),
  fc.array(fc.string({ maxLength: 8 }), { maxLength: 3 })
);

/* -------------------------------------------------------------------------- */
/* Properties                                                                 */
/* -------------------------------------------------------------------------- */

describe(PROPERTY_TAG, () => {
  describe("generator guarantees", () => {
    test("every randomized property runs at least 100 generated cases", () => {
      expect(completionPropertyOptions().numRuns).toBeGreaterThanOrEqual(
        COMPLETION_PROPERTY_MIN_RUNS
      );
      expect(COMPLETION_PROPERTY_MIN_RUNS).toBeGreaterThanOrEqual(100);
    });

    test("every generated valid address is accepted and is never reserved", () => {
      const samples = fc.sample(validEmailSubmission, {
        numRuns: 200,
        seed: COMPLETION_PROPERTY_SEED,
      });

      for (const address of samples) {
        expect(isReservedDevelopmentIdentity(address)).toBe(false);
        expect(
          validateRegistrationPayload({
            email: address,
            password: "correct horse battery",
            name: "Nora",
            workspaceName: "Bid Desk",
          }).ok
        ).toBe(true);
      }
    });

    test("every generated reserved address is classified reserved", () => {
      const samples = fc.sample(
        reservedEmailAddress.chain((address) => addressVariant(address)),
        { numRuns: 200, seed: COMPLETION_PROPERTY_SEED }
      );

      for (const address of samples) {
        expect(isReservedDevelopmentIdentity(address)).toBe(true);
        for (const runtime of PRODUCTION_RUNTIMES) {
          expect(
            isProductionBlockedDevelopmentIdentity(
              normalizeAccountEmail(address),
              runtime
            )
          ).toBe(true);
        }
      }
    });

    test("the length fixtures sit exactly on either side of the address bound", () => {
      const atBound = wellFormedAddressOfLength(
        REGISTRATION_FIELD_BOUNDS.email.max
      );

      expect(atBound).toHaveLength(REGISTRATION_FIELD_BOUNDS.email.max);
      expect(overLongAddress).toHaveLength(
        REGISTRATION_FIELD_BOUNDS.email.max + 1
      );
      expect(
        validateRegistrationPayload({
          email: atBound,
          password: "correct horse battery",
          name: "Nora",
          workspaceName: "Bid Desk",
        }).ok
      ).toBe(true);
      expect(
        validateRegistrationPayload({
          email: overLongAddress,
          password: "correct horse battery",
          name: "Nora",
          workspaceName: "Bid Desk",
        })
      ).toEqual({ ok: false, fieldPaths: ["email"] });
    });

    test("every malformed address fixture offends only the email field", () => {
      for (const address of MALFORMED_ADDRESSES) {
        expect(address.length).toBeGreaterThanOrEqual(
          REGISTRATION_FIELD_BOUNDS.email.min
        );
        expect(address.length).toBeLessThanOrEqual(
          REGISTRATION_FIELD_BOUNDS.email.max
        );
        expect(
          validateRegistrationPayload({
            email: address,
            password: "correct horse battery",
            name: "Nora",
            workspaceName: "Bid Desk",
          })
        ).toEqual({ ok: false, fieldPaths: ["email"] });
      }
    });
  });

  describe("Requirement 1.11: an out-of-bounds or malformed payload creates nothing", () => {
    test("returns 400 REGISTRATION_INVALID naming every offending field and changes nothing", async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidPayloadPlan,
          sourceAddress,
          async (plan, address) => {
            const expectedFieldPaths = REGISTRATION_FIELD_ORDER.filter(
              (field) => plan[field].offending
            );
            const payload = buildPayload({
              email: plan.email.field,
              password: plan.password.field,
              name: plan.name.field,
              workspaceName: plan.workspaceName.field,
              locale: plan.locale.field,
            });

            const harness = createHarness();
            const before = harness.repository.snapshot();

            const result = await harness.service.register({
              payload,
              sourceAddress: address,
            });

            expect(result).toEqual({
              ok: false,
              status: 400,
              code: "REGISTRATION_INVALID",
              fieldPaths: expectedFieldPaths,
            });
            expect(harness.repository.isEmpty()).toBe(true);
            expectNoSideEffect(harness, before);
          }
        ),
        completionPropertyOptions()
      );
    });

    test("returns 400 REGISTRATION_INVALID naming every required field for a non-object payload", async () => {
      await fc.assert(
        fc.asyncProperty(
          nonObjectPayload,
          sourceAddress,
          async (payload, address) => {
            const harness = createHarness();
            const before = harness.repository.snapshot();

            const result = await harness.service.register({
              payload,
              sourceAddress: address,
            });

            expect(result).toEqual({
              ok: false,
              status: 400,
              code: "REGISTRATION_INVALID",
              fieldPaths: ["email", "password", "name", "workspaceName"],
            });
            expect(harness.repository.isEmpty()).toBe(true);
            expectNoSideEffect(harness, before);
          }
        ),
        completionPropertyOptions()
      );
    });
  });

  describe("Requirement 1.2: a duplicate normalized address creates nothing", () => {
    test("returns 409 EMAIL_ALREADY_REGISTERED and leaves every existing record unchanged", async () => {
      const duplicateCase = validEmailAddress.chain((address) =>
        fc.record({
          normalizedAddress: fc.constant(normalizeAccountEmail(address)),
          seededAddress: addressVariant(address),
          submittedAddress: addressVariant(address),
          unrelatedAddresses: fc.uniqueArray(validEmailAddress, {
            maxLength: 3,
          }),
          supporting: validSupportingFields,
          sourceAddress,
        })
      );

      await fc.assert(
        fc.asyncProperty(duplicateCase, async (generated) => {
          const harness = createHarness();
          const seeded = harness.repository.seedUser({
            email: generated.seededAddress,
            emailVerified: false,
          });

          // Unrelated records make "every existing record unchanged" load-bearing.
          for (const unrelated of generated.unrelatedAddresses) {
            if (
              normalizeAccountEmail(unrelated) === generated.normalizedAddress
            ) {
              continue;
            }
            const neighbour = harness.repository.seedUser({ email: unrelated });
            harness.repository.seedVerificationToken({
              userId: neighbour.id,
              tokenHash: `hash-${neighbour.id}`,
              hashSalt: `salt-${neighbour.id}`,
              hashVersion: 1,
              createdAt: new Date(CLOCK_INSTANT),
              expiresAt: new Date(
                new Date(CLOCK_INSTANT).getTime() + 24 * 60 * 60 * 1000
              ),
            });
          }

          const payload = buildPayload({
            email: submitted(generated.submittedAddress),
            ...generated.supporting,
          });
          // The payload itself is valid, so the rejection can only come from the
          // uniqueness check rather than from field validation.
          expect(validateRegistrationPayload(payload).ok).toBe(true);

          const before = harness.repository.snapshot();
          expect(
            before.users.some(
              (user) => user.email === generated.normalizedAddress
            )
          ).toBe(true);

          const result = await harness.service.register({
            payload,
            sourceAddress: generated.sourceAddress,
          });

          expect(result).toEqual({
            ok: false,
            status: 409,
            code: "EMAIL_ALREADY_REGISTERED",
          });
          expectNoSideEffect(harness, before);
          expect(
            harness.repository.snapshot().users.map((user) => user.id)
          ).toContain(seeded.id);
        }),
        completionPropertyOptions()
      );
    });
  });

  describe("Requirement 1.3: a reserved development identity creates nothing", () => {
    test("returns 400 RESERVED_IDENTITY in a production runtime and changes nothing", async () => {
      const reservedCase = reservedEmailAddress.chain((address) =>
        fc.record({
          submittedAddress: addressVariant(address),
          runtime: fc.constantFrom(...PRODUCTION_RUNTIMES),
          supporting: validSupportingFields,
          sourceAddress,
        })
      );

      await fc.assert(
        fc.asyncProperty(reservedCase, async (generated) => {
          const harness = createHarness(generated.runtime);
          const payload = buildPayload({
            email: submitted(generated.submittedAddress),
            ...generated.supporting,
          });
          expect(validateRegistrationPayload(payload).ok).toBe(true);

          const before = harness.repository.snapshot();

          const result = await harness.service.register({
            payload,
            sourceAddress: generated.sourceAddress,
          });

          expect(result).toEqual({
            ok: false,
            status: 400,
            code: "RESERVED_IDENTITY",
          });
          expect(harness.repository.isEmpty()).toBe(true);
          expectNoSideEffect(harness, before);
        }),
        completionPropertyOptions()
      );
    });

    test("reports RESERVED_IDENTITY rather than the duplicate when both conditions hold", async () => {
      const reservedAndSeededCase = reservedEmailAddress.chain((address) =>
        fc.record({
          normalizedAddress: fc.constant(normalizeAccountEmail(address)),
          seededAddress: addressVariant(address),
          submittedAddress: addressVariant(address),
          runtime: fc.constantFrom(...PRODUCTION_RUNTIMES),
          supporting: validSupportingFields,
          sourceAddress,
        })
      );

      await fc.assert(
        fc.asyncProperty(reservedAndSeededCase, async (generated) => {
          const harness = createHarness(generated.runtime);
          harness.repository.seedUser({ email: generated.seededAddress });

          const payload = buildPayload({
            email: submitted(generated.submittedAddress),
            ...generated.supporting,
          });
          expect(validateRegistrationPayload(payload).ok).toBe(true);

          const before = harness.repository.snapshot();
          // The uniqueness condition genuinely holds, so the assertion below
          // proves criterion 1.3 is evaluated before criterion 1.2.
          expect(
            await harness.repository.findUserIdByNormalizedEmail(
              generated.normalizedAddress
            )
          ).not.toBeNull();

          const result = await harness.service.register({
            payload,
            sourceAddress: generated.sourceAddress,
          });

          expect(result).toEqual({
            ok: false,
            status: 400,
            code: "RESERVED_IDENTITY",
          });
          expectNoSideEffect(harness, before);
        }),
        completionPropertyOptions()
      );
    });
  });
});
