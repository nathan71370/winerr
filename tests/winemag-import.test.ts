import { describe, it, expect } from "vitest";
import { parseWinemagCsv } from "@/winemag/import";

const csv = `,country,description,designation,points,price,province,region_1,region_2,taster_name,taster_twitter_handle,title,variety,winery
0,Italy,"desc","Vulkà Bianco",87,,Sicily & Sardinia,Etna,,Kerin,@kerino,"Nicosia 2013 Vulkà Bianco (Etna)",White Blend,Nicosia
1,France,"desc","",90,15,Bordeaux,Médoc,,Roger,@roger,"Château Test 2015 (Médoc)",Cabernet Sauvignon,Château Test
2,France,"desc","",90,15,Bordeaux,Médoc,,Roger,@roger,"Château Test 2015 (Médoc)",Cabernet Sauvignon,Château Test`;

describe("parseWinemagCsv", () => {
  it("maps winemag columns into reference rows", () => {
    const rows = parseWinemagCsv(csv);
    const nicosia = rows.find((r) => r.producer === "Nicosia")!;
    expect(nicosia.wine).toBe("Vulkà Bianco");
    expect(nicosia.region).toBe("Etna");
    expect(nicosia.country).toBe("Italy");
    expect(nicosia.colour).toBe("White");
    expect(nicosia.displayName).toContain("Nicosia 2013");
    expect(typeof nicosia.lwin).toBe("string");
    expect(nicosia.lwin.length).toBeGreaterThan(0);
  });
  it("falls back region_1 → province and derives red colour", () => {
    const ct = parseWinemagCsv(csv).find((r) => r.producer === "Château Test")!;
    expect(ct.region).toBe("Médoc");
    expect(ct.wine).toBeNull();        // empty designation → null
    expect(ct.colour).toBe("Red");
  });
  it("dedupes identical wines (same generated key)", () => {
    // rows 1 and 2 are identical → one reference row
    const rows = parseWinemagCsv(csv);
    expect(rows.filter((r) => r.producer === "Château Test")).toHaveLength(1);
    expect(rows).toHaveLength(2); // Nicosia + one Château Test
  });
  it("skips rows with no winery", () => {
    const bad = `,country,winery\n0,France,\n1,France,Real`;
    const rows = parseWinemagCsv(bad);
    expect(rows).toHaveLength(1);
    expect(rows[0].producer).toBe("Real");
  });
});
