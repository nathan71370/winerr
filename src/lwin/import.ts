import { parse } from "csv-parse/sync";

export type LwinRow = {
  lwin: string;
  displayName: string | null;
  producer: string | null;
  wine: string | null;
  region: string | null;
  country: string | null;
  colour: string | null;
  type: string | null;
};

// Parses an LWIN CSV export into rows ready for upsert. Tolerates extra columns;
// rows without an LWIN code are skipped.
export function parseLwinCsv(csv: string): LwinRow[] {
  const records: Record<string, string>[] = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  const rows: LwinRow[] = [];
  for (const r of records) {
    const lwin = r.LWIN?.trim();
    if (!lwin) continue;
    rows.push({
      lwin,
      displayName: r.DISPLAY_NAME ?? null,
      producer: r.PRODUCER_NAME ?? null,
      wine: r.WINE ?? null,
      region: r.REGION ?? null,
      country: r.COUNTRY ?? null,
      colour: r.COLOUR ?? null,
      type: r.TYPE ?? null,
    });
  }
  return rows;
}
