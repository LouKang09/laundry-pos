import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, cash } from "./ui";

// Used by the live POS and historical Manual Add; server prices from Inventory.
export function AddonsPicker({ catalog = [], value, onChange, historical = false }) {
  const [choice,setChoice] = useState("");
  const available = catalog.filter(item => !value.some(row => row.inventoryItemId === item.id));
  const selected = available.some(item => item.id === choice) ? choice : available[0]?.id;
  return (
    <section className="action-panel addon-picker">
      <div className="section-title"><div>
        <h3>Optional add-ons</h3>
        <span className="muted">Detergent, fabcon, bleach and other products priced from Inventory</span>
      </div></div>
      {catalog.length === 0 && <p className="muted">No add-ons configured. Open Inventory, set a selling price and enable “Available as POS / Manual Add add-on” for the products you want to offer.</p>}
      {value.map((row,i) => {
        const item = catalog.find(x => x.id === row.inventoryItemId);
        if (!item) return null;
        const counted = ["PCS","PIECE","CAPS"].includes(item.unit.toUpperCase());
        return <div key={row.inventoryItemId} className="addon-picker-item">
          <div className="addon-picker-item-name"><strong>{item.name}</strong><small>{cash(item.salePrice)} / {item.unit}{!historical ? ` · ${item.stock} available` : ""}</small></div>
          <Field label={`Quantity (${item.unit})`}>
            <input type="number" min={counted ? "1" : "0.001"} step={counted ? "1" : "0.001"}
              max={!historical ? String(item.stock) : undefined}
              value={row.quantity}
              onChange={e => onChange(value.map((v,j) => i===j?{...v,quantity:e.target.value}:v))}/>
          </Field>
          <strong className="addon-picker-item-total">{cash(Number(item.salePrice)*Number(row.quantity||0))}</strong>
          <button className="secondary" type="button" onClick={()=>onChange(value.filter((_,j)=>i!==j))}><Trash2 size={16}/> Remove</button>
        </div>;
      })}
      {available.length > 0 && <div className="addon-picker-add">
        <Field label="Choose add-on">
          <select value={selected} onChange={e=>setChoice(e.target.value)}>
            {available.map(item=><option key={item.id} value={item.id}>{item.name} · {cash(item.salePrice)}/{item.unit}</option>)}
          </select>
        </Field>
        <button type="button" className="secondary" onClick={()=>{if(selected)onChange([...value,{inventoryItemId:selected,quantity:"1"}]);}}>
          <Plus size={16}/> Add product
        </button>
      </div>}
      <p className="small muted">{historical
        ? "Historical add-ons are saved at the configured selling price; current inventory is not deducted."
        : "Add-ons deduct stock when the order is saved; service supplies deduct stock at Washing."}</p>
    </section>
  );
}
