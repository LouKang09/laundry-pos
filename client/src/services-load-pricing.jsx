import React, { useMemo, useState } from "react";
import { Edit3, Plus, Settings2, Trash2 } from "lucide-react";
import { post, put } from "./api";
import { useApp } from "./context";
import {
  Badge,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Modal,
  PageHead,
  SaveButton,
  Table,
  cash,
  useData,
} from "./ui";

const defaults = {
  name: "",
  unit: "KG",
  regularFullPrice: "220",
  regularFullQuantity: "7",
  regularHalfPrice: "150",
  regularHalfQuantity: "4",
  expressFullPrice: "320",
  expressFullQuantity: "7",
  expressHalfPrice: "250",
  expressHalfQuantity: "4",
  active: true,
};

function quantityLabel(service, value) {
  return `${value} ${service.unit === "KG" ? "kg" : "pc"}`;
}

const starterTiers = [
  { label: "Full", quantity: "7", regularPrice: "220", expressPrice: "320" },
  { label: "Half", quantity: "4", regularPrice: "150", expressPrice: "250" },
];
function editableTiers(service) {
  if (Array.isArray(service?.pricingTiers) && service.pricingTiers.length)
    return service.pricingTiers.map(t => ({ ...t }));
  if (!service?.id) return starterTiers.map(t => ({ ...t }));
  return [
    { label: "Full", quantity: String(service.regularFullQuantity), regularPrice: String(service.regularFullPrice), expressPrice: String(service.expressFullPrice) },
    { label: "Half", quantity: String(service.regularHalfQuantity), regularPrice: String(service.regularHalfPrice), expressPrice: String(service.expressHalfPrice) },
  ];
}
function servicePayload(value, tiers, active = value.active) {
  const sorted = [...tiers].sort((a,b) => Number(b.quantity) - Number(a.quantity));
  const full = sorted[0], half = sorted[1] || full;
  return {
    name: value.name.trim(), unit: value.unit.trim().toUpperCase(),
    regularFullPrice: String(full.regularPrice), regularFullQuantity: String(full.quantity),
    regularHalfPrice: String(half.regularPrice), regularHalfQuantity: String(half.quantity),
    expressFullPrice: String(full.expressPrice), expressFullQuantity: String(full.quantity),
    expressHalfPrice: String(half.expressPrice), expressHalfQuantity: String(half.quantity),
    pricingTiers: tiers.map(t => ({
      label: t.label.trim(), quantity: String(t.quantity),
      regularPrice: String(t.regularPrice), expressPrice: String(t.expressPrice),
    })), active: !!active,
  };
}
const unitLabel = unit => ({ KG: "kg", PIECE: "piece", PCS: "pcs", L: "L", CAPS: "caps" })[unit?.toUpperCase()] || unit;
const countUnit = unit => ["PIECE", "PCS", "CAPS"].includes(unit?.toUpperCase());
function ServiceEditor({ service, onClose, onSaved }) {
  const [value,setValue] = useState({ ...defaults, ...service });
  const [tiers,setTiers] = useState(() => editableTiers(service));
  const [error,setError] = useState(""), [busy,setBusy] = useState(false);
  const updateTier = (i,field,next) =>
    setTiers(current => current.map((t,index) => index === i ? { ...t, [field]: next } : t));
  return (
    <Modal title={service?.id ? "Edit service pricing" : "Add service"} onClose={onClose} wide>
      <form onSubmit={async event => {
        event.preventDefault();
        setError(""); setBusy(true);
        try {
          if (!tiers.length) throw new Error("Add at least one pricing tier");
          const payload = servicePayload(value,tiers);
          await (service?.id ? put(`/admin/services/${service.id}`,payload) : post("/admin/services",payload));
          onSaved(); onClose();
        } catch(err) { setError(err.message); }
        finally { setBusy(false); }
      }}>
        <ErrorBox message={error} />
        <p className="muted">Add, edit, or remove pricing tiers. Each tier sets a maximum quantity and its regular/express price; the smallest tier covering the leftover quantity is charged. Historic orders retain their saved price.</p>
        <div className="form-grid">
          <Field label="Service name">
            <input required maxLength={160} value={value.name}
              onChange={e => setValue(v => ({ ...v, name:e.target.value }))}/>
          </Field>
          <Field label="Measurement unit (choose or type a new one)">
            <input required maxLength={30} list="laundry-service-units" value={value.unit}
              onChange={e => setValue(v => ({ ...v, unit:e.target.value }))}/>
            <datalist id="laundry-service-units">
              {["KG","PCS","PIECE","L","CAPS"].map(u => <option key={u} value={u}/>)}
            </datalist>
          </Field>
        </div>
        <section className="action-panel">
          <div className="section-title"><div><h3>Pricing tiers</h3><span className="muted">Flexible load sizes and prices</span></div></div>
          {tiers.map((tier,i) => (
            <div key={i} className="form-grid" style={{ marginBottom: 12, alignItems: "end" }}>
              <Field label="Tier name"><input required maxLength={60} value={tier.label} onChange={e=>updateTier(i,"label",e.target.value)}/></Field>
              <Field label={`Capacity (${unitLabel(value.unit)})`}>
                <input required type="number" min={countUnit(value.unit) ? "1" : "0.001"}
                  step={countUnit(value.unit) ? "1" : "0.001"}
                  value={tier.quantity} onChange={e=>updateTier(i,"quantity",e.target.value)}/>
              </Field>
              <Field label="Regular price (₱)"><input required type="number" min="0.01" step="0.01" value={tier.regularPrice} onChange={e=>updateTier(i,"regularPrice",e.target.value)}/></Field>
              <Field label="Express price (₱)"><input required type="number" min="0.01" step="0.01" value={tier.expressPrice} onChange={e=>updateTier(i,"expressPrice",e.target.value)}/></Field>
              <button type="button" className="secondary" disabled={tiers.length === 1} onClick={()=>setTiers(t => t.filter((_,n)=>n!==i))}><Trash2 size={15}/> Remove tier</button>
            </div>
          ))}
          <button className="secondary" type="button" disabled={tiers.length >= 20}
            onClick={()=>setTiers(t=>[...t,{label:"New tier",quantity:"1",regularPrice:"1",expressPrice:"1"}])}>
            <Plus size={16}/> Add pricing tier
          </button>
        </section>
        <label className="checkbox"><input type="checkbox" checked={!!value.active} onChange={e=>setValue(v=>({...v,active:e.target.checked}))}/> Active service</label>
        <SaveButton busy={busy}>Save service pricing</SaveButton>
      </form>
    </Modal>
  );
}
function UsageEditor({ service, onClose }) {
  const { data: inventory } = useData("/admin/inventory");
  const { data: usage, error } = useData(`/admin/services/${service.id}/usage`);
  const [entries,setEntries] = useState(null), [busy,setBusy] = useState(false), [err,setErr] = useState("");
  const rows = entries ?? (usage || []).map(u => ({inventoryItemId:u.inventoryItemId,quantityPerUnit:String(u.quantityPerUnit)}));
  return (
    <Modal title={service.name + " · Supply use"} onClose={onClose}>
      <p className="muted">Configure only the supplies this service consumes when Washing begins. Remove or add a supply at any time. Measurement units come directly from Inventory.</p>
      <ErrorBox message={error || err}/>
      {!inventory || !usage ? <Loading/> : (
        <form onSubmit={async e => {
          e.preventDefault();setBusy(true);setErr("");
          try {
            await put(`/admin/services/${service.id}/usage`,rows.map(x=>({...x})));
            onClose();
          } catch(ex){setErr(ex.message);} finally {setBusy(false);}
        }}>
          {rows.map((row,i)=> (
            <div className="form-grid" key={i} style={{ alignItems:"end",marginBottom:12 }}>
              <Field label="Supply">
                <select value={row.inventoryItemId} onChange={e=>setEntries(rows.map((r,j)=>i===j?{...r,inventoryItemId:e.target.value}:r))}>
                  {inventory.filter(item=>item.id===row.inventoryItemId || !rows.some(r=>r.inventoryItemId===item.id)).map(item=><option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}
                </select>
              </Field>
              <Field label={`Used per ${unitLabel(service.unit)}`}>
                <input required type="number" min="0.001" step="0.001" value={row.quantityPerUnit}
                  onChange={e=>setEntries(rows.map((r,j)=>i===j?{...r,quantityPerUnit:e.target.value}:r))}/>
              </Field>
              <button className="secondary" type="button" onClick={()=>setEntries(rows.filter((_,j)=>j!==i))}><Trash2 size={15}/> Remove</button>
            </div>
          ))}
          <button type="button" className="secondary" disabled={!inventory.some(item=>!rows.some(r=>r.inventoryItemId===item.id))}
            onClick={()=>{
              const next=inventory.find(item=>!rows.some(r=>r.inventoryItemId===item.id));
              if(next)setEntries([...rows,{inventoryItemId:next.id,quantityPerUnit:"1"}]);
            }}><Plus size={16}/> Add supply</button>
          <SaveButton busy={busy}>Save supply use</SaveButton>
        </form>
      )}
    </Modal>
  );
}

export function Services() {
  const [rev, setRev] = useState(0),
    [edit, setEdit] = useState(null),
    [usage, setUsage] = useState(null);
  const { data, error, loading } = useData("/services?all=true", rev),
    { notify } = useApp();

  return (
    <>
      <PageHead title="Services & load pricing" eyebrow="CUSTOMIZABLE LOAD PRICING">
        <button className="primary" onClick={() => setEdit({ ...defaults })}>
          <Plus size={18} /> Add service
        </button>
      </PageHead>
      <section className="panel">
        <p className="muted">
          Edit, add, remove or deactivate services and load tiers without code changes. Regular and Express prices are configured per tier.
        </p>
        <ErrorBox message={error} />
        {loading ? (
          <Loading />
        ) : data?.length ? (
          <Table headers={["Service", "Unit", "Pricing tiers (Regular / Express)", "Status", ""]}>
            {data.map(service=>(
              <tr key={service.id}>
                <td><strong>{service.name}</strong></td>
                <td>{unitLabel(service.unit)}</td>
                <td>{editableTiers(service).map((t,i)=>(
                  <small key={i}>{t.label}: {t.quantity} {unitLabel(service.unit)} · {cash(t.regularPrice)} / {cash(t.expressPrice)}</small>
                ))}</td>
                <td><Badge value={service.active ? "ACTIVE" : "INACTIVE"}/></td>
                <td><div className="actions">
                  <button className="secondary" onClick={()=>setEdit(service)}><Edit3 size={16}/> Edit</button>
                  <button className="secondary" onClick={()=>setUsage(service)}><Settings2 size={16}/> Supply use</button>
                  {service.active && <button className="secondary" title="Hide from new orders; retain historical transactions"
                    onClick={async()=>{if (!window.confirm(`Remove ${service.name} from active services? Existing orders are retained.`)) return;
                      try{await put(`/admin/services/${service.id}`,servicePayload(service,editableTiers(service),false));setRev(n=>n+1);notify("Service removed from POS");}
                      catch(e){notify(e.message);}
                    }}><Trash2 size={15}/> Remove</button>}
                </div></td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No services configured.</Empty>
        )}
      </section>
      {edit && (
        <ServiceEditor
          service={edit.id ? edit : null}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setRev((current) => current + 1);
            notify("Service load pricing saved");
          }}
        />
      )}
      {usage && <UsageEditor service={usage} onClose={() => setUsage(null)} />}
    </>
  );
}
