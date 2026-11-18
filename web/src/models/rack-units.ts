// Rack unit layout without three.js, so the UI can import it without loading the 3D code.
export const U = 0.04445;
export const W = 0.6, D = 1.2;
export const Y0 = 0.12;
export type Unit = { u: number; kind: "srv2" | "srv4" | "sw" | "blank" | "cable" | "patch" };
export const STACK: Unit[] = [
  ...Array.from({ length: 8 }, () => ({ u: 2, kind: "srv2" as const })), { u: 1, kind: "blank" },
  ...Array.from({ length: 3 }, () => ({ u: 4, kind: "srv4" as const })), { u: 1, kind: "blank" },
  ...Array.from({ length: 4 }, () => ({ u: 2, kind: "srv2" as const })), { u: 1, kind: "cable" },
  { u: 1, kind: "sw" }, { u: 1, kind: "sw" }, { u: 1, kind: "patch" },
];
export const RACK_UNITS = STACK.reduce((a, s) => a + s.u, 0);

export interface RackUnit { index: number; u0: number; u: number; kind: Unit["kind"]; label: string; y0: number; y1: number }
const LABEL: Record<Unit["kind"], string> = { srv2: "2U server", srv4: "4U server", sw: "1U network switch", blank: "1U blank panel", cable: "1U cable manager", patch: "1U patch panel" };
export const RACK_UNIT_LIST: RackUnit[] = (() => {
  let u = 0;
  return STACK.map((s, index) => {
    const out = { index, u0: u + 1, u: s.u, kind: s.kind, label: LABEL[s.kind], y0: Y0 + u * U, y1: Y0 + (u + s.u) * U };
    u += s.u; return out;
  });
})();
// unit under a local height (metres above the floor), or null for the plinth, top and gaps
export function unitAtHeight(y: number): RackUnit | null {
  return RACK_UNIT_LIST.find((r) => y >= r.y0 && y < r.y1) ?? null;
}
