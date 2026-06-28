export type DrinkStatus = {
  key: "young" | "ready" | "soon" | "past";
  label: string;
  color: string; // a CSS var() from the z1..z5 heat scale
};

// Maps a wine's estimated window against the current year to a status + heat
// colour. Returns null when the window is incomplete.
export function drinkStatus(
  from: number | null,
  to: number | null,
  currentYear: number,
): DrinkStatus | null {
  if (from == null || to == null) return null;
  if (currentYear < from) {
    return { key: "young", label: `Trop jeune (dès ${from})`, color: "var(--z1)" };
  }
  if (currentYear > to) {
    return { key: "past", label: `À boire (apogée passée ${to})`, color: "var(--z5)" };
  }
  if (currentYear >= to - 1) {
    return { key: "soon", label: `À boire avant ${to}`, color: "var(--z4)" };
  }
  return { key: "ready", label: `À boire (${from}–${to})`, color: "var(--z2)" };
}
