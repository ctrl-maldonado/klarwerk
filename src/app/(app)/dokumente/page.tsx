import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/modules/auth/context";
import { tenantDb } from "@/lib/tenant-db";
import { customerDisplayName } from "@/modules/customers/service";
import { Badge, Card, CardBody, CardHeader, ConfidenceBar, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { DocumentUpload } from "@/components/app/document-upload";

export const metadata: Metadata = { title: "Dokumente" };


export default async function DocumentsPage() {
  const context = await requireOnboarded();
  context.assert("documents:read");
  const db = tenantDb(context.tenant.id);

  const [documents, customers, orders] = await Promise.all([
    db.document.findMany({ include: { customer: true, order: true, uploadedBy: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.customer.findMany({ where: { deletedAt: null }, orderBy: { lastName: "asc" }, take: 200 }),
    db.order.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);

  return (
    <>
      <PageHeader title="Dokumente" description="Angebote, Rechnungen, Fotos und Anhänge. Klarwerk liest aus, was auslesbar ist." />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="Ablage" description={`${documents.length} Dokumente`} />
            {documents.length ? (
              <CardBody className="divide-y divide-ink-100 px-0 py-0">
                {documents.map((document) => {
                  const extraction = (document.aiExtraction as Record<string, any> | null) ?? null;
                  return (
                    <div key={document.id} className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <a href={`/api/dokumente/${document.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                          {document.filename}
                        </a>
                        <span className="text-xs text-ink-500">
                          {formatDate(document.createdAt)} · {Math.round(document.size / 1024)} kB
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                        {document.customer ? (
                          <Link href={`/kunden/${document.customer.id}`} className="hover:underline">
                            {customerDisplayName(document.customer)}
                          </Link>
                        ) : null}
                        {document.order ? (
                          <Link href={`/auftraege/${document.order.id}`} className="hover:underline">
                            {document.order.orderNumber}
                          </Link>
                        ) : null}
                        {extraction?.documentType ? <Badge tone="brand">{extraction.documentType}</Badge> : null}
                      </div>
                      {extraction?.summary ? <p className="mt-1 text-sm text-ink-600">{extraction.summary}</p> : null}
                      {extraction?.note ? <p className="mt-1 text-xs text-amber-700">{extraction.note}</p> : null}
                      {extraction?.error ? <p className="mt-1 text-xs text-red-600">{extraction.error}</p> : null}
                      {typeof document.aiConfidence === "number" ? (
                        <div className="mt-1">
                          <ConfidenceBar value={document.aiConfidence} label="Vertrauen" />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </CardBody>
            ) : (
              <EmptyState title="Noch keine Dokumente" description="Laden Sie ein Angebot, eine Rechnung oder ein Foto hoch." />
            )}
          </Card>
        </div>

        <aside>
          {context.can("documents:write") ? (
            <Card>
              <CardHeader title="Dokument hochladen" description="PDF, Word, Bild, CSV oder Text – bis 20 MB." />
              <CardBody>
                <DocumentUpload
                  customers={customers.map((customer) => ({ id: customer.id, name: customerDisplayName(customer) }))}
                  orders={orders.map((order) => ({
                    id: order.id,
                    label: `${order.orderNumber} – ${order.title}`,
                    customerId: order.customerId,
                  }))}
                />
              </CardBody>
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}
