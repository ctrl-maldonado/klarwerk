import type { Metadata } from "next";
import { requireOnboarded } from "@/modules/auth/context";
import { tenantDb } from "@/lib/tenant-db";
import { expandPermissions } from "@/lib/rbac";
import { Badge, Button, Card, CardBody, CardHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { UserForm } from "./user-form";
import { deactivateUserAction } from "../actions";

export const metadata: Metadata = { title: "Team" };


export default async function TeamSettingsPage() {
  const context = await requireOnboarded();
  const db = tenantDb(context.tenant.id);

  const [users, roles, employees] = await Promise.all([
    db.user.findMany({ include: { role: true }, orderBy: { createdAt: "asc" } }),
    db.role.findMany({ orderBy: { key: "asc" } }),
    db.employee.findMany({ orderBy: { lastName: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Benutzer" description={`${users.length} Konten in diesem Betrieb.`} />
        <CardBody className="divide-y divide-ink-100 px-0 py-0">
          {users.map((user) => (
            <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink-800">{user.name}</span>
                  <Badge tone="info">{user.role?.name ?? "ohne Rolle"}</Badge>
                  {!user.isActive ? <Badge tone="neutral">deaktiviert</Badge> : null}
                </div>
                <p className="text-xs text-ink-500">
                  {user.email}
                  {user.lastLoginAt ? ` · zuletzt angemeldet ${formatDate(user.lastLoginAt)}` : " · noch nie angemeldet"}
                </p>
              </div>
              {context.can("users:write") && user.id !== context.user.id ? (
                <form action={deactivateUserAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    {user.isActive ? "Deaktivieren" : "Aktivieren"}
                  </Button>
                </form>
              ) : null}
            </div>
          ))}
        </CardBody>
      </Card>

      {context.can("users:write") ? (
        <Card>
          <CardHeader title="Benutzer anlegen" />
          <CardBody>
            <UserForm roles={roles.map((role) => ({ key: role.key, name: role.name }))} />
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Rollen und Rechte" />
        <CardBody className="space-y-3">
          {roles.map((role) => (
            <div key={role.id} className="rounded-lg border border-ink-200 px-4 py-3">
              <p className="text-sm font-medium text-ink-900">{role.name}</p>
              <p className="text-xs text-ink-500">{role.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {expandPermissions(role.permissions).map((permission) => (
                  <span key={permission} className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600">
                    {permission}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Mitarbeitende im Einsatz" description="Grundlage für die Terminplanung." />
        <CardBody className="divide-y divide-ink-100 px-0 py-0">
          {employees.map((employee) => (
            <div key={employee.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-ink-800">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: employee.color }} />
                  {employee.firstName} {employee.lastName}
                </p>
                <p className="text-xs text-ink-500">
                  {employee.jobTitle}
                  {employee.skills.length ? ` · ${employee.skills.join(", ")}` : ""}
                  {employee.regions.length ? ` · PLZ ${employee.regions.join(", ")}` : ""}
                </p>
              </div>
              <Badge tone={employee.isActive ? "success" : "neutral"}>{employee.isActive ? "aktiv" : "inaktiv"}</Badge>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
