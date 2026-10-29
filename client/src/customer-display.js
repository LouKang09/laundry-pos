// Customer labels used across POS customer pickers.
export function customerDisplayName(customer) {
  const name = String(customer?.name || "").trim();
  const unit = String(customer?.roomUnit || customer?.customerRoomUnit || "").trim();
  if (!unit) return name;
  const location = /^(?:room|unit|rm\.?|dorm|building|floor|blk|block)\b/i.test(unit)
    ? unit
    : (/^[0-9]+[A-Za-z0-9-]*$/i.test(unit) ? "Room " + unit : unit);
  return name + " — " + location;
}
