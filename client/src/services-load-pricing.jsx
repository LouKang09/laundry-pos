import React, { useMemo, useState } from "react";
import { Edit3, Plus, Settings2 } from "lucide-react";
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

function ServiceEditor({ service, onClose, onSaved }) {
  const [value, setValue] = useState({ ...defaults, ...service }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const update = (field, next) => setValue((current) => ({ ...current, [field]: next }));
  const surcharge = useMemo(
    () => ({
      full: Number(value.expressFullPrice || 0) - Number(value.regularFullPrice || 0),
      half: Number(value.expressHalfPrice || 0) - Number(value.regularHalfPrice || 0),
    }),
    [value.expressFullPrice, value.regularFullPrice, value.expressHalfPrice, value.regularHalfPrice],
  );
  const quantityStep = value.unit === "KG" ? "0.001" : "1";

  return (
    <Modal title={service?.id ? "Edit service pricing" : "Add service"} onClose={onClose} wide>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            const payload = {
              name: value.name.trim(),
              unit: value.unit,
              regularFullPrice: value.regularFullPrice,
              regularFullQuantity: value.regularFullQuantity,
              regularHalfPrice: value.regularHalfPrice,
              regularHalfQuantity: value.regularHalfQuantity,
              expressFullPrice: value.expressFullPrice,
              expressFullQuantity: value.expressFullQuantity,
              expressHalfPrice: value.expressHalfPrice,
              expressHalfQuantity: value.expressHalfQuantity,
              active: !!value.active,
            };
            await (service?.id
              ? put(`/admin/services/${service.id}`, payload)
              : post("/admin/services", payload));
            onSaved();
            onClose();
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorBox message={error} />
        <p className="muted">
          Pricing is by load, not by price per kilo. Enter the full-load and half-load
          charge and the maximum quantity covered by each load.
        </p>
        <div className="form-grid">
          <Field label="Service name">
            <input
              value={value.name}
              onChange={(e) => update("name", e.target.value)}
              required
              maxLength={160}
              autoFocus
            />
          </Field>
          <Field label="Charge by">
            <select value={value.unit} onChange={(e) => update("unit", e.target.value)}>
              <option value="KG">Kilo (KG)</option>
              <option value="PIECE">Piece</option>
            </select>
          </Field>
        </div>

        <section className="action-panel">
          <div className="section-title">
            <div>
              <h3>Regular</h3>
              <span className="muted">Full load and half load</span>
            </div>
          </div>
          <div className="form-grid">
            <Field label="Regular · Full price (₱)">
              <input type="number" min="0.01" step="0.01" value={value.regularFullPrice} onChange={(e) => update("regularFullPrice", e.target.value)} required />
            </Field>
            <Field label={`Regular · Full ${value.unit === "KG" ? "kilo" : "pieces"}`}>
              <input type="number" min={quantityStep} step={quantityStep} value={value.regularFullQuantity} onChange={(e) => update("regularFullQuantity", e.target.value)} required />
            </Field>
            <Field label="Regular / Half price (₱)">
              <input type="number" min="0.01" step="0.01" value={value.regularHalfPrice} onChange={(e) => update("regularHalfPrice", e.target.value)} required />
            </Field>
            <Field label={`Regular / Half ${value.unit === "KG" ? "kilo" : "pieces"}`}>
              <input type="number" min={quantityStep} step={quantityStep} value={value.regularHalfQuantity} onChange={(e) => update("regularHalfQuantity", e.target.value)} required />
            </Field>
          </div>
        </section>

        <section className="action-panel">
          <div className="section-title">
            <div>
              <h3>Express</h3>
              <span className="muted">
                Full difference {surcharge.full >= 0 ? "+" : ""}{cash(surcharge.full)} · Half difference {surcharge.half >= 0 ? "+" : ""}{cash(surcharge.half)}
              </span>
            </div>
          </div>
          <div className="form-grid">
            <Field label="Express · Full price (₱)">
              <input type="number" min="0.01" step="0.01" value={value.expressFullPrice} onChange={(e) => update("expressFullPrice", e.target.value)} required />
            </Field>
            <Field label={`Express · Full ${value.unit === "KG" ? "kilo" : "pieces"}`}>
              <input type="number" min={quantityStep} step={quantityStep} value={value.expressFullQuantity} onChange={(e) => update("expressFullQuantity", e.target.value)} required />
            </Field>
            <Field label="Express / Half price (₱)">
              <input type="number" min="0.01" step="0.01" value={value.expressHalfPrice} onChange={(e) => update("expressHalfPrice", e.target.value)} required />
            </Field>
            <Field label={`Express / Half ${value.unit === "KG" ? "kilo" : "pieces"}`}>
              <input type="number" min={quantityStep} step={quantityStep} value={value.expressHalfQuantity} onChange={(e) => update("expressHalfQuantity", e.target.value)} required />
            </Field>
          </div>
        </section>

        <label className="checkbox">
          <input type="checkbox" checked={!!value.active} onChange={(e) => update("active", e.target.checked)} />
          Active service
        </label>
        <p className="small muted">
          Example: 7 kg Regular ₱220 + a remaining 1–4 kg half load ₱150 means 9 kg costs ₱370. If the remainder is above the half-load limit, another full load is charged.
        </p>
        <SaveButton busy={busy}>Save service pricing</SaveButton>
      </form>
    </Modal>
  );
}

function UsageEditor({ service, onClose }) {
  const { data: inventory } = useData("/admin/inventory"),
    { data: usage, error } = useData(`/admin/services/${service.id}/usage`);
  const [busy, setBusy] = useState(false),
    [err, setErr] = useState("");
  return (
    <Modal title={service.name + " · Supply use"} onClose={onClose}>
      <p className="muted">
        Supply quantity used per actual {service.unit.toLowerCase()}. Inventory is
        still consumed from actual quantity when Washing begins; load pricing does not
        change supply consumption.
      </p>
      <ErrorBox message={error || err} />
      {!inventory || !usage ? (
        <Loading />
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setErr("");
            const values = [...new FormData(event.currentTarget)]
              .filter(([, amount]) => Number(amount) > 0)
              .map(([inventoryItemId, quantityPerUnit]) => ({ inventoryItemId, quantityPerUnit }));
            try {
              await put(`/admin/services/${service.id}/usage`, values);
              onClose();
            } catch (e) {
              setErr(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {inventory.map((item) => (
            <Field
              key={item.id}
              label={`${item.name} (${item.unit})`}
              name={item.id}
              type="number"
              min="0"
              step="0.001"
              defaultValue={usage.find((row) => row.inventoryItemId === item.id)?.quantityPerUnit || "0"}
            />
          ))}
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
      <PageHead title="Services & load pricing" eyebrow="FULL + HALF LOAD PRICING">
        <button className="primary" onClick={() => setEdit({ ...defaults })}>
          <Plus size={18} /> Add service
        </button>
      </PageHead>
      <section className="panel">
        <p className="muted">
          No per-unit price is used for new transactions. Each service has Regular and
          Express full-load and half-load prices with their own quantity limits.
        </p>
        <ErrorBox message={error} />
        {loading ? (
          <Loading />
        ) : data?.length ? (
          <Table headers={["Service", "Regular full", "Regular half", "Express full", "Express half", "Status", ""]}>
            {data.map((service) => (
              <tr key={service.id}>
                <td>
                  <strong>{service.name}</strong>
                  <small>{service.unit === "KG" ? "By kilo" : "By piece"}</small>
                </td>
                <td><strong>{cash(service.regularFullPrice)}</strong><small>{quantityLabel(service, service.regularFullQuantity)}</small></td>
                <td><strong>{cash(service.regularHalfPrice)}</strong><small>{quantityLabel(service, service.regularHalfQuantity)}</small></td>
                <td><strong>{cash(service.expressFullPrice)}</strong><small>{quantityLabel(service, service.expressFullQuantity)}</small></td>
                <td><strong>{cash(service.expressHalfPrice)}</strong><small>{quantityLabel(service, service.expressHalfQuantity)}</small></td>
                <td><Badge value={service.active ? "ACTIVE" : "INACTIVE"} /></td>
                <td>
                  <div className="actions">
                    <button className="secondary" onClick={() => setEdit(service)}><Edit3 size={16} /> Edit</button>
                    <button className="secondary" onClick={() => setUsage(service)}><Settings2 size={16} /> Supply use</button>
                  </div>
                </td>
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
