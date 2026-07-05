import { auth } from "@/auth/config";
import { redirect, notFound } from "next/navigation";
import { getWineWithBottles } from "@/cellar/queries";
import { drinkStatus } from "@/cellar/drink-status";
import { ReviewForm } from "./ReviewForm";
import { latestSnapshots, priceHistory } from "@/price/queries";
import { hasQuoteKeys } from "@/price/service";
import { gainLossPct } from "@/price/valuation";
import { sparklinePoints } from "@/price/sparkline";
import { todayLocalISO } from "@/lib/dates";
import { getUserAIConfig } from "@/settings/queries";

export default async function WinePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { id } = await params;
  const data = await getWineWithBottles(session.user.id, id);
  if (!data) notFound();
  const { wine, bottles, review } = data;
  const ds = drinkStatus(wine.drinkFrom, wine.drinkTo, new Date().getFullYear());

  const viewerConfig = await getUserAIConfig(session.user.id);
  const canQuote = hasQuoteKeys(viewerConfig);
  // Snapshots are shared/catalog-level data — always load them (cheap), so the
  // block renders for everyone once a quote exists. Only the "no snapshot yet"
  // pending state is gated on the viewer's own quote-capable keys.
  const snapshot = (await latestSnapshots([wine.id])).get(wine.id) ?? null;
  const history = await priceHistory(wine.id);
  const spark = sparklinePoints(history.map((h) => h.estimate), 220, 36);
  const fmtEur = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: n < 100 ? 2 : 0 })} €`;

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <a href="/cellar" style={{ fontSize: "var(--t-small)" }}>← Ma cave</a>
        <a href={`/cave?wine=${wine.id}`} style={{ fontSize: "var(--t-small)", color: "var(--accent-deep)" }}>Localiser dans ma cave</a>
      </div>
      <h1 style={{ fontSize: "var(--t-h1)", marginTop: "var(--s-3)" }}>
        {wine.producer}{wine.cuvee ? ` · ${wine.cuvee}` : ""}
      </h1>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny DB-served thumbnail; no image optimizer on self-host */}
      <img src={`/api/wine-image/${wine.id}`} alt="" width={120} height={160}
        style={{ objectFit: "cover", borderRadius: "var(--radius)", border: "1px solid var(--line)", background: "var(--cream-deep)", marginTop: "var(--s-3)", display: "block" }} />
      <p style={{ color: "var(--ink-mute)", marginTop: "var(--s-2)" }}>
        {wine.vintage ?? "—"} · {wine.region ?? "—"} · {wine.color ?? "—"}
        {wine.grapes ? ` · ${wine.grapes}` : ""}
      </p>

      <div style={{ marginTop: "var(--s-5)", padding: "var(--s-5)", border: "1px solid var(--line)", borderRadius: "var(--radius)", background: "var(--card)" }}>
        <div style={{ fontSize: "var(--t-kicker)", textTransform: "uppercase", letterSpacing: 1.5, color: "var(--ink-mute)" }}>Fenêtre de dégustation</div>
        {ds ? (
          <div style={{ marginTop: "var(--s-2)" }}>
            <span style={{ fontSize: "var(--t-meta)", color: "#fff", background: ds.color, padding: "2px 8px", borderRadius: "var(--radius-pill)" }}>{ds.label}</span>
            {wine.drinkWindowConfidence && (
              <span style={{ color: "var(--ink-mute)", fontSize: "var(--t-meta)", marginLeft: "var(--s-2)" }}>
                confiance {Math.round(Number(wine.drinkWindowConfidence) * 100)} %
              </span>
            )}
          </div>
        ) : (
          <div style={{ marginTop: "var(--s-2)", color: "var(--ink-mute)", fontSize: "var(--t-small)" }}>—</div>
        )}
      </div>

      {(snapshot || canQuote) && (
        <div style={{ marginTop: "var(--s-4)", padding: "var(--s-5)", border: "1px solid var(--line)", borderRadius: "var(--radius)", background: "var(--card)" }}>
          <div style={{ fontSize: "var(--t-kicker)", textTransform: "uppercase", letterSpacing: 1.5, color: "var(--ink-mute)" }}>Cote estimée</div>
          {snapshot?.estimate != null ? (
            <div style={{ marginTop: "var(--s-2)" }}>
              <span style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h2)" }}>{fmtEur(snapshot.estimate)}</span>
              {snapshot.low != null && snapshot.high != null && (
                <span style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)", marginLeft: "var(--s-2)" }}>
                  ({fmtEur(snapshot.low)} – {fmtEur(snapshot.high)})
                </span>
              )}
              <div style={{ color: "var(--ink-mute)", fontSize: "var(--t-meta)", marginTop: 4 }}>
                estimé le {snapshot.fetchedAt.toLocaleDateString("fr-FR")}{snapshot.source && snapshot.source !== "none" ? ` · ${snapshot.source}` : ""}
              </div>
              {spark && (
                <svg viewBox="0 0 220 36" width={220} height={36} style={{ marginTop: "var(--s-3)", display: "block" }} aria-label="Évolution de la cote">
                  <polyline points={spark} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
                </svg>
              )}
            </div>
          ) : (
            <div style={{ marginTop: "var(--s-2)", color: "var(--ink-mute)", fontSize: "var(--t-small)" }}>
              {snapshot ? "—" : "Cote en attente"}
            </div>
          )}
        </div>
      )}

      <h2 style={{ fontSize: "var(--t-h3)", marginTop: "var(--s-6)" }}>Mon avis</h2>
      <div style={{ marginTop: "var(--s-3)" }}>
        <ReviewForm
          wineId={wine.id}
          initialRating={review?.rating != null ? Number(review.rating) : null}
          initialNote={review?.tastingNote ?? ""}
          initialDate={review?.tastedAt ?? todayLocalISO()}
        />
      </div>

      <h2 style={{ fontSize: "var(--t-h3)", marginTop: "var(--s-6)" }}>Mes bouteilles</h2>
      <ul style={{ listStyle: "none", marginTop: "var(--s-3)", display: "grid", gap: "var(--s-2)" }}>
        {bottles.map((b) => (
          <li key={b.id} style={{ padding: "var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)", fontSize: "var(--t-small)", color: "var(--ink-soft)" }}>
            ×{b.quantity} · {b.status === "drunk" ? "bue" : "en cave"}
            {b.purchasePrice ? ` · ${b.purchasePrice} €` : ""}
            {b.purchaseDate ? ` · acheté le ${b.purchaseDate}` : ""}
            {(() => {
              const buy = b.purchasePrice != null ? Number(b.purchasePrice) : null;
              const pct = buy != null && snapshot?.estimate != null ? gainLossPct(buy, snapshot.estimate) : null;
              return pct != null ? (
                <span style={{ marginLeft: "var(--s-2)", color: pct >= 0 ? "var(--good)" : "var(--warn)", fontWeight: 600 }}>
                  {pct >= 0 ? "+" : ""}{pct} %
                </span>
              ) : null;
            })()}
          </li>
        ))}
      </ul>
    </main>
  );
}
