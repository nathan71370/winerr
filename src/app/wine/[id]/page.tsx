import { auth } from "@/auth/config";
import { redirect, notFound } from "next/navigation";
import { getWineWithBottles } from "@/cellar/queries";
import { drinkStatus } from "@/cellar/drink-status";
import { ReviewForm } from "./ReviewForm";

export default async function WinePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { id } = await params;
  const data = await getWineWithBottles(session.user.id, id);
  if (!data) notFound();
  const { wine, bottles, review } = data;
  const ds = drinkStatus(wine.drinkFrom, wine.drinkTo, new Date().getFullYear());

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <a href="/cellar" style={{ fontSize: "var(--t-small)" }}>← Ma cave</a>
      <h1 style={{ fontSize: "var(--t-h1)", marginTop: "var(--s-3)" }}>
        {wine.producer}{wine.cuvee ? ` · ${wine.cuvee}` : ""}
      </h1>
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

      <h2 style={{ fontSize: "var(--t-h3)", marginTop: "var(--s-6)" }}>Mon avis</h2>
      <div style={{ marginTop: "var(--s-3)" }}>
        <ReviewForm
          wineId={wine.id}
          initialRating={review?.rating != null ? Number(review.rating) : null}
          initialNote={review?.tastingNote ?? ""}
          initialDate={review?.tastedAt ?? new Date().toISOString().slice(0, 10)}
        />
      </div>

      <h2 style={{ fontSize: "var(--t-h3)", marginTop: "var(--s-6)" }}>Mes bouteilles</h2>
      <ul style={{ listStyle: "none", marginTop: "var(--s-3)", display: "grid", gap: "var(--s-2)" }}>
        {bottles.map((b) => (
          <li key={b.id} style={{ padding: "var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)", fontSize: "var(--t-small)", color: "var(--ink-soft)" }}>
            ×{b.quantity} · {b.status === "drunk" ? "bue" : "en cave"}
            {b.purchasePrice ? ` · ${b.purchasePrice} €` : ""}
            {b.purchaseDate ? ` · acheté le ${b.purchaseDate}` : ""}
          </li>
        ))}
      </ul>
    </main>
  );
}
