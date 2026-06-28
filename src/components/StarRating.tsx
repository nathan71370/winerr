"use client";

import type { CSSProperties } from "react";
import { starFills } from "@/reviews/rating";

// Half-star aware star rating. Read-only by default; pass onRate to make it
// interactive (click the left half of a star for X.5, the right half for X).
export function StarRating({
  value,
  onRate,
  size = 22,
}: {
  value: number | null;
  onRate?: (rating: number) => void;
  size?: number;
}) {
  const fills = starFills(value ?? 0);
  const interactive = !!onRate;

  function handle(e: React.MouseEvent<HTMLSpanElement>, index: number) {
    if (!onRate) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const leftHalf = e.clientX - rect.left < rect.width / 2;
    onRate(index + (leftHalf ? 0.5 : 1));
  }

  const wrap: CSSProperties = {
    display: "inline-flex",
    gap: 2,
    fontSize: size,
    lineHeight: 1,
    cursor: interactive ? "pointer" : "default",
  };

  return (
    <span style={wrap} aria-label={value != null ? `${value} sur 5` : "non noté"}>
      {fills.map((f, i) => (
        <span
          key={i}
          onClick={(e) => handle(e, i)}
          style={{ color: f === "empty" ? "var(--line)" : "var(--accent)" }}
        >
          {f === "half" ? (
            <span
              style={{
                background: "linear-gradient(90deg,var(--accent) 50%,var(--line) 50%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              ★
            </span>
          ) : (
            "★"
          )}
        </span>
      ))}
    </span>
  );
}
