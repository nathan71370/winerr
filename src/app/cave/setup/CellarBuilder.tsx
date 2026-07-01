"use client";

import { useState, useTransition } from "react";
import { moveUnitAction, deleteUnitAction } from "@/cave/actions";
import { CubeForm, type CubeRow } from "./CubeForm";

const CELL = 92;

export function CellarBuilder({ units }: { units: CubeRow[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ gridX: number; gridY: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const maxX = units.length ? Math.max(...units.map((u) => u.gridX)) : 0;
  const maxY = units.length ? Math.max(...units.map((u) => u.gridY)) : 0;
  const cols = maxX + 2;               // one spare column
  const levels = maxY + 2;             // one spare level
  const at = (x: number, y: number) => units.find((u) => u.gridX === x && u.gridY === y);

  function drop(x: number, y: number) {
    if (!dragId || at(x, y)) return;
    const id = dragId;
    setDragId(null);
    startTransition(() => { moveUnitAction(id, x, y); });
  }

  const selectedUnit = units.find((u) => u.id === selected) ?? null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "var(--s-5)", alignItems: "start" }}>
      <div style={{ overflow: "auto", background: "var(--cream-deep)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "var(--s-4)" }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${CELL}px)`, gap: 10, justifyContent: "start" }}>
          {/* render top level first (highest gridY), floor last */}
          {Array.from({ length: levels }).flatMap((_, rowFromTop) => {
            const y = levels - 1 - rowFromTop;
            return Array.from({ length: cols }).map((__, x) => {
              const u = at(x, y);
              if (u) {
                return (
                  <div
                    key={`${x}-${y}`}
                    draggable
                    onDragStart={() => setDragId(u.id)}
                    onClick={() => { setSelected(u.id); setAdding(null); }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(u.id); setAdding(null); } }}
                    aria-label={`${u.name}, ${u.kind === "diamond" ? "losange" : "grille"} ${u.cols}×${u.rows}`}
                    style={{ height: CELL, border: `2px solid ${selected === u.id ? "var(--accent)" : "var(--line)"}`, borderRadius: 8, background: "var(--card)", cursor: "grab", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", boxShadow: selected === u.id ? "0 0 0 3px rgba(216,91,61,.25)" : "none" }}
                  >
                    <CubeIcon kind={u.kind} />
                    <span style={{ position: "absolute", bottom: 3, left: 0, right: 0, textAlign: "center", fontSize: 9, color: "var(--ink-mute)" }}>{u.name}</span>
                  </div>
                );
              }
              return (
                <div
                  key={`${x}-${y}`}
                  onClick={() => { setAdding({ gridX: x, gridY: y }); setSelected(null); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => drop(x, y)}
                  style={{ height: CELL, border: "2px dashed var(--line)", borderRadius: 8, background: adding && adding.gridX === x && adding.gridY === y ? "var(--cream)" : "transparent", color: "var(--ink-mute)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}
                >
                  +
                </div>
              );
            });
          })}
        </div>
        <p style={{ fontSize: "var(--t-meta)", color: "var(--ink-mute)", marginTop: "var(--s-3)" }}>
          Clique une case « + » pour poser un cube. Glisse un cube pour le déplacer / l’empiler. La rangée du bas est posée par terre.
        </p>
      </div>

      <aside style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "var(--s-4)" }}>
        {adding ? (
          <>
            <h3 style={{ fontSize: "var(--t-h3)", marginBottom: "var(--s-3)" }}>Nouveau cube</h3>
            <CubeForm gridX={adding.gridX} gridY={adding.gridY} onSuccess={() => setAdding(null)} />
            <button onClick={() => setAdding(null)} style={ghostBtn}>Annuler</button>
          </>
        ) : selectedUnit ? (
          <>
            <h3 style={{ fontSize: "var(--t-h3)", marginBottom: "var(--s-3)" }}>{selectedUnit.name}</h3>
            <CubeForm unit={selectedUnit} onSuccess={() => setSelected(null)} />
            <form action={deleteUnitAction} style={{ marginTop: "var(--s-3)" }}>
              <input type="hidden" name="unitId" value={selectedUnit.id} />
              <button style={{ ...ghostBtn, color: "var(--warn)", borderColor: "var(--line)" }}>Supprimer (les bouteilles reviennent « à ranger »)</button>
            </form>
          </>
        ) : (
          <p style={{ fontSize: "var(--t-small)", color: "var(--ink-mute)" }}>Sélectionne un cube pour l’éditer, ou clique une case « + » pour en ajouter un.</p>
        )}
      </aside>
    </div>
  );
}

function CubeIcon({ kind }: { kind: "grid" | "diamond" }) {
  if (kind === "diamond") {
    return (
      <svg viewBox="0 0 40 40" width={44} height={44} aria-hidden>
        <rect x="4" y="4" width="32" height="32" fill="#e7dcc6" stroke="#b79a6a" strokeWidth={1.5} />
        <line x1="20" y1="4" x2="20" y2="36" stroke="#c9b896" strokeWidth={1} />
        <line x1="4" y1="20" x2="36" y2="20" stroke="#c9b896" strokeWidth={1} />
        <path d="M4 4 L20 20 L4 36 M36 4 L20 20 L36 36" stroke="#a6784a" strokeWidth={1.5} fill="none" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" width={44} height={44} aria-hidden>
      <rect x="4" y="4" width="32" height="32" fill="#e7dcc6" stroke="#b79a6a" strokeWidth={1.5} />
      <line x1="15" y1="4" x2="15" y2="36" stroke="#c9b896" strokeWidth={1} />
      <line x1="26" y1="4" x2="26" y2="36" stroke="#c9b896" strokeWidth={1} />
      <line x1="4" y1="15" x2="36" y2="15" stroke="#c9b896" strokeWidth={1} />
      <line x1="4" y1="26" x2="36" y2="26" stroke="#c9b896" strokeWidth={1} />
    </svg>
  );
}

const ghostBtn: React.CSSProperties = { width: "100%", marginTop: "var(--s-3)", background: "none", border: "1px solid var(--line)", borderRadius: "var(--radius-pill)", padding: "var(--s-2)", fontSize: "var(--t-small)", color: "var(--ink-soft)", cursor: "pointer" };
