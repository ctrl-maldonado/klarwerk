import { describe, expect, it } from "vitest";
import { selectCustomer, selectOrder, selectableOrders } from "@/lib/document-links";

const ORDERS = [
  { id: "a1", customerId: "k1" },
  { id: "a2", customerId: "k1" },
  { id: "a3", customerId: "k2" },
  { id: "a4", customerId: null },
];

describe("Kopplung von Kunde und Auftrag", () => {
  it("zeigt ohne gewählten Kunden alle Aufträge", () => {
    expect(selectableOrders(ORDERS, "")).toHaveLength(4);
  });

  it("beschränkt die Aufträge auf den gewählten Kunden", () => {
    expect(selectableOrders(ORDERS, "k1").map((order) => order.id)).toEqual(["a1", "a2"]);
  });

  it("blendet Aufträge ohne Kunden aus, sobald ein Kunde gewählt ist", () => {
    expect(selectableOrders(ORDERS, "k2").map((order) => order.id)).toEqual(["a3"]);
  });

  it("setzt den Kunden, wenn ein Auftrag gewählt wird", () => {
    expect(selectOrder(ORDERS, "a3", { customerId: "", orderId: "" })).toEqual({
      customerId: "k2",
      orderId: "a3",
    });
  });

  it("überschreibt einen abweichenden Kunden mit dem des Auftrags", () => {
    expect(selectOrder(ORDERS, "a1", { customerId: "k2", orderId: "a3" })).toEqual({
      customerId: "k1",
      orderId: "a1",
    });
  });

  it("leert den Kunden bei einem Auftrag ohne Kundenbezug", () => {
    expect(selectOrder(ORDERS, "a4", { customerId: "k1", orderId: "a1" })).toEqual({
      customerId: "",
      orderId: "a4",
    });
  });

  it("behält den Auftrag, wenn er zum neuen Kunden gehört", () => {
    expect(selectCustomer(ORDERS, "k1", { customerId: "", orderId: "a2" })).toEqual({
      customerId: "k1",
      orderId: "a2",
    });
  });

  it("wählt einen fremden Auftrag ab, wenn der Kunde wechselt", () => {
    expect(selectCustomer(ORDERS, "k2", { customerId: "k1", orderId: "a1" })).toEqual({
      customerId: "k2",
      orderId: "",
    });
  });

  it("behält den Auftrag, wenn der Kundenbezug entfernt wird", () => {
    expect(selectCustomer(ORDERS, "", { customerId: "k1", orderId: "a1" })).toEqual({
      customerId: "",
      orderId: "a1",
    });
  });
});
