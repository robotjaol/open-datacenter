import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Equipment, Rack, Twin } from "./types";
import { buildRack, buildRackParts, FRONT_Z, RACK_UNIT_LIST, unitAtHeight } from "./models/rack";
import { buildContainment } from "./models/containment";
import { ledGeometry, ledMaterial } from "./leds";
import { fmtLength, measure, Measurement, ORTHO_FOV, orthoScale, PERSPECTIVE_FOV, sectionPlane, SectionAxis, ViewName, VIEW_DIRECTION } from "./cad";
import { buildTray } from "./models/tray";
import { buildPlant } from "./models/plant";
import { availableModels, loadExternal } from "./models/external";
import { RACK_SIZE } from "./models/rack";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

interface RackSet { ids: string[]; center: THREE.Vector3; simple: THREE.InstancedMesh; body: THREE.InstancedMesh; mid: THREE.InstancedMesh; accent: THREE.InstancedMesh; led: THREE.InstancedMesh; hallId: string; trays?: THREE.Mesh }
const DETAIL_DISTANCE = 35;   // full detail inside this distance
const MID_DISTANCE = 70;      // medium detail up to here, then a plain block

export type ColorMode = "hall" | "telemetry" | "neutral";
export interface Layers { leds: boolean; aisles: boolean; halls: boolean; racks: boolean; electrical: boolean; cooling: boolean; relations: boolean; labels: boolean }
export interface Picked { kind: "rack" | "equipment" | "hall"; id: string; unit?: number }

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

// racks face +z in the model; rows that face -y are turned half a revolution
function placeRack(m: THREE.Matrix4, r: Rack) {
  if (r.facing === "-y") m.makeRotationY(Math.PI); else m.identity();
  m.setPosition(r.x + r.width / 2, 0, r.y + r.depth / 2);
}

