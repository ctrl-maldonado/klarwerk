import { config } from "dotenv";

config({ path: ".env" });

(process.env as Record<string, string>).NODE_ENV ??= "test";
process.env.ENCRYPTION_KEY ??= "test-encryption-key-mindestens-32-zeichen-lang";
process.env.SESSION_SECRET ??= "test-session-secret-mindestens-32-zeichen-lang";
