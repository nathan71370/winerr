import { auth } from "@/auth/config";
import { redirect, notFound } from "next/navigation";
import { getCellarItem } from "@/cellar/queries";
import { EditBottleForm } from "./EditBottleForm";

export default async function EditBottlePage({ params }: { params: Promise<{ itemId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { itemId } = await params;
  const b = await getCellarItem(session.user.id, itemId);
  if (!b) notFound();

  const initial = {
    itemId: b.itemId,
    producer: b.producer ?? "",
    cuvee: b.cuvee ?? "",
    vintage: b.vintage != null ? String(b.vintage) : "",
    region: b.region ?? "",
    country: b.country ?? "",
    color: b.color ?? "rouge",
    grapes: b.grapes ?? "",
    quantity: String(b.quantity),
    purchasePrice: b.purchasePrice ?? "",
    purchaseDate: b.purchaseDate ?? "",
  };

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <a href="/cellar" style={{ fontSize: "var(--t-small)" }}>← Ma cave</a>
      <h1 style={{ fontSize: "var(--t-h1)", marginTop: "var(--s-3)" }}>Modifier la bouteille</h1>
      <EditBottleForm initial={initial} />
    </main>
  );
}
