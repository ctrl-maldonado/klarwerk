import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { AI_ACTIONS } from "@/modules/ai/action-catalog";
import { WEBHOOK_EVENTS } from "@/modules/webhooks";

/** OpenAPI-Beschreibung der öffentlichen Schnittstelle (§25). */
export function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Klarwerk API",
      version: "1.0.0",
      description:
        "Schnittstelle für Kunden, Aufträge, Termine, Freigaben und den Nachrichteneingang. Authentifizierung über Bearer-Token (API-Schlüssel des Betriebs) oder die angemeldete Sitzung.",
    },
    servers: [{ url: `${env.appUrl}/api` }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    },
    paths: {
      "/health": {
        get: { summary: "Systemzustand", security: [], responses: { "200": { description: "OK" } } },
      },
      "/v1/kunden": {
        get: {
          summary: "Kunden suchen",
          parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "Liste der Kunden" } },
        },
        post: { summary: "Kunde anlegen", responses: { "201": { description: "Angelegt" } } },
      },
      "/v1/auftraege": {
        get: {
          summary: "Aufträge abrufen",
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "priority", in: "query", schema: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] } },
            { name: "offen", in: "query", schema: { type: "boolean" } },
          ],
          responses: { "200": { description: "Liste der Aufträge" } },
        },
      },
      "/v1/termine": {
        get: {
          summary: "Termine abrufen oder freie Zeitfenster suchen",
          parameters: [
            { name: "frei", in: "query", schema: { type: "boolean" } },
            { name: "dauer", in: "query", schema: { type: "integer" } },
            { name: "plz", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "Termine oder Zeitfenster" } },
        },
      },
      "/v1/freigaben": {
        get: { summary: "Offene Freigaben", responses: { "200": { description: "Liste" } } },
      },
      "/intake/email": {
        post: {
          summary: "Eingehende Nachricht übergeben",
          description: "Nimmt Nachrichten aus fremden Systemen entgegen und stößt die Verarbeitung an.",
          responses: { "202": { description: "Zur Verarbeitung angenommen" } },
        },
      },
      "/dokumente/{id}": {
        get: { summary: "Dokument herunterladen", responses: { "200": { description: "Datei" } } },
      },
      "/datenschutz/export": {
        get: { summary: "Datenexport des Betriebs (DSGVO)", responses: { "200": { description: "JSON-Export" } } },
      },
    },
    "x-klarwerk-ai-actions": AI_ACTIONS.map((action) => ({
      key: action.key,
      name: action.name,
      riskLevel: action.riskLevel,
      requiredPermission: action.requiredPermission,
      readOnly: Boolean(action.readOnly),
    })),
    "x-klarwerk-webhook-events": WEBHOOK_EVENTS,
  };

  return NextResponse.json(spec);
}
