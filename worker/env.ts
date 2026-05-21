// Load .env.local for the worker process. Next.js does this automatically for
// API routes; the worker is a plain Node process so we have to load explicitly.
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, "..", ".env.local") });

// Hard fail if ANTHROPIC_API_KEY is set. The whole point of this worker is to
// use the user's Max plan via OAuth (stored in macOS Keychain by the `claude`
// CLI). If an API key is present, the SDK will silently prefer it and bill
// the API — exactly what we're trying to stop.
if (process.env.ANTHROPIC_API_KEY) {
  console.error(
    "[worker] ANTHROPIC_API_KEY is set in the environment. Remove it from " +
      ".env.local and your shell — this worker must authenticate via the " +
      "Claude Code Max session, not an API key.",
  );
  process.exit(1);
}

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"] as const;
for (const k of REQUIRED) {
  if (!process.env[k]) {
    console.error(`[worker] missing required env var: ${k}`);
    process.exit(1);
  }
}
