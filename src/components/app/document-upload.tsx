"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { uploadDocumentAction, type UploadState } from "@/app/(app)/dokumente/actions";
import { useToast } from "@/components/app/toast";
import { Button, Field, inputClass } from "@/components/ui";
import { selectCustomer, selectOrder, selectableOrders } from "@/lib/document-links";

export interface UploadCustomer {
  id: string;
  name: string;
}

export interface UploadOrder {
  id: string;
  label: string;
  /** Bestimmt, welchem Kunden der Auftrag gehört – Grundlage für die Kopplung
   *  der beiden Auswahlfelder. */
  customerId: string | null;
}

function Upload({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird hochgeladen …" : label}
    </Button>
  );
}

const fileInputClass =
  "block w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink-700 hover:file:bg-ink-200";

export function DocumentUpload({
  customers = [],
  orders = [],
  fixedOrderId,
  fixedCustomerId,
  submitLabel = "Hochladen",
}: {
  customers?: UploadCustomer[];
  orders?: UploadOrder[];
  /** Beim Hochladen direkt am Auftrag steht der Bezug bereits fest; die
   *  Auswahlfelder entfallen dann. */
  fixedOrderId?: string;
  fixedCustomerId?: string | null;
  submitLabel?: string;
}) {
  const { toast } = useToast();
  const [customerId, setCustomerId] = useState("");
  const [orderId, setOrderId] = useState("");

  const bound = Boolean(fixedOrderId);

  /* Die Regeln stehen in @/lib/document-links und sind dort geprüft: ein
     Auftrag gehört zu höchstens einem Kunden, beide Felder dürfen sich nicht
     widersprechen. */
  const availableOrders = selectableOrders(orders, customerId);

  function apply(next: { customerId: string; orderId: string }) {
    setCustomerId(next.customerId);
    setOrderId(next.orderId);
  }

  async function handleUpload(formData: FormData) {
    const result: UploadState = await uploadDocumentAction({}, formData);
    if (result.error) {
      toast({ tone: "error", title: "Hochladen fehlgeschlagen", detail: result.error });
      return;
    }
    toast({ tone: "success", title: "Dokument abgelegt", detail: result.success });
  }

  return (
    <form action={handleUpload} className="space-y-3">
      <Field label="Datei">
        <input type="file" name="file" required className={fileInputClass} />
      </Field>

      {bound ? (
        <>
          <input type="hidden" name="orderId" value={fixedOrderId} />
          <input type="hidden" name="customerId" value={fixedCustomerId ?? ""} />
        </>
      ) : (
        <>
          <Field label="Kunde (optional)">
            <select
              name="customerId"
              className={inputClass}
              value={customerId}
              onChange={(event) => apply(selectCustomer(orders, event.target.value, { customerId, orderId }))}
            >
              <option value="">— kein Bezug —</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Auftrag (optional)"
            hint={
              customerId && availableOrders.length === 0
                ? "Für diesen Kunden gibt es keinen Auftrag."
                : customerId
                  ? "Nur Aufträge dieses Kunden."
                  : undefined
            }
          >
            <select
              name="orderId"
              className={inputClass}
              value={orderId}
              onChange={(event) => apply(selectOrder(orders, event.target.value, { customerId, orderId }))}
              disabled={Boolean(customerId) && availableOrders.length === 0}
            >
              <option value="">— kein Bezug —</option>
              {availableOrders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.label}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      <Upload label={submitLabel} />
    </form>
  );
}
