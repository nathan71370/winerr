import { requireUserId } from "@/auth/require-user";
import { getSettingsState } from "@/settings/queries";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const state = await getSettingsState(userId);

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <a href="/cellar" style={{ fontSize: "var(--t-small)" }}>← Ma cave</a>
      <h1 style={{ fontSize: "var(--t-h1)", marginTop: "var(--s-3)" }}>Réglages</h1>
      <SettingsForm state={state} />
    </main>
  );
}
