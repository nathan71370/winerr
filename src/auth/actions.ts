"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/auth/password";
import { registerSchema } from "@/lib/validation";
import { signIn } from "@/auth/config";

export async function registerAction(_prev: unknown, formData: FormData) {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: "Champs invalides (email valide + mot de passe ≥ 8 caractères)." };
  }
  const { email, password, name } = parsed.data;

  const existing = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (existing) return { error: "Un compte existe déjà avec cet email." };

  const passwordHash = await hashPassword(password);
  try {
    await db.insert(users).values({ email, name, passwordHash });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "23505") {
      return { error: "Un compte existe déjà avec cet email." };
    }
    throw e;
  }

  await signIn("credentials", { email, password, redirect: false });
  redirect("/cellar");
}
