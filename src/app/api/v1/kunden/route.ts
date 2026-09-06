import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantDb } from "@/lib/tenant-db";
import { customerDisplayName, nextCustomerNumber, searchCustomers } from "@/modules/customers/service";
import { apiError, authenticateRequest, requireScope } from "@/modules/api/auth";
import { writeAudit } from "@/modules/audit";
import { dispatchWebhook } from "@/modules/webhooks";

export async function GET(request: Request) {
  try {
    const caller = await authenticateRequest(request);
    requireScope(caller, "customers:read");
    const url = new URL(request.url);
    const customers = await searchCustomers(caller.tenantId, url.searchParams.get("q") ?? "", 100);
    return NextResponse.json({
      data: customers.map((customer) => ({
        id: customer.id,
        customerNumber: customer.customerNumber,
        name: customerDisplayName(customer),
        email: customer.email,
        phone: customer.phone,
        street: customer.street,
        zip: customer.zip,
        city: customer.city,
        createdAt: customer.createdAt,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

const createSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  companyName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  street: z.string().optional(),
  zip: z.string().optional(),
  city: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const caller = await authenticateRequest(request);
    requireScope(caller, "customers:write");

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "invalid_payload", message: parsed.error.issues[0].message } }, { status: 400 });
    }

    const customer = await tenantDb(caller.tenantId).customer.create({
      data: {
        tenantId: caller.tenantId,
        customerNumber: await nextCustomerNumber(caller.tenantId),
        type: parsed.data.companyName ? "COMPANY" : "PERSON",
        companyName: parsed.data.companyName ?? null,
        firstName: parsed.data.firstName ?? null,
        lastName: parsed.data.lastName ?? null,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        street: parsed.data.street ?? null,
        zip: parsed.data.zip ?? null,
        city: parsed.data.city ?? null,
        source: "api",
      },
    });

    await writeAudit({
      tenantId: caller.tenantId,
      actorType: caller.via === "api_key" ? "INTEGRATION" : "USER",
      actorUserId: caller.userId ?? null,
      actorLabel: caller.label,
      action: "create_customer",
      entityType: "customer",
      entityId: customer.id,
      details: { via: caller.via },
    });
    await dispatchWebhook(caller.tenantId, "customer.created", { customerId: customer.id });

    return NextResponse.json({ data: customer }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
