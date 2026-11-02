import * as THREE from 'three';
import { OceanSim, defaultOceanParams } from './vendor/ultra-water/OceanSim.js';

// 海面有五種，網址 ?sea= 切換：
//   （預設）toon：卡通風的海，和島的配色一致。水紋明暗只分三階（像畫上去的色塊），
//     顏色由岸邊淺到外海深（離岸距離表，見 world.js 的 bakeShore），岸邊一圈白浪花和一道道往外推的浪花線。
//     水紋是在 shader 裡直接算幾道正弦波的斜率，不跑 FFT 模擬（FFT 一秒算 30 次，每兩幀就有一幀多畫幾十個 pass，畫面會頓）
//   real：波浪模擬用 Ultra Water（MIT，github.com/Humpalumps/Ultra-Water）的 FFT 海洋，
//     只拿它算出來的「坡度」和「白浪」貼在原本平的海面上（法線、太陽反光、天空反射、浪尖白沫），海面本身不起伏
//   mix：低多邊形的起伏（不規則的三角面）上再疊一層淡一點的 FFT 水紋、天空反射和白浪
//   lowpoly：只有低多邊形的起伏
//   flat：原本的平面海
const SEA = new URLSearchParams(location.search).get('sea');
export const SEA_MODE = ['flat', 'lowpoly', 'mix', 'real'].includes(SEA) ? SEA : 'toon';
export const RIPPLES = ['real', 'mix'].includes(SEA_MODE); // 要跑 FFT 模擬
export const FACETS = SEA_MODE === 'lowpoly' || SEA_MODE === 'mix'; // 海面切成三角面上下起伏
export const SHORE_ON = SEA_MODE === 'toon'; // 用離岸距離表（取代島邊兩圈淺灘色帶）
export const OCEAN_ON = RIPPLES;

const U = {
  uSlope: { value: [null, null, null] }, // 只用前三層；2.1 公尺那層放大後比一個像素還小，看不出來
  uDisp: { value: [null, null] },
  uLen: { value: new THREE.Vector4(1, 1, 1, 1) },
  uScale: { value: 1.6 },       // 1 公尺的模擬 = 幾個場景單位（越小水紋越細）
  uSky: { value: new THREE.Color('#dcecf2') },
  uSkyAmt: { value: 0.55 },
  uGain: { value: 0.5 },        // 水紋整體的斜度（1 = 真實海面，太粗糙；小一點比較像模型海）
  uFoam: { value: new THREE.Vector2(0.5, 0.25) }, // 白浪門檻、寬度（turbulence 低於門檻開始起白沫）
  uTime: { value: 0 },
  uWave: { value: 0.75 },       // 三角面起伏的高度（浪頂在海平面，浪谷往下 2 倍）
  // 卡通海
  uShore: { value: null },
  uShoreRect: { value: new THREE.Vector4(0, 0, 1, 1) }, // 離岸距離表涵蓋的範圍 x0, z0, 寬, 高
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSea: { value: [new THREE.Color('#e3f5ec'), new THREE.Color('#b3e2d6'), new THREE.Color('#8fd0c8'), new THREE.Color('#72bbbf')] }, // 岸邊 → 外海
};
export function setShore(tex, x0, z0, w, h) {
  U.uShore.value = tex;
  U.uShoreRect.value.set(x0, z0, w, h);
}

// 低多邊形起伏：幾道不同方向、不同長度的波，座標先用雜訊扭一下，再乘上一層很大範圍的雜訊
// （有的地方平靜、有的地方浪大），才不會整片規律得像玻璃
const WAVE_GLSL = /* glsl */`
float seaHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float seaNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(seaHash(i), seaHash(i + vec2(1, 0)), u.x), mix(seaHash(i + vec2(0, 1)), seaHash(i + 1.0), u.x), u.y);
}
float seaWave(vec2 p) {
  vec2 q = p + 9.0 * vec2(seaNoise(p * 0.025 + uTime * 0.03), seaNoise(p * 0.025 + vec2(5.2, 1.3) - uTime * 0.03));
  float w = sin(dot(q, vec2(0.17, 0.07)) + uTime * 1.0) * 0.38
          + sin(dot(q, vec2(-0.09, 0.19)) + uTime * 1.35) * 0.27
          + sin(dot(q, vec2(0.26, -0.21)) + uTime * 1.9) * 0.17
          + (seaNoise(q * 0.11 + uTime * 0.25) * 2.0 - 1.0) * 0.3;
  float calm = 0.4 + 0.8 * seaNoise(p * 0.012 + 3.1);
  return clamp(w * calm, -1.0, 1.0);
}`;
// 卡通海的水紋：四道方向、長度不同的正弦波（約 2–9 公尺），斜率直接微分出來；座標先用雜訊扭一下才不規律。
// 回傳 xy＝斜率，z＝高度（-1..1，浪尖白沫用）。遠處一個像素比波長還大時那道波會變成雜點閃爍，照像素大小（fwidth）把它淡掉
const TOON_GLSL = /* glsl */`
vec3 toonWave(vec2 p) {
  vec2 q = p + 2.5 * vec2(seaNoise(p * 0.06 + uTime * 0.05), seaNoise(p * 0.06 + vec2(5.2, 1.3) - uTime * 0.05));
  float px = length(fwidth(p)) / 6.2832;
  vec3 r = vec3(0.0);
  vec2 k; float a, ph, f;
  #define TOON_W(K, A, W, H) k = K; a = A; ph = dot(q, k) + uTime * W; f = 1.0 - smoothstep(0.06, 0.2, px * length(k)); r += vec3(k * a * cos(ph), H * sin(ph)) * f;
  TOON_W(vec2(0.62, 0.30), 0.17, 1.1, 0.32)
  TOON_W(vec2(-0.42, 1.02), 0.09, 1.5, 0.28)
  TOON_W(vec2(1.55, -1.05), 0.04, 2.1, 0.22)
  TOON_W(vec2(-2.4, -1.7), 0.018, 2.7, 0.18)
  return r;
}`;

