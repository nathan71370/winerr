import { describe, it, expect } from "vitest";
import { isEmailAllowed } from "@/auth/whitelist";

describe("isEmailAllowed", () => {
  it("is open when the whitelist is unset or empty", () => {
    expect(isEmailAllowed("a@b.fr", undefined)).toBe(true);
    expect(isEmailAllowed("a@b.fr", "")).toBe(true);
    expect(isEmailAllowed("a@b.fr", " , ,")).toBe(true);
  });
  it("matches case-insensitively and trims whitespace", () => {
    const wl = " Alice@Mail.com , bob@mail.com ";
    expect(isEmailAllowed("alice@mail.com", wl)).toBe(true);
    expect(isEmailAllowed("  BOB@MAIL.COM  ", wl)).toBe(true);
  });
  it("refuses an email not on the list", () => {
    expect(isEmailAllowed("eve@mail.com", "alice@mail.com,bob@mail.com")).toBe(false);
  });
});
