/** E-Mail-Integrationen (§24). Jede Anbindung ist isoliert und austauschbar. */

export interface NormalizedMessage {
  externalId: string;
  threadId?: string;
  fromName: string;
  fromEmail: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  receivedAt: Date;
  attachments: Array<{ filename: string; mimeType: string; size: number }>;
}

export interface OutgoingMessage {
  to: string[];
  cc?: string[];
  subject: string;
  bodyText: string;
  inReplyToExternalId?: string;
}

export interface SendResult {
  externalId?: string;
  /** false = die Nachricht wurde nicht an einen echten Mailserver übergeben. */
  deliveredExternally: boolean;
  note?: string;
}

export interface EmailProvider {
  readonly key: string;
  readonly label: string;
  listMessages(options: { since?: Date; limit?: number }): Promise<NormalizedMessage[]>;
  sendMessage(message: OutgoingMessage): Promise<SendResult>;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}
