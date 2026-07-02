// The user's calendar day (Europe/Paris), as YYYY-MM-DD. fr-CA gives ISO order.
export function todayLocalISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(now);
}
