import { redirect } from "next/navigation";
import { signIn } from "@/auth/config";

export default function LoginPage() {
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
        <input name="email" type="email" placeholder="Email" required style={inputStyle} />
        <input name="password" type="password" placeholder="Mot de passe" required style={inputStyle} />
        <button style={btnStyle}>Entrer</button>
      </form>
      <p style={{ marginTop: "var(--s-4)", fontSize: "var(--t-small)" }}>
        Pas de compte ? <a href="/register">S'inscrire</a>
      </p>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)",
  background: "var(--card)", fontSize: "var(--t-body)",
};
const btnStyle: React.CSSProperties = {
  padding: "var(--s-3)", border: "none", borderRadius: "var(--radius-pill)",
  background: "var(--accent)", color: "#fff", fontSize: "var(--t-body)", cursor: "pointer",
};
