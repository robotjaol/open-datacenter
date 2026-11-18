import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type Axis = "x" | "y" | "z";

// collects boxes and cylinders into one vertex coloured geometry
export class Kit {
  private parts: THREE.BufferGeometry[] = [];

  private add(g: THREE.BufferGeometry, color: number, m?: THREE.Matrix4) {
    if (m) g.applyMatrix4(m);
    const flat = g.index ? g.toNonIndexed() : g;
    flat.deleteAttribute("uv");
    const c = new THREE.Color(color);
    const n = flat.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    flat.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.parts.push(flat);
  }

  // box centred at cx, cy, cz
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: number, rot?: { x?: number; y?: number; z?: number }) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot?.x ?? 0, rot?.y ?? 0, rot?.z ?? 0)), new THREE.Vector3(1, 1, 1));
    this.add(new THREE.BoxGeometry(w, h, d), color, m);
  }

  // cylinder along an axis, centred at cx, cy, cz; r2 makes a cone frustum
  cyl(cx: number, cy: number, cz: number, r: number, len: number, axis: Axis, color: number, seg = 14, r2?: number) {
    const g = new THREE.CylinderGeometry(r2 ?? r, r, len, seg, 1, false);
    const q = new THREE.Quaternion();
    if (axis === "x") q.setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
    if (axis === "z") q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    this.add(g, color, new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), q, new THREE.Vector3(1, 1, 1)));
  }

  get count() { return this.parts.length; }

  // merged geometry; shiftY moves the origin (used to centre equipment on its bounding box)
  build(shiftY = 0): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false)!;
    if (shiftY) g.translate(0, shiftY, 0);
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

export const PAINT = {
  steel: 0x2b3138, darkSteel: 0x1b2026, cabinet: 0xc3c9cf, cabinetDark: 0x9aa2aa, black: 0x07090b, rubber: 0x15181c,
  glass: 0x0b2a3a, copper: 0xb87333, alu: 0xaeb6bd, red: 0xd04a4a, blue: 0x4a82d0, porcelain: 0x8a5a3c, safety: 0xf2b84b,
};
