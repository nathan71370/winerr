"use client";

import { useState } from "react";
import { projectUnit, boardSize, compartmentPolygon, pointsAttr, CUBE, DEPTH_X, DEPTH_Y } from "@/cave/iso";
import { compartmentKeys, type Unit } from "@/cave/compartments";
import { compartmentId, groupContents, type ContentRow } from "@/cave/group";
import { placeBottlesAction, unplaceAction } from "@/cave/actions";

export type BoardUnit = { id: string; name: string; kind: "grid" | "diamond"; cols: number | null; rows: number | null; gridX: number; gridY: number };
export type TrayItem = { itemId: string; producer: string; cuvee: string | null; vintage: number | null; color: string | null; unplaced: number };

const colorHex: Record<string, string> = { rouge: "#8f2f24", blanc: "#d9c27a", rose: "#d98fa0", effervescent: "#c9a06a" };

export function CaveBoard({
  units, contents, tray, highlight, locate,
}: {
  units: BoardUnit[];
  contents: ContentRow[];
  tray: TrayItem[];
  highlight: string[];       // compartment ids to pulse (locate mode)
  locate: { wineLabel: string } | null;
}) {
  const [selected, setSelected] = useState<string | null>(null); // "unitId:compartment"
  const grouped = groupContents(contents);
  const highlightSet = new Set(highlight);
  const rows = units.length ? Math.max(...units.map((u) => u.gridY)) + 1 : 1;
  const { width, height } = boardSize(units);

  const wineLabel = (r: ContentRow) => `${r.producer}${r.cuvee ? " · " + r.cuvee : ""}${r.vintage ? " " + r.vintage : ""}`;
  const selectedRows = selected ? grouped.get(selected) ?? [] : [];
  const selectedUnitId = selected ? selected.split(":")[0] : null;
  const selectedCompartment = selected ? selected.slice(selected.indexOf(":") + 1) : null;

  return (
    <div>
      <style>{`@keyframes cavePulse {0%,100%{opacity:.55}50%{opacity:1}} .cave-glow{animation:cavePulse 1.4s ease-in-out infinite}`}</style>

      {locate && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", background: "var(--ink)", color: "var(--cream)", borderRadius: "var(--radius)", padding: "var(--s-3) var(--s-4)", marginBottom: "var(--s-4)" }}>
          <b style={{ fontSize: "var(--t-body)" }}>{locate.wineLabel}</b>
          <span style={{ marginLeft: "auto", fontSize: "var(--t-small)", color: "var(--accent)" }}>
            {highlight.length > 0 ? `${highlight.length} compartiment(s)` : "aucune bouteille rangée"}
          </span>
        </div>
      )}

      <div style={{ overflow: "auto", border: "1px solid var(--line)", borderRadius: "var(--radius)", background: "var(--cream-deep)" }}>
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ maxWidth: "100%", display: "block" }}>
          {units.map((u) => {
            const origin = projectUnit(u.gridX, u.gridY, rows);
            const unit: Unit = { kind: u.kind, cols: u.cols, rows: u.rows };
            const keys = compartmentKeys(unit);
            // depth extrusion (top + right faces)
            const top = pointsAttr([{ x: origin.x, y: origin.y }, { x: origin.x + DEPTH_X, y: origin.y - DEPTH_Y }, { x: origin.x + CUBE + DEPTH_X, y: origin.y - DEPTH_Y }, { x: origin.x + CUBE, y: origin.y }]);
            const right = pointsAttr([{ x: origin.x + CUBE, y: origin.y }, { x: origin.x + CUBE + DEPTH_X, y: origin.y - DEPTH_Y }, { x: origin.x + CUBE + DEPTH_X, y: origin.y + CUBE - DEPTH_Y }, { x: origin.x + CUBE, y: origin.y + CUBE }]);
            return (
              <g key={u.id}>
                <polygon points={top} fill="#d8c9aa" stroke="#b79a6a" strokeWidth={1.5} />
                <polygon points={right} fill="#c9b896" stroke="#b79a6a" strokeWidth={1.5} />
                <rect x={origin.x} y={origin.y} width={CUBE} height={CUBE} fill="#efe7d8" stroke="#b79a6a" strokeWidth={1.5} />
                {keys.map((key) => {
                  const id = compartmentId(u.id, key);
                  const poly = compartmentPolygon(unit, key, origin);
                  const bottles = grouped.get(id) ?? [];
                  const count = bottles.reduce((s, b) => s + b.quantity, 0);
                  const dimmed = highlightSet.size > 0 && !highlightSet.has(id);
                  const glow = highlightSet.has(id);
                  const fill = count > 0 ? colorHex[bottles[0].color ?? ""] ?? "#a08" : "transparent";
                  const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
                  const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
                  return (
                    <g key={id} onClick={() => setSelected(id)} style={{ cursor: "pointer", opacity: dimmed ? 0.28 : 1 }}>
                      <polygon points={pointsAttr(poly)} className={glow ? "cave-glow" : undefined}
                        fill={glow ? "var(--accent)" : fill} fillOpacity={glow ? 0.9 : count > 0 ? 0.85 : 0}
                        stroke={selected === id ? "var(--accent-deep)" : "#a6784a"} strokeWidth={selected === id ? 2.5 : 0.8} />
                      {count > 0 && !glow && (
                        <text x={cx} y={cy + 3} textAnchor="middle" fontSize={11} fill="#fff" fontWeight={700}>{count}</text>
                      )}
                    </g>
                  );
                })}
                <text x={origin.x + CUBE / 2} y={origin.y + CUBE + 14} textAnchor="middle" fontSize={10} fill="var(--ink-mute)">{u.name}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {selected && (
        <CompartmentPanel
          unitName={units.find((u) => u.id === selectedUnitId)?.name ?? "?"}
          compartment={selectedCompartment ?? ""}
          unitId={selectedUnitId ?? ""}
          rows={selectedRows}
          tray={tray}
          onClose={() => setSelected(null)}
          label={wineLabel}
        />
      )}

      <div style={{ marginTop: "var(--s-4)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "var(--s-3) var(--s-4)" }}>
        <div style={{ fontSize: "var(--t-meta)", color: "var(--accent-deep)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>
          À ranger — {tray.reduce((s, t) => s + t.unplaced, 0)} bouteille(s)
        </div>
        {tray.length === 0 ? (
          <p style={{ fontSize: "var(--t-small)", color: "var(--ink-mute)", marginTop: "var(--s-2)" }}>Tout est rangé.</p>
        ) : (
          <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap", marginTop: "var(--s-2)" }}>
            {tray.map((t) => (
              <span key={t.itemId} style={{ display: "flex", alignItems: "center", gap: "var(--s-1)", fontSize: "var(--t-small)", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-pill)", padding: "2px 10px" }}>
                <span style={{ width: 7, height: 16, borderRadius: 2, background: colorHex[t.color ?? ""] ?? "#a08" }} />
                {t.producer}{t.vintage ? ` ${t.vintage}` : ""} <b style={{ color: "var(--accent-deep)" }}>×{t.unplaced}</b>
              </span>
            ))}
          </div>
        )}
        <p style={{ fontSize: "var(--t-meta)", color: "var(--ink-mute)", marginTop: "var(--s-2)" }}>Clique un compartiment pour y déposer une bouteille.</p>
      </div>
    </div>
  );
}

function CompartmentPanel({
  unitName, compartment, unitId, rows, tray, onClose, label,
}: {
  unitName: string; compartment: string; unitId: string;
  rows: ContentRow[]; tray: TrayItem[]; onClose: () => void; label: (r: ContentRow) => string;
}) {
  const placeable = tray.filter((t) => t.unplaced > 0);
  return (
    <div style={{ marginTop: "var(--s-4)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "var(--s-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <b style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h3)" }}>{unitName} · {compartment}</b>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-mute)", cursor: "pointer", fontSize: "var(--t-small)" }}>Fermer</button>
      </div>

      {rows.length === 0 ? (
        <p style={{ fontSize: "var(--t-small)", color: "var(--ink-mute)", marginTop: "var(--s-2)" }}>Compartiment vide.</p>
      ) : (
        <ul style={{ listStyle: "none", display: "grid", gap: "var(--s-2)", marginTop: "var(--s-3)" }}>
          {rows.map((r) => (
            <li key={r.itemId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--t-small)" }}>
              <span>{label(r)} <b>×{r.quantity}</b></span>
              <form action={unplaceAction}>
                <input type="hidden" name="placementId" value={r.placementId} />
                <button style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--radius-pill)", padding: "2px 10px", fontSize: "var(--t-meta)", color: "var(--warn)", cursor: "pointer" }}>Retirer</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {placeable.length > 0 && (
        <form action={placeBottlesAction} style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)", marginTop: "var(--s-3)", alignItems: "center" }}>
          <input type="hidden" name="unitId" value={unitId} />
          <input type="hidden" name="compartment" value={compartment} />
          <select name="cellarItemId" required style={sel}>
            {placeable.map((t) => <option key={t.itemId} value={t.itemId}>{t.producer}{t.vintage ? ` ${t.vintage}` : ""} (×{t.unplaced})</option>)}
          </select>
          <input name="quantity" type="number" min={1} defaultValue={1} style={{ ...sel, width: 64 }} />
          <button style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", padding: "var(--s-2) var(--s-4)", cursor: "pointer", fontSize: "var(--t-small)" }}>Déposer ici</button>
        </form>
      )}
    </div>
  );
}

const sel: React.CSSProperties = { padding: "var(--s-2) var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)", fontSize: "var(--t-small)" };
