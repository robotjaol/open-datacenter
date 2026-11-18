import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Equipment, Twin } from "./types";

export type ColorMode = "hall" | "telemetry" | "neutral";
export interface Layers { halls: boolean; racks: boolean; electrical: boolean; cooling: boolean; relations: boolean; labels: boolean }
export interface Picked { kind: "rack" | "equipment" | "hall"; id: string }

const SYSTEM_COLOR: Record<string, number> = { UPS: 0x7c9cff, TX: 0xf2b84b, GEN: 0xe8829f, CHL: 0x38bdf8, CDU: 0x6fcf97 };
const HALL_COLOR = [0x38bdf8, 0x7c9cff, 0x6fcf97, 0xb79cf0];
const ELECTRICAL = new Set(["UPS", "TX", "GEN"]);

function label(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 64;
  const g = canvas.getContext("2d")!;
  let size = 28;
  g.font = `600 ${size}px Inter, system-ui, sans-serif`;
  while (g.measureText(text).width > 236 && size > 12) { size -= 2; g.font = `600 ${size}px Inter, system-ui, sans-serif`; }
  g.fillStyle = "rgba(10,13,17,0.85)"; g.fillRect(0, 8, 256, 48);
  g.fillStyle = "#e8edf2"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(12, 3, 1); sprite.renderOrder = 10;
  return sprite;
}

