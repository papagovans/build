"use client";

/**
 * Checkbox list for a small `hasMany` relationship.
 *
 * Payload renders those as a type-ahead multi select, which is right for a
 * list of hundreds. These lists have three and five entries, and someone
 * setting up a floor plan wants to see every chassis at once and tick the ones
 * it is built on, not discover what is hiding in a dropdown.
 *
 * One component serves both relationships. It is wired up in payload.config.ts
 * through `clientProps`, on floor-plans.availableLengths and
 * trim-packages.floorPlans. The stored value stays an ordinary relationship
 * array, so nothing downstream knows the control is custom.
 */
import { FieldLabel, useField } from "@payloadcms/ui";
import { useEffect, useState } from "react";

type Row = { id: number | string; name: string };
type Ref = number | string | { id: number | string };

const idOf = (ref: Ref) => (typeof ref === "object" && ref !== null ? ref.id : ref);

export function RelationshipCheckboxes({
  path,
  collection,
  label,
  help,
  emptyNoun,
}: {
  path: string;
  /** Payload collection slug to list, e.g. "van-lengths". */
  collection: string;
  label: string;
  help: string;
  /** Plural noun for the "nothing ticked" note, e.g. "van lengths". */
  emptyNoun: string;
}) {
  const { value, setValue } = useField<Ref[]>({ path });
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    // Same origin, so the admin's auth cookie rides along and these
    // authenticated-only collections answer.
    fetch(`/api/${collection}?limit=100&sort=order&depth=0`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { docs?: Row[] }) => {
        setRows(d.docs ?? []);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [collection]);

  const current = value ?? [];
  const selected = new Set(current.map((v) => String(idOf(v))));

  const toggle = (id: number | string) => {
    setValue(
      selected.has(String(id))
        ? current.filter((v) => String(idOf(v)) !== String(id))
        : [...current, id],
    );
  };

  return (
    <div className="field-type" style={{ marginBottom: 24 }}>
      <FieldLabel label={label} path={path} />
      <p style={{ fontSize: 13, opacity: 0.7, margin: "0 0 10px", maxWidth: "48rem" }}>
        {help}
      </p>

      {state === "loading" && <p style={{ fontSize: 13, opacity: 0.6 }}>Loading…</p>}
      {state === "error" && (
        <p style={{ fontSize: 13, color: "var(--theme-error-500)" }}>
          Could not load the {emptyNoun}. Reload the page.
        </p>
      )}

      {state === "ready" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px" }}>
          {rows.map((row) => (
            <label
              key={row.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(String(row.id))}
                onChange={() => toggle(row.id)}
                style={{ width: 16, height: 16, cursor: "pointer" }}
              />
              {row.name}
            </label>
          ))}
        </div>
      )}

      {state === "ready" && selected.size === 0 && (
        <p style={{ fontSize: 13, opacity: 0.7, marginTop: 10 }}>
          Nothing ticked, so this is offered on all {rows.length} {emptyNoun},
          including any added later.
        </p>
      )}
    </div>
  );
}
