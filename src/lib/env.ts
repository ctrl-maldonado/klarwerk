/** Zentrale, typisierte Konfiguration. Wird nur serverseitig importiert. */

function optional(key: string, fallback = ""): string {
  return process.env[key]?.trim() || fallback;
}

function required(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Fehlende Umgebungsvariable: ${key}`);
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get appUrl() {
    return optional("APP_URL", "http://localhost:3000");
  },
  get nodeEnv() {
    return optional("NODE_ENV", "development");
  },
  get isProduction() {
    return this.nodeEnv === "production";
  },
  get encryptionKey() {
    return required("ENCRYPTION_KEY");
  },
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
  openai: {
    get apiKey() {
      return optional("OPENAI_API_KEY");
    },
    get baseUrl() {
      return optional("OPENAI_BASE_URL", "https://api.openai.com/v1");
    },
    get model() {
      return optional("OPENAI_MODEL", "gpt-4o-mini");
    },
  },
  anthropic: {
    get apiKey() {
      return optional("ANTHROPIC_API_KEY");
    },
    /** Leer = Standardadresse des SDK. */
    get baseUrl() {
      return optional("ANTHROPIC_BASE_URL");
    },
    get model() {
      return optional("ANTHROPIC_MODEL", "claude-opus-5");
    },
    /** low | medium | high | xhigh | max. Leer = Vorgabe der API. */
    get effort() {
      return optional("ANTHROPIC_EFFORT", "low");
    },
    /** "aus" schaltet das Nachdenken ab. Bei Werkzeugaufrufen wirkungslos. */
    get thinking() {
      return optional("ANTHROPIC_THINKING", "an") !== "aus";
    },
    /** Stille Wiederholungen bei Rate-Limit und Serverfehler. */
    get maxRetries() {
      const value = Number(optional("ANTHROPIC_MAX_RETRIES", "1"));
      return Number.isFinite(value) && value >= 0 ? value : 1;
    },
    /** Obergrenze je Anfrage in Sekunden. */
    get timeoutMs() {
      const value = Number(optional("ANTHROPIC_TIMEOUT_SECONDS", "60"));
      return (Number.isFinite(value) && value > 0 ? value : 60) * 1000;
    },
  },
  microsoft: {
    get clientId() {
      return optional("MICROSOFT_CLIENT_ID");
    },
    get clientSecret() {
      return optional("MICROSOFT_CLIENT_SECRET");
    },
    get tenantId() {
      return optional("MICROSOFT_TENANT_ID", "common");
    },
    get configured() {
      return Boolean(this.clientId && this.clientSecret);
    },
  },
  google: {
    get clientId() {
      return optional("GOOGLE_CLIENT_ID");
    },
    get clientSecret() {
      return optional("GOOGLE_CLIENT_SECRET");
    },
    get configured() {
      return Boolean(this.clientId && this.clientSecret);
    },
  },
  storage: {
    get endpoint() {
      return optional("S3_ENDPOINT");
    },
    get bucket() {
      return optional("S3_BUCKET");
    },
    get region() {
      return optional("S3_REGION", "eu-central-1");
    },
    get accessKeyId() {
      return optional("S3_ACCESS_KEY_ID");
    },
    get secretAccessKey() {
      return optional("S3_SECRET_ACCESS_KEY");
    },
    get configured() {
      return Boolean(this.endpoint && this.bucket && this.accessKeyId);
    },
  },
  get redisUrl() {
    return optional("REDIS_URL");
  },
  stripe: {
    get secretKey() {
      return optional("STRIPE_SECRET_KEY");
    },
    get webhookSecret() {
      return optional("STRIPE_WEBHOOK_SECRET");
    },
    get configured() {
      return Boolean(this.secretKey);
    },
  },
  get platformAdminEmails(): string[] {
    return optional("PLATFORM_ADMIN_EMAILS")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
  },
};
