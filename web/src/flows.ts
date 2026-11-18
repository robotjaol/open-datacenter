import * as THREE from "three";
import type { Twin } from "./types";

// Animated particles along schematic power and cooling routes. Positions come from the display
// positions of the plant and the rack rows; they show the direction and relative size of flows, not cable routes.
export type FlowKind = "powerA" | "powerB" | "supply" | "return";
export interface Route { kind: FlowKind; pts: THREE.Vector3[]; length: number; cum: number[]; label: string }

const COLOR: Record<FlowKind, number> = { powerA: 0xff6b5a, powerB: 0x5aa9ff, supply: 0x38e0f8, return: 0xffb347 };
const SPACING: Record<FlowKind, number> = { powerA: 1.4, powerB: 1.4, supply: 1.7, return: 1.7 };

export function makeRoute(kind: FlowKind, pts: THREE.Vector3[], label: string): Route {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { kind, pts, length: cum[cum.length - 1], cum, label };
}

export function pointAt(r: Route, s: number, out: THREE.Vector3): THREE.Vector3 {
  const t = ((s % r.length) + r.length) % r.length;
  let i = 1; while (i < r.cum.length - 1 && r.cum[i] < t) i++;
  const k = (t - r.cum[i - 1]) / Math.max(1e-9, r.cum[i] - r.cum[i - 1]);
  return out.lerpVectors(r.pts[i - 1], r.pts[i], k);
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const centroid = (list: { display_position: { x: number; y: number; width: number; depth: number } }[]) => ({
  x: list.reduce((a, e) => a + e.display_position.x + e.display_position.width / 2, 0) / list.length,
  z: list.reduce((a, e) => a + e.display_position.y + e.display_position.depth / 2, 0) / list.length,
});

export function buildRoutes(twin: Twin): Route[] {
  const routes: Route[] = [];
  const cols = [...new Set(twin.halls.map((h) => h.x))].sort((a, b) => a - b);
  const left = twin.halls.filter((h) => h.x === cols[0])[0], right = twin.halls.filter((h) => h.x === cols[cols.length - 1])[0];
  const mid = cols.length > 1 ? (left.x + left.width + right.x) / 2 : left.x + left.width + 4;
  const trunk = { A: mid - 2.5, B: mid + 2.5, supply: mid - 0.6, back: mid + 0.6 };
  const hallsSouthFirst = twin.halls.slice().sort((a, b) => b.y - a.y);
  const zNorth = Math.min(...twin.halls.map((h) => h.y));

  for (const path of ["A", "B"] as const) {
    const kind: FlowKind = path === "A" ? "powerA" : "powerB";
    const tx = twin.equipment.filter((e) => e.system === "TX" && e.path === path), ups = twin.equipment.filter((e) => e.system === "UPS" && e.path === path);
    if (!tx.length || !ups.length) continue;
    const t = centroid(tx), u = centroid(ups), x = trunk[path];
    routes.push(makeRoute(kind, [v(t.x, 0.8, t.z), v(t.x, 0.8, (t.z + u.z) / 2), v(u.x, 0.8, (t.z + u.z) / 2), v(u.x, 0.8, u.z)], `Path ${path}: transformer to UPS`));
    routes.push(makeRoute(kind, [v(u.x, 0.8, u.z), v(x, 0.8, u.z), v(x, 0.8, zNorth)], `Path ${path}: UPS to hall feeders`));
    for (const hall of hallsSouthFirst) {
      const rows = new Map<number, typeof twin.racks>();
      for (const r of twin.racks) if (r.hall_id === hall.id) { const a = rows.get(r.y) ?? []; a.push(r); rows.set(r.y, a); }
      const west = hall.x + hall.width / 2 < mid;
      for (const [y, rs] of rows) {
        const x0 = Math.min(...rs.map((r) => r.x)), x1 = Math.max(...rs.map((r) => r.x + r.width)), z = y + rs[0].depth / 2 + (path === "A" ? -0.07 : 0.07);
        const edge = west ? hall.x + hall.width : hall.x, far = west ? x0 : x1;
        routes.push(makeRoute(kind, [v(x, 0.8, z), v(edge, 0.8, z), v(edge, 2.9, z), v(far, 2.9, z)], `Path ${path}: tray in ${hall.id}`));
      }
    }
  }

  const chl = twin.equipment.filter((e) => e.system === "CHL");
  if (chl.length) {
    const c = centroid(chl);
    for (const hall of hallsSouthFirst) {
      const cdus = twin.equipment.filter((e) => e.system === "CDU" && e.path === hall.id);
      if (!cdus.length) continue;
      const d = centroid(cdus);
      const supply = [v(c.x, 0.5, c.z), v(trunk.supply, 0.5, c.z), v(trunk.supply, 0.5, d.z), v(d.x, 0.5, d.z)];
      routes.push(makeRoute("supply", supply, `Chilled water to ${hall.id} CDUs`));
      routes.push(makeRoute("return", supply.map((p) => p.clone().add(v(0, -0.15, 0.4))).reverse(), `Return from ${hall.id} CDUs`));
      // secondary loop: CDU to the rear manifold of each row and back
      const rows = new Map<number, typeof twin.racks>();
      for (const r of twin.racks) if (r.hall_id === hall.id) { const a = rows.get(r.y) ?? []; a.push(r); rows.set(r.y, a); }
      for (const [y, rs] of rows) {
        const x1 = Math.max(...rs.map((r) => r.x + r.width)), sign = rs[0].facing === "-y" ? 1 : -1, z = y + rs[0].depth / 2 + sign * 0.4;
        routes.push(makeRoute("supply", [v(d.x, 0.5, d.z), v(d.x, 1.0, z), v(x1, 1.0, z)], `CDU supply to row in ${hall.id}`));
        routes.push(makeRoute("return", [v(x1, 0.8, z + 0.1), v(d.x + 0.4, 0.8, z + 0.1), v(d.x + 0.4, 0.5, d.z)], `Row return to CDU in ${hall.id}`));
      }
    }
  }
  return routes.filter((r) => r.length > 0.5);
}

export class FlowLayer {
  readonly object: THREE.Points;
  private offsets: Float32Array;
  private owner: Uint16Array;
  private pos: THREE.BufferAttribute;
  private tmp = new THREE.Vector3();
  readonly count: number;

  constructor(private routes: Route[]) {
    const owners: number[] = [], offs: number[] = [];
    routes.forEach((r, ri) => { const n = Math.max(2, Math.round(r.length / SPACING[r.kind])); for (let i = 0; i < n; i++) { owners.push(ri); offs.push((i / n) * r.length); } });
    this.count = owners.length; this.owner = Uint16Array.from(owners); this.offsets = Float32Array.from(offs);
    const geo = new THREE.BufferGeometry(), col = new Float32Array(this.count * 3), c = new THREE.Color();
    this.pos = new THREE.BufferAttribute(new Float32Array(this.count * 3), 3);
    for (let i = 0; i < this.count; i++) { c.setHex(COLOR[routes[this.owner[i]].kind]); col.set([c.r, c.g, c.b], i * 3); }
    geo.setAttribute("position", this.pos); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    let map: THREE.Texture | null = null;
    if (typeof document !== "undefined") {                 // round sprite; skipped where there is no DOM (tests)
      const c = document.createElement("canvas"); c.width = c.height = 32;
      const g = c.getContext("2d");
      if (g) { const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16); grd.addColorStop(0, "#fff"); grd.addColorStop(0.55, "#fff"); grd.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = grd; g.fillRect(0, 0, 32, 32); map = new THREE.CanvasTexture(c); }
    }
    this.object = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.34, map, alphaTest: 0.2, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true }));
    this.object.frustumCulled = false; this.object.raycast = () => {}; this.object.visible = false;
    this.update(0, 0, 0);
  }

  // advance every particle; power and cooling run at their own speed (metres per second, visual only)
  update(dt: number, powerSpeed: number, coolSpeed: number) {
    for (let i = 0; i < this.count; i++) {
      const r = this.routes[this.owner[i]], speed = r.kind === "powerA" || r.kind === "powerB" ? powerSpeed : coolSpeed;
      this.offsets[i] = (this.offsets[i] + speed * dt) % r.length;
      pointAt(r, this.offsets[i], this.tmp); this.pos.setXYZ(i, this.tmp.x, this.tmp.y, this.tmp.z);
    }
    this.pos.needsUpdate = true;
  }

  dispose() { this.object.geometry.dispose(); (this.object.material as THREE.Material).dispose(); }
}
