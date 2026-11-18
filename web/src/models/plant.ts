import * as THREE from "three";
import { Kit, PAINT } from "./kit";

// Generic plant models sized to the display footprint. Front faces +z.
// Shapes follow common public equipment layouts; they are not vendor models.
// Origin is the centre of the bounding box so mesh.position is the box centre.
export interface PlantSize { w: number; d: number; h: number }
const louvres = (k: Kit, x: number, y: number, z: number, w: number, n: number, pitch: number, dz: number, color: number, side: "z" | "x" = "z") => {
  for (let i = 0; i < n; i++) {
    if (side === "z") k.box(x, y + i * pitch, z, w, 0.012, dz, color, { x: 0.5 });
    else k.box(x, y + i * pitch, z, dz, 0.012, w, color, { z: 0.5 });
  }
};

function ups(s: PlantSize, band: number): THREE.BufferGeometry {
  const k = new Kit(), { w, d, h } = s;
  k.box(0, 0.06, 0, w, 0.12, d, PAINT.darkSteel);
  k.box(0, h / 2 + 0.06, 0, w - 0.02, h - 0.16, d - 0.02, PAINT.cabinet);
  k.box(0, h - 0.03, 0, w, 0.06, d, PAINT.cabinetDark);
  const doors = 4, dw = (w - 0.12) / doors;
  for (let i = 0; i < doors; i++) {
    const x = -w / 2 + 0.06 + dw * (i + 0.5);
    k.box(x, h / 2 + 0.06, d / 2 + 0.004, dw - 0.016, h - 0.3, 0.012, PAINT.cabinet);
    k.box(x + (i % 2 ? -1 : 1) * (dw / 2 - 0.05), h / 2, d / 2 + 0.016, 0.014, 0.16, 0.012, PAINT.alu);       // handle
    louvres(k, x, 0.35, d / 2 + 0.012, dw * 0.7, 6, 0.028, 0.006, PAINT.cabinetDark);
  }
  k.box(-w / 2 + 0.06 + dw * 1.5, h * 0.62, d / 2 + 0.014, 0.3, 0.2, 0.01, PAINT.black);                    // display
  k.box(-w / 2 + 0.06 + dw * 1.5, h * 0.62, d / 2 + 0.02, 0.26, 0.15, 0.004, PAINT.glass);
  for (let i = 0; i < 4; i++) k.box(-w / 2 + 0.06 + dw * 1.5 - 0.09 + i * 0.06, h * 0.5, d / 2 + 0.016, 0.02, 0.02, 0.008, [0x39ff8a, 0x39ff8a, 0xf2b84b, 0x3a4048][i]);
  k.box(0, h * 0.86, d / 2 + 0.012, w - 0.2, 0.05, 0.004, band);                                              // system colour band
  for (const x of [-w / 4, w / 4]) { k.cyl(x, h + 0.008, 0, 0.22, 0.02, "y", PAINT.black, 20); for (const r of [0.08, 0.15]) k.cyl(x, h + 0.02, 0, r, 0.004, "y", PAINT.alu, 20); }
  k.box(w / 2 - 0.3, h + 0.05, -d / 2 + 0.2, 0.3, 0.06, 0.2, PAINT.steel);                                    // cable entry
  return k.build(-h / 2);
}