export class TwinScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private center = new THREE.Vector3();
  private racksMesh: THREE.InstancedMesh;
  private rackIds: string[];
  private rackIndex = new Map<string, number>();
  private rackBase: THREE.Color[] = [];
  private equipMeshes = new Map<string, THREE.Mesh>();
  private hallFloors = new Map<string, THREE.Mesh>();
  private hallGroup = new THREE.Group();
  private labelGroup = new THREE.Group();
  private lines = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private ray = new THREE.Vector2();
  private frame = 0;
  private disposed = false;
  private down = { x: 0, y: 0 };
  private anim: { t0: number; from: THREE.Vector3; to: THREE.Vector3; ft: THREE.Vector3; tt: THREE.Vector3 } | null = null;
  private selected: Picked | null = null;
  private resize: ResizeObserver;
  onSelect: (p: Picked | null) => void = () => {};
  onHover: (id: string | null, x: number, y: number) => void = () => {};

  constructor(private canvas: HTMLCanvasElement, private twin: Twin) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.background = new THREE.Color(0x0a0d11);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03; this.controls.minDistance = 6; this.controls.maxDistance = 220;
    // framing
    const xs = [...twin.halls.map((h) => h.x), ...twin.halls.map((h) => h.x + h.width), ...twin.equipment.map((e) => e.display_position.x + e.display_position.width)];
    const ys = [...twin.halls.map((h) => h.y), ...twin.halls.map((h) => h.y + h.depth), ...twin.equipment.map((e) => e.display_position.y + e.display_position.depth)];
    this.center.set((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...ys) + Math.max(...ys)) / 2);
    this.scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x1a222c, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(40, 70, 30); this.scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x0d1117 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(this.center.x, -0.02, this.center.z); this.scene.add(ground);
    const grid = new THREE.GridHelper(200, 40, 0x26303b, 0x171d25); grid.position.set(this.center.x, 0, this.center.z); this.scene.add(grid);
    this.scene.add(this.hallGroup, this.labelGroup, this.lines);
    this.buildHalls();
    const n = twin.racks.length;
    this.rackIds = twin.racks.map((r) => r.asset_id);
    this.racksMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.2 }), n);
    const m = new THREE.Matrix4();
    twin.racks.forEach((r, i) => {
      m.compose(new THREE.Vector3(r.x + r.width / 2, r.height / 2, r.y + r.depth / 2), new THREE.Quaternion(), new THREE.Vector3(r.width * 0.96, r.height, r.depth * 0.96));
      this.racksMesh.setMatrixAt(i, m);
      this.rackIndex.set(r.asset_id, i);
    });
    this.racksMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.scene.add(this.racksMesh);
    this.buildEquipment();
    this.setColorMode("hall");
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(canvas.parentElement!);
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerleave", () => this.onHover(null, 0, 0));
    this.fit();
    this.flyTo("overview", true);
    this.loop();
  }

  private buildHalls() {
    for (const [i, hall] of this.twin.halls.entries()) {
      const color = HALL_COLOR[i % HALL_COLOR.length];
      const floor = new THREE.Mesh(new THREE.BoxGeometry(hall.width, 0.2, hall.depth), new THREE.MeshStandardMaterial({ color: 0x18212b, roughness: 0.9 }));
      floor.position.set(hall.x + hall.width / 2, 0.1, hall.y + hall.depth / 2);
      floor.userData = { kind: "hall", id: hall.id };
      this.hallFloors.set(hall.id, floor);
      const shell = new THREE.Mesh(new THREE.BoxGeometry(hall.width, hall.height, hall.depth), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.045, depthWrite: false }));
      shell.position.set(hall.x + hall.width / 2, hall.height / 2, hall.y + hall.depth / 2);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(hall.width, hall.height, hall.depth)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }));
      edges.position.copy(shell.position);
      this.hallGroup.add(floor, shell, edges);
      const tag = label(`${hall.id}  ${hall.rack_count} racks`);
      tag.position.set(hall.x + hall.width / 2, hall.height + 2.2, hall.y + hall.depth / 2);
      this.labelGroup.add(tag);
    }
    const ys = this.twin.equipment.filter((e) => e.system !== "CDU");
    if (ys.length) {
      const px = Math.min(...ys.map((e) => e.display_position.x)) + 22, pz = Math.min(...ys.map((e) => e.display_position.y)) - 3;
      const tag = label("Plant yard (schematic)"); tag.scale.set(14, 3.5, 1); tag.position.set(px, 4, pz); this.labelGroup.add(tag);
    }
  }

  private buildEquipment() {
    for (const e of this.twin.equipment) {
      const p = e.display_position;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.width, p.height, p.depth),
        new THREE.MeshStandardMaterial({ color: SYSTEM_COLOR[e.system] ?? 0x888888, roughness: 0.5, metalness: 0.25, emissive: 0x000000 }));
      mesh.position.set(p.x + p.width / 2, p.height / 2, p.y + p.depth / 2);
      mesh.userData = { kind: "equipment", id: e.asset_id, system: e.system };
      this.equipMeshes.set(e.asset_id, mesh);
      this.scene.add(mesh);
    }
  }

  private fit() {
    const parent = this.canvas.parentElement!;
    const w = Math.max(2, parent.clientWidth), h = Math.max(2, parent.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  setLayers(l: Layers) {
    this.hallGroup.visible = l.halls;
    this.racksMesh.visible = l.racks;
    this.labelGroup.visible = l.labels;
    this.lines.visible = l.relations;
    for (const [id, mesh] of this.equipMeshes) {
      const sys = (mesh.userData.system as string);
      mesh.visible = ELECTRICAL.has(sys) ? l.electrical : l.cooling;
      void id;
    }
  }

  setColorMode(mode: ColorMode) {

    const t = this.twin;
    const values = t.racks.map((r) => r.telemetry[0]?.value ?? 0);
    const lo = Math.min(...values), hi = Math.max(...values);
    this.rackBase = t.racks.map((r) => {
      if (mode === "neutral") return new THREE.Color(0x5d6e80);
      if (mode === "hall") return new THREE.Color(HALL_COLOR[t.halls.findIndex((h) => h.id === r.hall_id) % HALL_COLOR.length]);
      const v = r.telemetry[0]?.value;
      if (v === undefined) return new THREE.Color(0x3a4551);
      const k = hi > lo ? (v - lo) / (hi - lo) : 0.6;
      return new THREE.Color(0x1f4e79).lerp(new THREE.Color(0x38e0f8), 0.25 + 0.7 * k);
    });
    this.paint();
  }

  telemetryRange(): [number, number] {
    const v = this.twin.racks.map((r) => r.telemetry[0]?.value).filter((x): x is number => x !== undefined);
    return v.length ? [Math.min(...v), Math.max(...v)] : [0, 0];
  }

  private related(p: Picked | null): { racks: Set<string>; equipment: Set<string>; halls: Set<string> } {
    const out = { racks: new Set<string>(), equipment: new Set<string>(), halls: new Set<string>() };
    if (!p) return out;
    if (p.kind === "rack") {
      const r = this.twin.racks.find((x) => x.asset_id === p.id)!;
      out.racks.add(p.id); out.halls.add(r.hall_id);
      [...r.relations.path_a_equipment, ...r.relations.path_b_equipment, ...r.relations.cdu_ids, ...r.relations.chiller_ids].forEach((i) => out.equipment.add(i));
    } else if (p.kind === "hall") {
      out.halls.add(p.id);
      this.twin.racks.filter((r) => r.hall_id === p.id).forEach((r) => out.racks.add(r.asset_id));
      this.twin.halls.find((h) => h.id === p.id)?.cdu_ids.forEach((i) => out.equipment.add(i));
    } else {
      const e = this.twin.equipment.find((x) => x.asset_id === p.id)!;
      out.equipment.add(p.id);
      e.serves_halls.forEach((h) => out.halls.add(h));
      if (e.system === "CDU") this.twin.racks.filter((r) => e.serves_halls.includes(r.hall_id)).forEach((r) => out.racks.add(r.asset_id));
    }
    return out;
  }

  private paint() {
    const rel = this.related(this.selected);
    const any = this.selected !== null;
    const c = new THREE.Color();
    this.twin.racks.forEach((r, i) => {
      c.copy(this.rackBase[i]);
      if (any) {
        if (rel.racks.has(r.asset_id)) { if (this.selected!.id === r.asset_id) c.set(0xffffff); else c.lerp(new THREE.Color(0xffffff), 0.35); }
        else c.multiplyScalar(0.28);
      }
      this.racksMesh.setColorAt(i, c);
    });
    this.racksMesh.instanceColor!.needsUpdate = true;
    for (const [id, mesh] of this.equipMeshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const on = rel.equipment.has(id);
      mat.emissive.setHex(on ? (this.selected?.id === id ? 0xffffff : mat.color.getHex()) : 0x000000);
      mat.emissiveIntensity = on ? (this.selected?.id === id ? 0.7 : 0.45) : 0;
      mat.opacity = any && !on ? 0.35 : 1; mat.transparent = any && !on;
    }
    for (const [id, floor] of this.hallFloors) {
      (floor.material as THREE.MeshStandardMaterial).emissive.setHex(rel.halls.has(id) && any ? 0x0b3a4d : 0x000000);
    }
    this.drawRelations(rel);
  }

  private drawRelations(rel: { equipment: Set<string> }) {
    this.lines.clear();
    const p = this.selected;
    if (!p || p.kind !== "rack") return;
    const r = this.twin.racks.find((x) => x.asset_id === p.id)!;
    const from = new THREE.Vector3(r.x + r.width / 2, r.height + 0.2, r.y + r.depth / 2);
    const groups: [string[], number][] = [[r.relations.path_a_equipment, 0x7c9cff], [r.relations.path_b_equipment, 0x38bdf8], [r.relations.cdu_ids, 0x6fcf97], [r.relations.chiller_ids, 0x38bdf8]];
    for (const [ids, color] of groups) {
      const pts = ids.map((id) => this.equipMeshes.get(id)?.position).filter((v): v is THREE.Vector3 => !!v);
      if (!pts.length) continue;
      const c = pts.reduce((a, b) => a.clone().add(b), new THREE.Vector3()).divideScalar(pts.length);
      c.y += 2;
      const mid = from.clone().lerp(c, 0.5); mid.y += 8;
      const curve = new THREE.QuadraticBezierCurve3(from, mid, c);
      this.lines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 })));
    }
    void rel;
  }

  select(p: Picked | null, notify = true) {
    this.selected = p;
    this.paint();
    if (notify) this.onSelect(p);
  }

  focusOn(p: Picked) {
    const c = new THREE.Vector3();
    let dist: number;
    if (p.kind === "rack") { const r = this.twin.racks.find((x) => x.asset_id === p.id)!; c.set(r.x, 1, r.y); dist = 14; }
    else if (p.kind === "hall") { const h = this.twin.halls.find((x) => x.id === p.id)!; c.set(h.x + h.width / 2, 2, h.y + h.depth / 2); dist = 34; }
    else { const m = this.equipMeshes.get(p.id)!; c.copy(m.position); dist = 18; }
    this.moveTo(c, c.clone().add(new THREE.Vector3(dist * 0.55, dist * 0.7, dist * 0.75)));
  }

  flyTo(zone: string, instant = false) {
    const t = this.twin;
    if (zone === "overview") {
      const c = this.center.clone(); c.y = 0;
      this.moveTo(c, c.clone().add(new THREE.Vector3(48, 62, 74)), instant);
    } else if (zone === "plant") {
      const ys = t.equipment.filter((e) => e.system !== "CDU");
      const cx = ys.reduce((a, e) => a + e.display_position.x, 0) / ys.length, cz = ys.reduce((a, e) => a + e.display_position.y, 0) / ys.length;
      const c = new THREE.Vector3(cx + 8, 0, cz); this.moveTo(c, c.clone().add(new THREE.Vector3(26, 32, 38)), instant);
    } else {
      const h = t.halls.find((x) => x.id === zone);
      if (h) { const c = new THREE.Vector3(h.x + h.width / 2, 0, h.y + h.depth / 2); this.moveTo(c, c.clone().add(new THREE.Vector3(18, 26, 32)), instant); }
    }
  }

  private moveTo(target: THREE.Vector3, position: THREE.Vector3, instant = false) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (instant || reduce) { this.camera.position.copy(position); this.controls.target.copy(target); this.controls.update(); this.anim = null; return; }
    this.anim = { t0: performance.now(), from: this.camera.position.clone(), to: position, ft: this.controls.target.clone(), tt: target };
  }

  // screen position of an asset, for tests and focus rings
  screenOf(id: string): { x: number; y: number } | null {
    const v = new THREE.Vector3();
    const rack = this.twin.racks.find((r) => r.asset_id === id);
    if (rack) v.set(rack.x + rack.width / 2, rack.height, rack.y + rack.depth / 2);
    else { const m = this.equipMeshes.get(id); if (!m) return null; v.copy(m.position); v.y *= 2; }
    v.project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  private pick(clientX: number, clientY: number): Picked | null {
    const rect = this.canvas.getBoundingClientRect();
    this.ray.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    this.raycaster.setFromCamera(this.ray, this.camera);
    const targets: THREE.Object3D[] = [];
    if (this.racksMesh.visible) targets.push(this.racksMesh);
    for (const m of this.equipMeshes.values()) if (m.visible) targets.push(m);
    if (this.hallGroup.visible) for (const f of this.hallFloors.values()) targets.push(f);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    if (hit.object === this.racksMesh) return { kind: "rack", id: this.rackIds[hit.instanceId!] };
    return { kind: hit.object.userData.kind, id: hit.object.userData.id };
  }

  private onDown = (e: PointerEvent) => { this.down = { x: e.clientX, y: e.clientY }; };
  private onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5 || e.button !== 0) return;
    this.select(this.pick(e.clientX, e.clientY));
  };
  private moveQueued = false;
  private onMove = (e: PointerEvent) => {
    if (this.moveQueued || e.buttons) return;
    this.moveQueued = true;
    requestAnimationFrame(() => {
      this.moveQueued = false;
      const hit = this.pick(e.clientX, e.clientY);
      this.canvas.style.cursor = hit ? "pointer" : "grab";
      this.onHover(hit ? hit.id : null, e.clientX, e.clientY);
    });
  };

  equipmentOf(id: string): Equipment | undefined { return this.twin.equipment.find((e) => e.asset_id === id); }

  private loop = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    if (this.anim) {
      const k = Math.min(1, (performance.now() - this.anim.t0) / 650), e = 1 - Math.pow(1 - k, 3);
      this.camera.position.lerpVectors(this.anim.from, this.anim.to, e);
      this.controls.target.lerpVectors(this.anim.ft, this.anim.tt, e);
      if (k >= 1) this.anim = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose()); else mat?.dispose?.();
    });
    this.renderer.dispose();
  }
}
