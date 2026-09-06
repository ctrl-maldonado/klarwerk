/**
 * Kopplung von Kunde und Auftrag beim Ablegen eines Dokuments.
 *
 * Ein Auftrag gehört zu höchstens einem Kunden. Beide Felder frei wählbar zu
 * lassen erlaubt widersprüchliche Angaben – etwa Rechnung an Kunde A, aber am
 * Auftrag von Kunde B. Die Regeln stehen hier als reine Funktionen, damit sie
 * geprüft werden können, ohne ein Auswahlfeld zu bedienen.
 */

export interface LinkableOrder {
  id: string;
  customerId: string | null;
}

export interface Selection {
  customerId: string;
  orderId: string;
}

/** Bei gewähltem Kunden bleiben nur dessen Aufträge wählbar. */
export function selectableOrders<T extends LinkableOrder>(orders: T[], customerId: string): T[] {
  if (!customerId) return orders;
  return orders.filter((order) => order.customerId === customerId);
}

/** Der Kunde ergibt sich aus dem Auftrag und wird mitgesetzt. */
export function selectOrder(orders: LinkableOrder[], nextOrderId: string, current: Selection): Selection {
  const order = orders.find((entry) => entry.id === nextOrderId);
  if (!order) return { customerId: current.customerId, orderId: nextOrderId };
  return { customerId: order.customerId ?? "", orderId: nextOrderId };
}

/** Ein Auftrag, der nicht zum neuen Kunden gehört, wird abgewählt. */
export function selectCustomer(orders: LinkableOrder[], nextCustomerId: string, current: Selection): Selection {
  const order = orders.find((entry) => entry.id === current.orderId);
  const keepOrder = !order || !nextCustomerId || order.customerId === nextCustomerId;
  return { customerId: nextCustomerId, orderId: keepOrder ? current.orderId : "" };
}
