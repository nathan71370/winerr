// Best-effort mapping of a grape/variety to a wine colour label. Approximate —
// used only as a search hint; the user can correct colour on the add form.
const RED = new Set([
  "pinot noir", "cabernet sauvignon", "merlot", "syrah", "shiraz", "red blend",
  "bordeaux-style red blend", "malbec", "tempranillo", "sangiovese", "nebbiolo",
  "zinfandel", "grenache", "portuguese red", "cabernet franc", "petite sirah",
  "carmenère", "barbera", "mourvèdre", "gamay", "corvina", "aglianico",
  "montepulciano", "primitivo", "touriga nacional", "petit verdot",
  "rhône-style red blend", "g-s-m", "nero d'avola", "carignan", "cinsault",
]);
const WHITE = new Set([
  "chardonnay", "riesling", "sauvignon blanc", "pinot gris", "pinot grigio",
  "white blend", "gewürztraminer", "viognier", "grüner veltliner", "chenin blanc",
  "albariño", "portuguese white", "sémillon", "bordeaux-style white blend",
  "melon", "muscat", "verdejo", "garganega", "vermentino", "torrontés",
  "marsanne", "roussanne", "pinot blanc", "fiano", "moscato", "gros and petit manseng",
]);
const SPARKLING = new Set([
  "champagne blend", "sparkling blend", "prosecco", "glera", "cava", "crémant",
]);

export function deriveColour(variety: string | null | undefined): "Red" | "White" | "Rosé" | "Sparkling" | null {
  if (!variety) return null;
  const v = variety.trim().toLowerCase();
  if (!v) return null;
  if (v.includes("rosé") || v === "rose" || v.includes("rosato")) return "Rosé";
  if (SPARKLING.has(v) || v.includes("sparkling") || v.includes("champagne")) return "Sparkling";
  if (RED.has(v)) return "Red";
  if (WHITE.has(v)) return "White";
  return null;
}
