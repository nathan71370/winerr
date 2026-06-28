import { describe, it, expect } from "vitest";
import { parseLwinCsv } from "@/lwin/import";

const csv = `LWIN,DISPLAY_NAME,PRODUCER_NAME,WINE,COUNTRY,REGION,COLOUR,TYPE
1000001,"Château Margaux","Château Margaux","",France,Bordeaux,Red,Still
1000002,"Pavillon Rouge","Château Margaux","Pavillon Rouge",France,Bordeaux,Red,Still`;

describe("parseLwinCsv", () => {
  it("maps LWIN columns to lwin_wines rows", () => {
    const rows = parseLwinCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      lwin: "1000001",
      displayName: "Château Margaux",
      producer: "Château Margaux",
      wine: "",
      region: "Bordeaux",
      country: "France",
      colour: "Red",
      type: "Still",
    });
  });

  it("skips rows without an LWIN code", () => {
    const bad = `LWIN,DISPLAY_NAME\n,"No code"\n2000001,"Has code"`;
    const rows = parseLwinCsv(bad);
    expect(rows).toHaveLength(1);
    expect(rows[0].lwin).toBe("2000001");
  });
});
