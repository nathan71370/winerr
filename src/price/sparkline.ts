// src/price/sparkline.ts
// Pure: map a numeric series onto an SVG <polyline points> string of the given
// box. Min → bottom, max → top; a flat series sits at mid-height.
export function sparklinePoints(values: number[], width: number, height: number): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = span === 0 ? height / 2 : height - ((v - min) / span) * height;
      return `${round2(x)},${round2(y)}`;
    })
    .join(" ");
}

const round2 = (n: number) => Math.round(n * 100) / 100;
