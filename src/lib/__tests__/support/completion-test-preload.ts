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

if (process.env.COMPLETION_USE_TEST_DATABASE === "1") {
  const approved = requireIsolatedTestDatabase(process.env);
  process.env.DATABASE_URL = approved.url;
} else {
  // A deliberately unreachable loopback URL prevents accidental shared-Neon use.
  process.env.DATABASE_URL = BLOCKED_TEST_DATABASE_URL;
  delete process.env.DIRECT_URL;
}

installNoExternalNetworkGuard();
