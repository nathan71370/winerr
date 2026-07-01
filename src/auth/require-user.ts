import { redirect } from "next/navigation";
import { auth } from "@/auth/config";

// Returns the acting user's id, or redirects to /login. Use in every server
// action / query that must be scoped to the current user.
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  return id;
}
