import { describe, expect, it } from "vitest";
import { compact, fixed, formatKpi, group, percent, toCsv } from "../src/util";
import { escapeHtml } from "../src/markdown";
import { niceTicks } from "../src/charts";

const kpi = (over: Record<string, unknown>) => ({ id: "x", label: "x", value: 1, unit: "kW", category: "c", provenance: "modeled", synthetic: false, sources: [], formula: null, description: "", ...over }) as any;

describe("number formatting", () => {
  it("groups thousands", () => expect(group(1234567.891, 1)).toBe("1,234,567.9"));
  it("fixed handles null", () => expect(fixed(null)).not.toBe("NaN"));
  it("compact abbreviates millions", () => expect(compact(32_850_000)).toBe("32.9M"));
  it("percent of a ratio", () => expect(percent(0.0992, 1)).toBe("9.9%"));
});

describe("KPI display", () => {
  it("shows PUE as a bare ratio", () => expect(formatKpi(kpi({ id: "pue", unit: "ratio", value: 1.3468 }))).toEqual({ text: "1.347", unit: "" }));
  it("shows IRR as percent", () => expect(formatKpi(kpi({ id: "irr", unit: "ratio", value: 0.0992 })).unit).toBe("%"));
  it("keeps negative NPV sign", () => expect(formatKpi(kpi({ id: "npv", unit: "USD", value: -329000 })).text).toBe("-329,000"));
  it("scales large USD to millions", () => expect(formatKpi(kpi({ unit: "USD", value: 57_600_000 })).unit).toBe("USD M"));
  it("says not defined for null", () => expect(formatKpi(kpi({ value: null })).text).toBe("not defined"));
});

describe("csv and html helpers", () => {
  it("quotes commas and quotes", () => expect(toCsv([{ a: 'x,"y"', b: 1 }])).toBe('a,b\n"x,""y""",1\n'));
  it("writes empty for null", () => expect(toCsv([{ a: null, b: 2 }])).toBe("a,b\n,2\n"));
  it("escapes html", () => expect(escapeHtml('<b a="1">&')).toBe("&lt;b a=&quot;1&quot;&gt;&amp;"));
});

describe("chart ticks", () => {
  it("covers the range", () => {
    const t = niceTicks(1.2, 1.5, 5);
    expect(t[0]).toBeLessThanOrEqual(1.2);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(1.5);
  });
  it("is strictly increasing", () => {
    const t = niceTicks(-3, 97, 5);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
  });
});
