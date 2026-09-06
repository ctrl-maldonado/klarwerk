import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { EmailProvider, NormalizedMessage, OAuthTokens, OutgoingMessage, SendResult } from "./types";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
  "openid",
  "email",
];

export function googleAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: env.google.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(body: Record<string, string>): Promise<OAuthTokens> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      ...body,
    }),
  });
  if (!response.ok) {
    throw new AppError(`Google-Anmeldung fehlgeschlagen: ${(await response.text()).slice(0, 300)}`, 502, "integration_error");
  }
  const payload = (await response.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };
}

export function exchangeGoogleCode(code: string, redirectUri: string): Promise<OAuthTokens> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export function refreshGoogleToken(refreshToken: string): Promise<OAuthTokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export class GmailProvider implements EmailProvider {
  readonly key = "google";
  readonly label = "Google Workspace";

  constructor(private readonly accessToken: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
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
        `Gmail antwortete mit ${response.status}: ${(await response.text()).slice(0, 300)}`,
        502,
        "integration_error",
      );
    }
    return (await response.json()) as T;
  }

  async listMessages(options: { since?: Date; limit?: number }): Promise<NormalizedMessage[]> {
    const query = options.since ? `&q=after:${Math.floor(options.since.getTime() / 1000)}` : "";
    const list = await this.request<{ messages?: Array<{ id: string }> }>(
      `/messages?maxResults=${options.limit ?? 25}&labelIds=INBOX${query}`,
    );

    const messages: NormalizedMessage[] = [];
    for (const entry of list.messages ?? []) {
      const detail = await this.request<any>(`/messages/${entry.id}?format=full`);
      const headers: Record<string, string> = Object.fromEntries(
        (detail.payload?.headers ?? []).map((header: any) => [header.name.toLowerCase(), header.value]),
      );
      const from = parseAddress(headers.from ?? "");
      messages.push({
        externalId: detail.id,
        threadId: detail.threadId,
        fromName: from.name,
        fromEmail: from.email,
        to: splitAddresses(headers.to ?? ""),
        cc: splitAddresses(headers.cc ?? ""),
        subject: headers.subject ?? "",
        bodyText: extractBody(detail.payload),
        receivedAt: new Date(Number(detail.internalDate)),
        attachments: collectAttachments(detail.payload),
      });
    }
    return messages;
  }

  async sendMessage(message: OutgoingMessage): Promise<SendResult> {
    const raw = [
      `To: ${message.to.join(", ")}`,
      message.cc?.length ? `Cc: ${message.cc.join(", ")}` : "",
      `Subject: ${encodeHeader(message.subject)}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      message.bodyText,
    ]
      .filter(Boolean)
      .join("\r\n");

    const result = await this.request<{ id: string }>("/messages/send", {
      method: "POST",
      body: JSON.stringify({ raw: Buffer.from(raw, "utf8").toString("base64url") }),
    });
    return { externalId: result.id, deliveredExternally: true };
  }
}

function encodeHeader(value: string): string {
  return /[^\x20-\x7E]/.test(value) ? `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=` : value;
}

function parseAddress(value: string): { name: string; email: string } {
  const match = value.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: "", email: value.trim() };
}

function splitAddresses(value: string): string[] {
  return value
    .split(",")
    .map((entry) => parseAddress(entry).email)
    .filter(Boolean);
}

function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf8");
  }
  for (const part of payload.parts ?? []) {
    const text = extractBody(part);
    if (text) return text;
  }
  return "";
}

function collectAttachments(payload: any): Array<{ filename: string; mimeType: string; size: number }> {
  const result: Array<{ filename: string; mimeType: string; size: number }> = [];
  const walk = (part: any) => {
    if (!part) return;
    if (part.filename) {
      result.push({ filename: part.filename, mimeType: part.mimeType ?? "application/octet-stream", size: part.body?.size ?? 0 });
    }
    (part.parts ?? []).forEach(walk);
  };
  walk(payload);
  return result;
}
