// Pure helpers to shape cave data for rendering. A "compartment id" is the
// stable "<unitId>:<compartment>" key used everywhere the board addresses a slot.
export function compartmentId(unitId: string, compartment: string): string {
  return `${unitId}:${compartment}`;
}

export type ContentRow = {
  placementId: string;
  unitId: string;
  compartment: string;
  quantity: number;
  itemId: string;
  wineId: string;
  producer: string;
  cuvee: string | null;
  vintage: number | null;
  color: string | null;
};

// Group placement/content rows by compartment id → the bottles in that compartment.
export function groupContents(rows: ContentRow[]): Map<string, ContentRow[]> {
  const map = new Map<string, ContentRow[]>();
  for (const row of rows) {
    const id = compartmentId(row.unitId, row.compartment);
    const list = map.get(id) ?? [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}

// The set of compartment ids that hold a located wine's placements.
export function highlightSet(placements: { unitId: string; compartment: string }[]): Set<string> {
  return new Set(placements.map((p) => compartmentId(p.unitId, p.compartment)));
}
