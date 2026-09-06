import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/modules/auth/context";
import { searchCustomers, customerDisplayName } from "@/modules/customers/service";
import { Button, Card, CardBody, EmptyState, PageHeader, inputClass } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Kunden" };


export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const context = await requireOnboarded();
  context.assert("customers:read");
  const { q } = await searchParams;
  const customers = await searchCustomers(context.tenant.id, q ?? "", 100);

  return (
    <>
      <PageHeader
        title="Kunden"
        description="Alle Kundenstammdaten des Betriebs."
        action={
          <form role="search" className="flex w-full gap-2 sm:w-96">
            <label htmlFor="kundensuche" className="sr-only">
              Kunden durchsuchen
            </label>
            <input
              id="kundensuche"
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="Name, E-Mail, Ort oder Nummer"
              className={cn(inputClass, "flex-1")}
            />
            <Button type="submit" variant="secondary">
              Suchen
            </Button>
          </form>
        }
      />

      <Card>
        {customers.length ? (
          <CardBody className="divide-y divide-ink-100 px-0 py-0">
            {customers.map((customer) => (
              <Link key={customer.id} href={`/kunden/${customer.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition hover:bg-ink-50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{customerDisplayName(customer)}</p>
                  <p className="truncate text-xs text-ink-500">
                    {[customer.street, `${customer.zip ?? ""} ${customer.city ?? ""}`.trim()].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end text-xs text-ink-500">
                  <span className="tabular-nums">{customer.customerNumber}</span>
                  <span>{customer.email ?? customer.phone ?? ""}</span>
                  <span className="text-ink-500">seit {formatDate(customer.createdAt)}</span>
                </div>
              </Link>
            ))}
          </CardBody>
        ) : (
          <EmptyState title="Keine Kunden gefunden" description="Passen Sie die Suche an oder legen Sie einen Kunden über eine Anfrage an." />
        )}
      </Card>
    </>
  );
}