// 把海面效果接到一個 MeshStandardMaterial 上。
// amp：FFT 水紋坡度的倍數（淺灘小一點）；foam：要不要白浪；main：是不是那張大海面（三角面起伏、卡通海只做在它上面）
export function seaMaterial(material, { amp = 1, foam = true, main = false } = {}) {
  const ripples = RIPPLES, faceted = main && FACETS, toon = main && SHORE_ON;
  if (!ripples && !faceted && !toon) return material;
  if (faceted) material.flatShading = true;
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uAmp: { value: amp } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
varying vec2 vSeaXZ;
${faceted ? `uniform float uTime, uWave;
attribute float aFace;
flat varying float vFace;
flat varying float vCrest;
${WAVE_GLSL}` : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSeaXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
${faceted ? `{
  float w = seaWave(vSeaXZ);
  vCrest = w * 0.5 + 0.5;
  vFace = aFace;
  transformed.y += (w - 1.0) * uWave;
}` : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vSeaXZ;
uniform sampler2D uSlope[3];
uniform sampler2D uDisp[2];
uniform vec4 uLen;
uniform float uScale, uAmp, uSkyAmt, uGain;
uniform vec3 uSky;
uniform vec2 uFoam;
${toon ? `uniform sampler2D uShore;
uniform vec4 uShoreRect;
uniform vec3 uSunDir, uSea[4];
uniform float uTime;
${WAVE_GLSL}
${TOON_GLSL}` : ''}
${faceted ? `flat varying float vFace;
flat varying float vCrest;` : ''}
float seaFoam = 0.0;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  ${faceted ? `// 每一面顏色深淺略有不同；浪頂偶爾一面泛白
  diffuseColor.rgb *= 0.9 + 0.16 * vFace;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.99, 1.0), step(0.88, vCrest) * step(0.45, vFace) * 0.55);` : ''}
  ${toon ? `// 卡通海：顏色依離岸距離由淺到深
  float shoreD = texture(uShore, (vSeaXZ - uShoreRect.xy) / uShoreRect.zw).r * 64.0;
  vec3 col = mix(uSea[0], uSea[1], smoothstep(1.0, 9.0, shoreD));
  col = mix(col, uSea[2], smoothstep(8.0, 26.0, shoreD));
  diffuseColor.rgb = mix(col, uSea[3], smoothstep(24.0, 64.0, shoreD));
  // 明暗只分三階：水紋朝太陽的那面亮一階、背著的暗一階；特別朝太陽的地方一點白色閃光
  vec3 tw = toonWave(vSeaXZ);
  vec2 sl = tw.xy;
  float dl = dot(normalize(vec3(-sl.x, 1.0, -sl.y)), uSunDir) - uSunDir.y;
  diffuseColor.rgb *= 1.0 + 0.07 * step(0.03, dl) - 0.06 * step(dl, -0.03);
  float glint = step(0.22, dl) * step(10.0, shoreD);
  // 浪尖白沫：邊緣切齊，像色塊
  seaFoam = step(0.62, tw.z) * step(0.6, seaNoise(vSeaXZ * 0.035 + uTime * 0.02)) * step(10.0, shoreD) * 0.75; // 只有浪高、又在浪大的那幾片海才起白沫
  // 岸邊：貼著岸一圈白浪花，外面一道道浪花線慢慢往外推、越遠越淡；用大範圍的水紋把線切成一段一段
  float rim = 1.0 - smoothstep(3.2, 4.6, shoreD); // 岩壁在海平面比島面寬 0.5–2.7 公尺，白邊要露在它外面
  float ring = fract(shoreD / 6.0 - uTime * 0.2 + sl.x * 1.5);
  float line = (smoothstep(0.0, 0.04, ring) - smoothstep(0.16, 0.24, ring)) * (1.0 - smoothstep(5.0, 20.0, shoreD)) * step(4.6, shoreD);
  line *= step(0.42, seaNoise(vSeaXZ * 0.045 + uTime * 0.03));
  seaFoam = max(seaFoam, max(rim, line * 0.9));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.98, 0.99, 1.0), max(seaFoam, glint * 0.75));` : ripples && foam ? `vec2 p = vSeaXZ / uScale;
  float turb = min(texture(uDisp[0], p / uLen.y).w, texture(uDisp[1], p / uLen.z).w);
  seaFoam = smoothstep(uFoam.x, uFoam.x - uFoam.y, turb);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.99, 1.0), seaFoam * 0.7);` : ''}
}`)
      .replace('#include <normal_fragment_maps>', ripples && !toon ? `{
  vec2 p = vSeaXZ / uScale;
  vec2 sl = texture(uSlope[0], p / uLen.x).xy + texture(uSlope[1], p / uLen.y).xy
          + texture(uSlope[2], p / uLen.z).xy;
  sl *= uGain * uAmp * (1.0 - seaFoam * 0.6);
  ${faceted
    ? `// 三角面本身的法線上再疊水紋
  normal = normalize(normal + (viewMatrix * vec4(-sl.x, 0.0, -sl.y, 0.0)).xyz);`
    : 'normal = normalize((viewMatrix * vec4(-sl.x, 1.0, -sl.y, 0.0)).xyz);'}
}` : '#include <normal_fragment_maps>')
      .replace('#include <emissivemap_fragment>', ripples || toon ? `#include <emissivemap_fragment>
{
  // 越斜看越反射天空（Schlick 菲涅耳），白浪的地方不反射
  float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 5.0);
  totalEmissiveRadiance += uSky * (0.04 + 0.96 * fr) * uSkyAmt * (1.0 - seaFoam)${toon ? ' * 0.6' : ''};
}` : '#include <emissivemap_fragment>');
  };
  material.customProgramCacheKey = () => `sea-${SEA_MODE}-${amp}-${foam}-${main}`;
  return material;
}

// 會起伏的大海面：約 7 公尺一格的三角網格，頂點用自己的亂數大幅錯開（三角形大小不一），
// 拆成每面獨立的三個頂點，再給每一面一個亂數（aFace，決定那一面的深淺）
export function seaGeometry(w, h, rng) {
  if (!FACETS) return new THREE.PlaneGeometry(w, h);
  const nx = 140, nz = 156, cx = w / nx, cz = h / nz;
  const g0 = new THREE.PlaneGeometry(w, h, nx, nz);
  const pos = g0.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const ix = i % (nx + 1), iz = Math.floor(i / (nx + 1));
    if (ix === 0 || ix === nx || iz === 0 || iz === nz) continue; // 邊緣不動，海面才不會缺角
    pos.setX(i, pos.getX(i) + (rng() - 0.5) * cx * 0.8);
    pos.setY(i, pos.getY(i) + (rng() - 0.5) * cz * 0.8);
  }
  const g = g0.toNonIndexed();
  const face = new Float32Array(g.attributes.position.count);
  for (let i = 0; i < face.length; i += 3) face[i] = face[i + 1] = face[i + 2] = rng();
  g.setAttribute('aFace', new THREE.BufferAttribute(face, 1));
  g.computeVertexNormals();
  return g;
}

// 主程式建好 renderer 之後呼叫；回傳每幀要跑的 update(dt)
export function startOcean(renderer) {
  const tick = (dt) => { U.uTime.value += Math.min(dt, 0.1); };
  // 天空反射的顏色跟著時段走（晚上幾乎不反射）；卡通海另外要太陽方向算三階明暗
  const setSky = (color, night, sunDir) => {
    U.uSky.value.copy(color);
    if (sunDir) U.uSunDir.value.copy(sunDir);
    U.uSkyAmt.value = night ? 0.25 : 0.55;
  };
  if (!RIPPLES) return { uniforms: U, update: tick, setSky };
  const params = Object.assign(defaultOceanParams(), { windSpeed: 7, choppiness: 0.9, foamRecovery: 0.9 });
  const sim = new OceanSim(renderer, params);
  U.uLen.value.set(...sim.lengths);
  const sync = () => {
    for (let c = 0; c < 3; c++) U.uSlope.value[c] = sim.slope[c];
    U.uDisp.value[0] = sim.displacement[1]; // 白浪看 85 公尺和 12 公尺兩層（最大那層的白浪是一大片，像污漬）
    U.uDisp.value[1] = sim.displacement[2];
  };
  sync();
  // 波浪動得慢，模擬一秒算 30 次就夠（原本每幀都算）；畫面還是每幀畫
  const STEP = 1 / 30;
  let acc = STEP;
  return {
    sim, uniforms: U,
    update(dt) {
      tick(dt);
      acc += Math.min(dt, 0.25);
      if (acc < STEP) return;
      sim.update(Math.min(acc, 0.25));
      acc = 0;
      renderer.setRenderTarget(null); // 模擬最後畫在自己的 render target 上，切回螢幕
      sync();
    },
    setSky,
  };
}
