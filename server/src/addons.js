import { D, money, fail, audit } from "./db.js";
export async function priceAddons(tx, requested = [], historical = false) {
  const seen = new Set(), lines = [];
  for (const row of requested) {
    if (seen.has(row.inventoryItemId)) fail(400, "Each add-on can appear once per order");
    seen.add(row.inventoryItemId);
    const item = await tx.inventoryItem.findUnique({ where: { id: row.inventoryItemId } });
    if (!item?.active || !item.sellAsAddon || item.salePrice.lte(0))
      fail(400, "An add-on is no longer available");
    const quantity = new D(row.quantity);
    if (quantity.lte(0) || quantity.gt("1000000")) fail(400, "Invalid add-on quantity");
    if (["PCS", "PIECE", "CAPS"].includes(item.unit.toUpperCase()) && !quantity.isInteger())
      fail(400, "Count-based add-ons need a whole quantity");
    if (!historical && item.stock.lt(quantity))
      fail(409, `Insufficient ${item.name} inventory for this add-on`);
    lines.push({
      inventoryItemId: item.id, name: item.name, unit: item.unit,
      quantity, unitPrice: item.salePrice,
      total: money(item.salePrice.mul(quantity)),
    });
  }
  return lines;
}
export async function consumeAddons(tx, lines, order, userId) {
  for (const line of lines) {
    const changed = await tx.inventoryItem.updateMany({
      where: { id: line.inventoryItemId, active: true, stock: { gte: line.quantity } },
      data: { stock: { decrement: line.quantity } },
    });
    if (!changed.count) fail(409, `Insufficient ${line.name} inventory for this add-on`);
    const saved = await tx.inventoryItem.findUnique({ where: { id: line.inventoryItemId } });
    await tx.inventoryTransaction.create({
      data: {
        itemId: line.inventoryItemId, type: "CONSUMPTION",
        quantity: line.quantity.negated(), stockAfter: saved.stock,
        reason: `Retail add-on: ${order.orderNumber}`, userId, orderId: order.id,
      },
    });
    await audit(tx, userId, "INVENTORY_CHANGED", "InventoryItem", line.inventoryItemId, {
      orderId: order.id, quantity: line.quantity.negated().toString(), type: "RETAIL_ADDON",
    });
  }
}
