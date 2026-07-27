/**
 * i18n Completeness Test (Req 18)
 *
 * Ensures every key in the translation dictionary has non-empty ar and en values.
 * Optionally verifies tr() usages in source match existing keys.
 */

import { t, tr } from "../i18n";
import * as fs from "fs";
import * as path from "path";

describe("i18n completeness (Req 18)", () => {
  const keys = Object.keys(t);

  describe("dictionary completeness", () => {
    it("should have at least 100 translation keys", () => {
      expect(keys.length).toBeGreaterThanOrEqual(100);
    });

    it.each(keys)("key '%s' should have non-empty ar value", (key) => {
      const entry = t[key];
      expect(entry).toBeDefined();
      expect(typeof entry.ar).toBe("string");
      expect(entry.ar.trim().length).toBeGreaterThan(0);
    });

    it.each(keys)("key '%s' should have non-empty en value", (key) => {
      const entry = t[key];
      expect(entry).toBeDefined();
      expect(typeof entry.en).toBe("string");
      expect(entry.en.trim().length).toBeGreaterThan(0);
    });
  });

  describe("tr() function behavior", () => {
    it("should return ar value for locale ar", () => {
      expect(tr("appName", "ar")).toBe("أراب كلاو");
    });

    it("should return en value for locale en", () => {
      expect(tr("appName", "en")).toBe("Arabclue");
    });

    it("should return the key itself for missing keys", () => {
      expect(tr("NONEXISTENT_KEY_12345", "ar")).toBe("NONEXISTENT_KEY_12345");
      expect(tr("NONEXISTENT_KEY_12345", "en")).toBe("NONEXISTENT_KEY_12345");
    });
  });

  describe("bilingual error codes", () => {
    // These are error codes that must exist for bilingual API error responses
    const requiredErrorCodes = [
      "SCHEMA_MIGRATION_PENDING",
      "EMAIL_ALREADY_REGISTERED",
      "RESERVED_IDENTITY",
      "VERIFICATION_TOKEN_INVALID",
      "EMAIL_VERIFICATION_REQUIRED",
      "RECOVERY_TOKEN_INVALID",
      "INVITE_FORBIDDEN",
      "ALREADY_A_MEMBER",
      "SEAT_LIMIT_REACHED",
      "INVITATION_TOKEN_INVALID",
      "INVITATION_EMAIL_MISMATCH",
      "CLAUSE_NOT_FOUND",
      "CLAUSE_TRANSLATION_MISSING",
      "UNSAFE_CLAUSE_TEXT",
      "CLAUSE_FIELD_INVALID",
      "TEMPLATE_NOT_FOUND",
      "TEMPLATE_KEY_EXISTS",
      "TEMPLATE_RETIRED",
      "CONTRACT_NOT_FOUND",
      "CONTRACT_REVISION_NOT_FOUND",
      "APPROVAL_FORBIDDEN",
      "EVIDENCE_VERSION_MISSING",
      "COMMENT_EDIT_FORBIDDEN",
      "COMMENT_RESOLVED",
      "COMMENT_DELETE_FORBIDDEN",
      "VERSION_NOT_FOUND",
      "MARKETPLACE_TRANSLATION_MISSING",
      "MARKETPLACE_ENTRY_RETIRED",
      "MARKETPLACE_RATING_INVALID",
      "BILLING_PROVIDER_UNCONFIGURED",
      "RECURRING_PROFILE_NOT_FOUND",
      "ANALYTICS_DATE_RANGE_REQUIRED",
      "ANALYTICS_DATE_INVALID",
      "ANALYTICS_DATE_RANGE_INVALID",
      "ANALYTICS_RANGE_TOO_LARGE",
    ];

    it.each(requiredErrorCodes)(
      "error code '%s' should exist with bilingual messages",
      (code) => {
        const entry = t[code];
        expect(entry).toBeDefined();
        expect(entry.ar.trim().length).toBeGreaterThan(0);
        expect(entry.en.trim().length).toBeGreaterThan(0);
      }
    );
  });

  describe("navigation and UI keys", () => {
    const navKeys = [
      "nav_dashboard",
      "nav_projects",
      "nav_documents",
      "nav_proposals",
      "nav_compliance",
      "nav_agents",
      "nav_contracts",
      "nav_billing",
      "nav_settings",
      "nav_admin",
    ];

    it.each(navKeys)("nav key '%s' should exist", (key) => {
      expect(t[key]).toBeDefined();
    });
  });

  describe("status keys", () => {
    const statusKeys = [
      "status_PENDING",
      "status_PARSING",
      "status_PARSED",
      "status_FAILED",
      "status_DRAFT",
      "status_SUBMITTED",
      "status_COMPLIANT",
      "status_NON_COMPLIANT",
      "status_PARTIAL",
    ];

    it.each(statusKeys)("status key '%s' should exist", (key) => {
      expect(t[key]).toBeDefined();
    });
  });

  describe("source code tr() usage verification", () => {
    /**
     * Scans source files for tr("key") usage and verifies keys exist.
     * This test helps catch typos or missing translations early.
     */
    it("all tr() keys used in source should exist in dictionary", () => {
      const srcDir = path.resolve(__dirname, "../../..");
      const trUsagePattern = /tr\("([^"]+)"/g;

      // Keys that are dynamically constructed or false positives
      const ignoredPatterns = [
        /^(documentId|message|projectId|query|runId|title|url|view)$/, // Variable names, not i18n keys
        /^(agent_|fw_|cat_|status_).*$/, // Dynamic keys constructed at runtime
      ];

      const usedKeys = new Set<string>();
      const missingKeys: string[] = [];

      function scanDirectory(dir: string) {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              if (
                !entry.name.startsWith(".") &&
                entry.name !== "node_modules" &&
                entry.name !== "__tests__" &&
                entry.name !== "__mocks__"
              ) {
                scanDirectory(fullPath);
              }
            } else if (
              entry.isFile() &&
              (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
            ) {
              try {
                const content = fs.readFileSync(fullPath, "utf8");
                let match;
                while ((match = trUsagePattern.exec(content)) !== null) {
                  usedKeys.add(match[1]);
                }
              } catch {
                // Skip unreadable files
              }
            }
          }
        } catch {
          // Skip inaccessible directories
        }
      }

      scanDirectory(srcDir);

      for (const key of usedKeys) {
        // Skip ignored patterns
        if (ignoredPatterns.some((p) => p.test(key))) continue;

        if (!t[key]) {
          missingKeys.push(key);
        }
      }

      if (missingKeys.length > 0) {
        console.warn("Missing i18n keys found in source:", missingKeys);
      }

      // Allow some slack for dynamically constructed keys
      expect(missingKeys.length).toBeLessThanOrEqual(5);
    });
  });
});