function transformer(s: PlantSize, band: number): THREE.BufferGeometry {
  const k = new Kit(), { w, d, h } = s;
  for (const z of [-d / 2 + 0.2, d / 2 - 0.2]) k.box(0, 0.08, z, w, 0.16, 0.2, PAINT.darkSteel);               // skid
  const tw = w - 1.0;
  k.box(0, 0.16 + 0.5, 0, tw, 1.0, d - 0.9, 0x3f5565);                                                       // tank
  k.box(0, 1.2, 0, tw + 0.06, 0.06, d - 0.84, 0x2f4452);                                                      // cover plate flange
  for (const sx of [-1, 1]) for (let i = 0; i < 16; i++) k.box(sx * (tw / 2 + 0.12 + 0.0), 0.2 + 0.5, -0.55 + i * 0.073, 0.03, 0.95, 0.06, 0x4a6578); // radiator fins
  for (const sx of [-1, 1]) { k.cyl(sx * (tw / 2 + 0.1), 1.16, 0, 0.03, d - 0.7, "z", 0x2f4452, 8); k.cyl(sx * (tw / 2 + 0.1), 0.24, 0, 0.03, d - 0.7, "z", 0x2f4452, 8); }
  for (const i of [-1, 0, 1]) {                                                                               // HV bushings
    const x = i * 0.5 - 0.0, z = d / 2 - 0.55;
    k.cyl(x, 1.3, z, 0.07, 0.2, "y", 0x2f4452, 12);
    for (let n = 0; n < 7; n++) { k.cyl(x, 1.45 + n * 0.1, z, 0.09, 0.03, "y", PAINT.porcelain, 14); k.cyl(x, 1.5 + n * 0.1, z, 0.045, 0.07, "y", PAINT.porcelain, 12); }
    k.cyl(x, 2.18, z, 0.03, 0.12, "y", PAINT.copper, 10);
  }
  for (const i of [-1.5, -0.5, 0.5, 1.5]) {                                                                   // LV bushings
    const x = i * 0.34, z = -d / 2 + 0.5;
    k.cyl(x, 1.3, z, 0.06, 0.14, "y", 0x2f4452, 12);
    for (let n = 0; n < 3; n++) k.cyl(x, 1.42 + n * 0.1, z, 0.08, 0.03, "y", PAINT.porcelain, 12);
    k.cyl(x, 1.72, z, 0.04, 0.2, "y", PAINT.copper, 10);
  }
  k.cyl(0, 1.62, -0.05 - 0.0, 0.18, tw - 0.3, "x", 0x39505f, 18);                                             // conservator
  k.cyl(-tw / 2 + 0.16, 1.62, 0, 0.19, 0.03, "x", 0x2f4452, 18);
  k.cyl(0, 1.38, 0.2, 0.025, 0.5, "y", 0x2f4452, 8);
  k.box(tw / 2 - 0.1, 0.9, d / 2 - 0.42, 0.45, 0.5, 0.2, 0x8e979f);                                            // marshalling box
  k.box(tw / 2 - 0.1, 0.9, d / 2 - 0.31, 0.38, 0.38, 0.01, 0x7a838b);
  k.box(0, 0.9, d / 2 - 0.44, tw - 0.9, 0.04, 0.004, band);
  k.box(-tw / 2 + 0.2, 0.7, d / 2 - 0.44, 0.22, 0.14, 0.006, PAINT.alu);                                      // rating plate
  void h;
  return k.build(-h / 2);
}

function generator(s: PlantSize, band: number): THREE.BufferGeometry {
  const k = new Kit(), { w, d, h } = s;
  const encl = w - 1.3;
  k.box(0, 0.15, 0, w, 0.3, d, PAINT.darkSteel);                                                              // skid and fuel tank
  k.box(-0.65, 0.8, 0, encl, 1.9 - 0.2, d - 0.1, 0xd7dbe0);                                                   // enclosure
  k.box(-0.65, 1.78, 0, encl + 0.04, 0.05, d, 0xaab1b8);
  for (let i = 0; i < 3; i++) {                                                                               // service doors
    const x = -0.65 - encl / 2 + 0.7 + i * (encl - 1.0) / 2;
    k.box(x, 0.95, d / 2 - 0.045, 1.1, 1.4, 0.012, 0xe4e7ea);
    k.box(x + 0.4, 0.95, d / 2 - 0.035, 0.03, 0.2, 0.02, PAINT.alu);
    louvres(k, x, 0.4, d / 2 - 0.04, 0.8, 5, 0.035, 0.01, 0xb4bbc2);
  }
  k.box(-0.65 - encl / 2 + 0.7, 1.55, d / 2 - 0.035, 0.5, 0.14, 0.01, band);
  k.box(-0.65 - encl / 2 + 0.2, 1.1, d / 2 - 0.035, 0.28, 0.3, 0.012, PAINT.black);                          // control panel
  k.box(-0.65 - encl / 2 + 0.2, 1.1, d / 2 - 0.028, 0.22, 0.2, 0.004, PAINT.glass);
  const rx = w / 2 - 0.55;                                                                                    // radiator section
  k.box(rx, 0.9, 0, 1.1, 1.3, d - 0.1, 0xc2c8ce);
  k.box(rx + 0.55, 0.9, 0, 0.04, 1.3, d - 0.1, PAINT.darkSteel);
  for (let i = 0; i < 30; i++) k.box(rx + 0.57, 0.3 + i * 0.04, 0, 0.012, 0.018, d - 0.2, 0x151a1f);          // core fins
  k.cyl(rx + 0.6, 0.9, 0, 0.5, 0.02, "x", PAINT.black, 28);                                                   // fan guard
  for (const r of [0.15, 0.3, 0.45]) k.cyl(rx + 0.615, 0.9, 0, r, 0.006, "x", PAINT.alu, 28);
  for (let i = 0; i < 8; i++) k.box(rx + 0.62, 0.9, 0, 0.004, 0.012, 1.0, PAINT.alu, { x: (i * Math.PI) / 8 });
  k.cyl(-1.2, 2.25, 0.4, 0.28, 1.5, "x", 0x4b5159, 20);                                                       // silencer
  k.cyl(-1.2, 2.0, 0.4, 0.07, 0.36, "y", 0x4b5159, 12);
  k.cyl(-0.6, 2.55, 0.4, 0.1, 0.5, "y", 0x4b5159, 14);                                                        // exhaust stack
  k.cyl(-0.6, 2.82, 0.4, 0.13, 0.04, "y", 0x2b3138, 14, 0.07);
  louvres(k, -2.0, 1.78, 0, d - 0.5, 3, 0.04, 0.2, 0xb4bbc2, "x");                                           // roof intake
  void h;
  return k.build(-h / 2);
}

