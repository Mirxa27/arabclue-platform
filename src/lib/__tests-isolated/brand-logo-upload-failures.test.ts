/**
 * Six English literals on the one upload a bidder does by hand.
 *
 * `POST /api/brand/logo` is reached from `brand-setup.tsx`, which read
 * `data.error` straight into a toast description. So every rejection on this
 * route — wrong file type, corrupt image, no brand profile — surfaced to an
 * Arabic-first user as an English sentence in a red box, and the route had no
 * `try/catch` at all, meaning a malformed multipart body produced Next's own
 * untranslated 500 instead.
 *
 * The avatar route answers all four of its image checks with `INVALID_REQUEST`.
 * Following that here would have traded a specific English sentence for a vague
 * bilingual one ("طلب غير صالح" / "Invalid request"), which is a worse answer to
 * someone whose 12 MB TIFF was rejected. Two codes carry the two facts a user
 * can act on: the file is the wrong kind, or the file will not decode.
 *
 * `image.mimeType !== file.type` and an undecodable buffer share
 * `LOGO_IMAGE_UNREADABLE` on purpose — a mislabeled image and a corrupt one call
 * for the same thing from the reader, which is to re-export it.
 */

import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

type BrandProfile = { id: string } | null;

let brandProfile: BrandProfile = { id: "brand-1" };
let role = "OWNER";
let hasSession = true;

let routePost: typeof import("@/app/api/brand/logo/route").POST;

beforeAll(async () => {
  // No mock for `@/lib/brand-logo` or `@/lib/storage`: the undecodable case is
  // driven with bytes that are genuinely not an image, so the real validator
  // rejects them, and nothing here reaches the happy path that would need
  // `sharp` or a writable upload directory.
  mock.module("@/lib/db", () => ({
    db: {
      user: { findUnique: mock(async () => ({ emailVerified: new Date() })) },
      brandProfile: { update: mock(async () => ({ id: "brand-1" })) },
      auditLog: { create: mock(async (args: unknown) => args) },
    },
  }));

  const auth = await import("@/lib/auth");
  mock.module("@/lib/auth", () => ({
    ...auth,
    requireSession: mock(async () =>
      hasSession
        ? { user: { id: "owner-1", role, emailVerified: new Date() } }
        : null
    ),
  }));

  const workspaceContext = await import("@/lib/workspace-context");
  mock.module("@/lib/workspace-context", () => ({
    ...workspaceContext,
    getTenantContext: mock(async () => ({
      workspace: { id: "ws-1" },
      brandProfile,
      userId: "owner-1",
      membershipRole: "OWNER",
    })),
  }));

  ({ POST: routePost } = await import("@/app/api/brand/logo/route"));
});

beforeEach(() => {
  brandProfile = { id: "brand-1" };
  role = "OWNER";
  hasSession = true;
});

function post(form: FormData) {
  return routePost(
    new NextRequest("http://localhost:3000/api/brand/logo", {
      method: "POST",
      body: form,
    })
  );
}

/**
 * Never start fixture bytes with `0x00`.
 *
 * Bun 1.3.9 round-trips a `FormData` body through `Request.formData()` with the
 * part silently emptied when its content begins with a NUL — the parsed `File`
 * keeps its `type` but comes back `size: 0`, `name: undefined`, zero bytes. That
 * looks exactly like a route bug (it reads as "wrong size" three checks later)
 * and it is not one; Node, which is what runs in production, parses it fine.
 * Every buffer below is therefore non-NUL-leading on purpose.
 */
function upload(bytes: Uint8Array, name: string, type: string) {
  const form = new FormData();
  form.append("file", new File([bytes], name, { type }));
  return post(form);
}

/** Every failure on this route reaches a human, so none of them may be one language. */
async function bilingualBody(res: Response) {
  const body = await res.json();
  expect(body.message.ar).not.toBe(body.message.en);
  expect(body.message.ar.length).toBeGreaterThan(0);
  return body;
}

describe("POST /api/brand/logo failures", () => {
  test("a missing file names the field it wanted", async () => {
    const res = await post(new FormData());
    expect(res.status).toBe(400);

    const body = await bilingualBody(res);
    expect(body.code).toBe("REQUEST_VALIDATION_FAILED");
    expect(body.message.en).toContain("file");
  });

  test("a non-image file type is rejected with the accepted types", async () => {
    const res = await upload(
      new Uint8Array([1, 2, 3]),
      "logo.txt",
      "text/plain"
    );
    expect(res.status).toBe(400);

    const body = await bilingualBody(res);
    expect(body.code).toBe("LOGO_IMAGE_TYPE_UNSUPPORTED");
    // The old English sentence named PNG/JPEG/WebP and 8 MiB. Converting it to a
    // generic "invalid request" would be a downgrade, so the replacement has to
    // keep telling the reader what to upload instead.
    expect(body.message.en).toContain("PNG");
    expect(body.message.ar).toContain("PNG");
  });

  test("bytes that are not a decodable image are rejected as unreadable", async () => {
    // `%PDF` — a real magic number, just not one of the three this route takes.
    // It reaches `validateAndNormalizeLogoImage` for real, which compares the
    // `.png` extension against the bytes and refuses.
    const res = await upload(
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      "logo.png",
      "image/png"
    );
    expect(res.status).toBe(400);

    const body = await bilingualBody(res);
    expect(body.code).toBe("LOGO_IMAGE_UNREADABLE");
  });

  test("an oversize image names the 8 MiB limit rather than failing to decode", async () => {
    // The size gate sits ahead of the decoder so this answers "too big" instead
    // of "could not be read", which tells a user with a 12 MB photo nothing.
    const res = await upload(
      new Uint8Array(8 * 1024 * 1024 + 1).fill(0x41),
      "logo.png",
      "image/png"
    );
    expect(res.status).toBe(400);
    expect((await bilingualBody(res)).code).toBe("LOGO_IMAGE_TYPE_UNSUPPORTED");
  });

  test("a workspace with no brand profile fails on that, not on the file", async () => {
    brandProfile = null;
    const res = await upload(new Uint8Array([1]), "logo.png", "image/png");
    expect(res.status).toBe(400);

    const body = await bilingualBody(res);
    expect(body.code).toBe("NO_BRAND_PROFILE");
  });

  test("an absent session is 401, not 403", async () => {
    // The old handler called `requireWriter`, which returns null both for no
    // session and for a REVIEWER, so it answered 403 to everyone. A caller whose
    // session simply expired was told they lacked permission.
    hasSession = false;
    const res = await upload(new Uint8Array([1]), "logo.png", "image/png");
    expect(res.status).toBe(401);
    expect((await bilingualBody(res)).code).toBe("AUTHENTICATION_REQUIRED");
  });

  test("a reviewer is 403", async () => {
    role = "REVIEWER";
    const res = await upload(new Uint8Array([1]), "logo.png", "image/png");
    expect(res.status).toBe(403);
    expect((await bilingualBody(res)).code).toBe("WORKSPACE_ROLE_FORBIDDEN");
  });
});
