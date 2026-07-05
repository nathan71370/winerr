// Registration whitelist. Unset/empty env → open registration (opt-in
// restriction). Matching is case-insensitive and whitespace-tolerant.
export function isEmailAllowed(email: string, whitelistEnv: string | undefined | null): boolean {
  const list = (whitelistEnv ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return true;
  return list.includes(email.trim().toLowerCase());
}
