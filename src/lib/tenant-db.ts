import { prisma } from "./db";
import { TenantIsolationError } from "./errors";

/**
 * Tenant-Isolation (§5, §51.1).
 *
 * Alle mandantenbezogenen Abfragen laufen über diesen Scope. Er injiziert
 * `tenantId` in jedes where/create/update und weigert sich, einen abweichenden
 * Tenant zu akzeptieren. Direkter `prisma.*`-Zugriff auf Mandantendaten ist
 * außerhalb von Seed/Worker-Bootstrap nicht vorgesehen.
 */

const TENANT_MODELS = [
  "customer",
  "customerContact",
  "order",
  "orderStatus",
  "appointment",
  "email",
  "emailAttachment",
  "emailCategory",
  "document",
  "task",
  "employee",
  "absence",
  "businessHour",
  "workflow",
  "workflowRun",
  "aIExecution",
  "aIProviderConfig",
  "aIAction",
  "approvalRequest",
  "integration",
  "auditLog",
  "notification",
  "usageRecord",
  "customField",
  "customFieldValue",
  "user",
  "role",
  "job",
  "webhookEndpoint",
  "apiKey",
  "supportAccessGrant",
  "industryProfile",
  "promptTemplate",
  "evaluationCase",
] as const satisfies readonly (keyof typeof prisma)[];

export type TenantModel = (typeof TENANT_MODELS)[number];

type AnyRecord = Record<string, unknown>;

function mergeWhere(where: unknown, tenantId: string): AnyRecord {
  const base = (where ?? {}) as AnyRecord;
  if ("tenantId" in base && base.tenantId !== tenantId) {
    throw new TenantIsolationError(
      `Abfrage enthielt tenantId=${String(base.tenantId)}, erlaubt ist ${tenantId}.`,
    );
  }
  return { ...base, tenantId };
}

function mergeData(data: unknown, tenantId: string): unknown {
  if (Array.isArray(data)) return data.map((entry) => mergeData(entry, tenantId));
  const base = (data ?? {}) as AnyRecord;
  if ("tenantId" in base && base.tenantId !== tenantId) {
    throw new TenantIsolationError(
      `Schreibvorgang enthielt tenantId=${String(base.tenantId)}, erlaubt ist ${tenantId}.`,
    );
  }
  return { ...base, tenantId };
}

const READ_OPS = new Set(["findMany", "findFirst", "count", "aggregate", "groupBy"]);
const WHERE_ONLY_OPS = new Set(["findUnique", "findUniqueOrThrow", "findFirstOrThrow", "delete", "deleteMany"]);

function wrapDelegate(model: TenantModel, tenantId: string) {
  const delegate = (prisma as unknown as Record<string, AnyRecord>)[model];
  if (!delegate) throw new Error(`Unbekanntes Modell: ${model}`);

  return new Proxy(delegate, {
    get(target, prop: string) {
      const original = target[prop];
      if (typeof original !== "function") return original;

      return (args: AnyRecord = {}) => {
        const call = original as (a: AnyRecord) => unknown;

        if (READ_OPS.has(prop) || WHERE_ONLY_OPS.has(prop)) {
          // findUnique erlaubt keine beliebigen Felder im where – dort filtern wir nach.
          if (prop === "findUnique" || prop === "findUniqueOrThrow") {
            const result = call({ ...args }) as Promise<AnyRecord | null>;
            return result.then((record) => {
              if (record && record.tenantId && record.tenantId !== tenantId) {
                throw new TenantIsolationError();
              }
              return record;
            });
          }
          return call({ ...args, where: mergeWhere(args.where, tenantId) });
        }

        if (prop === "create") {
          return call({ ...args, data: mergeData(args.data, tenantId) });
        }
        if (prop === "createMany" || prop === "createManyAndReturn") {
          return call({ ...args, data: mergeData(args.data, tenantId) });
        }
        if (prop === "update" || prop === "updateMany") {
          return call({ ...args, where: mergeWhere(args.where, tenantId) });
        }
        if (prop === "upsert") {
          return call({
            ...args,
            where: mergeWhere(args.where, tenantId),
            create: mergeData(args.create, tenantId),
          });
        }
        return call(args);
      };
    },
  });
}

/**
 * Die Delegates behalten ihre vollständigen Prisma-Typen, damit `include`/`select`
 * weiterhin typsicher sind. `tenantId` wird zur Laufzeit ergänzt bzw. geprüft.
 */
export type TenantScope = Pick<typeof prisma, TenantModel> & {
  tenantId: string;
  raw: typeof prisma;
};

const scopeCache = new Map<string, TenantScope>();

/** Liefert einen mandantengebundenen Datenbank-Zugriff. */
export function tenantDb(tenantId: string): TenantScope {
  if (!tenantId) throw new TenantIsolationError("tenantId fehlt.");
  const cached = scopeCache.get(tenantId);
  if (cached) return cached;

  const scope = { tenantId, raw: prisma } as unknown as TenantScope;
  for (const model of TENANT_MODELS) {
    Object.defineProperty(scope, model, {
      value: wrapDelegate(model, tenantId),
      enumerable: true,
    });
  }
  scopeCache.set(tenantId, scope);
  return scope;
}

/** Prüft, dass ein geladener Datensatz wirklich zum Tenant gehört. */
export function assertTenant<T extends { tenantId?: string | null }>(
  record: T | null | undefined,
  tenantId: string,
): T {
  if (!record) throw new TenantIsolationError("Datensatz nicht gefunden.");
  if (record.tenantId && record.tenantId !== tenantId) throw new TenantIsolationError();
  return record;
}