function chiller(s: PlantSize, band: number): THREE.BufferGeometry {
  const k = new Kit(), { w, d, h } = s;
  for (const z of [-d / 2 + 0.12, d / 2 - 0.12]) k.box(0, 0.09, z, w, 0.18, 0.22, PAINT.safety);             // base rails
  for (const x of [-w / 2 + 0.1, 0, w / 2 - 0.1]) k.box(x, 0.09, 0, 0.18, 0.18, d - 0.2, PAINT.safety);
  // refrigerant circuit: evaporator shell, compressor, water nozzles
  k.cyl(0, 0.62, 0, 0.3, w - 1.2, "x", 0x6c7f8f, 24);
  for (const sx of [-1, 1]) { k.cyl(sx * (w / 2 - 0.58), 0.62, 0, 0.32, 0.05, "x", 0x55697a, 24); k.cyl(sx * (w / 2 - 0.56), 0.62, 0, 0.31, 0.06, "x", 0x55697a, 24, 0.2); }
  k.cyl(0, 1.08, 0, 0.17, 1.4, "x", 0x7e8fa0, 18);
  k.box(0, 0.98, 0, 0.5, 0.12, 0.5, 0x2f3a44);
  for (const [i, z] of [-0.18, 0.18].entries()) { k.cyl(-w / 2 + 0.7, 0.62, z * 1.6, 0.06, 0.4, "z", i === 0 ? PAINT.blue : PAINT.red, 12); k.cyl(-w / 2 + 0.7, 0.62, z * 1.6 + (i ? 0.2 : -0.2), 0.09, 0.03, "z", PAINT.alu, 14); }
  // V coil banks: bottom edge inner, top edge outer, so the V opens upward under the fans
  const zIn = 0.25, zOut = d / 2 - 0.08, yLo = 0.35, yHi = h - 0.2;
  const run = zOut - zIn, rise = yHi - yLo, len = Math.hypot(run, rise), tilt = Math.atan2(run, rise);
  for (const sz of [-1, 1]) {
    const cz = sz * (zIn + run / 2), cy = yLo + rise / 2;
    k.box(0, cy, cz, w - 0.5, len, 0.07, 0x16222d, { x: sz * tilt });                                        // coil block
    for (let i = 0; i < 40; i++) k.box(-w / 2 + 0.3 + i * ((w - 0.6) / 39), cy, cz + sz * 0.0, 0.004, len - 0.04, 0.078, 0x2a3d4d, { x: sz * tilt });   // fin lines
    k.box(0, yHi + 0.02, sz * zOut, w - 0.5, 0.05, 0.1, PAINT.steel);                                         // top header
  }
  for (const sx of [-1, 1]) k.box(sx * (w / 2 - 0.12), 0.35 + (h - 0.35) / 2, 0, 0.05, h - 0.5, d - 0.2, 0x7d868e);   // end panels
  // fans on the top deck: housing ring, black hub, five blades
  for (const x of [-1.6, 0, 1.6]) for (const sz of [-1, 1]) {
    const px = x * (w / 4.2), pz = sz * 0.58, py = h - 0.1;
    k.cyl(px, py, pz, 0.52, 0.1, "y", 0x1b2026, 28);
    k.cyl(px, py + 0.052, pz, 0.47, 0.008, "y", PAINT.black, 28);
    for (let i = 0; i < 5; i++) k.box(px + Math.cos((i * 2 * Math.PI) / 5) * 0.22, py + 0.06, pz - Math.sin((i * 2 * Math.PI) / 5) * 0.22, 0.4, 0.008, 0.1, 0x59626b, { y: (i * 2 * Math.PI) / 5 + 0.25 });
    k.cyl(px, py + 0.065, pz, 0.07, 0.04, "y", 0x2f3a44, 12);
    for (const r of [0.5]) k.cyl(px, py + 0.06, pz, r, 0.01, "y", PAINT.alu, 28);
  }
  k.box(w / 2 - 0.45, 0.9, d / 2 - 0.1, 0.8, 1.2, 0.2, 0x8e979f);                                             // control panel
  k.box(w / 2 - 0.45, 1.0, d / 2 + 0.005, 0.3, 0.2, 0.004, PAINT.glass);
  k.box(w / 2 - 0.45, 1.5, d / 2, 0.7, 0.06, 0.004, band);
  return k.build(-h / 2);
}

