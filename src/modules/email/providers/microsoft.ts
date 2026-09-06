import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { EmailProvider, NormalizedMessage, OAuthTokens, OutgoingMessage, SendResult } from "./types";

const GRAPH = "https://graph.microsoft.com/v1.0";

export const MICROSOFT_SCOPES = [
  "offline_access",
  "User.Read",
  "Mail.Read",
  "Mail.Send",
  "Calendars.ReadWrite",
];

export function microsoftAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: env.microsoft.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: MICROSOFT_SCOPES.join(" "),
    state,
  });
  return `https://login.microsoftonline.com/${env.microsoft.tenantId}/oauth2/v2.0/authorize?${params}`;
}

async function tokenRequest(body: Record<string, string>): Promise<OAuthTokens> {
  const response = await fetch(
    `https://login.microsoftonline.com/${env.microsoft.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.microsoft.clientId,
        client_secret: env.microsoft.clientSecret,
        ...body,
      }),
    },
  );
  if (!response.ok) {
    throw new AppError(`Microsoft-Anmeldung fehlgeschlagen: ${(await response.text()).slice(0, 300)}`, 502, "integration_error");
  }
  const payload = (await response.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };
}

export function exchangeMicrosoftCode(code: string, redirectUri: string): Promise<OAuthTokens> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export function refreshMicrosoftToken(refreshToken: string): Promise<OAuthTokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export class MicrosoftGraphProvider implements EmailProvider {
  readonly key = "microsoft365";
  readonly label = "Microsoft 365";

  constructor(private readonly accessToken: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${GRAPH}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new AppError(
        `Microsoft Graph antwortete mit ${response.status}: ${(await response.text()).slice(0, 300)}`,
        502,
        "integration_error",
      );
    }
    if (response.status === 202 || response.status === 204) return {} as T;
    return (await response.json()) as T;
  }

  async listMessages(options: { since?: Date; limit?: number }): Promise<NormalizedMessage[]> {
    const filter = options.since ? `&$filter=receivedDateTime ge ${options.since.toISOString()}` : "";
    const payload = await this.request<{ value: any[] }>(
      `/me/mailFolders/inbox/messages?$top=${options.limit ?? 25}&$orderby=receivedDateTime desc${filter}`,
    );
    return payload.value.map((message) => ({
      externalId: message.id,
      threadId: message.conversationId,
      fromName: message.from?.emailAddress?.name ?? "",
      fromEmail: message.from?.emailAddress?.address ?? "",
      to: (message.toRecipients ?? []).map((r: any) => r.emailAddress.address),
      cc: (message.ccRecipients ?? []).map((r: any) => r.emailAddress.address),
      subject: message.subject ?? "",
      bodyText: message.body?.contentType === "text" ? message.body.content : stripHtml(message.body?.content ?? ""),
      bodyHtml: message.body?.contentType === "html" ? message.body.content : undefined,
      receivedAt: new Date(message.receivedDateTime),
      attachments: (message.attachments ?? []).map((a: any) => ({
        filename: a.name,
        mimeType: a.contentType,
        size: a.size ?? 0,
      })),
    }));
  }

  async sendMessage(message: OutgoingMessage): Promise<SendResult> {
    await this.request("/me/sendMail", {
      method: "POST",
      body: JSON.stringify({
        message: {
          subject: message.subject,
          body: { contentType: "Text", content: message.bodyText },
          toRecipients: message.to.map((address) => ({ emailAddress: { address } })),
          ccRecipients: (message.cc ?? []).map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: true,
      }),
    });
    return { deliveredExternally: true };
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
