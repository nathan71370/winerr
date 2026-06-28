import { parse } from "csv-parse/sync";
import { deriveColour } from "./colour";

export type WinemagRefRow = {
  lwin: string;
  displayName: string | null;
  producer: string | null;
  wine: string | null;
  region: string | null;
  country: string | null;
  colour: string | null;
  type: string | null;
};

// Deterministic surrogate key from a row's identity (djb2). Re-imports upsert,
// and duplicate reviews of the same wine collapse to one reference row.
function keyOf(parts: string): string {
  let h = 5381;
  for (let i = 0; i < parts.length; i++) h = ((h << 5) + h + parts.charCodeAt(i)) >>> 0;
  return "wm" + h.toString(36);
}

// Parses the winemag 130k CSV into reference rows for `lwin_wines`, deduped by
// generated key.
export function parseWinemagCsv(csv: string): WinemagRefRow[] {
  const records: Record<string, string>[] = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });
  const byKey = new Map<string, WinemagRefRow>();
  for (const r of records) {
    const producer = (r.winery ?? "").trim();
    if (!producer) continue;
    const wine = (r.designation ?? "").trim() || null;
    const region = (r.region_1 ?? "").trim() || (r.province ?? "").trim() || null;
    const country = (r.country ?? "").trim() || null;
    const colour = deriveColour(r.variety);
    const displayName = (r.title ?? "").trim() || producer;
    const lwin = keyOf(`${producer}|${wine ?? ""}|${region ?? ""}|${country ?? ""}`);
    byKey.set(lwin, {
      lwin,
      displayName,
      producer,
      wine,
      region,
      country,
      colour,
      type: colour === "Sparkling" ? "Sparkling" : "Still",
    });
  }
  return [...byKey.values()];
}
