/** Fehler, die bewusst nach außen sichtbar sind (§28: AI darf nie still scheitern). */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code: string = "bad_request",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Nicht angemeldet.") {
    super(message, 401, "unauthorized");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Keine Berechtigung für diese Aktion.") {
    super(message, 403, "forbidden");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Nicht gefunden.") {
    super(message, 404, "not_found");
  }
}

export class TenantIsolationError extends AppError {
  constructor(message = "Zugriff auf fremde Mandantendaten wurde blockiert.") {
    super(message, 403, "tenant_isolation");
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Zu viele Anfragen. Bitte kurz warten.") {
    super(message, 429, "rate_limited");
  }
}

export class AIProviderNotConfiguredError extends AppError {
  constructor(message = "AI provider not configured.") {
    super(message, 503, "ai_provider_not_configured");
  }
}
