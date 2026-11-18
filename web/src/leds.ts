import * as THREE from "three";

// Status LEDs blink in the shader, so 200 racks cost one uniform update.
// The rate follows the synthetic rack telemetry. It is an illustration, not a real status signal.
export const LED_MIN_HZ = 0.6, LED_MAX_HZ = 2.4;      // stays under 3 flashes per second

export function ledMaterial(calm: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uPhase: { value: 0 }, uCalm: { value: calm ? 1 : 0 }, uOn: { value: new THREE.Color(0x3ddc84) }, uOff: { value: new THREE.Color(0x06241a) } },
    vertexShader: `
      attribute float aRate; attribute float aPhase;
      uniform float uPhase; uniform float uCalm; varying float vOn;
      void main() {
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        float unit = fract(sin(floor(position.y * 22.5) * 12.9898) * 43758.5453);
        float cycle = fract(uPhase * aRate + aPhase + unit);
        vOn = max(uCalm, step(0.38, cycle));
        gl_Position = projectionMatrix * modelViewMatrix * p;
      }`,
    fragmentShader: `
      uniform vec3 uOn; uniform vec3 uOff; varying float vOn;
      void main() { gl_FragColor = vec4(mix(uOff, uOn, vOn), 1.0); }`,
  });
}

// per instance rate and phase; rates come from normalised telemetry in 0..1
export function ledGeometry(base: THREE.BufferGeometry, load: number[]): THREE.BufferGeometry {
  const g = base.clone();
  const rate = new Float32Array(load.length), phase = new Float32Array(load.length);
  load.forEach((k, i) => { rate[i] = LED_MIN_HZ + (LED_MAX_HZ - LED_MIN_HZ) * Math.min(1, Math.max(0, k)); phase[i] = (i * 0.6180339887) % 1; });
  g.setAttribute("aRate", new THREE.InstancedBufferAttribute(rate, 1));
  g.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
  return g;
}
