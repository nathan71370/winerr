import { redirect } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/auth/config";
import { inputStyle, btnStyle, labelStyle } from "../_styles";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirect: false,
      });
    } catch {
      redirect("/login?error=1");
    }
    redirect("/cellar");
  }

  return (
    <main style={{ maxWidth: 360, margin: "10vh auto", padding: "var(--s-6)" }}>
      <h1 style={{ fontSize: "var(--t-h1)" }}>Se connecter</h1>
      <form action={login} style={{ display: "grid", gap: "var(--s-3)", marginTop: "var(--s-6)" }}>
        <label style={labelStyle}>Email
          <input name="email" type="email" placeholder="Email" required autoComplete="email" style={inputStyle} />
        </label>
        <label style={labelStyle}>Mot de passe
          <input name="password" type="password" placeholder="Mot de passe" required autoComplete="current-password" style={inputStyle} />
        </label>
        {error && <p aria-live="polite" style={{ color: "var(--warn)", fontSize: "var(--t-small)" }}>Identifiants invalides.</p>}
        <button style={btnStyle}>Entrer</button>
      </form>
      <p style={{ marginTop: "var(--s-4)", fontSize: "var(--t-small)" }}>
        Pas de compte ? <Link href="/register">S’inscrire</Link>
      </p>
    </main>
  );
}
