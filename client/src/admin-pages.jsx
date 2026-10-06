import React, { useState } from "react";
import { Edit3, Eye, EyeOff, Plus } from "lucide-react";
import { post, put } from "./api";
import {
  Badge,
  ErrorBox,
  Field,
  Loading,
  Modal,
  PageHead,
  Pager,
  SaveButton,
  SearchBox,
  Table,
  date,
  label,
  useData,
} from "./ui";

function UserEditor({ user, onClose, onSaved }) {
  const editing = !!user?.id;
  const [showPassword, setShowPassword] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={editing ? "Edit user" : "Create user"} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const form = new FormData(e.currentTarget),
            password = String(form.get("password") || ""),
            confirmPassword = String(form.get("confirmPassword") || "");
          if (!editing && !password) {
            setError("Password is required");
            return;
          }
          if (password !== confirmPassword) {
            setError("Password and retyped password must match");
            return;
          }
          const payload = {
            name: String(form.get("name") || ""),
            email: String(form.get("email") || ""),
            role: String(form.get("role") || "LAUNDRY_STAFF"),
            active: form.has("active"),
            ...(password ? { password } : {}),
          };
          setBusy(true);
          try {
            await (editing
              ? put("/admin/users/" + user.id, payload)
              : post("/admin/users", payload));
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
          {editing
            ? "Saving revokes this user’s active sessions. Leave both password fields blank to keep the current password."
            : "Passwords must be at least 12 characters and must match."}
        </p>
        <Field
          label="Full name"
          name="name"
          defaultValue={user?.name || ""}
          required
          maxLength={160}
        />
        <Field
          label="Email address"
          name="email"
          type="email"
          defaultValue={user?.email || ""}
          required
        />
        <Field label="Role">
          <select name="role" defaultValue={user?.role || "LAUNDRY_STAFF"}>
            <option value="LAUNDRY_STAFF">Laundry Staff</option>
            <option value="ADMIN">Admin</option>
          </select>
        </Field>
        <Field label={editing ? "New password (optional)" : "Password"}>
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            minLength={12}
            maxLength={128}
            required={!editing}
            autoComplete="new-password"
          />
        </Field>
        <Field label={editing ? "Retype new password" : "Retype password"}>
          <input
            name="confirmPassword"
            type={showPassword ? "text" : "password"}
            minLength={12}
            maxLength={128}
            required={!editing}
            autoComplete="new-password"
          />
        </Field>
        <button
          type="button"
          className="text-button"
          onClick={() => setShowPassword((v) => !v)}
        >
          {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          {showPassword ? "Hide password" : "Show password"}
        </button>
        <label className="checkbox">
          <input
            type="checkbox"
            name="active"
            defaultChecked={user?.active ?? true}
          />
          Active user
        </label>
        <SaveButton busy={busy} />
      </form>
    </Modal>
  );
}

export function UserManagement() {
  const [rev, setRev] = useState(0),
    [edit, setEdit] = useState(null);
  const { data, error, loading } = useData("/admin/users", rev);
  return (
    <>
      <PageHead title="Users">
        <button className="primary" onClick={() => setEdit({})}>
          <Plus size={18} /> Create user
        </button>
      </PageHead>
      <section className="panel">
        <ErrorBox message={error} />
        {loading ? (
          <Loading />
        ) : (
          <Table headers={["Name", "Email", "Role", "Status", ""]}>
            {data?.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.name}</strong></td>
                <td>{u.email}</td>
                <td>{label(u.role)}</td>
                <td><Badge value={u.active ? "ACTIVE" : "INACTIVE"} /></td>
                <td>
                  <button className="secondary" onClick={() => setEdit(u)}>
                    <Edit3 size={16} /> Edit
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>
      {edit && (
        <UserEditor
          user={edit}
          onClose={() => setEdit(null)}
          onSaved={() => setRev((v) => v + 1)}
        />
      )}
    </>
  );
}

function displayMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || !Object.keys(metadata).length)
    return <span className="muted">No additional details</span>;
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
      {Object.entries(metadata).map(([key, value]) => (
        <div key={key}>
          <strong>{label(key)}:</strong>{" "}
          <span>
            {value && typeof value === "object"
              ? JSON.stringify(value)
              : String(value ?? "—")}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Logs() {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1);
  const { data, error, loading } = useData(
    "/admin/logs?page=" + page + "&q=" + encodeURIComponent(q),
  );
  return (
    <>
      <PageHead title="System logs" eyebrow="AUDIT TRAIL" />
      <section className="panel">
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Search action, user, or entity ID"
        />
        <ErrorBox message={error} />
        {loading ? (
          <Loading />
        ) : (
          <>
            <Table
              headers={[
                "Timestamp",
                "User",
                "Action",
                "Entity / ID",
                "Details",
              ]}
            >
              {data?.rows.map((l) => (
                <tr key={l.id}>
                  <td>{date(l.createdAt)}</td>
                  <td>{l.user?.name || "System"}</td>
                  <td>{label(l.action)}</td>
                  <td>
                    {l.entity}
                    <small className="mono">{l.entityId || "—"}</small>
                  </td>
                  <td>
                    <details>
                      <summary>View details</summary>
                      {displayMetadata(l.metadata)}
                    </details>
                  </td>
                </tr>
              ))}
            </Table>
            {data && (
              <Pager
                page={page}
                total={data.total}
                size={50}
                onChange={setPage}
              />
            )}
          </>
        )}
      </section>
    </>
  );
}
