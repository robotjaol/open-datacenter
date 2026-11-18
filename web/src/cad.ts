import * as THREE from "three";
export { fmtLength } from "./units";

// CAD style helpers: standard views, an orthographic-like projection and length formatting.
export type ViewName = "plan" | "front" | "side" | "iso";
export type SectionAxis = "x" | "y" | "z";

export const PERSPECTIVE_FOV = 42;
export const ORTHO_FOV = 4;       // a very narrow field of view is parallel projection to within 0.1 percent

// direction from the target to the camera
export const VIEW_DIRECTION: Record<ViewName, THREE.Vector3> = {
  plan: new THREE.Vector3(0, 1, 0.0001).normalize(),
  front: new THREE.Vector3(0, 0.0001, 1).normalize(),
  side: new THREE.Vector3(1, 0.0001, 0).normalize(),
  iso: new THREE.Vector3(1, 0.82, 1).normalize(),
};

// distance multiplier that keeps the framing when the field of view narrows
export function orthoScale(fovFrom: number, fovTo: number): number {
  const t = (d: number) => Math.tan((d * Math.PI) / 360);
  return t(fovFrom) / t(fovTo);
}

export interface Measurement { a: THREE.Vector3; b: THREE.Vector3; distance: number; dx: number; dy: number; dz: number }

export function measure(a: THREE.Vector3, b: THREE.Vector3): Measurement {
  return { a: a.clone(), b: b.clone(), distance: a.distanceTo(b), dx: Math.abs(b.x - a.x), dy: Math.abs(b.y - a.y), dz: Math.abs(b.z - a.z) };
}

export function sectionPlane(axis: SectionAxis, offset: number): THREE.Plane {
  const n = new THREE.Vector3(axis === "x" ? -1 : 0, axis === "y" ? -1 : 0, axis === "z" ? -1 : 0);
  return new THREE.Plane(n, offset);        // keeps the side where coordinate < offset
}
