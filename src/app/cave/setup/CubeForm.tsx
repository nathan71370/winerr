"use client";

import { useActionState, useEffect, useState } from "react";
import { createUnitAction, updateUnitAction } from "@/cave/actions";

export type CubeRow = { id: string; name: string; kind: "grid" | "diamond"; cols: number | null; rows: number | null; gridX: number; gridY: number };

// Add mode: pass gridX/gridY (the target cell). Edit mode: pass unit.
export function CubeForm({ unit, gridX, gridY, onSuccess }: { unit?: CubeRow; gridX?: number; gridY?: number; onSuccess?: () => void }) {
  const action = unit ? updateUnitAction : createUnitAction;
  const [state, formAction] = useActionState(action, null as { error?: string; ok?: boolean } | null);
  const [kind, setKind] = useState<"grid" | "diamond">(unit?.kind ?? "grid");

  useEffect(() => { if (state?.ok) onSuccess?.(); }, [state, onSuccess]);

  return (
    <form action={formAction} style={{ display: "grid", gap: "var(--s-3)" }}>
      {unit && <input type="hidden" name="unitId" value={unit.id} />}
      {!unit && <input type="hidden" name="gridX" value={gridX ?? 0} />}
      {!unit && <input type="hidden" name="gridY" value={gridY ?? 0} />}
      {unit && <input type="hidden" name="gridX" value={unit.gridX} />}
      {unit && <input type="hidden" name="gridY" value={unit.gridY} />}

      <input name="name" defaultValue={unit?.name ?? ""} placeholder="Nom du cube" required style={inp} />

      <div style={{ display: "flex", gap: "var(--s-2)" }}>
        <label style={segLabel(kind === "grid")}>
          <input type="radio" name="kind" value="grid" checked={kind === "grid"} onChange={() => setKind("grid")} style={{ display: "none" }} /> ▦ Grille
        </label>
        <label style={segLabel(kind === "diamond")}>
          <input type="radio" name="kind" value="diamond" checked={kind === "diamond"} onChange={() => setKind("diamond")} style={{ display: "none" }} /> ◇ Losange
        </label>
      </div>

      <div style={{ display: "flex", gap: "var(--s-2)", alignItems: "center" }}>
        <input name="cols" type="number" min={1} max={20} defaultValue={unit?.cols ?? 4} style={{ ...inp, width: 64 }} aria-label="colonnes" />
        <span style={{ color: "var(--ink-mute)" }}>×</span>
        <input name="rows" type="number" min={1} max={20} defaultValue={unit?.rows ?? 4} style={{ ...inp, width: 64 }} aria-label="rangées" />
        <span style={{ fontSize: "var(--t-meta)", color: "var(--ink-mute)" }}>{kind === "diamond" ? "cellules (× 4 triangles)" : "colonnes × rangées"}</span>
      </div>

      {state?.error && <p style={{ color: "var(--warn)", fontSize: "var(--t-small)" }}>{state.error}</p>}
      <button style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", padding: "var(--s-2) var(--s-4)", cursor: "pointer" }}>
        {unit ? "Enregistrer" : "Ajouter le cube"}
      </button>
    </form>
  );
}

function segLabel(active: boolean): React.CSSProperties {
  return { flex: 1, textAlign: "center", fontSize: "var(--t-small)", padding: "var(--s-2)", borderRadius: "var(--radius-sm)", cursor: "pointer", border: `1.5px solid ${active ? "var(--accent)" : "var(--line)"}`, background: active ? "var(--cream-deep)" : "var(--card)", color: active ? "var(--accent-deep)" : "var(--ink-soft)", fontWeight: active ? 600 : 400 };
}

const inp: React.CSSProperties = { padding: "var(--s-2) var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)", fontSize: "var(--t-small)" };
