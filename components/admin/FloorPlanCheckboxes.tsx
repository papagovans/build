"use client";

/**
 * Checkbox list for the trim package -> floor plans relationship.
 *
 * Payload renders a `hasMany` relationship as a type-ahead multi select. That
 * is the right control for a list of hundreds; there are five floor plans, and
 * someone setting up a trim package wants to see all five and tick the ones
 * that apply without discovering what is in the dropdown.
 *
 * Wired up in payload.config.ts on the trim-packages `floorPlans` field. The
 * value stays a normal relationship array, so nothing downstream knows or
 * cares that the control is custom.
 */
import { FieldLabel, useField } from "@payloadcms/ui";
import { useEffect, useState } from "react";

type Plan = { id: number | string; name: string; slug: string };
type Ref = number | string | { id: number | string };

const idOf = (ref: Ref) =>
  typeof ref === "object" && ref !== null ? ref.id : ref;

export function FloorPlanCheckboxes({ path }: { path: string }) {
  const { value, setValue } = useField<Ref[]>({ path });
  const [plans, setPlans] = useState<Plan[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    // Same-origin, so the admin's auth cookie rides along and the
    // authenticated-only floor-plans collection answers.
    fetch("/api/floor-plans?limit=100&sort=order&depth=0", {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { docs?: Plan[] }) => {
        setPlans(d.docs ?? []);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

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
      <FieldLabel label="Floor plans" path={path} />
      <p
        style={{
          fontSize: 13,
          opacity: 0.7,
          margin: "0 0 10px",
          maxWidth: "48rem",
        }}
      >
        Tick every floor plan this trim package is offered on. Leave all of them
        unticked to offer it on every plan, including any added later.
      </p>

      {state === "loading" && <p style={{ fontSize: 13, opacity: 0.6 }}>Loading…</p>}
      {state === "error" && (
        <p style={{ fontSize: 13, color: "var(--theme-error-500)" }}>
          Could not load the floor plans. Reload the page.
        </p>
      )}

      {state === "ready" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px" }}>
          {plans.map((plan) => (
            <label
              key={plan.id}
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
                checked={selected.has(String(plan.id))}
                onChange={() => toggle(plan.id)}
                style={{ width: 16, height: 16, cursor: "pointer" }}
              />
              {plan.name}
            </label>
          ))}
        </div>
      )}

      {state === "ready" && selected.size === 0 && (
        <p style={{ fontSize: 13, opacity: 0.7, marginTop: 10 }}>
          Nothing ticked, so this trim package is offered on all{" "}
          {plans.length} floor plans.
        </p>
      )}
    </div>
  );
}
