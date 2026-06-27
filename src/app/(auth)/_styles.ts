import type { CSSProperties } from "react";

export const inputStyle: CSSProperties = {
  padding: "var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)",
  background: "var(--card)", fontSize: "var(--t-body)",
};

export const btnStyle: CSSProperties = {
  padding: "var(--s-3)", border: "none", borderRadius: "var(--radius-pill)",
  background: "var(--accent)", color: "#fff", fontSize: "var(--t-body)", cursor: "pointer",
};