export class TwinScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private center = new THREE.Vector3();
  private rackSets: RackSet[] = [];
  private rackLoc = new Map<string, { set: RackSet; idx: number }>();
  private racksVisible = true;
  private pmrem: THREE.PMREMGenerator;
  private rackBase: THREE.Color[] = [];
  private equipMeshes = new Map<string, THREE.Mesh>();
  private hallFloors = new Map<string, THREE.Mesh>();
  private hallGroup = new THREE.Group();
  private labelGroup = new THREE.Group();
  private lines = new THREE.Group();
  private trays = new THREE.Group();
  private aisleGroup = new THREE.Group();
  private casters: THREE.Object3D[] = [];
  private ledMat = ledMaterial(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  private ledsOn = true;
  private layerAisles = true;
  private ledPhase = 0;
  private lastTick = performance.now();
  activity = 1;            // global load factor for LED rate, set by the simulation
  private dirty = true;
  private shadowDirty = true;
  renderedFrames = 0;
  // ask for one more frame; the loop draws only when something changed
  invalidate() { this.dirty = true; }
  private raycaster = new THREE.Raycaster();
  private ray = new THREE.Vector2();
  private frame = 0;
  private disposed = false;
  private down = { x: 0, y: 0 };
  private anim: { t0: number; from: THREE.Vector3; to: THREE.Vector3; ft: THREE.Vector3; tt: THREE.Vector3 } | null = null;
  private selected: Picked | null = null;
  private resize: ResizeObserver;
  // component level: selected unit marker and exploded assembly
  private unitMarker = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.38, depthTest: false }));
  private exploded: { id: string; group: THREE.Group; parts: { mesh: THREE.Mesh; dir: THREE.Vector3; unit?: number }[]; k: number; to: number; t0: number; from: number; settled?: boolean; hidden: { im: THREE.InstancedMesh; idx: number }[] } | null = null;
  get isExploded() { return this.exploded !== null && this.exploded.to === 1; }
  // CAD state
  private ortho = false;
  private lodScale = 1;
  private sectionOn = false;
  private measuring = false;
  private measurePoints: THREE.Vector3[] = [];
  private measureGroup = new THREE.Group();
  private dimBox: THREE.Box3Helper | null = null;
  onMeasure: (m: Measurement | null, pending: boolean) => void = () => {};
  onSelect: (p: Picked | null) => void = () => {};
  onHover: (id: string | null, x: number, y: number) => void = () => {};

  constructor(private canvas: HTMLCanvasElement, private twin: Twin) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.autoUpdate = false; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture; this.scene.environmentIntensity = 0.55;
    this.scene.background = new THREE.Color(0x0a0d11);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.addEventListener("change", () => { this.dirty = true; });
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03; this.controls.minDistance = 1.2; this.controls.maxDistance = 220;
    // framing
    const xs = [...twin.halls.map((h) => h.x), ...twin.halls.map((h) => h.x + h.width), ...twin.equipment.map((e) => e.display_position.x + e.display_position.width)];
    const ys = [...twin.halls.map((h) => h.y), ...twin.halls.map((h) => h.y + h.depth), ...twin.equipment.map((e) => e.display_position.y + e.display_position.depth)];
    this.center.set((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...ys) + Math.max(...ys)) / 2);
    this.scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x1a222c, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(this.center.x + 40, 70, this.center.z + 30); sun.target.position.set(this.center.x, 0, this.center.z);
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 200 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x0d1117 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(this.center.x, -0.02, this.center.z); this.scene.add(ground);
    const grid = new THREE.GridHelper(200, 40, 0x26303b, 0x171d25); grid.position.set(this.center.x, 0, this.center.z); this.scene.add(grid);
    this.unitMarker.visible = false; this.unitMarker.renderOrder = 9; this.unitMarker.raycast = () => {};
    this.scene.add(this.hallGroup, this.labelGroup, this.lines, this.trays, this.aisleGroup, this.measureGroup, this.unitMarker);
    this.buildHalls();
    this.buildRacks();
    this.buildTrays();
    this.buildAisles();
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
    void this.applyExternalModels();
  }

  // raised floor: 600 mm tile grid drawn into a repeating texture
  private tileMaterials(w: number, d: number): THREE.Material[] {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#1b242e"; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#0e141a"; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128);
    g.fillStyle = "#222c37"; for (const [x, y] of [[10, 10], [118, 10], [10, 118], [118, 118]]) g.fillRect(x - 2, y - 2, 4, 4);
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(w / 0.6, d / 0.6);
    tex.anisotropy = 8; tex.colorSpace = THREE.SRGBColorSpace;
    const side = new THREE.MeshStandardMaterial({ color: 0x18212b, roughness: 0.9 });
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0.1 });
    return [side, side, top, side, side, side];
  }

  private buildHalls() {
    for (const [i, hall] of this.twin.halls.entries()) {
      const color = HALL_COLOR[i % HALL_COLOR.length];
      const floor = new THREE.Mesh(new THREE.BoxGeometry(hall.width, 0.2, hall.depth), this.tileMaterials(hall.width, hall.depth));
      floor.position.set(hall.x + hall.width / 2, 0.1, hall.y + hall.depth / 2);
      floor.userData = { kind: "hall", id: hall.id }; floor.receiveShadow = true;
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

  private buildRacks() {
    const geo = buildRack();
    const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.55 });
    const accentMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const vals = this.twin.racks.map((r) => r.telemetry[0]?.value ?? NaN).filter((v) => Number.isFinite(v));
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const simpleMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.2 });
    const m = new THREE.Matrix4();
    for (const hall of this.twin.halls) {
      const racks = this.twin.racks.filter((r) => r.hall_id === hall.id);
      const n = racks.length;
      const mk = (g: THREE.BufferGeometry, mat: THREE.Material) => {
        const im = new THREE.InstancedMesh(g, mat, n);
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
        return im;
      };
      const set: RackSet = { hallId: hall.id, ids: racks.map((r) => r.asset_id), center: new THREE.Vector3(hall.x + hall.width / 2, 1, hall.y + hall.depth / 2),
        simple: mk(geo.simple, simpleMat), mid: mk(geo.mid, bodyMat), body: mk(geo.body, bodyMat), accent: mk(geo.accent, accentMat),
        led: new THREE.InstancedMesh(ledGeometry(geo.led, racks.map((r) => { const v = r.telemetry[0]?.value; return v === undefined || hi <= lo ? 0.5 : (v - lo) / (hi - lo); })), this.ledMat, n) };
      racks.forEach((r, i) => {
        placeRack(m, r);
        set.simple.setMatrixAt(i, m); set.mid.setMatrixAt(i, m); set.body.setMatrixAt(i, m); set.accent.setMatrixAt(i, m); set.led.setMatrixAt(i, m);
        this.rackLoc.set(r.asset_id, { set, idx: i });
      });
      // invisible low poly caster keeps shadows stable while the detail level changes
      const caster = new THREE.InstancedMesh(geo.simple, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), n);
      racks.forEach((r, i) => { placeRack(m, r); caster.setMatrixAt(i, m); });
      caster.castShadow = true; caster.raycast = () => {}; this.casters.push(caster); this.scene.add(caster);
      set.body.receiveShadow = true; set.mid.receiveShadow = true; set.simple.receiveShadow = true;
      for (const im of [set.simple, set.mid, set.body, set.accent, set.led]) { im.computeBoundingSphere(); im.frustumCulled = true; }
      set.body.visible = false; set.mid.visible = false; set.accent.visible = false; set.led.visible = false; set.led.raycast = () => {};
      this.scene.add(set.simple, set.mid, set.body, set.accent, set.led);
      this.rackSets.push(set);
    }
  }

  // hot aisles get a glazed roof and end doors, cold aisles a blue floor marker; both come from the Python aisle plan.
  // Everything is merged by material, so the whole layer costs four draw calls.
  private buildAisles() {
    const frameMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.7 });
    const glassMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.28, roughness: 0.1, metalness: 0.2, depthWrite: false });
    const tintMat = (color: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const tints = { cold: [] as THREE.BufferGeometry[], hot: [] as THREE.BufferGeometry[] }, frames: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [];
    const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.clone().translate(x, y, z);
    for (const hall of this.twin.halls) for (const a of hall.aisles ?? []) {
      const cx = a.x + a.width / 2, cz = a.y + a.depth / 2;
      const plane = new THREE.PlaneGeometry(a.width, a.depth); plane.rotateX(-Math.PI / 2); plane.deleteAttribute("uv");
      tints[a.kind].push(at(plane, cx, 0.21, cz));
      if (!a.contained) continue;
      const c = buildContainment(a.width, a.depth, 2.2);
      frames.push(at(c.frame, cx, 0.2, cz)); glass.push(at(c.glass, cx, 0.2, cz));
    }
    const add = (gs: THREE.BufferGeometry[], mat: THREE.Material, shadow = false, order = 0) => {
      if (!gs.length) return;
      const mesh = new THREE.Mesh(mergeGeometries(gs, false)!, mat);
      mesh.raycast = () => {}; mesh.castShadow = shadow; mesh.renderOrder = order; this.aisleGroup.add(mesh);
    };
    add(tints.cold, tintMat(0x38bdf8)); add(tints.hot, tintMat(0xf97316)); add(frames, frameMat, true); add(glass, glassMat, false, 2);
  }

  // generic overhead cable tray above each rack row, schematic and not part of the data contract.
  // One merged mesh per hall, shown together with the detailed racks of that hall.
  private buildTrays() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 });
    const topY = 2.75;
    for (const hall of this.twin.halls) {
      const rows = new Map<number, typeof this.twin.racks>();
      for (const r of this.twin.racks) if (r.hall_id === hall.id) { const a = rows.get(r.y) ?? []; a.push(r); rows.set(r.y, a); }
      const parts: THREE.BufferGeometry[] = [];
      for (const [y, rs] of rows) {
        const x0 = Math.min(...rs.map((r) => r.x)), x1 = Math.max(...rs.map((r) => r.x + r.width));
        parts.push(buildTray(x1 - x0, hall.height - topY).translate(x0, topY, y + rs[0].depth / 2));
      }
      if (!parts.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(parts, false)!, mat);
      mesh.castShadow = true; mesh.raycast = () => {};
      this.trays.add(mesh);
      const set = this.rackSets.find((x) => x.hallId === hall.id);
      if (set) set.trays = mesh;
    }
  }

  // optional local GLB files replace the generic models when present
  private async applyExternalModels() {
    const have = await availableModels();
    if (!have.size) return;
    if (have.has("rack")) {
      const rack = await loadExternal("rack", { w: RACK_SIZE.w, d: RACK_SIZE.d, h: RACK_SIZE.h, origin: "floor" });
      if (rack && !this.disposed) { for (const st of this.rackSets) { st.body.geometry = rack; st.mid.geometry = rack; st.accent.count = 0; st.led.count = 0; } this.dirty = true; }
    }
    const names: Record<string, string> = { UPS: "ups", TX: "tx", GEN: "gen", CHL: "chl", CDU: "cdu" };
    for (const [id, mesh] of this.equipMeshes) {
      const e = this.twin.equipment.find((x) => x.asset_id === id)!, p = e.display_position, name = names[e.system];
      if (!name || !have.has(name)) continue;
      const g = await loadExternal(name, { w: p.width, d: p.depth, h: p.height, origin: "center" });
      if (g && !this.disposed) { mesh.geometry = g; this.shadowDirty = true; this.dirty = true; const mat = mesh.material as THREE.MeshStandardMaterial; mat.vertexColors = true; mat.needsUpdate = true; }
    }
  }

  // swap between the box stand-in and the full rack model by distance
  private updateLod() {
    const iso = this.exploded !== null;            // an exploded rack stands alone
    for (const s of this.rackSets) {
      const d = this.camera.position.distanceTo(s.center) * this.lodScale, full = d < DETAIL_DISTANCE, mid = !full && d < MID_DISTANCE;
      const on = this.racksVisible && !iso;
      s.body.visible = on && full; s.mid.visible = on && mid;
      s.accent.visible = on && (full || mid); s.led.visible = this.ledsOn && !this.sectionOn && on && (full || mid); s.simple.visible = on && !full && !mid;
      if (s.trays) s.trays.visible = on && (full || mid);
    }
    // labels are fixed in world size, so hide them when the camera is close
    for (const t of this.labelGroup.children) t.visible = this.camera.position.distanceTo(t.position) * this.lodScale > 30 && this.camera.position.y > 10;
  }

  private buildEquipment() {
    for (const e of this.twin.equipment) {
      const p = e.display_position;
      const geo = buildPlant(e.system, { w: p.width, d: p.depth, h: p.height }, SYSTEM_COLOR[e.system] ?? 0x888888)
        ?? new THREE.BoxGeometry(p.width, p.height, p.depth);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: geo.hasAttribute("color"), color: 0xffffff, roughness: 0.5, metalness: 0.4 }));
      mesh.position.set(p.x + p.width / 2, p.height / 2, p.y + p.depth / 2);
      mesh.userData = { kind: "equipment", id: e.asset_id, system: e.system };
      this.equipMeshes.set(e.asset_id, mesh);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  private fit() {
    const parent = this.canvas.parentElement!;
    const w = Math.max(2, parent.clientWidth), h = Math.max(2, parent.clientHeight);
    this.renderer.setSize(w, h, false); this.dirty = true;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  setLayers(l: Layers) {
    this.hallGroup.visible = l.halls;
    this.layerAisles = l.aisles; this.aisleGroup.visible = l.aisles && !this.exploded; this.ledsOn = l.leds; this.racksVisible = l.racks; this.trays.visible = l.racks; this.dirty = true; for (const c of this.casters) c.visible = l.racks; this.shadowDirty = true;
    this.updateLod();
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
    this.dirty = true;
    const rel = this.related(this.selected);
    const any = this.selected !== null;
    const c = new THREE.Color(), body = new THREE.Color();
    this.twin.racks.forEach((r, i) => {
      c.copy(this.rackBase[i]); body.setRGB(1, 1, 1);
      if (any) {
        if (rel.racks.has(r.asset_id)) { if (this.selected!.id === r.asset_id) { c.set(0xffffff); body.setRGB(1.6, 1.6, 1.6); } else c.lerp(new THREE.Color(0xffffff), 0.35); }
        else { c.multiplyScalar(0.28); body.setRGB(0.3, 0.3, 0.3); }
      }
      const loc = this.rackLoc.get(r.asset_id)!;
      loc.set.simple.setColorAt(loc.idx, c); loc.set.accent.setColorAt(loc.idx, c); loc.set.body.setColorAt(loc.idx, body); loc.set.mid.setColorAt(loc.idx, body);
    });
    for (const st of this.rackSets) for (const im of [st.simple, st.accent, st.body, st.mid]) im.instanceColor!.needsUpdate = true;
    for (const [id, mesh] of this.equipMeshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const on = rel.equipment.has(id);
      mat.emissive.setHex(on ? (this.selected?.id === id ? 0xffffff : (SYSTEM_COLOR[mesh.userData.system as string] ?? 0x888888)) : 0x000000);
      mat.emissiveIntensity = on ? (this.selected?.id === id ? 0.16 : 0.1) : 0;
      mat.opacity = any && !on ? 0.35 : 1; mat.transparent = any && !on;
    }
    for (const [id, floor] of this.hallFloors) {
      for (const mt of floor.material as THREE.MeshStandardMaterial[]) mt.emissive.setHex(rel.halls.has(id) && any ? 0x0b3a4d : 0x000000);
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
    if (this.exploded && this.exploded.to === 1 && p?.id !== this.exploded.id) this.explode(false);
    this.paint(); this.updateUnitMarker();
    if (notify) this.onSelect(p);
  }

  // yellow marker over the selected rack unit (or emissive highlight on the exploded part)
  private updateUnitMarker() {
    const p = this.selected, ex = this.exploded;
    if (ex) for (const pt of ex.parts) (pt.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(p?.id === ex.id && p.unit !== undefined && pt.unit === p.unit ? 0x6b5200 : 0x000000);
    if (!p || p.kind !== "rack" || p.unit === undefined || ex) { this.unitMarker.visible = false; this.dirty = true; return; }
    const r = this.twin.racks.find((x) => x.asset_id === p.id)!, u = RACK_UNIT_LIST[p.unit], m = new THREE.Matrix4();
    placeRack(m, r);
    this.unitMarker.position.set(0, (u.y0 + u.y1) / 2, FRONT_Z + 0.045).applyMatrix4(m);
    this.unitMarker.quaternion.setFromRotationMatrix(m); this.unitMarker.scale.set(0.492, u.y1 - u.y0 + 0.004, 0.05);
    this.unitMarker.visible = true; this.dirty = true;
  }

  // pull the selected rack apart into frame, side panels, PDUs, manifold and each unit
  explode(on: boolean) {
    if (!on) { if (this.exploded) { this.exploded.to = 0; this.exploded.from = this.exploded.k; this.exploded.t0 = performance.now(); this.exploded.settled = false; this.dirty = true; } return; }
    const p = this.selected; if (!p || p.kind !== "rack" || this.exploded) return;
    const r = this.twin.racks.find((x) => x.asset_id === p.id)!, loc = this.rackLoc.get(p.id)!;
    const placement = new THREE.Matrix4(); placeRack(placement, r);
    const group = new THREE.Group(); group.matrixAutoUpdate = false; group.matrix.copy(placement); group.matrixWorldNeedsUpdate = true;
    const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.55 });
    const ledBasic = new THREE.MeshBasicMaterial({ color: 0x3ddc84 });
    const parts: { mesh: THREE.Mesh; dir: THREE.Vector3; unit?: number }[] = [];
    const list = buildRackParts();
    list.forEach((pt) => {
      const mesh = new THREE.Mesh(pt.geometry, bodyMat.clone()); mesh.castShadow = false; mesh.userData = { unit: pt.unit?.index, name: pt.name };
      group.add(mesh);
      const dir = new THREE.Vector3(...pt.direction);
      if (pt.unit) { dir.y = (pt.unit.index - list.length / 3) * 0.075; dir.z = 0.55 + (pt.unit.index % 2) * 0.25; }
      parts.push({ mesh, dir, unit: pt.unit?.index });
      if (pt.led) { const lm = new THREE.Mesh(pt.led, ledBasic); lm.raycast = () => {}; mesh.add(lm); }
    });
    // hide the instanced rack while the exploded copy stands in for it
    const set = loc.set, caster = this.casters[this.rackSets.indexOf(set)] as THREE.InstancedMesh, hidden: { im: THREE.InstancedMesh; idx: number }[] = [];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const im of [set.simple, set.mid, set.body, set.accent, set.led, caster]) { im.setMatrixAt(loc.idx, zero); im.instanceMatrix.needsUpdate = true; hidden.push({ im, idx: loc.idx }); }
    this.scene.add(group);
    this.aisleGroup.visible = false;
    this.exploded = { id: p.id, group, parts, k: 0, from: 0, to: 1, t0: performance.now(), hidden };
    this.shadowDirty = true; this.dirty = true;
    this.updateUnitMarker();
    const c = new THREE.Vector3(r.x + r.width / 2, 1.1, r.y + r.depth / 2), sign = r.facing === "-y" ? -1 : 1;
    this.moveTo(c, c.clone().add(new THREE.Vector3(2.6 * sign, 0.8, 4.4 * sign)));
  }

  private stepExplode() {
    const ex = this.exploded; if (!ex) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = reduce ? 1 : Math.min(1, (performance.now() - ex.t0) / 800), e = 1 - Math.pow(1 - t, 3);
    ex.k = ex.from + (ex.to - ex.from) * e;
    for (const pt of ex.parts) pt.mesh.position.copy(pt.dir).multiplyScalar(ex.k * 0.5);
    if (t < 1 || !ex.settled) { this.dirty = true; ex.settled = t >= 1; }
    if (t >= 1 && ex.to === 0) this.finishExplode();
  }

  private finishExplode() {
    const ex = this.exploded; if (!ex) return;
    const r = this.twin.racks.find((x) => x.asset_id === ex.id)!, m = new THREE.Matrix4(); placeRack(m, r);
    for (const h of ex.hidden) { h.im.setMatrixAt(h.idx, m); h.im.instanceMatrix.needsUpdate = true; }
    this.scene.remove(ex.group);
    ex.group.traverse((o) => { const me = o as THREE.Mesh; me.geometry?.dispose?.(); (me.material as THREE.Material | undefined)?.dispose?.(); });
    this.aisleGroup.visible = this.layerAisles;
    this.exploded = null; this.shadowDirty = true; this.dirty = true; this.updateUnitMarker();
  }

  focusOn(p: Picked) {
    const c = new THREE.Vector3();
    let off: THREE.Vector3;
    if (p.kind === "rack") {
      const r = this.twin.racks.find((x) => x.asset_id === p.id)!, sign = r.facing === "-y" ? -1 : 1;
      c.set(r.x + r.width / 2, 1.2, r.y + r.depth / 2); off = new THREE.Vector3(0.35, 0.15, 1.65 * sign);
      if (p.unit !== undefined) { const u = RACK_UNIT_LIST[p.unit]; c.y = (u.y0 + u.y1) / 2; c.z += (FRONT_Z + 0.05) * sign; off = new THREE.Vector3(0.18 * sign, 0.05, 0.85 * sign); }       // inside the 1.8 m cold aisle, facing the front
    } else if (p.kind === "hall") {
      const h = this.twin.halls.find((x) => x.id === p.id)!;
      c.set(h.x + h.width / 2, 2, h.y + h.depth / 2); off = new THREE.Vector3(18, 26, 32);
    } else {
      const m = this.equipMeshes.get(p.id)!, size = new THREE.Vector3();
      new THREE.Box3().setFromObject(m).getSize(size);
      c.copy(m.position); const k = Math.max(size.x, size.z) * 0.9 + 3; off = new THREE.Vector3(k * 0.6, k * 0.45, k);
    }
    this.moveTo(c, c.clone().add(off));
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
    this.dirty = true;
    if (instant || reduce) { this.camera.position.copy(position); this.controls.target.copy(target); this.controls.update(); this.anim = null; return; }
    this.anim = { t0: performance.now(), from: this.camera.position.clone(), to: position, ft: this.controls.target.clone(), tt: target };
  }

  // screen position of an asset, for tests and focus rings
  screenOf(id: string): { x: number; y: number } | null {
    const v = new THREE.Vector3();
    const rack = this.twin.racks.find((r) => r.asset_id === id);
    if (rack) v.set(rack.x + rack.width / 2, rack.height - 0.15, rack.y + rack.depth / 2);
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
    for (const st of this.rackSets) for (const im of [st.simple, st.mid, st.body]) if (im.visible) targets.push(im);
    for (const m of this.equipMeshes.values()) if (m.visible) targets.push(m);
    if (this.exploded) for (const pt of this.exploded.parts) targets.push(pt.mesh);
    if (this.hallGroup.visible) for (const f of this.hallFloors.values()) targets.push(f);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    if (this.exploded && hit.object.parent === this.exploded.group) return { kind: "rack", id: this.exploded.id, unit: hit.object.userData.unit };
    const set = this.rackSets.find((st) => st.simple === hit.object || st.mid === hit.object || st.body === hit.object);
    if (set) {
      let unit: number | undefined;
      if (hit.object === set.body || hit.object === set.mid) {
        const m = new THREE.Matrix4(); (hit.object as THREE.InstancedMesh).getMatrixAt(hit.instanceId!, m);
        const local = hit.point.clone().applyMatrix4(m.invert());
        if (local.z > 0.3) unit = unitAtHeight(local.y)?.index;       // front face only
      }
      return { kind: "rack", id: set.ids[hit.instanceId!], unit };
    }
    return { kind: hit.object.userData.kind, id: hit.object.userData.id };
  }

  // ---- CAD tools ----
  setView(name: ViewName) {
    const target = this.controls.target.clone(), dist = this.camera.position.distanceTo(target);
    this.moveTo(target, target.clone().addScaledVector(VIEW_DIRECTION[name], dist));
  }

  setProjection(ortho: boolean) {
    if (ortho === this.ortho) return;
    const target = this.controls.target, dir = this.camera.position.clone().sub(target), k = orthoScale(PERSPECTIVE_FOV, ORTHO_FOV);
    this.ortho = ortho; this.lodScale = ortho ? 1 / k : 1;
    this.camera.fov = ortho ? ORTHO_FOV : PERSPECTIVE_FOV;
    this.camera.near = ortho ? 0.5 * k : 0.5; this.camera.far = ortho ? 600 * k : 600;
    this.controls.minDistance = ortho ? 1.2 * k : 1.2; this.controls.maxDistance = ortho ? 220 * k : 220;
    this.camera.position.copy(target).addScaledVector(dir, ortho ? k : 1 / k);
    this.camera.updateProjectionMatrix(); this.controls.update(); this.dirty = true;
  }
  get isOrtho() { return this.ortho; }

  // section plane through the model; null removes it. LEDs are hidden while it is on because their shader is not clipped.
  setSection(axis: SectionAxis | null, offset = 0) {
    this.sectionOn = axis !== null;
    this.renderer.clippingPlanes = axis ? [sectionPlane(axis, offset)] : [];
    this.dirty = true; this.shadowDirty = true;
  }

  setMeasure(on: boolean) {
    this.measuring = on; this.canvas.style.cursor = on ? "crosshair" : "grab";
    if (!on) this.clearMeasure();
  }

  clearMeasure() {
    this.measurePoints = [];
    for (const c of [...this.measureGroup.children]) { this.measureGroup.remove(c); (c as THREE.Mesh).geometry?.dispose?.(); }
    this.onMeasure(null, false); this.dirty = true;
  }

  private surfacePoint(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    this.ray.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    this.raycaster.setFromCamera(this.ray, this.camera);
    const targets: THREE.Object3D[] = [];
    for (const st of this.rackSets) for (const im of [st.simple, st.mid, st.body]) if (im.visible) targets.push(im);
    for (const m of this.equipMeshes.values()) if (m.visible) targets.push(m);
    for (const f of this.hallFloors.values()) targets.push(f);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (hit) return hit.point.clone();
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null;
  }

  private addMeasurePoint(p: THREE.Vector3) {
    if (this.measurePoints.length >= 2) this.clearMeasure();
    this.measurePoints.push(p);
    const r = this.ortho ? 0.12 : 0.06;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(r * Math.max(1, this.camera.position.distanceTo(p) / 12), 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd23f, depthTest: false }));
    dot.position.copy(p); dot.renderOrder = 10; this.measureGroup.add(dot);
    if (this.measurePoints.length === 2) {
      const [a, b] = this.measurePoints;
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0xffd23f, depthTest: false }));
      line.renderOrder = 10; this.measureGroup.add(line);
      this.onMeasure(measure(a, b), false);
    } else this.onMeasure(null, true);
    this.dirty = true;
  }

  // world position of the midpoint of the active measurement on screen, for the label
  measureLabelAt(): { x: number; y: number } | null {
    if (this.measurePoints.length < 2) return null;
    const v = this.measurePoints[0].clone().add(this.measurePoints[1]).multiplyScalar(0.5).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.canvas.clientWidth, y: ((1 - v.y) / 2) * this.canvas.clientHeight };
  }

  // bounding box and size of the selection, drawn as a dimension box
  showDimensions(on: boolean): { w: number; h: number; d: number; text: string } | null {
    if (this.dimBox) { this.scene.remove(this.dimBox); this.dimBox.geometry.dispose(); this.dimBox = null; this.dirty = true; }
    const p = this.selected; if (!on || !p) return null;
    const box = new THREE.Box3();
    if (p.kind === "rack") { const r = this.twin.racks.find((x) => x.asset_id === p.id)!; box.set(new THREE.Vector3(r.x, 0, r.y), new THREE.Vector3(r.x + r.width, r.height, r.y + r.depth)); }
    else if (p.kind === "hall") { const h = this.twin.halls.find((x) => x.id === p.id)!; box.set(new THREE.Vector3(h.x, 0, h.y), new THREE.Vector3(h.x + h.width, 3.6, h.y + h.depth)); }
    else { const m = this.equipMeshes.get(p.id); if (!m) return null; box.setFromObject(m); }
    this.dimBox = new THREE.Box3Helper(box, new THREE.Color(0xffd23f)); this.scene.add(this.dimBox); this.dirty = true;
    const s = box.getSize(new THREE.Vector3());
    return { w: s.x, h: s.y, d: s.z, text: `${fmtLength(s.x)} x ${fmtLength(s.z)} x ${fmtLength(s.y)} (W x D x H)` };
  }

  private onDown = (e: PointerEvent) => { this.down = { x: e.clientX, y: e.clientY }; };
  private onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5 || e.button !== 0) return;
    if (this.measuring) { const p = this.surfacePoint(e.clientX, e.clientY); if (p) this.addMeasurePoint(p); return; }
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
    if (this.anim) this.dirty = true;
    this.stepExplode();
    const now = performance.now(), dt = now - this.lastTick;
    if (dt >= 50 && this.ledMat.uniforms.uCalm.value === 0 && this.rackSets.some((r) => r.led.visible)) {
      this.lastTick = now; this.ledPhase += (dt / 1000) * this.activity;
      this.ledMat.uniforms.uPhase.value = this.ledPhase; this.dirty = true;
    } else if (dt >= 50) this.lastTick = now;
    this.controls.update();
    if (!this.dirty) return;
    this.dirty = false;
    this.updateLod();
    if (this.shadowDirty) { this.renderer.shadowMap.needsUpdate = true; this.shadowDirty = false; }
    this.renderer.render(this.scene, this.camera); this.renderedFrames++;
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
    this.pmrem.dispose();
    this.renderer.dispose();
  }
}
