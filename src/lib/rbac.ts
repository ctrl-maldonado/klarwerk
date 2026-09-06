import { ForbiddenError } from "./errors";

/**
 * Berechtigungen (§6, §29). Format: "<bereich>:<aktion>".
 * "*" = alles, "<bereich>:*" = alles in einem Bereich.
 */
export const PERMISSIONS = [
  "customers:read",
  "customers:write",
  "customers:delete",
  "orders:read",
  "orders:write",
  "orders:delete",
  "emails:read",
  "emails:write",
  "emails:send",
  "calendar:read",
  "calendar:write",
  "documents:read",
  "documents:write",
  "documents:delete",
  "tasks:read",
  "tasks:write",
  "workflows:read",
  "workflows:write",
  "ai:use",
  "ai:approve",
  "ai:configure",
  "integrations:read",
  "integrations:write",
  "users:read",
  "users:write",
  "settings:read",
  "settings:write",
  "analytics:read",
  "audit:read",
  "billing:read",
  "billing:write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type RoleKey = "owner" | "admin" | "office_manager" | "employee" | "technician";

export interface RoleDefinition {
  key: RoleKey;
  name: string;
  description: string;
  permissions: string[];
}

export const SYSTEM_ROLES: RoleDefinition[] = [
  {
    key: "owner",
    name: "Inhaber",
    description: "Vollzugriff auf alle Bereiche des Unternehmens.",
    permissions: ["*"],
  },
  {
    key: "admin",
    name: "Administrator",
    description: "Verwaltet Benutzer, Integrationen, Automationen und Einstellungen.",
    permissions: [
      "customers:*",
      "orders:*",
      "emails:*",
      "calendar:*",
      "documents:*",
      "tasks:*",
      "workflows:*",
      "ai:use",
      "ai:approve",
      "ai:configure",
      "integrations:*",
      "users:*",
      "settings:*",
      "analytics:read",
      "audit:read",
      "billing:read",
    ],
  },
  {
    key: "office_manager",
    name: "Büroleitung",
    description: "Bearbeitet Kunden, Aufträge, E-Mails, Termine und AI-Vorschläge.",
    permissions: [
      "customers:read",
      "customers:write",
      "orders:read",
      "orders:write",
      "emails:read",
      "emails:write",
      "emails:send",
      "calendar:read",
      "calendar:write",
      "documents:read",
      "documents:write",
      "tasks:read",
      "tasks:write",
      "workflows:read",
      "ai:use",
      "ai:approve",
      "analytics:read",
      "settings:read",
    ],
  },
  {
    key: "employee",
    name: "Mitarbeiter",
    description: "Eingeschränkter Zugriff auf das Tagesgeschäft.",
    permissions: [
      "customers:read",
      "orders:read",
      "orders:write",
      "emails:read",
      "calendar:read",
      "documents:read",
      "tasks:read",
      "tasks:write",
      "ai:use",
    ],
  },
  {
    key: "technician",
    name: "Techniker",
    description: "Sieht die eigenen Aufträge und Termine.",
    permissions: ["customers:read", "orders:read", "calendar:read", "documents:read", "tasks:read"],
  },
];

export function grantsPermission(granted: string[], required: string): boolean {
  if (granted.includes("*")) return true;
  if (granted.includes(required)) return true;
  const [area] = required.split(":");
  return granted.includes(`${area}:*`);
}

export function hasPermission(granted: string[], required: string | string[]): boolean {
  const list = Array.isArray(required) ? required : [required];
  return list.every((permission) => grantsPermission(granted, permission));
}

export function hasAnyPermission(granted: string[], required: string[]): boolean {
  return required.some((permission) => grantsPermission(granted, permission));
}

export function assertPermission(granted: string[], required: string | string[]): void {
  if (!hasPermission(granted, required)) {
    const missing = (Array.isArray(required) ? required : [required]).filter(
      (permission) => !grantsPermission(granted, permission),
    );
    throw new ForbiddenError(`Keine Berechtigung: ${missing.join(", ")}`);
  }
}

/** Expandiert "<bereich>:*" für die Anzeige in der Oberfläche. */
export function expandPermissions(granted: string[]): string[] {
  if (granted.includes("*")) return [...PERMISSIONS];
  return PERMISSIONS.filter((permission) => grantsPermission(granted, permission));
}