function cdu(s: PlantSize, band: number): THREE.BufferGeometry {
  const k = new Kit(), { w, d, h } = s;
  k.box(0, 0.05, 0, w, 0.1, d, PAINT.darkSteel);
  k.box(0, 0.95, 0, w - 0.02, 1.7, d - 0.02, PAINT.cabinet);
  k.box(0, 1.82, 0, w, 0.06, d, PAINT.cabinetDark);
  k.box(0, 1.0, d / 2 + 0.004, w - 0.08, 1.6, 0.012, PAINT.cabinet);
  k.box(-0.25, 1.4, d / 2 + 0.014, 0.26, 0.18, 0.01, PAINT.black);
  k.box(-0.25, 1.4, d / 2 + 0.02, 0.22, 0.13, 0.004, PAINT.glass);
  for (let i = 0; i < 3; i++) k.box(-0.35 + i * 0.07, 1.22, d / 2 + 0.016, 0.02, 0.02, 0.008, [0x39ff8a, 0x39ff8a, 0x3a4048][i]);
  k.box(0.28, 1.0, d / 2 + 0.014, 0.02, 0.3, 0.012, PAINT.alu);
  k.box(0, 1.62, d / 2 + 0.012, w - 0.3, 0.04, 0.004, band);
  louvres(k, 0, 0.3, d / 2 + 0.012, w * 0.6, 6, 0.028, 0.006, PAINT.cabinetDark);
  for (const [i, z] of [-0.12, 0.12].entries()) {                                                             // secondary manifold on top
    const c = i === 0 ? PAINT.blue : PAINT.red;
    k.cyl(0, 1.98, z, 0.045, w - 0.1, "x", c, 14);
    for (const sx of [-1, 1]) { k.cyl(sx * (w / 2 - 0.05), 1.9, z, 0.045, 0.2, "y", c, 14); k.cyl(sx * (w / 2 - 0.05), 1.83, z, 0.07, 0.03, "y", PAINT.alu, 16); }
  }
  k.cyl(w / 2 - 0.12, 1.2, -d / 2 + 0.1, 0.07, 0.45, "y", 0x4a5560, 14);                                      // expansion vessel
  void h;
  return k.build(-h / 2);
}

export function buildPlant(system: string, size: PlantSize, band: number): THREE.BufferGeometry | null {
  switch (system) {
    case "UPS": return ups(size, band);
    case "TX": return transformer(size, band);
    case "GEN": return generator(size, band);
    case "CHL": return chiller(size, band);
    case "CDU": return cdu(size, band);
    default: return null;
  }
}
