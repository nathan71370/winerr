"use client";

import { useState } from "react";
import { StarRating } from "@/components/StarRating";
import { upsertReviewAction } from "@/reviews/actions";

export function ReviewForm({
  wineId,
  initialRating,
  initialNote,
  initialDate,
}: {
  wineId: string;
  initialRating: number | null;
  initialNote: string;
  initialDate: string;
}) {
  const [rating, setRating] = useState<number | null>(initialRating);

  return (
    <form action={upsertReviewAction} style={{ display: "grid", gap: "var(--s-3)" }}>
      <input type="hidden" name="wineId" value={wineId} />
      <input type="hidden" name="rating" value={rating ?? ""} />
      <StarRating value={rating} onRate={setRating} size={28} />
      <textarea
        name="tastingNote"
        defaultValue={initialNote}
        placeholder="Notes de dégustation…"
        style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "var(--s-3)", fontSize: "var(--t-body)", minHeight: 80, background: "var(--card)" }}
      />
      <label style={{ fontSize: "var(--t-small)", color: "var(--ink-soft)", display: "grid", gap: 4 }}>
        Dégusté le
        <input
          type="date"
          name="tastedAt"
          defaultValue={initialDate}
          style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "var(--s-2) var(--s-3)", fontSize: "var(--t-body)", background: "var(--card)" }}
        />
      </label>
      <button
        disabled={rating == null}
        style={{ padding: "var(--s-3)", border: "none", borderRadius: "var(--radius-pill)", background: "var(--accent)", color: "#fff", fontSize: "var(--t-body)", cursor: "pointer" }}
      >
        Enregistrer
      </button>
    </form>
  );
}
