"use client";

import { useTransition } from "react";
import { StarRating } from "@/components/StarRating";
import { upsertRatingAction } from "@/reviews/actions";

// Quick-rate control for a cellar list row: clicking a star saves immediately.
export function RowRating({ wineId, value }: { wineId: string; value: number | null }) {
  const [pending, start] = useTransition();
  return (
    <span style={{ opacity: pending ? 0.5 : 1 }}>
      <StarRating
        value={value}
        size={17}
        onRate={(r) => start(() => upsertRatingAction(wineId, r))}
      />
    </span>
  );
}
