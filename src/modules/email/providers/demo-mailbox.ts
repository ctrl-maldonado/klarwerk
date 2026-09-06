import type { EmailProvider, NormalizedMessage, OutgoingMessage, SendResult } from "./types";

/**
 * Demo-Postfach (§42).
 * Verbindet sich mit keinem Mailserver. Eingehende Nachrichten kommen aus der
 * Demo-Ablage oder über die Intake-Schnittstelle, ausgehende werden gespeichert,
 * aber ausdrücklich NICHT versendet – das wird an jeder Stelle so ausgewiesen.
 */
export class DemoMailboxProvider implements EmailProvider {
  readonly key = "demo";
  readonly label = "Demo-Postfach (kein echter Versand)";

  async listMessages(): Promise<NormalizedMessage[]> {
    return [];
  }

  async sendMessage(_message: OutgoingMessage): Promise<SendResult> {
    return {
      deliveredExternally: false,
      note: "Demo-Postfach: Die Nachricht wurde gespeichert, aber nicht an einen Mailserver übergeben.",
    };
  }
}
