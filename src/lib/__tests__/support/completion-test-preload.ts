import {
  clearProviderCredentials,
  installNoExternalNetworkGuard,
} from "./provider-mocks";
import {
  BLOCKED_TEST_DATABASE_URL,
  requireIsolatedTestDatabase,
} from "./test-database";

process.env.TZ = "UTC";
clearProviderCredentials(process.env);
// Keep completion suites on the real verification path even when a local .env
// temporarily sets SKIP_EMAIL_VERIFICATION for interactive development.
// Force an explicit off value — Bun may re-expose deleted keys from .env.
delete process.env.SKIP_EMAIL_VERIFICATION;
process.env.SKIP_EMAIL_VERIFICATION = "false";

if (process.env.COMPLETION_USE_TEST_DATABASE === "1") {
  const approved = requireIsolatedTestDatabase(process.env);
  process.env.DATABASE_URL = approved.url;
} else {
  // A deliberately unreachable loopback URL prevents accidental shared-Neon use.
  process.env.DATABASE_URL = BLOCKED_TEST_DATABASE_URL;
  delete process.env.DIRECT_URL;
}

installNoExternalNetworkGuard();
