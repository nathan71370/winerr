"use client";

import { useActionState, useState } from "react";
import { createUnitAction, updateUnitAction } from "@/cave/actions";

type UnitRow = { id: string; name: string; kind: "grid" | "diamond"; cols: number | null; rows: number | null; gridX: number; gridY: number };

export function UnitForm({ unit }: { unit?: UnitRow }) {
  const action = unit ? updateUnitAction : createUnitAction;
  const [state, formAction] = useActionState(action, null as { error?: string; ok?: boolean } | null);
  const [kind, setKind] = useState<"grid" | "diamond">(unit?.kind ?? "grid");

  return (
    <form action={formAction} style={{ display: "grid", gap: "var(--s-3)", padding: "var(--s-4)", border: "1px solid var(--line)", borderRadius: "var(--radius)", background: "var(--card)" }}>
      {unit && <input type="hidden" name="unitId" value={unit.id} />}
      <input name="name" defaultValue={unit?.name ?? ""} placeholder="Nom du cube" required style={inp} />
      <div style={{ display: "flex", gap: "var(--s-2)" }}>
        <label style={{ flex: 1 }}>
          <input type="radio" name="kind" value="grid" checked={kind === "grid"} onChange={() => setKind("grid")} /> Grille
        </label>
        <label style={{ flex: 1 }}>
          <input type="radio" name="kind" value="diamond" checked={kind === "diamond"} onChange={() => setKind("diamond")} /> Losange
        </label>
      </div>
      {kind === "grid" && (
        <div style={{ display: "flex", gap: "var(--s-2)" }}>
          <input name="cols" type="number" min={1} max={20} defaultValue={unit?.cols ?? 4} placeholder="colonnes" style={inp} />
          <input name="rows" type="number" min={1} max={20} defaultValue={unit?.rows ?? 4} placeholder="rangées" style={inp} />
        </div>
      )}
      <div style={{ display: "flex", gap: "var(--s-2)" }}>
        <input name="gridX" type="number" min={0} defaultValue={unit?.gridX ?? 0} placeholder="colonne" style={inp} />
        <input name="gridY" type="number" min={0} defaultValue={unit?.gridY ?? 0} placeholder="niveau" style={inp} />
      </div>
      {state?.error && <p style={{ color: "var(--warn)", fontSize: "var(--t-small)" }}>{state.error}</p>}
      <button style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", padding: "var(--s-2) var(--s-4)", cursor: "pointer" }}>
        {unit ? "Enregistrer" : "+ Ajouter le cube"}
      </button>
    </form>
  );
}

const inp: React.CSSProperties = { padding: "var(--s-2) var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)", fontSize: "var(--t-small)", width: "100%" };
