import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Optional local models: web/public/models/<name>.glb
// Names: rack, ups, tx, gen, chl, cdu. Files are never committed (see .gitignore).
// Only geometry and base colours are used. Textures and animations are ignored.
export interface Fit { w: number; d: number; h: number; origin: "floor" | "center" }

// names of GLB files the server found; empty when the API is offline
export async function availableModels(): Promise<Set<string>> {
  try {
    const res = await fetch("/api/models");
    if (!res.ok) return new Set();
    return new Set(((await res.json()) as { models: string[] }).models);
  } catch { return new Set(); }
}

export async function loadExternal(name: string, fit: Fit): Promise<THREE.BufferGeometry | null> {
  let buf: ArrayBuffer;
  try {
    const res = await fetch(`/models/${name}.glb`);
    if (!res.ok) return null;
    buf = await res.arrayBuffer();
  } catch { return null; }
  if (new TextDecoder().decode(buf.slice(0, 4)) !== "glTF") return null;       // single page fallback returns HTML
  const gltf = await new GLTFLoader().parseAsync(buf, "");
  gltf.scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    let g = mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    for (const attr of Object.keys(g.attributes)) if (attr !== "position" && attr !== "normal") g.deleteAttribute(attr);
    if (!g.attributes.normal) g.computeVertexNormals();
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const c = mat?.color ?? new THREE.Color(0x888888);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    parts.push(g);
  });
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  merged.computeBoundingBox();
  const box = merged.boundingBox!, size = box.getSize(new THREE.Vector3());
  const k = Math.min(fit.w / size.x, fit.d / size.z, fit.h / size.y);           // uniform, keeps proportions
  merged.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  merged.scale(k, k, k);
  if (fit.origin === "center") merged.translate(0, -(size.y * k) / 2, 0);
  merged.computeBoundingSphere();
  return merged;
}
