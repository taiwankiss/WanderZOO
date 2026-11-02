import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { seaMaterial, seaGeometry, setShore, OCEAN_ON, FACETS, SHORE_ON } from './ocean.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, mat, ribbon, curveOf } from './util.js';
import { FACILITIES } from './icons.js';

// 展場地面只比草地高一點點，動物就站在上面
export const FLOOR = 0.04;

// 園區平地的範圍（橢圓），外面慢慢長成山丘
export const PARK = { x: -48, z: -165, rx: 212, rz: 246 }; // 涵蓋整個園區（依官方平面圖）
const parkR = (x, z) => Math.hypot((x - PARK.x) / PARK.rx, (z - PARK.z) / PARK.rz);

const GEO = {
  rock: new THREE.DodecahedronGeometry(1, 0),
  ico: new THREE.IcosahedronGeometry(1, 0),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 7),
  box: new THREE.BoxGeometry(1, 1, 1),
  disc: new THREE.CircleGeometry(1, 40),
  sph: new THREE.SphereGeometry(1, 10, 7),
  roof: new THREE.ConeGeometry(1, 1, 4),
  cone: new THREE.ConeGeometry(1, 1, 7),
  // 三角柱：長軸沿 x、尖端朝上，當作人字形屋頂
  prism: new THREE.CylinderGeometry(1, 1, 1, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2),
  hit: new THREE.CylinderGeometry(1, 1, 1, 24),
};

const COLOR = {
  wood: '#8a6a4a', woodLight: '#b08a5f', roof: '#d9774b', rock: '#9d978a',
  // 樹葉：多數是綠（深綠、黃綠、亮綠），點綴橘黃、橘紅
  leaf: ['#6fa65a', '#5f9a52', '#7db46c', '#8cbf6a', '#a9cf4f', '#b9d65a', '#7fd45e', '#5cc26a', '#94c84a', '#f0b43c', '#e8953a', '#e2703a'], cream: '#f4ecdb', grass: '#b8d891',
};

const RAIN_LEAF = ['#2f6f3a', '#3f7f3c', '#4f8a46', '#2e7d4f', '#5a9a4a', '#3d8f5f', '#6fa65a'];

// 每個展場的主題：地面顏色、邊界以石頭或灌木為主、邊界種闊葉樹或松樹
const THEMES = {
  mudforest: { top: '#93744a', rim: 'rock', rimColor: '#7d6f5c' },
  meadow: { top: '#b4d870', rim: 'bush', rimColor: '#7fb35a' },
  forestfloor: { top: '#7c6948', rim: 'rock', rimColor: '#80786a' },
  cliff: { top: '#cfc6a6', rim: 'rock', rimColor: '#b9b098' },
  mountain: { top: '#a9b39a', rim: 'rock', rimColor: '#a19e90', pine: true },
  river: { top: '#9ed38c', rim: 'rock', rimColor: '#aba597' },
  forest: { top: '#78a852', rim: 'bush', rimColor: '#4f8a46' },
  bamboo: { top: '#b0cf6c', rim: 'bush', rimColor: '#8fbb4c' },
  jungle: { top: '#5f9a48', rim: 'bush', rimColor: '#3f7f3c' },
  pasture: { top: '#bfdc7a', rim: 'bush', rimColor: '#86b85a' },
  paddock: { top: '#dcc79c', rim: 'bush', rimColor: '#8fbf5e' },
  farmyard: { top: '#cbe48c', rim: 'bush', rimColor: '#7fb35a' },
  pigpen: { top: '#a88b5e', rim: 'bush', rimColor: '#7fa94f' },
  canopy: { top: '#7fae5a', rim: 'bush', rimColor: '#3f7f3c' },
  woodland: { top: '#9bb36a', rim: 'bush', rimColor: '#5f9a48' },
  desert: { top: '#e2c98f', rim: 'rock', rimColor: '#c8b48a' },
  lagoon: { top: '#d9cfa6', rim: 'rock', rimColor: '#b5ad98' },
  island: { top: '#7cc4d8', rim: 'rock', rimColor: '#9d978a' }, // 長臂猿島：地面是水，島在中間
  // 熱帶雨林區
  riverbank: { top: '#c2a576', rim: 'rock', rimColor: '#9a8a6e' },
  swamp: { top: '#86a85e', rim: 'bush', rimColor: '#3f7f3c' },
  rainfloor: { top: '#6f9a4a', rim: 'bush', rimColor: '#2f6f3a' },
  // 非洲草原、澳洲紅土
  savanna: { top: '#d6c27c', rim: 'bush', rimColor: '#9aa65a' },
  outback: { top: '#d9a66a', rim: 'rock', rimColor: '#b98a5a' },
  // 極地冰層
  ice: { top: '#e8f2f6', rim: 'rock', rimColor: '#e2eef4', otherColor: '#f4f9fc' },
  // 蟲蟲探索谷：花草園
  garden: { top: '#b8d880', rim: 'bush', rimColor: '#7fb35a' },
};

const waterMat = new THREE.MeshStandardMaterial({ color: '#6fc2dc', roughness: 0.15, metalness: 0.05, emissive: '#2b7f99', emissiveIntensity: 0.18 });
const mudMat = new THREE.MeshStandardMaterial({ color: '#6f5039', roughness: 0.5, flatShading: true });
// 平放的水池、泥池：展場地面（polygonOffset -3）只比它低幾公分，斜看時兩層搶著畫會閃爍，水面要偏移得比展場地面更多
const ON_TOP = { polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 };
const poolMat = waterMat.clone(); Object.assign(poolMat, ON_TOP);
const mudPoolMat = mudMat.clone(); Object.assign(mudPoolMat, ON_TOP);
const mistMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.3, depthWrite: false });
const riverMat = new THREE.MeshStandardMaterial({ color: '#6fc2dc', roughness: 0.15, metalness: 0.05, emissive: '#2b7f99', emissiveIntensity: 0.18, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
const fallMat = new THREE.MeshStandardMaterial({ color: '#bfe8f4', roughness: 0.2, emissive: '#7fd0e8', emissiveIntensity: 0.35, transparent: true, opacity: 0.85 });
const hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
// 非洲營地：營火、煤油燈自己發光；越野車窗戶
const fireMat = new THREE.MeshStandardMaterial({ color: '#ff8a2a', emissive: '#ff6a00', emissiveIntensity: 1.2, roughness: 1 });
const fireMat2 = new THREE.MeshStandardMaterial({ color: '#ffd04a', emissive: '#ffb000', emissiveIntensity: 1.4, roughness: 1 });
const lanternMat = new THREE.MeshStandardMaterial({ color: '#ffe2a0', emissive: '#ffb84a', emissiveIntensity: 1.0, roughness: 0.6 });
const windowMatShared = new THREE.MeshStandardMaterial({ color: '#9fb2d6', roughness: 0.35 });
const tintMat = () => new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.95 });

// 建築用的柔和材質（不做平面著色，看起來比較像黏土模型）
const softMat = (color) => mat(color, { flatShading: false, roughness: 0.8, emissive: color, emissiveIntensity: 0.28 }); // 微微自發光，白色才不會被暖色陽光染黃

function mesh(geo, color, o = {}) {
  const m = new THREE.Mesh(geo, o.material || mat(color));
  m.position.set(o.x || 0, o.y || 0, o.z || 0);
  m.scale.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  m.castShadow = o.shadow !== false;
  m.receiveShadow = true;
  return m;
}

// 一批同形狀的小物件（石頭、灌木、柵欄）合成一個 InstancedMesh
function instanced(geo, items, material = tintMat()) {
  const inst = new THREE.InstancedMesh(geo, material, items.length);
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  items.forEach((it, i) => {
    d.position.set(...it.p);
    d.rotation.set(...(it.r || [0, 0, 0]));
    d.scale.set(...it.s);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
    if (it.c) inst.setColorAt(i, c.set(it.c));
  });
  inst.castShadow = inst.receiveShadow = true;
  return inst;
}

// 園區外圍的高山：貓空纜車的山頂站（指南宮站）蓋在這座山上
// 非洲動物區後方遠處一座頂端平平、積雪的高山（乞力馬扎羅山的遠景），flat：山頂比較平
const PEAKS = [{ x: 155, z: -590, r: 80, h: 46 }, { x: -150, z: -600, r: 95, h: 105, flat: true, snow: 0.72 }];
const peakShape = (p, x, z) => {
  const q = ((x - p.x) ** 2 + (z - p.z) ** 2) / (p.r * p.r);
  return p.h * Math.exp(-(p.flat ? q * q * 0.6 + q * 0.5 : q));
};
export function terrainHeight(x, z) {
  const r = parkR(x, z);
  if (ISL) return isleTerrain(x, z, r);
  if (r < 1) return 0;
  const n = Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.09) + 0.5 * Math.sin(x * 0.23 - z * 0.19);
  let peak = 0;
  for (const p of PEAKS) peak += peakShape(p, x, z);
  return Math.pow(r - 1, 1.2) * 42 * (0.75 + 0.25 * n) + peak * Math.min(1, (r - 1) / 0.15); // 園區邊緣慢慢長出來，不會突然一階
}

// 地形高低：每個園區是一塊平台（資料裡的 level），從入口往園區深處越來越高，園區之間的步道是緩坡，
// 看高度也能分出是哪一區。用每區輪廓的距離做加權平均（在園區裡面距離是 0，權重最大，所以是平的），
// 入口廣場一帶是 0。整個園區先算成 3 公尺一格的高度表，查的時候做雙線性內插
const LV = { x0: -300, z0: -450, cell: 3, nx: 0, nz: 0, h: null };
function setupLevels(data) {
  const areas = data.zones.filter((z) => z.outline).map((z) => ({ poly: z.outline, h: z.level || 0 }));
  const P = data.layout.plaza;
  if (P) areas.push({ circle: [P.x, P.z, P.r + 14], h: 0 });
  const segDist = (x, z, [ax, az], [bx, bz]) => {
    const dx = bx - ax, dz = bz - az, k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - ax - dx * k, z - az - dz * k);
  };
  const outside = (x, z, a) => {
    if (a.circle) return Math.max(0, Math.hypot(x - a.circle[0], z - a.circle[1]) - a.circle[2]);
    let inside = false, d = Infinity;
    for (let i = 0, j = a.poly.length - 1; i < a.poly.length; j = i++) {
      const [xi, zi] = a.poly[i], [xj, zj] = a.poly[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      d = Math.min(d, segDist(x, z, a.poly[i], a.poly[j]));
    }
    return inside ? 0 : d;
  };
  const field = (x, z) => {
    let sw = 0, sh = 0;
    for (const a of areas) { const w = 1 / (outside(x, z, a) + 2) ** 6; sw += w; sh += w * a.h; }
    return sh / sw;
  };
  // 每個展場自己也是一塊平台（高度取展場中心），剛好落在兩區之間坡上的展場（長臂猿島）地面才不會一邊陷下去
  for (const { enclosure: e } of data.animals) areas.push({ circle: [e.x, e.z, Math.max(e.rx, e.rz) * 1.3], h: field(e.x, e.z) });
  LV.nx = Math.ceil(520 / LV.cell) + 1; LV.nz = Math.ceil(600 / LV.cell) + 1;
  LV.h = new Float32Array(LV.nx * LV.nz);
  for (let j = 0; j < LV.nz; j++) for (let i = 0; i < LV.nx; i++) LV.h[j * LV.nx + i] = field(LV.x0 + i * LV.cell, LV.z0 + j * LV.cell);
  // 建築、服務小屋、大型造景、拱門底下整出一塊平地（高度取中心），蓋在坡上的才不會一邊陷進地面
  const L = data.layout;
  LV.pads = [];
  const pad = (x, z, r) => LV.pads.push({ x, z, r, h: levelAt(x, z) + terrainHeight(x, z) });
  for (const b of L.buildings || []) pad(b.x, b.z, Math.hypot(b.w || 4, b.d || 4) / 2 + 2);
  for (const h of L.houses || []) pad(h.x, h.z, 3.5);
  for (const g of L.gates || []) pad(g.x, g.z, (g.w || 2.2) + 1.5);
  for (const d of L.decor || []) pad(d.x, d.z, (d.r || 1.5) + 1);
  if (L.plaza) pad(L.plaza.x, L.plaza.z, L.plaza.r + 1);
}
function levelAt(x, z) {
  if (!LV.h) return 0;
  const fx = Math.max(0, Math.min(LV.nx - 1.001, (x - LV.x0) / LV.cell)), fz = Math.max(0, Math.min(LV.nz - 1.001, (z - LV.z0) / LV.cell));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, H = LV.h, n = LV.nx;
  return (H[j * n + i] * (1 - u) + H[j * n + i + 1] * u) * (1 - v) + (H[(j + 1) * n + i] * (1 - u) + H[(j + 1) * n + i + 1] * u) * v;
}
// 島嶼版（網址加 ?islands，資料由 islands.js 改寫）：園區在海上一座座的島，島面都一樣高，海底和外圍山丘照地形
const ISLE_H = 1.4, SEA_FLOOR = -4;
let ISL = null;
function isleTerrain(x, z, r) {
  if (r < 1) return SEA_FLOOR;
  const n = Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.09) + 0.5 * Math.sin(x * 0.23 - z * 0.19);
  let peak = 0;
  for (const p of PEAKS) peak += peakShape(p, x, z);
  return SEA_FLOOR + Math.pow(r - 1, 1.2) * (ISL.tall ? 16 : 60) * (0.75 + 0.25 * n) + peak * Math.min(1, (r - 1) / 0.15);
}
function edgeDist(x, z, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i], dx = bx - ax, dz = bz - az;
    const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    d = Math.min(d, Math.hypot(x - ax - dx * k, z - az - dz * k));
  }
  return d;
}
// 在哪一座島上（inset：離岸邊至少這麼遠才算）
function islandAt(x, z, inset = 0) {
  if (!ISL) return null;
  for (const I of ISL.islands) {
    if (x < I.x0 || x > I.x1 || z < I.z0 || z > I.z1 || !inPolygon(x, z, I.poly)) continue;
    return !inset || edgeDist(x, z, I.poly) >= inset ? I : null;
  }
  return null;
}
const onBridge = (x, z) => !!bridgeAt(x, z);
function bridgeAt(x, z) {
  for (const b of ISL.bridges) {
    const [ax, az] = b.a, [bx, bz] = b.b, dx = bx - ax, dz = bz - az;
    const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(x - ax - dx * k, z - az - dz * k) < b.width / 2 + 0.7) return { b, k };
  }
  return null;
}
// 浮空島（第二版）：橋在兩座島的岸邊之間（k0～k1）由一邊的高度斜到另一邊
function floatY(x, z) {
  const I = islandAt(x, z);
  if (I) return ISLE_H + I.h + (I.hill ? hillAt(I.hill, x, z) : 0);
  const hit = bridgeAt(x, z);
  if (hit) {
    const { b, k } = hit, u = Math.max(0, Math.min(1, (k - b.k0) / (b.k1 - b.k0 || 1)));
    return ISLE_H + b.ha + (b.hb - b.ha) * u;
  }
  if (ISL.tall) return terrainHeight(x, z); // 第三版：海底和外圍的岸
  // 不在島上也不在橋上（推薦路線跨過空中的那一段）：取最近那座島的高度
  let best = ISL.islands[0], bd = Infinity;
  for (const J of ISL.islands) { const d = Math.hypot(x - J.cx, z - J.cz) - J.rad; if (d < bd) { bd = d; best = J; } }
  return ISLE_H + best.h;
}
// 第三版非洲島中央的小山丘：餘弦形的隆起，邊緣接回平的島面
const hillAt = (H, x, z) => { const d = Math.hypot(x - H.x, z - H.z); return d < H.r ? H.h * 0.5 * (1 + Math.cos((Math.PI * d) / H.r)) : 0; };
function setupIslands(data) {
  const A = data.archipelago;
  // 海的範圍：所有島外圍再留 75 公尺，再外面是山
  Object.assign(PARK, { x: (A.x0 + A.x1) / 2, z: (A.z0 + A.z1) / 2, rx: (A.x1 - A.x0) / 2 + 75, rz: (A.z1 - A.z0) / 2 + 75 });
  ISL = {
    islands: data.islands.map((I) => {
      const xs = I.poly.map((q) => q[0]), zs = I.poly.map((q) => q[1]);
      return { ...I, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    }),
    bridges: data.bridges,
    viaducts: data.viaducts || [],
    float: !!data.floating,
    tall: !!data.tall,
  };
  for (const I of ISL.islands) I.rad = Math.max(...I.poly.map(([x, z]) => Math.hypot(x - I.cx, z - I.cz)));
  if (ISL.tall) {
    // 第三版的海比較大，原本的雪山有一半泡在海裡（雪會畫在山腳）。改成海外圍一圈高矮不一的山，
    // 纜車山頂那座照舊（山頂站在 [155, -584]）。[角度（-π/2 是北邊）, 離中心幾倍, 高, 半徑, 雪線, 平頂]
    const keep = PEAKS[0];
    PEAKS.length = 0;
    PEAKS.push(keep);
    for (const [a, k, h, r, snow, flat] of [
      [-Math.PI / 2 - 0.45, 1.3, 110, 90, 0.68, true], [-Math.PI / 2 - 0.05, 1.42, 80, 70, 0.78], [-Math.PI / 2 + 0.6, 1.3, 64, 62, 0.8],
      [-Math.PI / 2 - 1.05, 1.28, 52, 58], [-Math.PI + 0.1, 1.3, 36, 50], [-0.3, 1.3, 44, 55],
    ]) {
      const x = Math.max(PARK.x - 450, Math.min(PARK.x + 450, PARK.x + Math.cos(a) * PARK.rx * k)), z = Math.max(PARK.z - 510, Math.min(PARK.z + 510, PARK.z + Math.sin(a) * PARK.rz * k));
      PEAKS.push({ x, z, r, h, snow, flat });
    }
  }
  // 非洲島中央的小山丘：只隆起在展場之間的空地上（半徑量到最近展場外圈再留 2 公尺），不蓋到展場；山小一點高度也跟著降
  // 第三版：臺灣動物區對岸（離臺灣島最近的那個岸角）是一片海灘
  if (ISL.tall) {
    const T = ISL.islands.find((I) => I.zone?.id === 'taiwan');
    let best = null;
    if (T) for (let a = 0; a < 360; a += 3) for (let r = 10; r < 400; r += 2) {
      const x = T.cx + Math.cos((a * Math.PI) / 180) * r, z = T.cz + Math.sin((a * Math.PI) / 180) * r;
      if (terrainHeight(x, z) > 0.3) { if (!best || r < best.r) best = { r, x, z }; break; }
    }
    if (best) ISL.beach = { x: best.x, z: best.z, r: 70 };
  }
  if (ISL.tall) for (const I of ISL.islands) if (I.zone?.id === 'africa' && !I.flora) {
    const room = Math.min(...data.animals.map(({ enclosure: e }) => Math.hypot(e.x - I.cx, e.z - I.cz) - Math.max(e.rx, e.rz) * 1.25 - 2));
    const r = Math.min(I.rad * 0.5, room);
    if (r > 6) I.hill = { x: I.cx, z: I.cz, r, h: Math.min(4.5, r * 0.22) };
  }
  if (ISL.float || ISL.tall) for (const b of ISL.bridges) {
    // 橋在水面（空中）的那一段：從 a 走出島岸的位置 k0 到走上另一座島的位置 k1
    let k0 = 0, k1 = 1;
    const at = (k) => !!islandAt(b.a[0] + (b.b[0] - b.a[0]) * k, b.a[1] + (b.b[1] - b.a[1]) * k);
    while (k0 < 1 && at(k0)) k0 += 0.01;
    while (k1 > k0 && at(k1)) k1 -= 0.01;
    Object.assign(b, { k0, k1 });
  }
  // 不在島上的建築（山上的指南宮站）底下整出一塊平地
  LV.pads = [];
  for (const b of data.layout.buildings || []) if (!islandAt(b.x, b.z)) LV.pads.push({ x: b.x, z: b.z, r: Math.hypot(b.w || 4, b.d || 4) / 2 + 2, h: terrainHeight(b.x, b.z) });
}

// 地面高度：園區平台＋外圍山丘。展場、步道、建築、動物、遊客都站在這個高度上
const PAD_EDGE = 5; // 平地外圍用 5 公尺慢慢接回原本的坡
export function groundY(x, z) {
  if (ISL?.float || ISL?.tall) return floatY(x, z);
  let y = ISL ? (islandAt(x, z) || onBridge(x, z) ? ISLE_H : terrainHeight(x, z)) : levelAt(x, z) + terrainHeight(x, z);
  for (const p of LV.pads || []) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d > p.r + PAD_EDGE) continue;
    const k = d < p.r ? 1 : 1 - (d - p.r) / PAD_EDGE;
    y += (p.h - y) * k * k * (3 - 2 * k);
  }
  return y;
}

// 平鋪在地上的幾何（步道、園區底色、河流）：每個頂點往上抬到地面高度
function drape(m) {
  const pos = m.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + m.position.x, z = pos.getZ(i) + m.position.z;
    // 地形網格約 3 公尺一格，坡上會比實際高度高一點：越陡墊得越高，步道才不會被地面蓋住
    const slope = ISL ? 0 : Math.abs(groundY(x + 1.7, z) - groundY(x - 1.7, z)) + Math.abs(groundY(x, z + 1.7) - groundY(x, z - 1.7));
    pos.setY(i, pos.getY(i) + groundY(x, z) + Math.min(0.8, slope * 0.35));
  }
  pos.needsUpdate = true;
  m.geometry.computeVertexNormals();
  m.geometry.computeBoundingSphere();
}
// 世界座標的一批 InstancedMesh（樹、灌木、河岸石頭）：每一個各自抬到所在位置的地面高度
function liftInstances(m) {
  const mx = new THREE.Matrix4();
  for (let i = 0; i < m.count; i++) {
    m.getMatrixAt(i, mx);
    const x = mx.elements[12], z = mx.elements[14];
    const slope = ISL ? 0 : Math.abs(groundY(x + 1.7, z) - groundY(x - 1.7, z)) + Math.abs(groundY(x, z + 1.7) - groundY(x, z - 1.7));
    mx.elements[13] += groundY(x, z) + Math.min(0.5, slope * 0.25); // 坡上墊高一點，跟地形網格對齊
    m.setMatrixAt(i, mx);
  }
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere();
}

// 園區範圍：每區一塊淡淡的主題色（顏色和官方地圖一樣），直接畫在地形頂點上，地形有高低也永遠貼著地面
function zoneTints(zones) {
  return zones.filter((z) => z.outline).map((z) => {
    const poly = new THREE.CatmullRomCurve3(z.outline.map(([x, zz]) => new THREE.Vector3(x, 0, zz)), true, 'centripetal').getPoints(90).map((v) => [v.x, v.z]);
    const xs = poly.map((q) => q[0]), zs = poly.map((q) => q[1]);
    // 極地是雪地、草原是金黃色的乾草地，其他園區是主題色混一點草綠
    const color = z.flora === 'polar' ? new THREE.Color('#e9f2f6') : z.flora === 'savanna' ? new THREE.Color('#d8c27a') : new THREE.Color(z.color).lerp(new THREE.Color(COLOR.grass), 0.72);
    return { poly, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), color };
  });
}
function inPolygon(x, z, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function makeTerrain(zones) {
  const tints = zoneTints(zones);
  const g = new THREE.PlaneGeometry(1000, 1120, 300, 336);
  g.rotateX(-Math.PI / 2);
  g.translate(PARK.x, 0, PARK.z);
  const pos = g.attributes.position;
  const col = [];
  const c = new THREE.Color();
  const flat = new THREE.Color(COLOR.grass), hill = new THREE.Color('#86b467'), high = new THREE.Color('#5d8d50'), bank = new THREE.Color('#7a9f58');
  const sand = new THREE.Color('#eadcb6');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    if (ISL) {
      // 海底和外圍山丘：水邊一圈沙灘，往上是草坡、深綠的山
      pos.setY(i, h);
      const onBeach = ISL.beach && h < 4.5 && Math.hypot(x - ISL.beach.x, z - ISL.beach.z) < ISL.beach.r * (0.9 + 0.1 * Math.sin(x * 0.2 + z * 0.13));
      if (h < 1.2 || onBeach) c.copy(sand); else if (ISL.tall) c.set('#bcd59c').lerp(new THREE.Color('#9cc184'), Math.min(1, (h - 1.2) / 14)); // 第三版：淡綠色的平緩岸地
      else c.copy(hill).lerp(high, Math.min(1, (h - 1.2) / 40));
      // 雪只畫在真的夠高的地方（山腳被海切掉的部分不會變白）
      for (const p of PEAKS) if (p.snow && peakShape(p, x, z) > p.h * p.snow && h > p.h * p.snow) c.set(peakShape(p, x, z) > p.h * 0.85 ? '#ffffff' : '#e8f0f4');
      c.offsetHSL(0, 0, (Math.sin(x * 1.7 + z * 0.9) * 0.5 + 0.5) * 0.04 - 0.02);
      col.push(c.r, c.g, c.b);
      continue;
    }
    pos.setY(i, groundY(x, z));
    if (h < 0.01) c.copy(flat); else c.copy(hill).lerp(high, Math.min(1, h / 40));
    // 園區平台之間的坡面染深一點，看得出每一區的邊界
    const slope = Math.hypot(levelAt(x + 1, z) - levelAt(x - 1, z), levelAt(x, z + 1) - levelAt(x, z - 1)) / 2;
    // 雪山：高過山的某個比例就是白雪
    for (const p of PEAKS) if (p.snow && parkR(x, z) > 1.2 && peakShape(p, x, z) > p.h * p.snow) c.set(p.snow && peakShape(p, x, z) > p.h * 0.85 ? '#ffffff' : '#e8f0f4');
    const tint = tints.find((t) => x > t.x0 && x < t.x1 && z > t.z0 && z < t.z1 && inPolygon(x, z, t.poly));
    if (h < 0.01) c.lerp(bank, Math.min(1, slope * 2.5));
    if (tint) c.copy(tint.color).lerp(bank, tint.color.getHSL({}).l > 0.85 ? 0 : Math.min(0.6, slope * 1.5)); // 雪地不染綠
    c.offsetHSL(0, 0, (Math.sin(x * 1.7 + z * 0.9) * 0.5 + 0.5) * 0.04 - 0.02);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  m.receiveShadow = true;
  return m;
}

function forest(spots, R) {
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.18, 1, 6).translate(0, 0.5, 0);
  const pineGeo = new THREE.ConeGeometry(1, 2.4, 7).translate(0, 1.2, 0);
  const white = tintMat();
  const rounds = spots.filter((s) => !s.pine), pines = spots.filter((s) => s.pine);
  const trunks = new THREE.InstancedMesh(trunkGeo, mat(COLOR.wood), spots.length);
  const crowns = new THREE.InstancedMesh(GEO.ico, white, rounds.length);
  const cones = new THREE.InstancedMesh(pineGeo, white, pines.length);
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  spots.forEach((s, i) => {
    d.position.set(s.x, s.y, s.z); d.rotation.set(0, R() * 6, 0); d.scale.set(s.s, s.s * (s.pine ? 0.8 : 1.3), s.s); d.updateMatrix();
    trunks.setMatrixAt(i, d.matrix);
  });
  rounds.forEach((s, i) => {
    d.position.set(s.x, s.y + s.s * 1.75, s.z); d.rotation.set(R(), R() * 6, 0);
    d.scale.set(s.s * 1.05, s.s * 1.15, s.s * 1.05); d.updateMatrix();
    crowns.setMatrixAt(i, d.matrix);
    crowns.setColorAt(i, c.set(s.c || COLOR.leaf[Math.floor(R() * COLOR.leaf.length)]));
  });
  pines.forEach((s, i) => {
    d.position.set(s.x, s.y + s.s * 0.55, s.z); d.rotation.set(0, R() * 6, 0);
    d.scale.set(s.s * 0.85, s.s, s.s * 0.85); d.updateMatrix();
    cones.setMatrixAt(i, d.matrix);
    cones.setColorAt(i, c.set(R() < 0.5 ? '#4f8a52' : '#5c9658'));
  });
  const g = new THREE.Group();
  for (const m of [trunks, crowns, cones]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}

// 展場輪廓：用幾個正弦波把橢圓揉成不規則的形狀，看起來不像一顆顆圓島
function outlineOf(e, R) {
  const ph = [R() * 6.28, R() * 6.28, R() * 6.28];
  const f = (a) => 1 + 0.1 * Math.sin(2 * a + ph[0]) + 0.07 * Math.sin(3 * a + ph[1]) + 0.04 * Math.sin(5 * a + ph[2]);
  const per = Math.PI * 2 * Math.sqrt((e.rx * e.rx + e.rz * e.rz) / 2);
  return (step, k = 1) => {
    const n = Math.max(12, Math.ceil(per / step));
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const r = f(a) * k;
      return [Math.cos(a) * e.rx * r, Math.sin(a) * e.rz * r];
    });
  };
}

function patch(points, material, y) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), material);
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

// 展場邊界：面向步道的一側只放矮石頭、矮灌木，讓遊客看得到；
// 背面和鄰居相接的一側種高灌木和樹，用植物把展場隔開
const OPEN = 3.4; // 離步道這個距離以內算「面向遊客」的一側
const WALL = OPEN + 2.2; // 石牆沿著整個面向步道的那一側，範圍比矮植物寬
function border(e, outline, theme, R, near, trees) {
  const rocks = [], bushes = [], posts = [], rails = [], walls = [];
  const wx = (x) => e.x + x, wz = (z) => e.z + z;
  const add = (kind, x, z, s) => {
    const rock = kind === 'rock';
    (rock ? rocks : bushes).push({
      p: [x, s * (rock ? 0.25 : 0.35), z], r: [R(), R() * 6, R()], s: [s, s * (rock ? 0.65 : 0.85), s],
      c: new THREE.Color(rock ? (theme.rim === 'rock' ? theme.rimColor : COLOR.rock) : (theme.rim === 'bush' ? theme.rimColor : theme.otherColor || '#6c9f52')).offsetHSL(0, 0, (R() - 0.5) * 0.08).getStyle(),
    });
  };
  const other = theme.rim === 'rock' ? 'bush' : 'rock';
  const k = e.barrier === 'fence' ? 1.1 : 1; // 有柵欄時植物種在柵欄外
  const size = Math.min(1, (e.rx + e.rz) / 11); // 小展場（兔子）的邊界植物也跟著小
  for (const [x, z] of outline(0.85, k)) {
    if (near(wx(x), wz(z), 0.5)) continue;
    if (e.barrier === 'wall' && near(wx(x), wz(z), WALL)) continue;
    if (near(wx(x), wz(z), OPEN)) {
      if (R() < 0.35) continue;
      add(R() < 0.8 ? theme.rim : other, x, z, 0.28 + R() * 0.2);
    } else {
      add(R() < 0.75 ? theme.rim : other, x, z, (0.55 + R() * 0.45) * size);
      const tx = x * 1.1, tz = z * 1.1;
      if (R() < 0.4 * size && !near(wx(tx), wz(tz), 1.6)) trees.push({ x: wx(tx), z: wz(tz), y: 0, s: 0.8 + R() * 0.5, pine: !!theme.pine && R() < 0.7 });
    }
  }

  // 大型展場才有柵欄或石牆
  if (e.barrier) {
    const pts = outline(1.3);
    pts.forEach(([ax, az], i) => {
      const [bx, bz] = pts[(i + 1) % pts.length];
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (near(wx(mx), wz(mz), 0.6)) return; // 支線步道走到展場邊，留一個觀景口
      const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax);
      if (e.barrier === 'fence') {
        posts.push({ p: [ax, 0.5, az], s: [0.08, 1, 0.08] });
        for (const y of [0.45, 0.85]) rails.push({ p: [mx, y, mz], r: [0, ry, 0], s: [len + 0.06, 0.08, 0.06] });
      } else if (near(wx(mx), wz(mz), WALL)) {
        walls.push({ p: [mx, 0.42, mz], r: [0, ry, 0], s: [len + 0.12, 0.84, 0.45], c: new THREE.Color('#aca490').offsetHSL(0, 0, (R() - 0.5) * 0.06).getStyle() });
      }
    });
  }

  const g = new THREE.Group();
  if (rocks.length) g.add(instanced(GEO.rock, rocks));
  if (bushes.length) g.add(instanced(GEO.ico, bushes));
  if (posts.length) g.add(instanced(GEO.cyl, posts, mat(COLOR.wood)));
  if (rails.length) g.add(instanced(GEO.box, rails, mat(COLOR.woodLight)));
  if (walls.length) g.add(instanced(GEO.box, walls));
  return g;
}

function tree(s, R, tall) {
  const g = new THREE.Group();
  const h = tall ? 2.4 : 1.3;
  g.add(mesh(GEO.cyl, COLOR.wood, { y: (h / 2) * s, sx: 0.16 * s, sy: h * s, sz: 0.16 * s }));
  g.add(mesh(GEO.ico, COLOR.leaf[Math.floor(R() * COLOR.leaf.length)], { y: (h + 0.6) * s, sx: 1.1 * s, sy: 1.2 * s, sz: 1.1 * s, ry: R() * 6 }));
  if (tall) g.add(mesh(GEO.ico, '#4f8a46', { x: 0.5 * s, y: (h - 0.3) * s, sx: 0.8 * s, sy: 0.7 * s, sz: 0.8 * s, ry: R() * 6 }));
  return g;
}

function pond(p, R, material) {
  const g = new THREE.Group();
  const [w, h] = p.size;
  if (p.ice) return icePool(p, R);
  g.add(mesh(GEO.disc, null, { material, rx: -Math.PI / 2, sx: w, sy: h, y: 0.03, shadow: false }));
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.3;
    const s = 0.28 + R() * 0.22;
    g.add(mesh(GEO.rock, COLOR.rock, { x: Math.cos(a) * (w + 0.1), z: Math.sin(a) * (h + 0.1), sx: s, sy: s * 0.6, sz: s, ry: R() * 6 }));
  }
  return g;
}

// 尤加利樹（方塊堆疊）：淺色斑駁的樹幹、往上斜伸的細枝、一串串灰綠色的細長葉子往下垂
// 有 to 的話多一根水平樹枝（頂面高度 h），無尾熊可以爬上去趴著
const GUM_BARK = ['#ece6d8', '#ddd6c6', '#cbc4b4', '#e4ddcd'];
const GUM_PATCH = ['#b8a88c', '#a9b2a2', '#c6b393', '#9fa596'];
const GUM_LEAF = ['#8fa898', '#7d9888', '#a2b6a4', '#6f8a7c', '#98ad8e'];
function gumTree(p, R) {
  const g = new THREE.Group();
  const s = p.to ? 1 : p.s || 1;
  const top = p.to ? (p.h || 3) + 3 : 6 * s;
  // 樹幹：一節一節的方塊，往上慢慢變細，表面貼幾塊剝落的樹皮
  const seg = 0.5, n = Math.ceil(top / seg);
  for (let k = 0; k < n; k++) {
    const t = k / n, w = (0.46 - 0.18 * t) * Math.max(s, 0.8), y = k * seg + seg / 2;
    g.add(mesh(GEO.box, GUM_BARK[k % GUM_BARK.length], { x: (R() - 0.5) * 0.04, y, sx: w, sy: seg + 0.01, sz: w, ry: (R() - 0.5) * 0.2 }));
    if (R() < 0.55) {
      const a = Math.floor(R() * 4) * (Math.PI / 2);
      g.add(mesh(GEO.box, GUM_PATCH[Math.floor(R() * GUM_PATCH.length)], { x: Math.cos(a) * w * 0.5, z: Math.sin(a) * w * 0.5, y, sx: 0.2, sy: seg * 0.7, sz: 0.2, ry: a, shadow: false }));
    }
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.3;
    g.add(mesh(GEO.box, GUM_BARK[2], { x: Math.cos(a) * 0.3, z: Math.sin(a) * 0.3, y: 0.15, sx: 0.32, sy: 0.3, sz: 0.2, ry: -a }));
  }
  // 細枝與樹冠：幾團扁平的葉叢，每團底下垂著細長的葉片
  const clusters = [[0, top + 0.3, 0, 1.5]];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + R(), y = top - 0.6 - k * 0.7 * s, r = (1.1 + R() * 0.4) * s;
    const len = r / Math.cos(0.7);
    g.add(mesh(GEO.box, GUM_BARK[1], { x: (Math.cos(a) * r) / 2, z: (-Math.sin(a) * r) / 2, y: y - 0.4, sx: 0.12, sy: len, sz: 0.12, ry: a, rz: -0.7 }));
    clusters.push([Math.cos(a) * r, y + 0.1, -Math.sin(a) * r, 1.1 * s]);
  }
  for (const [x, y, z, c] of clusters) {
    g.add(mesh(GEO.box, GUM_LEAF[Math.floor(R() * GUM_LEAF.length)], { x, y, z, sx: c * (0.9 + R() * 0.3), sy: 0.42, sz: c * (0.9 + R() * 0.3), ry: R() * 1.5 }));
    g.add(mesh(GEO.box, GUM_LEAF[Math.floor(R() * GUM_LEAF.length)], { x: x + 0.2, y: y + 0.32, z: z - 0.1, sx: c * 0.6, sy: 0.3, sz: c * 0.6, ry: R() * 1.5 }));
    for (let k = 0; k < 5; k++) {
      const a = R() * Math.PI * 2, r = c * (0.25 + R() * 0.25), lh = 0.45 + R() * 0.4;
      g.add(mesh(GEO.box, GUM_LEAF[Math.floor(R() * GUM_LEAF.length)], { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, y: y - 0.2 - lh / 2, sx: 0.07, sy: lh, sz: 0.16, ry: a, shadow: false }));
    }
  }
  if (p.to) {
    const h = p.h || 3, [ex, ez] = p.to, len = Math.hypot(ex, ez);
    const limb = new THREE.Group();
    limb.position.y = h - 0.16;
    limb.rotation.y = Math.atan2(-ez, ex);
    limb.add(mesh(GEO.box, GUM_BARK[1], { x: len / 2, sx: len + 0.2, sy: 0.3, sz: 0.3 }));
    limb.add(mesh(GEO.box, GUM_PATCH[0], { x: len * 0.3, y: 0.16, sx: 0.5, sy: 0.04, sz: 0.24, shadow: false }));
    limb.add(mesh(GEO.box, GUM_BARK[2], { x: len * 0.7, y: 0.5, z: 0.25, sx: 0.1, sy: 1.1, sz: 0.1, rz: -0.5, rx: 0.3 }));
    limb.add(mesh(GEO.box, GUM_LEAF[1], { x: len + 0.3, y: 0.55, sx: 1.1, sy: 0.38, sz: 1, ry: R() }));
    limb.add(mesh(GEO.box, GUM_LEAF[2], { x: len * 0.75, y: 1.05, z: 0.4, sx: 0.8, sy: 0.32, sz: 0.8, ry: R() }));
    g.add(limb);
  }
  return g;
}

// ---- 極地冰層（參考 Reference 的極地動物區）：白色、淡藍的方塊冰層，藍綠色的水 ----
const ICE = ['#f4f9fc', '#e4f1f7', '#d2e8f2', '#c2e0ee'];
const iceWater = new THREE.MeshStandardMaterial({ color: '#4fc0d6', roughness: 0.1, metalness: 0.05, emissive: '#1f8fa8', emissiveIntensity: 0.2, ...ON_TOP });
// 冰水池：藍綠色的水，岸邊一圈方方的冰塊，水上漂幾塊浮冰
function icePool(p, R) {
  const g = new THREE.Group(), [w, h] = p.size;
  g.add(mesh(GEO.disc, null, { material: iceWater, rx: -Math.PI / 2, sx: w, sy: h, y: 0.03, shadow: false }));
  const n = Math.round((w + h) * 2.2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, s = 0.45 + R() * 0.4;
    g.add(mesh(GEO.box, null, { material: softMat(ICE[Math.floor(R() * 3)]), x: Math.cos(a) * (w + 0.15), z: Math.sin(a) * (h + 0.15), y: s * 0.25, sx: s * 1.4, sy: s * 0.6, sz: s, ry: -a + (R() - 0.5) * 0.4 }));
  }
  for (let i = 0; i < 4; i++) {
    const a = R() * 6.28, r = 0.3 + R() * 0.45, s = 0.5 + R() * 0.6;
    g.add(mesh(GEO.box, null, { material: softMat(ICE[0]), x: Math.cos(a) * w * r, z: Math.sin(a) * h * r, y: 0.06, sx: s * 1.3, sy: 0.14, sz: s, ry: R() * 3 }));
  }
  return g;
}
function iceShelf(p, R) {
  // 一層層方塊冰台（tiers 和石堆一樣是［半徑, 高度］，動物可以一階一階跳上去），側面淡藍、頂面白，邊緣掛冰柱
  const g = new THREE.Group();
  p.tiers.forEach(([r, h], i) => {
    g.add(mesh(GEO.box, null, { material: softMat(ICE[2 + (i % 2)]), y: h / 2, sx: r * 1.75, sy: h, sz: r * 1.6, ry: i * 0.3 }));
    g.add(mesh(GEO.box, null, { material: softMat(ICE[0]), y: h + 0.06, sx: r * 1.8, sy: 0.14, sz: r * 1.65, ry: i * 0.3 }));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + i, s = 0.4 + R() * 0.4;
      g.add(mesh(GEO.box, null, { material: softMat(ICE[1]), x: Math.cos(a) * r * 0.95, z: Math.sin(a) * r * 0.9, y: h - s * 0.4, sx: s, sy: s * 1.2, sz: s, ry: R() * 3 }));
      g.add(mesh(GEO.box, null, { material: softMat(ICE[3]), x: Math.cos(a + 0.5) * r * 0.88, z: Math.sin(a + 0.5) * r * 0.8, y: h - 0.35, sx: 0.1, sy: 0.5, sz: 0.1, shadow: false })); // 冰柱
    }
  });
  return g;
}

// 展場裡的造景，座標相對於展場中心
const PROPS = {
  tree: (p, R) => tree(p.s || 1, R),
  tallTree: (p, R) => tree(p.s || 1, R, true),
  pine: (p) => {
    const s = p.s || 1;
    const g = new THREE.Group();
    g.add(mesh(GEO.cyl, COLOR.wood, { y: 0.4 * s, sx: 0.14 * s, sy: 0.8 * s, sz: 0.14 * s }));
    g.add(mesh(GEO.cone, '#4f8a52', { y: 1.6 * s, sx: 0.95 * s, sy: 2.2 * s, sz: 0.95 * s }));
    return g;
  },
  rock: (p, R) => {
    const s = p.s || 1;
    return mesh(GEO.rock, COLOR.rock, { y: 0.2 * s, sx: 0.8 * s, sy: 0.55 * s, sz: 0.7 * s, ry: R() * 6 });
  },
  pond: (p, R) => pond(p, R, poolMat),
  mud: (p, R) => pond(p, R, mudPoolMat),
  log: (p) => mesh(GEO.cyl, '#8b6748', { y: 0.24, sx: 0.26, sy: p.len || 2.2, sz: 0.26, rz: Math.PI / 2, ry: p.rot || 0 }),
  fern: (p, R) => {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + R();
      g.add(mesh(GEO.cone, i % 2 ? '#3f8a42' : '#5aa04c', { x: Math.cos(a) * 0.3, z: Math.sin(a) * 0.3, y: 0.3, sx: 0.18, sy: 0.7, sz: 0.4, rx: Math.sin(a) * 0.6, rz: -Math.cos(a) * 0.6 }));
    }
    return g;
  },
  grass: (p, R) => {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      g.add(mesh(GEO.cone, i % 2 ? '#8dbf4e' : '#a4cc5c', { x: (R() - 0.5) * 0.9, z: (R() - 0.5) * 0.9, y: 0.3, sx: 0.08, sy: 0.6 + R() * 0.3, sz: 0.08, rx: (R() - 0.5) * 0.5, rz: (R() - 0.5) * 0.5 }));
    }
    return g;
  },
  flowers: (p, R) => {
    const g = new THREE.Group();
    const cols = ['#f4d35e', '#f28f8f', '#ffffff', '#c792ea'];
    for (let i = 0; i < 7; i++) {
      const x = (R() - 0.5) * 1.4, z = (R() - 0.5) * 1.4;
      g.add(mesh(GEO.cyl, '#5f9a3a', { x, z, y: 0.15, sx: 0.02, sy: 0.3, sz: 0.02, shadow: false }));
      g.add(mesh(GEO.ico, cols[i % 4], { x, z, y: 0.32, sx: 0.09, sy: 0.07, sz: 0.09 }));
    }
    return g;
  },
  termite: (p) => {
    const s = p.s || 1;
    const g = new THREE.Group();
    g.add(mesh(GEO.cone, '#b0855a', { y: 0.7 * s, sx: 0.55 * s, sy: 1.4 * s, sz: 0.55 * s }));
    g.add(mesh(GEO.cone, '#a07650', { x: 0.35 * s, y: 0.4 * s, sx: 0.3 * s, sy: 0.8 * s, sz: 0.3 * s }));
    return g;
  },
  cliff: (p, R) => {
    const s = p.s || 1;
    const g = new THREE.Group();
    g.add(mesh(GEO.rock, '#b5ac94', { y: 0.7 * s, sx: 1.6 * s, sy: 1.1 * s, sz: 1.3 * s, ry: R() * 6 }));
    g.add(mesh(GEO.rock, '#a8a089', { x: -0.4 * s, y: 1.7 * s, sx: 1 * s, sy: 0.8 * s, sz: 0.9 * s, ry: R() * 6 }));
    g.add(mesh(GEO.rock, '#c2b99f', { x: 0.9 * s, z: 0.8 * s, y: 0.4 * s, sx: 0.8 * s, sy: 0.6 * s, sz: 0.7 * s, ry: R() * 6 }));
    return g;
  },
  mountain: (p, R) => {
    const s = p.s || 1;
    const g = new THREE.Group();
    g.add(mesh(GEO.rock, '#9d9a8c', { y: 0.9 * s, sx: 1.9 * s, sy: 1.6 * s, sz: 2 * s, ry: R() * 6 }));
    g.add(mesh(GEO.rock, '#8f8c80', { x: 0.3 * s, y: 2.3 * s, sx: 1.1 * s, sy: 1.1 * s, sz: 1.2 * s, ry: R() * 6 }));
    g.add(mesh(GEO.rock, '#aaa697', { x: -1.2 * s, z: 1.2 * s, y: 0.5 * s, sx: 1 * s, sy: 0.8 * s, sz: 1 * s, ry: R() * 6 }));
    g.add(mesh(GEO.cone, '#4f8a52', { x: 0.9 * s, z: -0.8 * s, y: 2.4 * s, sx: 0.5 * s, sy: 1.3 * s, sz: 0.5 * s }));
    return g;
  },
  waterfall: (p, R) => {
    const g = new THREE.Group();
    g.add(mesh(GEO.rock, '#9a958a', { y: 0.9, sx: 1.2, sy: 1.3, sz: 1, ry: R() * 6 }));
    g.add(mesh(GEO.box, null, { material: fallMat, x: -0.75, y: 0.75, sx: 0.08, sy: 1.5, sz: 0.6, ry: 0.6, shadow: false }));
    return g;
  },
  bamboo: (p, R) => {
    const s = p.s || 1;
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const x = (R() - 0.5) * 1.2, z = (R() - 0.5) * 1.2, h = (2.6 + R() * 1.4) * s;
      g.add(mesh(GEO.cyl, i % 2 ? '#7fae3c' : '#95c24a', { x, z, y: h / 2, sx: 0.07, sy: h, sz: 0.07, rz: (R() - 0.5) * 0.15 }));
      g.add(mesh(GEO.ico, '#6aa13a', { x: x + 0.15, z, y: h, sx: 0.45, sy: 0.25, sz: 0.3, ry: R() * 6 }));
    }
    return g;
  },
  branch: () => {
    const g = new THREE.Group();
    g.add(mesh(GEO.cyl, COLOR.wood, { y: 1, x: -0.6, sx: 0.14, sy: 2, sz: 0.14 }));
    g.add(mesh(GEO.cyl, '#7a5a3e', { y: 1.5, sx: 0.12, sy: 2.4, sz: 0.12, rz: 1.1 }));
    g.add(mesh(GEO.cyl, '#7a5a3e', { y: 2, x: 0.3, sx: 0.09, sy: 1.6, sz: 0.09, rz: -0.9, ry: 0.8 }));
    return g;
  },
  climb: () => {
    const g = new THREE.Group();
    for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
      g.add(mesh(GEO.cyl, COLOR.wood, { x, z, y: 1.25, sx: 0.09, sy: 2.5, sz: 0.09 }));
    }
    g.add(mesh(GEO.box, COLOR.woodLight, { y: 1.45, sx: 2.1, sy: 0.12, sz: 2.1 }));
    g.add(mesh(GEO.cyl, '#c8b48a', { y: 0.75, x: 1.3, sx: 0.04, sy: 1.5, sz: 0.04, rz: 0.5 }));
    return g;
  },
  hut: () => {
    const g = new THREE.Group();
    g.add(mesh(GEO.box, COLOR.woodLight, { y: 0.55, sx: 1.7, sy: 1.1, sz: 1.4 }));
    g.add(mesh(GEO.box, '#3a2e25', { y: 0.42, z: 0.71, sx: 0.6, sy: 0.75, sz: 0.04, shadow: false }));
    g.add(mesh(GEO.roof, COLOR.roof, { y: 1.5, sx: 1.4, sy: 0.85, sz: 1.2, ry: Math.PI / 4 }));
    return g;
  },
  den: (p) => {
    const s = p.s || 1;
    const g = new THREE.Group();
    g.add(mesh(GEO.sph, p.color || '#8e877a', { sx: 1.35 * s, sy: 1 * s, sz: 1.15 * s }));
    // 洞口朝向展場中心
    const dx = -p.at[0], dz = -p.at[1], dl = Math.hypot(dx, dz) || 1;
    const hole = mesh(GEO.disc, '#2a2622', { shadow: false, sx: 0.42 * s, sy: 0.38 * s });
    hole.position.set((dx / dl) * 1.12 * s, 0.32 * s, (dz / dl) * 1.0 * s);
    hole.rotation.y = Math.atan2(dx, dz);
    g.add(hole);
    return g;
  },
  // 紅色穀倉：白色門框、人字形屋頂
  barn: (p) => {
    const s = p.s || 1;
    const g = new THREE.Group();
    g.add(mesh(GEO.box, '#c9473d', { y: 0.95 * s, sx: 3 * s, sy: 1.9 * s, sz: 2.4 * s }));
    g.add(mesh(GEO.prism, '#8e3a32', { y: 2.3 * s, sx: 3.3 * s, sy: 0.85 * s, sz: 1.65 * s }));
    g.add(mesh(GEO.box, COLOR.cream, { y: 0.7 * s, z: 1.21 * s, sx: 1.2 * s, sy: 1.4 * s, sz: 0.05 * s, shadow: false }));
    g.add(mesh(GEO.box, '#a23a31', { y: 0.66 * s, z: 1.23 * s, sx: 0.95 * s, sy: 1.26 * s, sz: 0.05 * s, shadow: false }));
    g.add(mesh(GEO.box, COLOR.cream, { y: 1.62 * s, z: 1.23 * s, sx: 0.5 * s, sy: 0.4 * s, sz: 0.05 * s, shadow: false }));
    g.rotation.y = p.ry || 0;
    return g;
  },
  hay: (p, R) => {
    const g = new THREE.Group();
    const n = p.n || 2;
    for (let i = 0; i < n; i++) {
      g.add(mesh(GEO.cyl, i % 2 ? '#e3c56c' : '#d8b95c', { x: (i - (n - 1) / 2) * 1.05, y: 0.42, sx: 0.45, sy: 0.85, sz: 0.45, rx: Math.PI / 2, ry: R() * 0.3 }));
    }
    return g;
  },
  trough: () => {
    const g = new THREE.Group();
    g.add(mesh(GEO.box, COLOR.wood, { y: 0.22, sx: 1.5, sy: 0.4, sz: 0.55 }));
    g.add(mesh(GEO.box, '#c9d78a', { y: 0.43, sx: 1.3, sy: 0.04, sz: 0.4, shadow: false }));
    return g;
  },
  // 山羊的階梯木平台
  platform: () => {
    const g = new THREE.Group();
    for (const [x, z, h] of [[-0.9, 0.6, 0.6], [0.2, -0.3, 1.2], [1.2, 0.5, 1.8]]) {
      g.add(mesh(GEO.box, COLOR.woodLight, { x, z, y: h, sx: 1.3, sy: 0.14, sz: 1.3 }));
      g.add(mesh(GEO.cyl, COLOR.wood, { x, z, y: h / 2, sx: 0.12, sy: h, sz: 0.12 }));
    }
    return g;
  },
  // 馬場的跨欄：白色立柱＋紅白橫桿
  jump: (p) => {
    const g = new THREE.Group();
    for (const z of [-1, 1]) g.add(mesh(GEO.box, '#f4f1ea', { z, y: 0.5, sx: 0.14, sy: 1, sz: 0.14 }));
    g.add(mesh(GEO.cyl, '#d9534f', { y: 0.62, sx: 0.06, sy: 2, sz: 0.06, rx: Math.PI / 2 }));
    g.add(mesh(GEO.cyl, '#f4f1ea', { y: 0.3, sx: 0.06, sy: 2, sz: 0.06, rx: Math.PI / 2 }));
    g.rotation.y = p.rot || 0;
    g.scale.setScalar(p.s || 1);
    return g;
  },
  mound: (p) => PROPS.den({ ...p, color: p.color || '#8ab65c' }),
  // 一層層堆起來的石堆（山羊、獼猴會一階一階跳上去）；tiers 是 [半徑, 高度]，動物站在每層的頂面
  crag: (p, R) => {
    if (p.ice) return iceShelf(p, R);
    const g = new THREE.Group();
    const base = new THREE.Color(p.color || '#a19e90');
    const tone = (k) => base.clone().offsetHSL(0, 0, (R() - 0.5) * 0.1 + k).getStyle();
    p.tiers.forEach(([r, h], i) => {
      // 平頂的岩塊當作站立面，邊緣再堆一圈大小不一的石頭
      g.add(mesh(GEO.cyl, null, { material: mat(tone(0.02 * i), { flatShading: true }), y: h / 2, sx: r, sy: h, sz: r * 0.96, ry: R() * 6 }));
      const n = Math.max(6, Math.round(r * 3.2));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + R() * 0.4, sz = Math.min(h, 1.2) * (0.45 + R() * 0.3);
        g.add(mesh(GEO.rock, tone(-0.03), { x: Math.cos(a) * r, z: Math.sin(a) * r * 0.96, y: h - sz * 0.75, sx: sz * 1.2, sy: sz, sz: sz * 1.1, ry: R() * 6 }));
      }
    });
    return g;
  },
  // 雨林大樹：粗壯的樹幹、層層樹冠、垂下來的藤蔓
  giantTree: (p, R) => {
    const s = p.s || 1, h = 15 * s;
    const g = new THREE.Group();
    const bark = '#6e5238';
    g.add(mesh(GEO.cyl, bark, { y: h * 0.3, sx: 1.05 * s, sy: h * 0.6, sz: 1.05 * s }));
    g.add(mesh(GEO.cyl, bark, { y: h * 0.75, sx: 0.75 * s, sy: h * 0.5, sz: 0.75 * s }));
    // 樹冠：上層大而扁，中層小一點
    const greens = ['#2f6f3a', '#3f7f3c', '#4f8a46', '#2e7d4f', '#3d8f5f'];
    for (let k = 0; k < 4; k++) {
      const a = R() * 6.28, r = k ? 2.6 * s : 0;
      g.add(mesh(GEO.ico, greens[Math.floor(R() * greens.length)], { x: Math.cos(a) * r, z: Math.sin(a) * r, y: h + (k ? -0.8 : 0.8) * s, sx: (k ? 3.4 : 5) * s, sy: (k ? 1.8 : 2.4) * s, sz: (k ? 3.2 : 4.6) * s, ry: R() * 6 }));
    }
    for (let k = 0; k < 2; k++) {
      const a = R() * 6.28;
      g.add(mesh(GEO.ico, greens[k], { x: Math.cos(a) * 1.8 * s, z: Math.sin(a) * 1.8 * s, y: h * 0.62, sx: 2.2 * s, sy: 1.2 * s, sz: 2 * s, ry: R() * 6 }));
    }
    // 藤蔓：從樹冠垂下來的細長線
    for (let k = 0; k < 6; k++) {
      const a = R() * 6.28, r = (2 + R() * 2.5) * s, len = (5 + R() * 6) * s;
      g.add(mesh(GEO.cyl, '#5d7a3a', { x: Math.cos(a) * r, z: Math.sin(a) * r, y: h - 1 * s - len / 2, sx: 0.06 * s, sy: len, sz: 0.06 * s, rz: (R() - 0.5) * 0.12, shadow: false }));
    }
    // 樹幹上的附生植物（蕨類、蘭花）
    for (let k = 0; k < 4; k++) {
      const a = R() * 6.28, y = (3 + R() * h * 0.5);
      g.add(mesh(GEO.ico, k % 2 ? '#7fae4a' : '#5aa04c', { x: Math.cos(a) * 0.95 * s, z: Math.sin(a) * 0.95 * s, y, sx: 0.7 * s, sy: 0.35 * s, sz: 0.7 * s }));
    }
    return g;
  },
  // 瀑布：一座岩壁，水從上面落進前方的水潭（水潭在 local +z 那一側）
  bigfall: (p, R) => {
    const s = p.s || 1, h = 9 * s;
    const g = new THREE.Group();
    const rocks = ['#8e887c', '#9d978a', '#857f74', '#a5a092'];
    for (const [x, y, z, sx, sy, sz] of [[0, 0.45, -1.2, 5, 1, 2.6], [-2.4, 0.36, -0.4, 2.6, 0.75, 2.2], [2.5, 0.33, -0.5, 2.4, 0.7, 2.2], [-1.2, 0.72, -1.6, 3, 0.7, 2], [1.4, 0.8, -1.5, 2.6, 0.62, 2]]) {
      g.add(mesh(GEO.rock, rocks[Math.floor(R() * rocks.length)], { x: x * s, y: y * h, z: z * s, sx: sx * s, sy: sy * h * 0.62, sz: sz * s, ry: R() * 6 }));
    }
    // 水流：岩壁正面一片半透明的水簾，底部白色水花
    g.add(mesh(GEO.box, null, { material: fallMat, y: h * 0.48, z: 0.9 * s, sx: 2.2 * s, sy: h * 0.92, sz: 0.25 * s, rx: -0.12, shadow: false }));
    g.add(mesh(GEO.disc, null, { material: poolMat, rx: -Math.PI / 2, y: 0.06, z: 3 * s, sx: 3.6 * s, sy: 2.8 * s, shadow: false }));
    for (let k = 0; k < 6; k++) {
      g.add(mesh(GEO.ico, null, { material: mistMat, x: (R() - 0.5) * 2.6 * s, z: (1.4 + R() * 1.2) * s, y: 0.4 * s, sx: (0.6 + R() * 0.5) * s, sy: 0.45 * s, sz: (0.6 + R() * 0.5) * s, shadow: false }));
    }
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI + R() * 0.2;
      const sz = (0.35 + R() * 0.4) * s;
      g.add(mesh(GEO.rock, '#9d978a', { x: Math.cos(a) * 3.7 * s, z: 3 * s + Math.sin(a) * 2.9 * s, y: 0.15, sx: sz, sy: sz * 0.6, sz, ry: R() * 6 }));
    }
    // 岩壁頂上幾棵樹和蕨類
    for (const [x, z] of [[-2.6, -1.2], [2.4, -1.6], [0.4, -2.4]]) {
      g.add(mesh(GEO.ico, '#3f7f3c', { x: x * s, z: z * s, y: h * 0.9, sx: 1.6 * s, sy: 1.3 * s, sz: 1.5 * s, ry: R() * 6 }));
    }
    g.rotation.y = p.ry || 0;
    return g;
  },
  // 可以爬的大樹：樹幹在 at，一根水平的粗樹枝伸到 to（相對樹幹），樹枝頂面高度 h
  perchtree: (p, R) => {
    if (p.gum) return gumTree(p, R); // 無尾熊展場的尤加利樹
    const g = new THREE.Group();
    const h = p.h || 3, [ex, ez] = p.to, len = Math.hypot(ex, ez), ry = Math.atan2(-ez, ex);
    g.add(mesh(GEO.cyl, COLOR.wood, { y: (h + 3) / 2, sx: 0.42, sy: h + 3, sz: 0.42 }));
    // 樹根往外張開一點
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      g.add(mesh(GEO.cone, COLOR.wood, { x: Math.cos(a) * 0.35, z: Math.sin(a) * 0.35, y: 0.3, sx: 0.25, sy: 0.7, sz: 0.25, rx: Math.sin(a) * 0.5, rz: -Math.cos(a) * 0.5 }));
    }
    const limb = new THREE.Group();
    limb.position.y = h - 0.32;
    limb.rotation.y = ry;
    limb.add(mesh(GEO.cyl, '#7a5a3e', { x: len / 2, sx: 0.34, sy: len + 0.3, sz: 0.34, rz: Math.PI / 2 }));
    limb.add(mesh(GEO.cyl, '#7a5a3e', { x: len * 0.55, y: 0.7, z: 0.4, sx: 0.12, sy: 1.6, sz: 0.12, rz: -0.6, rx: 0.4 }));
    limb.add(mesh(GEO.ico, '#4f8a46', { x: len + 0.2, y: 0.9, sx: 1.3, sy: 0.9, sz: 1.2, ry: R() * 6 }));
    g.add(limb);
    g.add(mesh(GEO.ico, '#5f9a52', { y: h + 3.4, sx: 2.6, sy: 2, sz: 2.4, ry: R() * 6 }));
    g.add(mesh(GEO.ico, '#4f8a46', { x: -0.9, y: h + 2.4, sx: 1.6, sy: 1.2, sz: 1.5, ry: R() * 6 }));
    return g;
  },
  // 沙浴區：一片淺色沙地，羊駝會在上面打滾
  dust: (p, R) => {
    const g = new THREE.Group();
    const [w, d] = p.size;
    g.add(mesh(GEO.disc, '#e6d2a4', { rx: -Math.PI / 2, sx: w, sy: d, y: 0.03, shadow: false }));
    g.add(mesh(GEO.disc, '#d9c08a', { rx: -Math.PI / 2, sx: w * 0.6, sy: d * 0.55, x: 0.2, z: -0.1, y: 0.04, shadow: false }));
    for (let k = 0; k < 6; k++) {
      const a = R() * 6.28;
      g.add(mesh(GEO.rock, '#cbb487', { x: Math.cos(a) * w * 1.02, z: Math.sin(a) * d * 1.02, y: 0.06, sx: 0.2, sy: 0.12, sz: 0.18, ry: R() * 6 }));
    }
    return g;
  },
  // 蹭背的木樁：粗短的樹幹，頂上一圈磨亮的樹皮
  post: () => {
    const g = new THREE.Group();
    g.add(mesh(GEO.cyl, COLOR.wood, { y: 1.1, sx: 0.32, sy: 2.2, sz: 0.32 }));
    g.add(mesh(GEO.cyl, COLOR.woodLight, { y: 1.5, sx: 0.34, sy: 0.6, sz: 0.34 }));
    g.add(mesh(GEO.cyl, '#6a4e36', { y: 2.22, sx: 0.36, sy: 0.08, sz: 0.36 }));
    return g;
  },
  // 狐獴的洞口：沙土堆出一圈，中間是黑色的洞
  burrows: (p, R) => {
    const g = new THREE.Group();
    for (const [x, z] of p.holes) {
      g.add(mesh(GEO.sph, p.color || '#d2b278', { x, z, y: 0, sx: 1.5, sy: 0.32, sz: 1.35, ry: R() * 6 }));
      g.add(mesh(GEO.disc, '#3a2a1c', { x, z, y: 0.34, sx: 0.95, sy: 0.85, rx: -Math.PI / 2, shadow: false }));
      for (let k = 0; k < 3; k++) {
        const a = R() * 6.28;
        g.add(mesh(GEO.rock, '#c4a46c', { x: x + Math.cos(a) * 1.6, z: z + Math.sin(a) * 1.4, y: 0.1, sx: 0.22, sy: 0.14, sz: 0.2, ry: R() * 6 }));
      }
    }
    return g;
  },
  // 長臂猿吊掛用的大樹：粗樹幹＋一根往 +x 伸出去的水平樹枝
  hangtree: (p, R) => {
    const h = p.h || 12, len = p.len || 7;
    const g = new THREE.Group();
    g.add(mesh(GEO.cyl, COLOR.wood, { y: h / 2 + 1, sx: 0.45, sy: h + 2, sz: 0.45 }));
    g.add(mesh(GEO.cyl, '#7a5a3e', { x: len / 2, y: h, sx: 0.28, sy: len, sz: 0.28, rz: Math.PI / 2 }));
    g.add(mesh(GEO.ico, '#4f8a46', { y: h + 2.6, sx: 2.8, sy: 2.2, sz: 2.6, ry: R() * 6 }));
    g.add(mesh(GEO.ico, '#5f9a52', { x: len * 0.85, y: h + 0.9, sx: 1.4, sy: 1, sz: 1.3, ry: R() * 6 }));
    return g;
  },
  // 長臂猿住的小島：低矮的草地圓台
  isle: (p) => {
    const g = new THREE.Group();
    g.add(mesh(GEO.cyl, '#7a6a52', { y: 0.05, sx: p.r * 1.05, sy: 0.3, sz: p.r * 0.95 }));
    g.add(mesh(GEO.cyl, '#8cc06a', { y: 0.22, sx: p.r, sy: 0.06, sz: p.r * 0.9 }));
    return g;
  },
  // 不能爬的尤加利樹（無尾熊展場的造景）
  gumtree: (p, R) => gumTree(p, R),
  // ---- 非洲草原造景（方塊造型）----
  // 平頂金合歡樹：細樹幹分成兩三叉，上面一片又寬又扁的樹冠；lantern：枝上掛一盞煤油燈
  acacia: (p, R) => {
    const s = p.s || 1, g = new THREE.Group(), h = 3.4 * s, bark = '#6a5440';
    g.add(mesh(GEO.box, bark, { y: h * 0.3, sx: 0.32 * s, sy: h * 0.6, sz: 0.32 * s }));
    for (const [a, l] of [[0.5, 1], [2.6, 0.9], [4.4, 0.8]]) {
      g.add(mesh(GEO.box, bark, { x: Math.cos(a) * 0.55 * s * l, z: Math.sin(a) * 0.55 * s * l, y: h * 0.72, sx: 0.18 * s, sy: h * 0.5 * l, sz: 0.18 * s, ry: -a, rz: -0.55 }));
    }
    const leaf = ['#6b7a3a', '#7d8a44', '#5f6e34'];
    g.add(mesh(GEO.box, leaf[0], { y: h + 0.15 * s, sx: 4.4 * s, sy: 0.45 * s, sz: 3.6 * s, ry: R() * 3 }));
    g.add(mesh(GEO.box, leaf[1], { x: 0.4 * s, y: h + 0.5 * s, sx: 3.0 * s, sy: 0.35 * s, sz: 2.6 * s, ry: R() * 3 }));
    g.add(mesh(GEO.box, leaf[2], { x: -0.6 * s, y: h - 0.1 * s, sx: 2.2 * s, sy: 0.3 * s, sz: 2.0 * s, ry: R() * 3 }));
    if (p.lantern) {
      g.add(mesh(GEO.box, '#3a3430', { x: 1.3 * s, y: h - 0.55 * s, sx: 0.04, sy: 0.5, sz: 0.04 }));
      g.add(mesh(GEO.box, null, { material: lanternMat, x: 1.3 * s, y: h - 0.95 * s, sx: 0.28, sy: 0.36, sz: 0.28, shadow: false }));
      g.add(mesh(GEO.box, '#3a3430', { x: 1.3 * s, y: h - 0.74 * s, sx: 0.34, sy: 0.06, sz: 0.34 }));
    }
    return g;
  },
  // 仙人掌（第三版沙漠）：一根粗柱，兩側各一隻往上彎的手臂
  cactus: (p, R) => {
    const s = (p.s || 1) * 1.2, g = new THREE.Group(), c = R() < 0.5 ? '#6f9a5a' : '#5f8f4e';
    g.add(mesh(GEO.box, c, { y: 1.5 * s, sx: 0.6 * s, sy: 3 * s, sz: 0.6 * s }));
    for (const [sd, y, l] of [[1, 1.3, 1], [-1, 1.8, 0.8]]) {
      g.add(mesh(GEO.box, c, { x: sd * 0.6 * s, y: y * s, sx: 0.7 * s, sy: 0.4 * s, sz: 0.4 * s }));
      g.add(mesh(GEO.box, c, { x: sd * 0.85 * s, y: (y + 0.5 * l) * s, sx: 0.4 * s, sy: 1.1 * l * s, sz: 0.4 * s }));
    }
    g.add(mesh(GEO.box, '#f39a5c', { y: 3.05 * s, sx: 0.3 * s, sy: 0.15 * s, sz: 0.3 * s, shadow: false }));
    return g;
  },
  // 花崗岩巨石堆（Kopje）：幾顆圓滾滾的大石頭疊在一起
  kopje: (p, R) => {
    const s = p.s || 1, g = new THREE.Group(), cols = ['#b8aa96', '#a89a86', '#c4b6a0', '#9d8f7c'];
    for (const [x, y, z, k] of [[0, 1.4, 0, 2.6], [1.9, 0.9, 0.8, 1.8], [-1.8, 0.8, -0.6, 1.9], [0.6, 2.9, -0.3, 1.5], [-0.8, 0.5, 1.8, 1.2], [2.2, 0.4, -1.6, 1.0]]) {
      g.add(mesh(GEO.rock, cols[Math.floor(R() * cols.length)], { x: x * s, y: y * s, z: z * s, sx: k * s, sy: k * 0.75 * s, sz: k * 0.9 * s, ry: R() * 6, rx: (R() - 0.5) * 0.4 }));
    }
    return g;
  },
  // 猴麵包樹：又粗又胖的樹幹，頂端短短的枝條上一小團葉子
  baobab: (p, R) => {
    const s = p.s || 1, g = new THREE.Group(), bark = '#9a8070', h = 6 * s;
    g.add(mesh(GEO.box, bark, { y: h * 0.35, sx: 2.6 * s, sy: h * 0.7, sz: 2.6 * s }));
    g.add(mesh(GEO.box, bark, { y: h * 0.78, sx: 2.0 * s, sy: h * 0.2, sz: 2.0 * s }));
    g.add(mesh(GEO.box, '#8a7262', { y: 0.3 * s, sx: 3.0 * s, sy: 0.6 * s, sz: 3.0 * s }));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + R() * 0.4, r = 1.1 * s;
      g.add(mesh(GEO.box, bark, { x: Math.cos(a) * r, z: Math.sin(a) * r, y: h * 0.95, sx: 0.3 * s, sy: 1.4 * s, sz: 0.3 * s, ry: -a, rz: -0.6 }));
      g.add(mesh(GEO.box, k % 2 ? '#6f8a3e' : '#7f9a48', { x: Math.cos(a) * r * 1.8, z: Math.sin(a) * r * 1.8, y: h * 1.08, sx: 1.1 * s, sy: 0.5 * s, sz: 1.0 * s, ry: R() * 3 }));
    }
    return g;
  },
  // 龜裂的紅土地：一片紅色地面，上面是深色的裂縫
  cracked: (p, R) => {
    const g = new THREE.Group(), [w, d] = p.size;
    g.add(mesh(GEO.disc, '#b8643a', { rx: -Math.PI / 2, sx: w, sy: d, y: 0.04, shadow: false }));
    for (let k = 0; k < 18; k++) {
      const a = R() * 6.28, r = Math.sqrt(R()) * 0.85;
      g.add(mesh(GEO.box, '#7a3a20', { x: Math.cos(a) * w * r, z: Math.sin(a) * d * r, y: 0.06, sx: 0.8 + R() * 1.2, sy: 0.02, sz: 0.08, ry: R() * 3, shadow: false }));
    }
    return g;
  },
  // 枯骨：方塊頭骨和幾根肋骨
  bones: (p, R) => {
    const g = new THREE.Group(), c = '#efe6d4';
    g.add(mesh(GEO.box, c, { y: 0.2, sx: 0.5, sy: 0.35, sz: 0.4, ry: R() * 3 }));
    g.add(mesh(GEO.box, '#2a2420', { x: 0.2, y: 0.25, sx: 0.12, sy: 0.1, sz: 0.3, shadow: false }));
    for (let k = 0; k < 4; k++) g.add(mesh(GEO.box, c, { x: -0.6 - k * 0.22, y: 0.12, sx: 0.07, sy: 0.07, sz: 0.9, ry: 0.2 }));
    g.add(mesh(GEO.box, c, { x: -0.9, y: 0.08, sx: 1.0, sy: 0.08, sz: 0.08 }));
    g.rotation.y = R() * 6;
    return g;
  },
  // 枯樹：光禿禿的灰色枝條，上面停著兩隻禿鷲
  deadtree: (p, R) => {
    const s = p.s || 1, g = new THREE.Group(), c = '#8a7a6a', h = 4 * s;
    g.add(mesh(GEO.box, c, { y: h / 2, sx: 0.35 * s, sy: h, sz: 0.35 * s }));
    const limbs = [[0.4, 0.7, 1.6], [2.4, 0.55, 1.3], [4.2, 0.85, 1.1]];
    for (const [a, f, l] of limbs) g.add(mesh(GEO.box, c, { x: Math.cos(a) * 0.5 * s, z: Math.sin(a) * 0.5 * s, y: h * f + 0.4 * s, sx: 0.14 * s, sy: l * s, sz: 0.14 * s, ry: -a, rz: -0.9 }));
    for (const [a, f] of [[0.4, 0.7], [2.4, 0.55]]) {
      const x = Math.cos(a) * 1.0 * s, z = Math.sin(a) * 1.0 * s, y = h * f + 0.95 * s;
      g.add(mesh(GEO.box, '#3a2e26', { x, z, y: y + 0.3, sx: 0.5, sy: 0.55, sz: 0.36, ry: -a })); // 禿鷲的身體
      g.add(mesh(GEO.box, '#d9b8a8', { x: x + Math.cos(a) * 0.3, z: z + Math.sin(a) * 0.3, y: y + 0.66, sx: 0.2, sy: 0.22, sz: 0.2, ry: -a }));
    }
    return g;
  },
  // 圓形茅草泥屋：土牆＋圓錐形茅草屋頂＋門口
  hut: (p) => {
    const s = p.s || 1, g = new THREE.Group();
    g.add(mesh(GEO.cyl, '#b07a4a', { y: 1.0 * s, sx: 1.8 * s, sy: 2.0 * s, sz: 1.8 * s }));
    g.add(mesh(GEO.box, '#6a4a30', { y: 1.0 * s, sx: 0.12 * s, sy: 2.04 * s, sz: 3.62 * s, shadow: false })); // 牆上一圈深色腰帶
    g.add(mesh(GEO.cone, '#c9a35a', { y: 2.8 * s, sx: 2.4 * s, sy: 1.8 * s, sz: 2.4 * s }));
    g.add(mesh(GEO.cone, '#b8924a', { y: 3.75 * s, sx: 0.5 * s, sy: 0.5 * s, sz: 0.5 * s }));
    g.add(mesh(GEO.box, '#3a2a1c', { x: 1.75 * s, y: 0.7 * s, sx: 0.12, sy: 1.4 * s, sz: 0.8 * s, shadow: false }));
    g.rotation.y = p.ry || 0;
    return g;
  },
  // 帆布探險帳篷：人字形的米色帆布、前面撐起來的遮陽篷
  tent: (p) => {
    const s = p.s || 1, g = new THREE.Group();
    g.add(mesh(GEO.box, '#8a7a5a', { y: 0.03, sx: 3.6 * s, sy: 0.06, sz: 3.0 * s, shadow: false }));
    g.add(mesh(GEO.prism, '#d9cba6', { y: 1.0 * s, sx: 1.7 * s, sy: 1.1 * s, sz: 1.5 * s }));
    g.add(mesh(GEO.box, '#5a4a36', { x: 1.72 * s, y: 0.6 * s, sx: 0.04, sy: 1.1 * s, sz: 0.8 * s, shadow: false }));
    g.add(mesh(GEO.box, '#cbbb94', { x: 2.3 * s, y: 1.5 * s, sx: 1.4 * s, sy: 0.06, sz: 2.4 * s, rz: -0.2 }));
    for (const z of [-1.1, 1.1]) g.add(mesh(GEO.box, '#5a4a36', { x: 2.9 * s, y: 0.7 * s, sx: 0.06, sy: 1.4 * s, sz: 0.06, z: z * s }));
    g.rotation.y = p.ry || 0;
    return g;
  },
  // 營火＋圍一圈的木籬笆（Boma），旁邊鋪一條幾何圖騰毯子
  boma: (p, R) => {
    const r = p.r || 4, g = new THREE.Group();
    const n = Math.round(r * 7);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      if (Math.abs(Math.sin(a / 2 - 0.4)) < 0.12) continue; // 留一個入口
      const h = 0.9 + R() * 0.5;
      g.add(mesh(GEO.box, k % 2 ? '#7a5a3e' : '#6a4a30', { x: Math.cos(a) * r, z: Math.sin(a) * r, y: h / 2, sx: 0.14, sy: h, sz: 0.14, rz: (R() - 0.5) * 0.15 }));
    }
    for (let k = 0; k < 4; k++) g.add(mesh(GEO.box, '#5a3e28', { y: 0.12, sx: 1.2, sy: 0.16, sz: 0.16, ry: (k / 4) * Math.PI }));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 6.28;
      g.add(mesh(GEO.rock, '#8a8278', { x: Math.cos(a) * 0.75, z: Math.sin(a) * 0.75, y: 0.1, sx: 0.22, sy: 0.16, sz: 0.2 }));
    }
    g.add(mesh(GEO.cone, null, { material: fireMat, y: 0.55, sx: 0.4, sy: 0.8, sz: 0.4, shadow: false }));
    g.add(mesh(GEO.cone, null, { material: fireMat2, y: 0.45, x: 0.15, sx: 0.25, sy: 0.55, sz: 0.25, shadow: false }));
    // 圍坐用的原木和毯子
    for (const a of [0.6, 2.2, 3.9]) g.add(mesh(GEO.box, '#8b6748', { x: Math.cos(a) * 2, z: Math.sin(a) * 2, y: 0.22, sx: 1.6, sy: 0.4, sz: 0.4, ry: -a + Math.PI / 2 }));
    const B = ['#c0392b', '#1e1a18', '#e8b830', '#2a5aa0'];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
      g.add(mesh(GEO.box, B[(i + j * 2) % 4], { x: -2.6 + i * 0.3, z: 1.0 + j * 0.3, y: 0.03, sx: 0.3, sy: 0.03, sz: 0.3, shadow: false }));
    }
    return g;
  },
  // 越野車：橄欖綠車身、下半截沾滿泥巴、車頂架、後面掛備胎
  jeep: (p) => {
    const g = new THREE.Group();
    g.add(mesh(GEO.box, '#6f7a52', { y: 1.15, sx: 4.2, sy: 1.0, sz: 2.0 }));
    g.add(mesh(GEO.box, '#7a5a3a', { y: 0.78, sx: 4.24, sy: 0.4, sz: 2.04 })); // 泥巴
    g.add(mesh(GEO.box, '#6f7a52', { x: -0.4, y: 2.0, sx: 2.6, sy: 0.8, sz: 1.9 }));
    g.add(mesh(GEO.box, null, { material: windowMatShared, x: -0.4, y: 2.05, sx: 2.64, sy: 0.5, sz: 1.94, shadow: false }));
    g.add(mesh(GEO.box, '#3a3a36', { x: -0.4, y: 2.5, sx: 2.4, sy: 0.12, sz: 1.8 }));
    g.add(mesh(GEO.box, '#c9b88a', { x: -0.6, y: 2.75, sx: 1.2, sy: 0.4, sz: 1.0 })); // 車頂的行李
    for (const [x, z] of [[1.4, 1.05], [-1.4, 1.05], [1.4, -1.05], [-1.4, -1.05]]) {
      g.add(mesh(GEO.box, '#1e1e1e', { x, z, y: 0.45, sx: 0.9, sy: 0.9, sz: 0.4 }));
      g.add(mesh(GEO.box, '#7a5a3a', { x, z: z * 1.03, y: 0.3, sx: 0.92, sy: 0.4, sz: 0.36, shadow: false }));
    }
    g.add(mesh(GEO.box, '#1e1e1e', { x: -2.25, y: 1.4, sx: 0.3, sy: 0.9, sz: 0.9 }));
    g.rotation.y = p.ry || 0;
    return g;
  },
  // 極地動物區的造景：一座小冰河（岩山、冰舌、崩裂的冰塔，見 glacier），冰舌朝島中心
  iceberg: (p, R) => {
    const g = glacier(R), I = 'x' in p && ISL ? islandAt(p.x, p.z) : null;
    g.scale.setScalar((p.s || 1) * 0.47);
    g.rotation.y = I ? Math.atan2(I.cx - p.x, I.cz - p.z) : p.ry || 0;
    return g;
  },
  // 入口廣場中間的噴水池
  fountain: () => {
    const g = new THREE.Group();
    g.add(mesh(GEO.cyl, '#d8ccb0', { y: 0.25, sx: 2.4, sy: 0.5, sz: 2.4 }));
    g.add(mesh(GEO.disc, null, { material: waterMat, rx: -Math.PI / 2, sx: 2.15, sy: 2.15, y: 0.52, shadow: false }));
    g.add(mesh(GEO.cyl, '#d8ccb0', { y: 1, sx: 0.35, sy: 1.6, sz: 0.35 }));
    g.add(mesh(GEO.cyl, '#d8ccb0', { y: 1.6, sx: 0.9, sy: 0.15, sz: 0.9 }));
    g.add(mesh(GEO.cone, null, { material: fallMat, y: 2.3, sx: 0.4, sy: 1.2, sz: 0.4, shadow: false }));
    return g;
  },
};

// ---- 海、島（只剩海上厚台地這一版，見 buildTall）----
// 凸多邊形往外推 d 公尺（淺灘的範圍）
function offsetPoly(poly, d) {
  const area = poly.reduce((s, [x, z], i) => { const [x2, z2] = poly[(i + 1) % poly.length]; return s + x * z2 - x2 * z; }, 0);
  const sgn = area > 0 ? 1 : -1; // 外側法線的方向跟著頂點的繞行方向
  const nrm = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [(dz / l) * sgn, (-dx / l) * sgn]; };
  return poly.map((v, i) => {
    const n1 = nrm(poly[(i - 1 + poly.length) % poly.length], v), n2 = nrm(v, poly[(i + 1) % poly.length]);
    const k = d / Math.max(0.35, 1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [v[0] + (n1[0] + n2[0]) * k, v[1] + (n1[1] + n2[1]) * k];
  });
}
const flatShape = (poly) => new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
const ISLE_SIDE = '#efe2c4'; // 島緣：米白色的厚邊（像政策島）
function islandTop(I) {
  const z = I.zone;
  if (!z) return new THREE.Color('#c4dc96');
  return z.flora === 'polar' ? new THREE.Color('#eaf3f7') : z.flora === 'savanna' ? new THREE.Color('#d8c27a') : new THREE.Color(z.color).lerp(new THREE.Color(COLOR.grass), 0.72);
}
function buildIslands(scene, R) {
  return buildTall(scene, R);
}

// 海上空曠的地方：離每座島的岸邊、每座橋都超過 d
const seaClear = (x, z, d) => parkR(x, z) < 0.9 && !ISL.islands.some((I) => inPolygon(x, z, I.poly) || edgeDist(x, z, I.poly) < d) && !ISL.bridges.some((b) => {
  const [ax, az] = b.a, [bx, bz] = b.b, dx = bx - ax, dz = bz - az, k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - dx * k, z - az - dz * k) < d;
}) && !(ISL.viaducts || []).some((v) => v.pts.some((p, i) => i % 3 === 0 && Math.hypot(x - p[0], z - p[1]) < d + 3)) // 第三版：船不穿過海上大橋
  && !(ISL.decor || []).some((q) => Math.hypot(x - q.x, z - q.z) < q.r + d); // 也不撞上裝飾小島
// 帆船：在海上空曠的地方慢慢繞小圈、隨浪起伏（第一版、第三版共用）
// 晚上的燈（船、飛機、熱氣球、展場）：小燈泡晚上變亮，外面一圈加法混色的光暈；船窗晚上發黃光；
// 展場地上一圈暖色光（假的燈光，不用點光源，所有展場可以同時亮）
const GLOW_TEX = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const LIGHTS = {
  bulbs: new Map(), sprites: new Map(), halos: [], pools: [],
  win: new THREE.MeshStandardMaterial({ color: '#5f9fae', emissive: '#ffd27a', emissiveIntensity: 0, roughness: 0.5 }),
  pool: new THREE.MeshBasicMaterial({ map: GLOW_TEX, color: '#ffc874', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
};
function halo(g, x, y, z, color = '#ffd27a', size = 2.4) {
  if (!LIGHTS.sprites.has(color)) LIGHTS.sprites.set(color, new THREE.SpriteMaterial({ map: GLOW_TEX, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const sp = new THREE.Sprite(LIGHTS.sprites.get(color));
  sp.position.set(x, y, z);
  sp.scale.setScalar(size);
  sp.visible = false;
  g.add(sp);
  LIGHTS.halos.push(sp);
}
function light(g, x, y, z, color = '#ffd27a', size = 2.4) {
  if (!LIGHTS.bulbs.has(color)) LIGHTS.bulbs.set(color, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 }));
  g.add(mesh(GEO.sph, null, { material: LIGHTS.bulbs.get(color), x, y, z, sx: 0.24, sy: 0.24, sz: 0.24, shadow: false }));
  halo(g, x, y, z, color, size * 1.8); // 光暈放大一點，拉遠看全景時船燈才看得到
}
function setLights(on) {
  for (const m of LIGHTS.bulbs.values()) m.emissiveIntensity = on ? 3 : 0.3;
  for (const sp of LIGHTS.halos) sp.visible = on;
  for (const p of LIGHTS.pools) p.visible = on;
  LIGHTS.win.emissiveIntensity = on ? 1.3 : 0;
}

function sailboats(scene, R, clearSea, n) {
  const boats = [];
  const hullMat = mat('#fbf7ee'), sailMat = mat('#ffffff', { side: THREE.DoubleSide }), trim = ['#e07a4c', '#3b8fd0', '#f2c14e'];
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.3, 0, 0, 3.4, 0, 1.9, 0.3, 0], 3));
  sailGeo.computeVertexNormals();
  for (let i = 0; i < 6000 && boats.length < n; i++) {
    const x = PARK.x + (R() * 2 - 1) * PARK.rx, z = PARK.z + (R() * 2 - 1) * PARK.rz;
    if (!clearSea(x, z, 9)) continue;
    const g = new THREE.Group();
    g.add(mesh(GEO.box, null, { material: hullMat, y: 0.25, sx: 3, sy: 0.6, sz: 1.2 }));
    g.add(mesh(GEO.box, trim[boats.length % 3], { y: 0.5, sx: 3.05, sy: 0.14, sz: 1.25, shadow: false }));
    g.add(mesh(GEO.box, null, { material: hullMat, x: 1.6, y: 0.3, sx: 0.6, sy: 0.5, sz: 0.8, ry: Math.PI / 4 }));
    g.add(mesh(GEO.cyl, COLOR.wood, { x: -0.2, y: 2, sx: 0.06, sy: 3.4, sz: 0.06 }));
    const sail = new THREE.Mesh(sailGeo, sailMat);
    sail.position.x = -0.15;
    sail.castShadow = true;
    g.add(sail);
    light(g, -0.2, 3.8, 0, '#fff4d6', 2.2); // 桅頂燈
    light(g, 1.1, 0.75, 0.62, '#ff5a4a', 1.4); light(g, 1.1, 0.75, -0.62, '#5aff8a', 1.4); // 左紅右綠的舷燈
    g.position.set(x, 0, z);
    g.rotation.y = R() * 6.3;
    g.userData.dynamic = true;
    scene.add(g);
    boats.push({ g, x, z, ph: R() * 6.3, sp: 0.04 + R() * 0.05, r: 3 + R() * 5 });
  }
  return {
    // 帆船慢慢繞小圈、隨浪起伏
    update(t) {
      for (const b of boats) {
        const a = b.ph + t * b.sp;
        b.g.position.set(b.x + Math.cos(a) * b.r, Math.sin(t * 1.3 + b.ph) * 0.08, b.z + Math.sin(a) * b.r);
        b.g.rotation.y = -a;
        b.g.rotation.x = Math.sin(t * 1.1 + b.ph) * 0.05;
      }
    },
  };
}

// 島的基本色（tallColors 先從這裡取再調色）：頂面、島緣、島底的土石
const EARTH = ['#c9a878', '#a8865c', '#86684a'];
const ISLE_STYLE = {
  savanna: { top: '#d8c27a', side: '#efe2c4', under: EARTH }, // 草原：米白沙岸
  camp: { top: '#dcc68e', side: '#efe2c4', under: EARTH },
  herd: { top: '#d3bd72', side: '#efe2c4', under: EARTH },
  rock: { top: '#cdb084', side: '#b3aa9c', under: ['#9d958a', '#837b70', '#6a635a'] }, // 岩石岸
  wet: { top: '#9fb565', side: '#8f6c4b', under: ['#7a5b40', '#664a34', '#523b2a'] }, // 泥岸
  forest: { top: '#76a24f', side: '#6e5038', under: ['#5f4532', '#4e3a2b', '#3f2f24'] }, // 森林：深色土岸
  madagascar: { top: '#cf8a58', side: '#b9653f', under: ['#a4563a', '#8a4630', '#703a29'] }, // 馬達加斯加紅土
};
function styleOf(I) {
  if (I.flora) return ISLE_STYLE[I.flora];
  const f = I.zone?.flora;
  const under = f === 'polar' ? ['#d6e8f0', '#b9d3e0', '#9dbccd'] : f === 'rainforest' ? ISLE_STYLE.forest.under : EARTH;
  return { top: islandTop(I), side: f === 'polar' ? '#e2eef4' : ISLE_SIDE, under };
}

// ---- 海上的厚台地（參考 Penny 的工作生活島）----
// 配色統一成奶油、鼠尾草綠、橘陶、淺藍綠：島的頂面往鼠尾草綠靠，岩壁往奶油色靠
const TALL = { sea: '#8fd0c8', shelf: ['#a9dcd2', '#c9eadf'], cliff: '#ecdcb6', sage: '#d3e2ab', terra: '#e98a5a', lamp: '#f39a5c' };
// 第三版：沙漠島整座是沙（頂面和岩壁都是沙色），極地島整座是冰
const TALL_ZONE = {
  africa: { top: '#c97c50', side: '#e2b48a' }, // 非洲島整座是紅土
  insects: { top: '#dba873', side: '#e6c08a' }, // 蟲蟲探索谷：介於紅土和沙漠之間
  rainforest: { top: '#7da35a', side: '#ecdcb6' }, // 熱帶雨林：比一般園區深一點的綠
  taiwan: { top: '#acc372', side: '#ecdcb6' }, // 臺灣動物區：介於兒童區（入口島）和雨林之間的綠，帶一點黃
  desert: { top: '#ecd49a', side: '#e2b97c' },
  polar: { top: '#f4fafd', side: '#bfe2ef' },
};
// 第三版展場地面的顏色：所在島的頂面顏色，同一區依序換深淺（亮的島往深、其他往淺）
const floorCount = new Map();
function enclosureFloor(e, zone) {
  const I = islandAt(e.x, e.z);
  const base = I ? tallColors(I).top : new THREE.Color(COLOR.grass), hsl = {};
  base.getHSL(hsl);
  const n = floorCount.get(zone) || 0;
  floorCount.set(zone, n + 1);
  const d = hsl.l > 0.8 ? -[0.07, 0.11, 0.09, 0.13][n % 4] : [0.08, 0.13, 0.05, 0.11, 0.16][n % 5];
  return base.clone().offsetHSL(0, hsl.l > 0.8 ? 0.04 : -0.04, d);
}
function tallColors(I) {
  const tz = !I.flora && TALL_ZONE[I.zone?.id];
  if (tz) return { top: new THREE.Color(tz.top), side: new THREE.Color(tz.side) };
  const st = styleOf(I);
  const top = new THREE.Color(st.top).lerp(new THREE.Color(TALL.sage), I.flora ? 0.28 : 0.38);
  const side = new THREE.Color(I.flora ? st.side : TALL.cliff).lerp(new THREE.Color(TALL.cliff), I.flora ? 0.4 : 0);
  return { top, side };
}
// 第三版岩壁的地層色（由上往下）：一般是奶油、杏桃、赭褐；沙漠是沙色系；極地是冰藍色系
const STRATA = {
  base: ['#ecdcb6', '#e2b48a', '#bf8f6c'],
  desert: ['#ecc88e', '#d9a066', '#b47e4e'],
  polar: ['#d6eff8', '#a8d6ea', '#7fb8d4'],
};
// 兩圈點數相同的多邊形之間接成一圈牆（上圈 y0、下圈 y1）；flat 時兩圈同高，就是一圈水平的環
function loftWall(a, b, y0, y1, flat = false) {
  const pos = [], n = a.length;
  const ccw = a.reduce((s, [x, z], i) => { const [x2, z2] = a[(i + 1) % n]; return s + x * z2 - x2 * z; }, 0) > 0; // 繞行方向決定三角形的順序，法線才會朝外（朝上）
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const A0 = [a[i][0], y0, a[i][1]], A1 = [a[j][0], y0, a[j][1]], B0 = [b[i][0], y1, b[i][1]], B1 = [b[j][0], y1, b[j][1]];
    if (ccw) pos.push(...A0, ...A1, ...B0, ...A1, ...B1, ...B0);
    else pos.push(...A0, ...B0, ...A1, ...A1, ...B0, ...B1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
// 海面的離岸距離表（給卡通海用：岸邊浪花線、由淺到深的顏色）：海面切成 2 公尺一格，
// 島（往外 2 公尺，岩壁底部比島面寬）、裝飾小島、外圍陸地（地形高過海面）算陸地，
// 用畫布把島畫出來當遮罩，再用兩趟掃描（倒角距離）算每一格到最近陸地的距離，存成 0–64 公尺的灰階貼圖
function bakeShore() {
  if (!SHORE_ON) return;
  const W = 1000, H = 1120, S = 2, nx = W / S, nz = H / S, x0 = PARK.x - W / 2, z0 = PARK.z - H / 2;
  const cv = document.createElement('canvas');
  cv.width = nx; cv.height = nz;
  const c = cv.getContext('2d');
  c.fillStyle = '#fff';
  const tx = (x) => (x - x0) / S, tz = (z) => (z - z0) / S;
  for (const I of ISL.islands) {
    c.beginPath();
    offsetPoly(I.poly, 2).forEach(([x, z], i) => (i ? c.lineTo(tx(x), tz(z)) : c.moveTo(tx(x), tz(z))));
    c.closePath();
    c.fill();
  }
  for (const q of ISL.decor || []) { c.beginPath(); c.arc(tx(q.x), tz(q.z), (q.r * 1.25 + 1.2) / S, 0, Math.PI * 2); c.fill(); }
  const img = c.getImageData(0, 0, nx, nz).data, d = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    d[k] = img[k * 4 + 3] > 127 || terrainHeight(x0 + (i + 0.5) * S, z0 + (j + 0.5) * S) > 0 ? 0 : 1e9;
  }
  const D = Math.SQRT2;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    if (i > 0) d[k] = Math.min(d[k], d[k - 1] + 1);
    if (j > 0) { d[k] = Math.min(d[k], d[k - nx] + 1); if (i > 0) d[k] = Math.min(d[k], d[k - nx - 1] + D); if (i < nx - 1) d[k] = Math.min(d[k], d[k - nx + 1] + D); }
  }
  for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i;
    if (i < nx - 1) d[k] = Math.min(d[k], d[k + 1] + 1);
    if (j < nz - 1) { d[k] = Math.min(d[k], d[k + nx] + 1); if (i < nx - 1) d[k] = Math.min(d[k], d[k + nx + 1] + D); if (i > 0) d[k] = Math.min(d[k], d[k + nx - 1] + D); }
  }
  const px = new Uint8Array(nx * nz);
  for (let k = 0; k < px.length; k++) px[k] = Math.min(255, Math.round((d[k] * S / 64) * 255));
  const tex = new THREE.DataTexture(px, nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  setShore(tex, x0, z0, W, H);
}
// 臺灣動物區對岸的海灘：沙灘上一排排陽傘和海灘巾、躺著曬太陽和站著聊天的人，海裡有人游泳、套著泳圈漂，
// 後面是遊客中心、幾間小攤販和救生員瞭望台。位置在 setupIslands 算好（ISL.beach）
function beach(scene, R, movers) {
  const B = ISL.beach, g = new THREE.Group();
  scene.add(g);
  const C = ['#ef6f6c', '#f2c14e', '#5bc0eb', '#9bc53d', '#ff9f1c', '#c77dff', '#fbf7ee'];
  const pick = (a) => a[Math.floor(R() * a.length)];
  const SKIN = ['#f0c9a4', '#d9a77e', '#b9825a'];
  // 朝海的方向：往海的中心
  const toSea = (x, z) => Math.atan2(PARK.x - x, PARK.z - z);
  const spots = (lo, hi, n, gap) => {
    const out = [];
    for (let i = 0; i < 4000 && out.length < n; i++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * B.r * 0.85, x = B.x + Math.cos(a) * r, z = B.z + Math.sin(a) * r, h = terrainHeight(x, z);
      if (h < lo || h > hi || out.some((o) => Math.hypot(o.x - x, o.z - z) < gap)) continue;
      out.push({ x, z, y: Math.max(0, h) });
    }
    return out;
  };
  const person = (x, y, z, ry, lying) => {
    const p = new THREE.Group(), shirt = pick(C);
    if (lying) {
      p.add(mesh(new THREE.CapsuleGeometry(0.22, 0.9, 2, 6), shirt, { y: 0.22, rz: Math.PI / 2 }));
      p.add(mesh(GEO.sph, pick(SKIN), { x: 0.75, y: 0.25, sx: 0.2, sy: 0.2, sz: 0.2 }));
    } else {
      p.add(mesh(new THREE.CapsuleGeometry(0.2, 0.75, 2, 6), shirt, { y: 0.6 }));
      p.add(mesh(GEO.sph, pick(SKIN), { y: 1.28, sx: 0.2, sy: 0.2, sz: 0.2 }));
      p.add(mesh(GEO.sph, pick(['#1f1a17', '#3b2a20', '#6b4a32']), { y: 1.36, sx: 0.21, sy: 0.12, sz: 0.21 }));
    }
    p.position.set(x, y, z);
    p.rotation.y = ry;
    p.scale.setScalar(1.5);
    g.add(p);
    return p;
  };
  // 陽傘＋海灘巾＋躺著的人
  for (const s of spots(0.15, 1.6, 16, 5)) {
    const ry = toSea(s.x, s.z), c1 = pick(C.slice(0, 6)), c2 = '#fbf7ee';
    const u = new THREE.Group();
    u.position.set(s.x, s.y, s.z);
    u.add(mesh(GEO.cyl, '#fbf7ee', { y: 1.4, sx: 0.06, sy: 2.8, sz: 0.06 }));
    for (let k = 0; k < 8; k++) u.add(mesh(new THREE.ConeGeometry(1.6, 0.6, 8, 1, false, (k / 8) * Math.PI * 2, Math.PI / 4), k % 2 ? c1 : c2, { y: 2.9 })); // 紅白相間的傘面
    u.rotation.z = (R() - 0.5) * 0.2;
    g.add(u);
    const tx = s.x + Math.sin(ry) * 1.6, tz = s.z + Math.cos(ry) * 1.6;
    g.add(mesh(GEO.box, pick(C), { x: tx, y: s.y + 0.04, z: tz, sx: 1.1, sy: 0.05, sz: 2.2, ry, shadow: false }));
    if (R() < 0.75) person(tx, s.y + 0.05, tz, ry + Math.PI / 2, true);
    if (R() < 0.4) person(s.x - Math.cos(ry) * 1.5, s.y, s.z + Math.sin(ry) * 1.5, ry + (R() - 0.5), false);
  }
  // 沙灘上走動、玩球、堆沙堡的人
  for (const s of spots(0.15, 2.2, 14, 3)) {
    person(s.x, s.y, s.z, R() * 6.28, false);
    if (R() < 0.3) g.add(mesh(GEO.sph, pick(C), { x: s.x + 1, y: s.y + 0.3, z: s.z, sx: 0.3, sy: 0.3, sz: 0.3 })); // 海灘球
    if (R() < 0.2) g.add(mesh(GEO.cone, '#e9cf98', { x: s.x - 1, y: s.y + 0.35, z: s.z + 0.6, sx: 0.6, sy: 0.7, sz: 0.6 })); // 沙堡
  }
  // 海裡游泳、套泳圈的人（離岸不遠的淺水），上下輕輕漂
  const swim = [];
  for (let i = 0; i < 4000 && swim.length < 18; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * B.r, x = B.x + Math.cos(a) * r, z = B.z + Math.sin(a) * r, h = terrainHeight(x, z);
    if (h > -0.6 || h < -3.5 || swim.some((o) => Math.hypot(o.x - x, o.z - z) < 3)) continue;
    let nearLand = false; // 只在離沙灘 12 公尺內的淺水
    for (let k = 0; k < 8 && !nearLand; k++) nearLand = terrainHeight(x + Math.cos(k * 0.785) * 12, z + Math.sin(k * 0.785) * 12) > 0.1;
    if (!nearLand) continue;
    const p = new THREE.Group();
    p.add(mesh(GEO.sph, pick(SKIN), { y: 0.35, sx: 0.3, sy: 0.3, sz: 0.3 }));
    p.add(mesh(GEO.sph, pick(['#1f1a17', '#3b2a20', '#f2c14e']), { y: 0.45, sx: 0.31, sy: 0.17, sz: 0.31 }));
    if (R() < 0.6) p.add(mesh(new THREE.TorusGeometry(0.55, 0.2, 8, 16), pick(C.slice(0, 6)), { y: 0.05, rx: Math.PI / 2 })); // 泳圈
    else for (const sd of [-1, 1]) p.add(mesh(GEO.box, pick(SKIN), { x: sd * 0.45, y: 0.05, sx: 0.5, sy: 0.12, sz: 0.14, rz: sd * 0.2 })); // 划水的手
    p.position.set(x, 0, z);
    p.rotation.y = R() * 6.28;
    p.userData.dynamic = true;
    g.add(p);
    swim.push({ p, x, z, ph: R() * 6.28 });
  }
  movers.push((t) => { for (const s of swim) { s.p.position.y = Math.sin(t * 1.6 + s.ph) * 0.12; s.p.rotation.z = Math.sin(t * 1.1 + s.ph) * 0.08; } });
  // 救生員瞭望台
  const lg = spots(0.3, 1.5, 1, 1)[0];
  if (lg) {
    const t = new THREE.Group();
    t.position.set(lg.x, lg.y, lg.z);
    t.rotation.y = toSea(lg.x, lg.z);
    for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) t.add(mesh(GEO.box, '#fbf7ee', { x, z, y: 1.3, sx: 0.12, sy: 2.6, sz: 0.12 }));
    t.add(mesh(GEO.box, '#ef6f6c', { y: 2.7, sx: 1.6, sy: 0.9, sz: 1.6 }));
    t.add(mesh(GEO.roof, '#fbf7ee', { y: 3.6, sx: 1.4, sy: 0.7, sz: 1.4, ry: Math.PI / 4 }));
    g.add(t);
    person(lg.x, lg.y + 3.2, lg.z, toSea(lg.x, lg.z), false).scale.setScalar(1.2);
  }
  // 後排：遊客中心（童話風館舍）和幾間小攤販
  const back = spots(2.2, 6, 5, 12);
  back.forEach((s, i) => {
    const o = i === 0 ? new THREE.Group() : TOWN.kiosk(R).g;
    if (i === 0) {
      storyHall(o, { w: 14, d: 9, color: '#f6eedb' }, 1, new THREE.MeshStandardMaterial({ color: '#9fb2d6', roughness: 0.35 }));
      const sign = mesh(GEO.box, '#3a8f8a', { y: 1.2, z: 5.2, sx: 4.4, sy: 0.9, sz: 0.12 });
      o.add(sign);
    } else o.scale.setScalar(1.3);
    o.position.set(s.x, s.y, s.z);
    o.rotation.y = toSea(s.x, s.z);
    g.add(o);
  });
}

function buildTall(scene, R) {
  // 海面：PlaneGeometry 在 XY 平面，seaGeometry 錯開頂點後再轉平；低多邊形／中間版的三角面起伏見 ocean.js
  const sea = new THREE.Mesh(seaGeometry(1000, 1120, rng(5)).rotateX(-Math.PI / 2).translate(PARK.x, 0, PARK.z),
    seaMaterial(new THREE.MeshStandardMaterial({ color: TALL.sea, roughness: SHORE_ON ? 0.6 : OCEAN_ON ? 0.16 : 0.35, metalness: 0.05 }), { amp: FACETS ? 0.6 : 1, main: true }));
  sea.receiveShadow = true;
  scene.add(sea);
  const mats = new Map();
  const M = (c) => { const k = typeof c === 'string' ? c : c.getHexString(); if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, flatShading: true })); return mats.get(k); };
  // 冰的岩壁：亮一點、光滑、微微自發光
  // 極地島的岩壁像冰塊：半透明、兩面都畫（看得到另一側的冰壁），裡面再一塊淡藍的冰芯
  const iceMat = (c) => { const k = 'ice' + c.getHexString(); if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.15, metalness: 0.1, flatShading: true, emissive: c, emissiveIntensity: 0.25, transparent: true, opacity: 0.62, side: THREE.DoubleSide })); return mats.get(k); };
  const iceCore = new THREE.MeshStandardMaterial({ color: '#9fd6ec', roughness: 0.2, emissive: '#7fc4e0', emissiveIntensity: 0.3, transparent: true, opacity: 0.45, depthWrite: false });
  const shelfM = TALL.shelf.map((c, i) => seaMaterial(new THREE.MeshStandardMaterial({ color: c, roughness: OCEAN_ON ? 0.3 : 0.45, polygonOffset: true, polygonOffsetFactor: -1 - i, polygonOffsetUnits: -1 - i }), { amp: 0.45 - i * 0.2, foam: false })); // 淺灘的水紋淡一點
  for (const I of ISL.islands) {
    const small = !I.zone || I.flora;
    if (!SHORE_ON) for (const [d, m, y] of [[small ? 5 : 8, shelfM[0], 0.02], [small ? 2.2 : 3.2, shelfM[1], 0.04]]) {
      const sh = new THREE.Mesh(new THREE.ShapeGeometry(flatShape(offsetPoly(I.poly, d))).rotateX(-Math.PI / 2), m);
      sh.position.y = y;
      sh.receiveShadow = true;
      scene.add(sh);
    }
    // 岩壁：不是垂直擠出，而是往下越來越外擴的斜面；高的島（頂面離海 9 公尺以上）分三層、矮的分兩層，
    // 每層顏色明顯不同（像一層層的地層），層和層之間再往外多一小階
    const { top } = tallColors(I), Y = ISLE_H + I.h;
    const pal = STRATA[I.zone?.id] || STRATA.base;
    const CAP_H = 1.65; // 最上面加厚的草皮層（cap）
    const cuts = Y >= 9 ? [Y - CAP_H, Y * 0.62, Y * 0.28, SEA_FLOOR] : [Y - CAP_H, Math.min(Y - 2.4, Y * 0.42), SEA_FLOOR];
    const FLARE = 0.13, LEDGE = 0.35;
    let off = 0.1;
    for (let i = 0; i < cuts.length - 1; i++) {
      const y0 = cuts[i], y1 = cuts[i + 1], o0 = off, o1 = off + (y0 - y1) * FLARE;
      const ice = I.zone?.id === 'polar';
      const m = new THREE.Mesh(loftWall(offsetPoly(I.poly, o0), offsetPoly(I.poly, o1), y0, y1), ice ? iceMat(new THREE.Color(pal[i])) : M(new THREE.Color(pal[i])));
      m.castShadow = i === 0;
      m.receiveShadow = true;
      scene.add(m);
      // 層和層之間的小平台（往外多 LEDGE）
      if (i < cuts.length - 2) {
        const ring = loftWall(offsetPoly(I.poly, o1), offsetPoly(I.poly, o1 + LEDGE), y1, y1, true);
        const lm = new THREE.Mesh(ring, ice ? iceMat(new THREE.Color(pal[i + 1])) : M(new THREE.Color(pal[i + 1])));
        lm.receiveShadow = true;
        scene.add(lm);
      }
      off = o1 + LEDGE;
    }
    if (I.zone?.id === 'polar' && !I.flora) {
      const core = new THREE.ExtrudeGeometry(flatShape(offsetPoly(I.poly, -2.5)), { depth: Y - 1.5 - SEA_FLOOR, bevelEnabled: false });
      core.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(core, iceCore);
      m.position.y = SEA_FLOOR;
      m.renderOrder = -1;
      scene.add(m);
    }
    if (I.hill) {
      // 非洲島中央的小山丘：一圈圈的環，頂點高度照 hillAt（和地面高度一致）
      const H = I.hill, g = new THREE.RingGeometry(0.01, H.r, 28, 10).rotateX(-Math.PI / 2), pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, hillAt(H, pos.getX(i) + H.x, pos.getZ(i) + H.z) + 0.02);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: top, roughness: 0.95, flatShading: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      m.position.set(H.x, Y, H.z);
      m.receiveShadow = m.castShadow = true;
      scene.add(m);
    }
    // 頂層草皮：約 1.65 公尺厚，上下兩邊都倒最大範圍的圓角（倒角厚度＝一半高度，像一塊圓潤的餅），
    // 最寬處是下方島形往中心縮成 0.98 倍；頂點合併後重算法線，圓角是平滑的
    const RB = CAP_H / 2 - 0.02, shrink = I.poly.map(([x, z]) => [I.cx + (x - I.cx) * 0.98, I.cz + (z - I.cz) * 0.98]);
    const inner = offsetPoly(shrink, -RB);
    const cap0 = new THREE.ExtrudeGeometry(flatShape(inner), { depth: 0.04, bevelEnabled: true, bevelThickness: RB, bevelSize: RB, bevelSegments: 8, curveSegments: 1 });
    cap0.deleteAttribute('uv');
    cap0.deleteAttribute('normal');
    const cap = mergeVertices(cap0, 1e-3);
    cap.computeVertexNormals();
    cap.rotateX(-Math.PI / 2);
    const polarTop = I.zone?.id === 'polar' && !I.flora && new THREE.MeshStandardMaterial({ color: top, roughness: 0.6, emissive: '#dceef6', emissiveIntensity: 0.35 }); // 冰原頂面亮白
    const capMat = polarTop || new THREE.MeshStandardMaterial({ color: top, roughness: 0.92 });
    const cm = new THREE.Mesh(cap, capMat);
    cm.position.y = Y - 0.04 - RB; // 頂面剛好在 Y
    // 草皮層比下方小一圈：岩壁頂端和草皮之間補一圈平台
    const shelf = new THREE.Mesh(loftWall(inner, offsetPoly(I.poly, 0.1), Y - CAP_H, Y - CAP_H, true), I.zone?.id === 'polar' && !I.flora ? iceMat(new THREE.Color(pal[0])) : M(new THREE.Color(pal[0])));
    shelf.receiveShadow = true;
    scene.add(shelf);
    cm.castShadow = cm.receiveShadow = true;
    scene.add(cm);
  }

  // 極地島旁邊的海上漂著幾座冰山（冰河崩下來的），離岸 6～16 公尺、不擋水道
  const bergs = [];
  for (const I of ISL.islands) {
    if (I.zone?.id !== 'polar' || I.flora) continue;
    for (let i = 0, n = 0; i < 400 && n < 7; i++) {
      const a = R() * Math.PI * 2, d = I.rad + 4 + R() * 12, x = I.cx + Math.cos(a) * d, z = I.cz + Math.sin(a) * d, sz = 1.4 + R() * 2.2;
      if (!seaClear(x, z, sz + 3)) continue;
      n++;
      bergs.push({ p: [x, sz * 0.25, z], r: [R() * 0.3, R() * 6, R() * 0.3], s: [sz * 1.3, sz, sz], c: R() < 0.6 ? '#f4fbfe' : '#cfeaf5' });
      bergs.push({ p: [x + sz * 0.5, sz * 0.75, z], r: [0, R() * 6, 0], s: [sz * 0.6, sz * 0.8, sz * 0.6], c: '#eef8fc' });
    }
  }
  if (bergs.length) scene.add(instanced(GEO.ico, bergs, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2, flatShading: true, emissive: '#cfeaf5', emissiveIntensity: 0.3 })));

  // 連接：陡的是樓梯，園區之間的主要道路是白色石橋，其他是木板橋（繩索欄杆、橘色燈籠）
  const wood = ['#c09062', '#ad7f53'], post = mat('#8b6748'), rope = mat('#d8bf92'), stone = mat('#f3ead3'), stoneD = mat('#e3d5b2'), rail = mat('#fbf7ee');
  const lampMat = new THREE.MeshStandardMaterial({ color: TALL.lamp, emissive: '#ff8a3a', emissiveIntensity: 0.55, roughness: 0.6 });
  const lantern = (x, y, z) => { scene.add(mesh(GEO.box, null, { material: post, x, z, y: y + 0.7, sx: 0.14, sy: 1.4, sz: 0.14 })); scene.add(mesh(GEO.ico, null, { material: lampMat, x, z, y: y + 1.55, sx: 0.32, sy: 0.38, sz: 0.32, shadow: false })); };
  for (const b of ISL.bridges) {
    const [ax, az] = b.a, [bx, bz] = b.b, len = Math.hypot(bx - ax, bz - az);
    if (len < 1 || b.k1 <= b.k0) continue;
    const ux = (bx - ax) / len, uz = (bz - az) / len, ry = Math.atan2(-uz, ux), nx = -uz, nz = ux;
    const a0 = Math.max(0, b.k0 * len - 1), a1 = Math.min(len, b.k1 * len + 1), L2 = a1 - a0, mid = (a0 + a1) / 2;
    const y0 = ISLE_H + b.ha, y1 = ISLE_H + b.hb, rz = Math.atan2(y1 - y0, L2), span = L2 / Math.cos(rz);
    const yAt = (t) => y0 + ((y1 - y0) * Math.max(0, Math.min(L2, t - a0))) / L2;
    const P = (t, side = 0) => [ax + ux * t + nx * side, az + uz * t + nz * side];
    const W = b.width + 0.9;
    const piers = (gap, w, m) => { for (let t = a0 + gap * 0.6; t < a1 - gap * 0.4; t += gap) { const [x, z] = P(t), top = yAt(t) - 0.5; scene.add(mesh(GEO.box, null, { material: m, x, z, y: (top + SEA_FLOOR) / 2, sx: w, sy: top - SEA_FLOOR, sz: W - 0.3, ry })); } };
    if (b.kind === 'stairs') {
      // 樓梯：每段最多 9 階（約 2.7 公尺高），段和段之間一塊比較寬的轉折平台（底下有橋墩、旁邊一盞燈籠）；
      // 每段底下一塊斜的石板，兩側白色扶手
      const n = Math.max(4, Math.round(Math.abs(y1 - y0) / 0.3)), fl = Math.ceil(n / 9);
      const LL = Math.min(2.2, (L2 * 0.35) / Math.max(1, fl - 1)), run = (L2 - (fl - 1) * LL) / n;
      const segs = []; // 一段一段：[起點 t, 終點 t, 起點高度, 終點高度, 是不是平台]
      let t = a0, y = y0, done = 0;
      for (let k = 0; k < fl; k++) {
        const m = Math.round((n * (k + 1)) / fl) - done, ye = y + ((y1 - y0) * m) / n;
        segs.push([t, t + m * run, y, ye, false]);
        t += m * run; y = ye; done += m;
        if (k < fl - 1) { segs.push([t, t + LL, y, y, true]); t += LL; }
      }
      const rails = (ta, tb, ya, yb) => {
        const l = tb - ta, r2 = Math.atan2(yb - ya, l), sp = l / Math.cos(r2), tm = (ta + tb) / 2, ym = (ya + yb) / 2;
        for (const sd of [-1, 1]) {
          const [rx, rz2] = P(tm, (W / 2 - 0.1) * sd);
          scene.add(mesh(GEO.box, null, { material: rail, x: rx, z: rz2, y: ym + 0.95, sx: sp, sy: 0.12, sz: 0.12, ry, rz: r2 }));
          for (let q = ta + 0.3; q <= tb - 0.2; q += 1.6) { const [px, pz] = P(q, (W / 2 - 0.1) * sd); scene.add(mesh(GEO.box, null, { material: rail, x: px, z: pz, y: ya + ((yb - ya) * (q - ta)) / l + 0.5, sx: 0.14, sy: 0.9, sz: 0.14, ry, shadow: false })); }
        }
      };
      let li = 0;
      for (const [ta, tb, ya, yb, flat] of segs) {
        const l = tb - ta, tm = (ta + tb) / 2, [cx, cz] = P(tm);
        if (flat) {
          // 轉折平台：寬一點的石台、底下一根粗橋墩、外側一盞燈籠
          scene.add(mesh(GEO.box, null, { material: stone, x: cx, z: cz, y: ya - 0.3, sx: l + 0.1, sy: 0.6, sz: W + 0.8, ry }));
          scene.add(mesh(GEO.box, null, { material: stoneD, x: cx, z: cz, y: (ya - 0.6 + SEA_FLOOR) / 2, sx: Math.max(1, l * 0.6), sy: ya - 0.6 - SEA_FLOOR, sz: W, ry }));
          const [lx, lz] = P(tm, (W / 2 + 0.25) * (li++ % 2 ? 1 : -1)); // 燈籠左右輪流
          lantern(lx, ya, lz);
          rails(ta, tb, ya, ya);
          continue;
        }
        const m = Math.max(1, Math.round(l / run)), st = l / m, r2 = Math.atan2(yb - ya, l);
        for (let k = 0; k < m; k++) {
          const q = ta + (k + 0.5) * st, yy = ya + ((yb - ya) * (k + 0.5)) / m, [x, z] = P(q);
          scene.add(mesh(GEO.box, null, { material: k % 2 ? stone : stoneD, x, z, y: yy - 0.3, sx: st + 0.04, sy: 0.6, sz: W, ry }));
        }
        scene.add(mesh(GEO.box, null, { material: stoneD, x: cx, z: cz, y: (ya + yb) / 2 - 0.9, sx: l / Math.cos(r2), sy: 0.7, sz: W - 0.2, ry, rz: r2 }));
        rails(ta, tb, ya, yb);
      }
      if (fl === 1) piers(6, 1, stoneD);
    } else if (b.kind === 'stone') {
      // 石橋：厚橋面、矮牆、一排橋墩，兩頭立燈籠
      const [cx, cz] = P(mid);
      scene.add(mesh(GEO.box, null, { material: stone, x: cx, z: cz, y: yAt(mid) - 0.35, sx: span, sy: 0.7, sz: W, ry, rz }));
      for (const sd of [-1, 1]) { const [px, pz] = P(mid, (W / 2 - 0.15) * sd); scene.add(mesh(GEO.box, null, { material: stoneD, x: px, z: pz, y: yAt(mid) + 0.3, sx: span, sy: 0.6, sz: 0.3, ry, rz })); }
      piers(7, 1.4, stoneD);
      for (const t of [a0 + 0.6, a1 - 0.6]) for (const sd of [-1, 1]) { const [x, z] = P(t, (W / 2 + 0.3) * sd); lantern(x, yAt(t), z); }
    } else {
      // 木板橋：一片片木板、木柱和繩索欄杆，每隔幾根柱子掛一盞燈籠
      for (let t = a0, i = 0; t < a1; t += 0.6, i++) {
        const [x, z] = P(t + 0.3);
        scene.add(mesh(GEO.box, null, { material: mat(wood[i % 2]), x, z, y: yAt(t + 0.3) - 0.1, sx: 0.52, sy: 0.2, sz: W - 0.2 + (i % 3) * 0.1, ry, rz }));
      }
      for (const sd of [-1, 1]) {
        const [rx, rz2] = P(mid, (W / 2 - 0.05) * sd);
        scene.add(mesh(GEO.box, null, { material: rope, x: rx, z: rz2, y: yAt(mid) + 0.85, sx: span, sy: 0.07, sz: 0.07, ry, rz }));
        let k = 0;
        for (let t = a0 + 0.2; t <= a1; t += 2.2, k++) {
          const [px, pz] = P(t, (W / 2 - 0.05) * sd);
          if (k % 2 === 1 && sd > 0) lantern(px, yAt(t), pz);
          else scene.add(mesh(GEO.box, null, { material: post, x: px, z: pz, y: yAt(t) + 0.45, sx: 0.16, sy: 1.1, sz: 0.16, ry }));
        }
      }
      piers(5, 0.35, post);
    }
  }

  // 海上的裝飾小島（不接橋）：有的有小房子、有的只有草皮、有的只是一片沙洲。先擺，船會避開（seaClear 會看 ISL.decor）
  ISL.decor = [];
  for (let i = 0, n = 0; i < 1500 && n < 14; i++) {
    const x = PARK.x + (R() * 2 - 1) * PARK.rx * 0.85, z = PARK.z + (R() * 2 - 1) * PARK.rz * 0.85, r = 2.5 + R() * 3.5;
    if (!seaClear(x, z, r + 9) || ISL.decor.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r + 18)) continue;
    const kind = n % 3; // 0：小房子 1：草皮 2：沙洲
    n++;
    ISL.decor.push({ x, z, r });
    const g = new THREE.Group(), sx = 0.8 + R() * 0.4, sz = 0.8 + R() * 0.4, ry = R() * 6, top = kind === 2 ? 0.5 : 1.3 + R() * 0.8;
    const disc = (rr, h, y, c) => g.add(mesh(new THREE.CylinderGeometry(rr, rr * 1.08, h, 9), c, { y, sx, sz, ry }));
    disc(r + 1.2, 0.3, 0.1, '#f2e2b8'); // 一圈淺色沙灘
    if (kind === 2) disc(r, top, top / 2, '#ecd49a');
    else {
      disc(r, top - 0.3, (top - 0.3) / 2, STRATA.base[0]);
      disc(r * 0.98, 0.35, top - 0.15, '#b8d58a');
      for (let k = 0; k < 2 + R() * 3; k++) { const a = R() * 6.3, rr = R() * r * 0.7; g.add(mesh(GEO.ico, ['#7fb35a', '#6fa65a', '#9cc26a'][k % 3], { x: Math.cos(a) * rr, z: Math.sin(a) * rr, y: top + 0.25, sx: 0.6, sy: 0.45, sz: 0.6 })); }
    }
    if (kind === 0) {
      const { g: h } = TOWN.cottage(R);
      h.position.y = top; h.rotation.y = R() * 6; h.scale.setScalar(0.85);
      g.add(h);
      g.add(mesh(GEO.cyl, '#7a5a3e', { x: r * 0.55, y: top + 1, sx: 0.25, sy: 2, sz: 0.25 }));
      g.add(mesh(GEO.ico, '#5f9a52', { x: r * 0.55, y: top + 2.4, sx: 1.1, sy: 1.3, sz: 1.1 }));
    } else if (kind === 2 && R() < 0.6) g.add(mesh(GEO.ico, '#c9b68a', { x: r * 0.3, y: top + 0.2, sx: 0.7, sy: 0.4, sz: 0.6 })); // 沙洲上一顆石頭
    g.position.set(x, 0, z);
    scene.add(g);
  }

  bakeShore();

  // ---- 交通工具：帆船、渡輪、飛機、熱氣球；天上一朵朵立體的雲 ----
  const boats = sailboats(scene, R, seaClear, 8);
  const movers = [];
  const buses = viaducts(scene, R, movers, { stone, stoneD, rail, lampMat });
  const giants = seaGiants(scene, seaClear);
  movers.push(giants);
  // 渡輪：沿著島和島之間的水道繞一圈（航線上的點都要離岸、離橋 5 公尺以上）
  for (let f = 0; f < 3; f++) {
    let curve = null;
    for (let tr = 0; tr < 60 && !curve; tr++) {
      const pts = [], k = 0.5 + R() * 0.35, n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + R() * 0.3;
        let r = k;
        while (r < 0.88 && !seaClear(PARK.x + Math.cos(a) * PARK.rx * r, PARK.z + Math.sin(a) * PARK.rz * r, 7)) r += 0.02;
        pts.push(new THREE.Vector3(PARK.x + Math.cos(a) * PARK.rx * r, 0, PARK.z + Math.sin(a) * PARK.rz * r));
      }
      const c = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      if (c.getSpacedPoints(160).every((p) => seaClear(p.x, p.z, 4))) curve = c;
    }
    if (!curve) continue;
    const g = new THREE.Group();
    g.add(mesh(GEO.box, '#fbf7ee', { y: 0.45, sx: 6.4, sy: 1, sz: 2.4 }));
    g.add(mesh(GEO.box, TALL.terra, { y: 0.95, sx: 6.5, sy: 0.18, sz: 2.45, shadow: false }));
    g.add(mesh(GEO.box, '#f3ead3', { x: -0.6, y: 1.65, sx: 3.2, sy: 1.2, sz: 2 }));
    g.add(mesh(GEO.box, null, { material: LIGHTS.win, x: -0.6, y: 1.8, sx: 3.25, sy: 0.4, sz: 2.05, shadow: false }));
    g.add(mesh(GEO.box, '#6f9a5a', { x: -0.6, y: 2.35, sx: 3.6, sy: 0.18, sz: 2.3 }));
    g.add(mesh(GEO.cyl, TALL.terra, { x: -1.6, y: 2.9, sx: 0.4, sy: 1.1, sz: 0.4 }));
    light(g, 0.8, 2.75, 0, '#fff4d6', 2.6);
    light(g, 2.6, 1.15, 1.3, '#ff5a4a', 1.8); light(g, 2.6, 1.15, -1.3, '#5aff8a', 1.8);
    g.userData.dynamic = true;
    scene.add(g);
    const len = curve.getLength(), sp = 3.5 + R() * 1.5, ph = R();
    const p = new THREE.Vector3(), tg = new THREE.Vector3();
    movers.push((t) => {
      const u = (ph + (t * sp) / len) % 1;
      curve.getPointAt(u, p); curve.getTangentAt(u, tg);
      g.position.set(p.x, Math.sin(t * 1.4 + ph * 9) * 0.1, p.z);
      g.rotation.set(Math.sin(t * 1.1 + ph * 7) * 0.03, Math.atan2(-tg.z, tg.x), 0);
    });
  }
  // 外海的大船：郵輪、貨輪沿著群島外圍的外海航行。群島有些地方貼近外海邊緣繞不了一圈，
  // 所以取外海最長的一段空曠水域，船在兩頭之間來回開（到頭就掉頭）
  const outerRun = (k0, clear, skip = null) => {
    const n = 90, rs = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      let r = k0;
      while (r > 0.62 && !seaClear(PARK.x + Math.cos(a) * PARK.rx * r, PARK.z + Math.sin(a) * PARK.rz * r, clear)) r -= 0.01;
      rs.push(r > 0.62 && !(skip && skip(i, n)) ? r : null);
    }
    // 最長一段連續可用的角度（頭尾相接也算）
    let best = [0, 0];
    for (let i = 0; i < n; i++) {
      if (rs[i] === null || rs[(i - 1 + n) % n] !== null) continue;
      let j = i;
      while (rs[(j + 1) % n] !== null && j - i < n - 1) j++;
      if (j - i > best[1] - best[0]) best = [i, j];
    }
    for (let trim = 0; trim < 20 && best[1] - best[0] > 8; trim++) {
      const pts = [];
      for (let i = best[0] + trim; i <= best[1] - trim; i++) { const k = i % n, a = (k / n) * Math.PI * 2, r = rs[k]; pts.push(new THREE.Vector3(PARK.x + Math.cos(a) * PARK.rx * r, 0, PARK.z + Math.sin(a) * PARK.rz * r)); }
      const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      if (c.getSpacedPoints(300).every((p) => seaClear(p.x, p.z, clear * 0.45))) return { c, i0: best[0] + trim, i1: best[1] - trim, n };
    }
    return null;
  };
  const sail = (g, curve, sp, bob = 0.06, loop = false) => {
    g.userData.dynamic = true;
    scene.add(g);
    const len = curve.getLength(), ph = R(), p = new THREE.Vector3(), tg = new THREE.Vector3();
    movers.push((t) => {
      const w = (ph + (t * sp) / len) % 2, back = !loop && w > 1, u = loop ? w % 1 : back ? 2 - w : w; // 來回：0→1 再 1→0（繞圈的就一直往前）
      curve.getPointAt(u, p); curve.getTangentAt(u, tg);
      if (back) tg.negate();
      g.position.set(p.x, Math.sin(t * 0.9 + ph * 9) * bob, p.z);
      g.rotation.set(Math.sin(t * 0.7 + ph * 7) * bob * 0.3, Math.atan2(-tg.z, tg.x), 0);
    });
  };
  const runA = outerRun(0.88, 14);
  // 貨輪走另一段（避開郵輪那段的角度），沒有的話就和郵輪同一段但內側一點
  const inA = (i, n) => runA && ((i - runA.i0 + n) % n) <= ((runA.i1 - runA.i0 + n) % n);
  const runB = outerRun(0.86, 14, inA) || outerRun(0.8, 14);
  {
    // 郵輪：白色長船身、深藍船底、三層甲板（一排排小窗）、紅色煙囪、船頭尖
    const g = new THREE.Group();
    g.add(mesh(GEO.box, '#2f4a6a', { y: 0.6, sx: 30, sy: 1.6, sz: 6 }));
    g.add(mesh(GEO.box, '#fbf7ee', { y: 2.4, sx: 30, sy: 2, sz: 6 }));
    g.add(mesh(GEO.prism, '#fbf7ee', { x: 16.2, y: 2.4, sx: 2.6, sy: 1.33, sz: 3.47, rz: -Math.PI / 2 }));
    g.add(mesh(GEO.prism, '#2f4a6a', { x: 16.2, y: 0.6, sx: 1.6, sy: 1.33, sz: 3.47, rz: -Math.PI / 2 }));
    for (let d = 0; d < 3; d++) {
      const w = 22 - d * 5, x = -2 - d * 1.2, y = 4.2 + d * 1.6;
      g.add(mesh(GEO.box, '#fbf7ee', { x, y, sx: w, sy: 1.6, sz: 5.2 - d * 0.6 }));
      g.add(mesh(GEO.box, null, { material: LIGHTS.win, x, y: y + 0.15, sx: w + 0.05, sy: 0.45, sz: 5.25 - d * 0.6, shadow: false }));
    }
    g.add(mesh(GEO.box, null, { material: LIGHTS.win, y: 2.6, sx: 30.05, sy: 0.4, sz: 6.05, shadow: false }));
    g.add(mesh(GEO.box, '#d65a3a', { x: -8, y: 9.4, sx: 2.6, sy: 3, sz: 2.2 }));
    g.add(mesh(GEO.box, '#2f2a26', { x: -8, y: 11, sx: 2.7, sy: 0.4, sz: 2.3 }));
    g.add(mesh(GEO.box, '#5fb8c8', { x: 6, y: 3.45, sx: 4, sy: 0.12, sz: 3, shadow: false })); // 甲板上的泳池
    for (let x = -12; x <= 14; x += 3.25) halo(g, x, 3.6, 0, '#ffe2a0', 2.6); // 甲板上一串燈
    light(g, -8, 11.8, 0, '#fff4d6', 3.5); light(g, 16.5, 3.6, 0, '#fff4d6', 3);
    light(g, 13, 3.5, 3.1, '#ff5a4a', 2.4); light(g, 13, 3.5, -3.1, '#5aff8a', 2.4);
    if (runA) sail(g, runA.c, 2.2, 0.04);
  }
  {
    // 貨輪：深紅船身、船尾白色駕駛樓，甲板上堆滿彩色貨櫃
    const g = new THREE.Group(), cols = ['#d65a3a', '#3f7f8a', '#f2c94c', '#6f9a5a', '#5f9fae', '#e98a5a'];
    g.add(mesh(GEO.box, '#9a3a32', { y: 0.9, sx: 28, sy: 2.4, sz: 5.6 }));
    g.add(mesh(GEO.box, '#2f2a26', { y: 0.05, sx: 28, sy: 0.5, sz: 5.6 }));
    g.add(mesh(GEO.prism, '#9a3a32', { x: 15.1, y: 0.9, sx: 2.4, sy: 1.25, sz: 3.24, rz: -Math.PI / 2 }));
    const boxes = [];
    for (let x = -6; x <= 10; x += 2.7) for (const z of [-1.4, 1.4]) for (let y = 0; y < 1 + Math.floor(R() * 3); y++) boxes.push({ p: [x, 2.65 + y * 1.3, z], s: [2.5, 1.25, 2.6], c: cols[Math.floor(R() * cols.length)] });
    g.add(instanced(GEO.box, boxes, mat('#ffffff')));
    g.add(mesh(GEO.box, '#fbf7ee', { x: -11, y: 4, sx: 3.4, sy: 4, sz: 5 }));
    g.add(mesh(GEO.box, null, { material: LIGHTS.win, x: -11, y: 5.4, sx: 3.45, sy: 0.6, sz: 5.05, shadow: false }));
    g.add(mesh(GEO.box, '#2f2a26', { x: -12, y: 7, sx: 1, sy: 2, sz: 1 }));
    light(g, -11, 8.4, 0, '#fff4d6', 3.2); light(g, 15.6, 2.4, 0, '#fff4d6', 2.6);
    light(g, -9.2, 4.6, 2.6, '#ff5a4a', 2); light(g, -9.2, 4.6, -2.6, '#5aff8a', 2);
    if (runB) sail(g, runB.c, 2.8, 0.04);
  }
  // 漁船：小小的藍白漁船在外海原地慢慢繞小圈，船尾一根桅桿掛著漁網
  for (let f = 0, tries = 0; f < 5 && tries < 400; tries++) {
    const a = R() * Math.PI * 2, r = 0.7 + R() * 0.25, x = PARK.x + Math.cos(a) * PARK.rx * r, z = PARK.z + Math.sin(a) * PARK.rz * r;
    if (!seaClear(x, z, 12)) continue;
    f++;
    const g = new THREE.Group(), hull = ['#3f7f8a', '#d65a3a', '#5f9fae'][f % 3];
    g.add(mesh(GEO.box, hull, { y: 0.35, sx: 5, sy: 0.9, sz: 1.9 }));
    g.add(mesh(GEO.prism, hull, { x: 2.9, y: 0.35, sx: 0.9, sy: 0.6, sz: 1.1, rz: -Math.PI / 2 }));
    g.add(mesh(GEO.box, '#fbf7ee', { y: 0.85, sx: 5.05, sy: 0.15, sz: 1.95, shadow: false }));
    g.add(mesh(GEO.box, '#fbf7ee', { x: 0.6, y: 1.5, sx: 1.6, sy: 1.2, sz: 1.4 }));
    g.add(mesh(GEO.box, null, { material: LIGHTS.win, x: 0.6, y: 1.7, sx: 1.65, sy: 0.35, sz: 1.45, shadow: false }));
    g.add(mesh(GEO.box, '#8b6748', { x: -1.6, y: 2.3, sx: 0.12, sy: 3.2, sz: 0.12 }));
    g.add(mesh(GEO.box, '#8b6748', { x: -2.4, y: 3.4, sx: 1.6, sy: 0.08, sz: 0.08, rz: -0.5 }));
    g.add(mesh(GEO.box, '#e8d9a8', { x: -2.9, y: 2.2, sx: 0.8, sy: 1.8, sz: 0.06, shadow: false })); // 漁網
    light(g, -1.6, 4, 0, '#ffb35a', 3); // 集魚燈
    light(g, 0.6, 2.3, 0, '#fff4d6', 1.8);
    const c = new THREE.CatmullRomCurve3(Array.from({ length: 6 }, (_, i) => { const b = (i / 6) * Math.PI * 2; return new THREE.Vector3(x + Math.cos(b) * 7, 0, z + Math.sin(b) * 5); }), true);
    sail(g, c, 0.8 + R() * 0.5, 0.12, true);
  }
  // 小飛機：在群島上空繞大圈、轉彎時機身傾斜，螺旋槳一直轉；第二架拖著一面布條
  for (let k = 0; k < 2; k++) {
    const g = new THREE.Group(), body = new THREE.Group();
    g.add(body);
    const S = 1.6;
    body.add(mesh(GEO.box, '#fbf7ee', { sx: 4.2 * S, sy: 1 * S, sz: 1 * S }));
    body.add(mesh(GEO.box, TALL.terra, { x: 2.2 * S, sx: 0.5 * S, sy: 0.9 * S, sz: 0.9 * S }));
    body.add(mesh(GEO.box, k ? '#6f9a5a' : TALL.terra, { x: 0.4 * S, y: 0.2 * S, sx: 1.3 * S, sy: 0.14 * S, sz: 7.5 * S }));
    body.add(mesh(GEO.box, k ? '#6f9a5a' : TALL.terra, { x: -1.9 * S, y: 0.15 * S, sx: 0.7 * S, sy: 0.1 * S, sz: 2.6 * S }));
    body.add(mesh(GEO.box, '#fbf7ee', { x: -1.9 * S, y: 0.75 * S, sx: 0.7 * S, sy: 1.2 * S, sz: 0.12 * S }));
    body.add(mesh(GEO.box, null, { material: LIGHTS.win, x: 1 * S, y: 0.45 * S, sx: 0.8 * S, sy: 0.35 * S, sz: 0.8 * S, shadow: false }));
    light(body, 0.4 * S, 0.25 * S, 3.8 * S, '#ff5a4a', 2.2); light(body, 0.4 * S, 0.25 * S, -3.8 * S, '#5aff8a', 2.2); light(body, -1.9 * S, 1.4 * S, 0, '#fff4d6', 2);
    const prop = mesh(GEO.box, '#5a4636', { x: 2.5 * S, sx: 0.08 * S, sy: 2.4 * S, sz: 0.22 * S, shadow: false });
    body.add(prop);
    if (k) {
      body.add(mesh(GEO.box, '#d8bf92', { x: -6 * S, sx: 7 * S, sy: 0.04, sz: 0.04, shadow: false }));
      body.add(mesh(GEO.box, '#fbf7ee', { x: -12 * S, sx: 5 * S, sy: 1.6 * S, sz: 0.06, shadow: false }));
      body.add(mesh(GEO.box, TALL.terra, { x: -12 * S, y: 0.85 * S, sx: 5 * S, sy: 0.12 * S, sz: 0.08, shadow: false }));
      body.add(mesh(GEO.box, TALL.terra, { x: -12 * S, y: -0.85 * S, sx: 5 * S, sy: 0.12 * S, sz: 0.08, shadow: false }));
    }
    g.userData.dynamic = true;
    scene.add(g);
    const rad = (k ? 0.3 : 0.42) * Math.min(PARK.rx, PARK.rz), alt = k ? 34 : 42, sp = (k ? 0.05 : -0.07); // 低一點、圈子小一點，全景時看得到
    movers.push((t) => {
      const a = t * sp + k * 2.5;
      g.position.set(PARK.x + Math.cos(a) * rad, alt + Math.sin(t * 0.5 + k) * 2, PARK.z + Math.sin(a) * rad * 0.8);
      g.rotation.y = Math.atan2(-Math.cos(a) * 0.8, -Math.sin(a)) + (sp < 0 ? Math.PI : 0);
      body.rotation.x = (sp < 0 ? 0.25 : -0.25);
      prop.rotation.x = t * 30;
    });
  }
  // 熱氣球：橘、綠、奶油色的條紋氣球，慢慢上下飄
  const envGeo = new THREE.SphereGeometry(1, 10, 8);
  [[TALL.terra, '#fbf7ee'], ['#6f9a5a', '#f3d58a'], ['#f3d58a', TALL.terra]].forEach(([c1, c2], k) => {
    const g = new THREE.Group();
    g.add(mesh(envGeo, c1, { y: 4.2, sx: 3, sy: 3.4, sz: 3 }));
    g.add(mesh(GEO.cyl, c2, { y: 4.2, sx: 3.08, sy: 1.1, sz: 3.08, shadow: false }));
    g.add(mesh(GEO.cyl, c2, { y: 1.6, sx: 1.2, sy: 0.9, sz: 1.2, shadow: false }));
    g.add(mesh(GEO.box, '#8b6748', { y: -0.4, sx: 1.1, sy: 0.8, sz: 1.1 }));
    for (const [dx, dz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) g.add(mesh(GEO.box, '#5a4636', { x: dx, z: dz, y: 0.55, sx: 0.04, sy: 1.3, sz: 0.04, shadow: false }));
    light(g, 0, 0.9, 0, '#ffa64a', 2.6); // 燃燒器的火
    halo(g, 0, 3.4, 0, '#ffb466', 9); // 晚上氣球被火光從裡面照亮
    g.scale.setScalar(1.6);
    g.userData.dynamic = true;
    scene.add(g);
    const a0 = R() * 6.3, r0 = (0.25 + R() * 0.35) * Math.min(PARK.rx, PARK.rz), y0 = 34 + R() * 18;
    movers.push((t) => {
      const a = a0 + t * 0.012;
      g.position.set(PARK.x + Math.cos(a) * r0, y0 + Math.sin(t * 0.3 + k * 2) * 3, PARK.z + Math.sin(a) * r0);
    });
  });
  // 空中小島（裝飾，不接橋）：倒圓錐的岩石底（三層地層色）、草皮頂，上面有的只種樹、有的有一間小房子，慢慢上下飄
  const sky = [];
  for (let i = 0, n = 0; i < 600 && n < 7; i++) {
    const a = R() * Math.PI * 2, k = 0.45 + R() * 0.5, x = PARK.x + Math.cos(a) * PARK.rx * k, z = PARK.z + Math.sin(a) * PARK.rz * k, r = 4 + R() * 3.5;
    if (ISL.islands.some((I) => Math.hypot(x - I.cx, z - I.cz) < I.rad + r + 4) || sky.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r + 30)) continue;
    n++;
    sky.push({ x, z, r });
    const g = new THREE.Group(), pal = STRATA.base;
    [[1, 0.9], [0.78, 1.6], [0.5, 2.2]].forEach(([w, h], j) => {
      const y = -[0, 0.9, 2.5][j] - h / 2;
      g.add(mesh(new THREE.CylinderGeometry(r * w, r * w * 0.72, h, 7), pal[j], { y, ry: R() * 3 }));
    });
    g.add(mesh(new THREE.ConeGeometry(r * 0.38, 3.2, 7), pal[2], { y: -6.2, rx: Math.PI }));
    g.add(mesh(new THREE.CylinderGeometry(r * 1.04, r, 0.5, 7), '#b8d58a', { y: 0.2 }));
    const kind = n % 3; // 0：只有樹 1：小房子＋樹 2：風車小屋
    const tree = (tx, tz, s2) => {
      g.add(mesh(GEO.cyl, '#7a5a3e', { x: tx, z: tz, y: 0.45 + 1 * s2, sx: 0.3 * s2, sy: 2 * s2, sz: 0.3 * s2 }));
      g.add(mesh(R() < 0.5 ? GEO.cone : GEO.ico, ['#5f9a52', '#6fa65a', TALL.terra, '#f2a53a'][Math.floor(R() * 4)], { x: tx, z: tz, y: 0.45 + 2.6 * s2, sx: 1.2 * s2, sy: 1.6 * s2, sz: 1.2 * s2 }));
    };
    if (kind) { const { g: h } = TOWN[kind === 1 ? 'cottage' : 'windmill'](R, []); h.position.y = 0.45; h.rotation.y = R() * 6; h.scale.setScalar(kind === 1 ? 1 : 0.8); g.add(h); }
    for (let t = 0; t < (kind ? 2 : 4); t++) { const aa = R() * 6.3, rr = (kind ? 0.6 : 0.2 + R() * 0.45) * r; tree(Math.cos(aa) * rr, Math.sin(aa) * rr, 0.8 + R() * 0.5); }
    g.userData.dynamic = true;
    scene.add(g);
    const y0 = 26 + R() * 16, ph = R() * 6;
    movers.push((t) => { g.position.set(x, y0 + Math.sin(t * 0.4 + ph) * 1.2, z); g.rotation.y = Math.sin(t * 0.05 + ph) * 0.2; });
  }
  // 立體雲：一團團圓滾滾的白雲，放在海和岸地的上空（不擋住島），會投下淡淡的影子
  const puffs = [];
  for (let i = 0, n = 0; i < 4000 && n < 26; i++) {
    const x = PARK.x + (R() * 2 - 1) * (PARK.rx + 60), z = PARK.z + (R() * 2 - 1) * (PARK.rz + 60), r = 5 + R() * 6;
    if (ISL.islands.some((I) => Math.hypot(x - I.cx, z - I.cz) < I.rad + r + 10) || sky.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r + 8)) continue;
    n++;
    const y = 40 + R() * 30;
    for (let k = 0; k < 5 + R() * 4; k++) {
      const s = r * (0.4 + R() * 0.45), dx = (R() - 0.5) * r * 2, dz = (R() - 0.5) * r * 1.2;
      puffs.push({ p: [x + dx, y + s * 0.3 - Math.abs(dx) * 0.15, z + dz], s: [s, s * 0.85, s], c: R() < 0.6 ? '#ffffff' : '#f6f4ee' });
    }
  }
  const clouds = instanced(new THREE.IcosahedronGeometry(1, 1), puffs, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#fffaf0', emissiveIntensity: 0.3 }));
  clouds.receiveShadow = false;
  clouds.userData.dynamic = true;
  scene.add(clouds);
  movers.push((t) => { clouds.position.x = Math.sin(t * 0.015) * 14; });
  if (ISL.beach) beach(scene, R, movers);
  // 星星：晚上才出現，散在高空的半球上
  const sp = [];
  for (let i = 0; i < 700; i++) {
    const a = R() * Math.PI * 2, e = 0.15 + R() * 1.3, r = 700;
    sp.push(PARK.x + Math.cos(a) * Math.cos(e) * r, 120 + Math.sin(e) * r * 0.6, PARK.z + Math.sin(a) * Math.cos(e) * r);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#fffbe8', size: 2.2, sizeAttenuation: false, fog: false }));
  stars.visible = false;
  stars.userData.dynamic = true;
  scene.add(stars);
  return {
    giants, // 開發用（?debug）
    update(t) { boats.update(t); for (const m of movers) m(t); },
    night(on) {
      for (const g of buses) g.visible = !on; // 晚上巴士收班
      stars.visible = on;
      for (const b of NIGHT.beams) b.visible = on;
      NIGHT.beacon.emissiveIntensity = on ? 2.6 : 0.7;
      lampMat.emissiveIntensity = on ? 2.4 : 0.55;
      clouds.material.emissiveIntensity = on ? 0.03 : 0.3; // 晚上的雲不要發亮
      giants.night(on);
      setLights(on);
    },
  };
}
// 海上的巨大生物：鯨魚、海豚群、鯨鯊、大王烏賊、哥吉拉，不定時從海面冒出來一隻（一次最多兩隻）
// 每隻都是方塊堆的模型，平常藏在不透明的海面下；出場時沿著一個方向游一段，演完沉回海裡
function seaGiants(scene, clearSea) {
  const B = (g, c, sx, sy, sz, x = 0, y = 0, z = 0, o = {}) => { const m = mesh(GEO.box, c, { x, y, z, sx, sy, sz, ...o }); g.add(m); return m; };
  const foam = mat('#ffffff', { transparent: true, opacity: 0.85 });
  // 浪花：一圈白色碎塊，在水面上往外擴散後消失
  const splash = () => {
    const g = new THREE.Group();
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; B(g, null, 0.5, 0.35, 0.5, Math.cos(a), 0.15, Math.sin(a), { material: foam, ry: a, shadow: false }); }
    g.visible = false;
    return g;
  };
  // 鯨魚（座頭鯨）：長 16 公尺，頭朝 +x
  const whale = () => {
    const g = new THREE.Group(), dark = '#3e5566', belly = '#d7dee2';
    B(g, dark, 11, 3.2, 3.8, 0, 0, 0); B(g, dark, 4, 2.6, 3.2, 6.8, -0.2, 0); B(g, belly, 9, 0.6, 3, 1.5, -1.7, 0);
    B(g, dark, 3.4, 1.8, 2.2, -6.6, 0.2, 0); B(g, dark, 2.6, 1.2, 1.4, -9.4, 0.3, 0);
    const tail = new THREE.Group(); tail.position.set(-10.6, 0.3, 0); g.add(tail);
    B(tail, dark, 1.6, 0.35, 5.6, -0.9, 0, 0); B(tail, dark, 1, 0.3, 2, -1.6, 0, 2.4); B(tail, dark, 1, 0.3, 2, -1.6, 0, -2.4);
    for (const s of [1, -1]) B(g, dark, 1.4, 0.3, 4.2, 4, -1.2, s * 3.6, { ry: s * 0.4, rx: s * 0.3 }); // 長長的胸鰭
    B(g, '#1d262c', 0.5, 0.5, 0.5, 8.2, 0.4, 1.6); B(g, '#1d262c', 0.5, 0.5, 0.5, 8.2, 0.4, -1.6);
    const spout = new THREE.Group(); spout.position.set(5.4, 1.6, 0); g.add(spout);
    for (let k = 0; k < 6; k++) B(spout, null, 0.7 + k * 0.25, 1.2, 0.7 + k * 0.25, 0, 0.6 + k * 1.1, 0, { material: foam, shadow: false });
    spout.visible = false;
    return { g, tail, spout, len: 16 };
  };
  const dolphin = () => {
    const g = new THREE.Group(), c = '#7f97a8';
    B(g, c, 2.4, 0.8, 0.8, 0, 0, 0); B(g, c, 0.8, 0.3, 0.3, 1.5, -0.15, 0); B(g, '#e4eaee', 2, 0.25, 0.6, 0.1, -0.35, 0);
    B(g, c, 0.6, 0.7, 0.18, -0.1, 0.6, 0, { rz: 0.5 }); B(g, c, 1, 0.5, 0.5, -1.6, 0.05, 0); B(g, c, 0.5, 0.12, 1.4, -2.2, 0.05, 0);
    B(g, '#1d262c', 0.12, 0.12, 0.12, 1, 0.1, 0.38); B(g, '#1d262c', 0.12, 0.12, 0.12, 1, 0.1, -0.38);
    g.scale.setScalar(1.6);
    return g;
  };
  const shark = () => {
    const g = new THREE.Group(), c = '#4a5e74';
    B(g, c, 10, 2.2, 3.4, 0, 0, 0); B(g, c, 1.4, 1.8, 3.8, 5.6, -0.1, 0); B(g, '#e6ecef', 8, 0.4, 2.8, 0.6, -1.2, 0);
    B(g, c, 2.2, 2.2, 0.4, -0.6, 1.9, 0, { rz: 0.45 }); B(g, c, 3, 1.4, 1.6, -6.4, 0.1, 0);
    const tail = new THREE.Group(); tail.position.set(-8, 0.1, 0); g.add(tail);
    B(tail, c, 1.2, 4.4, 0.4, -0.6, 0.8, 0, { rz: -0.4 });
    for (const s of [1, -1]) B(g, c, 2, 0.3, 2.6, 2, -0.9, s * 2.4, { ry: s * 0.5 });
    for (let k = 0; k < 26; k++) { const x = -5 + (k % 9) * 1.15, z = (Math.floor(k / 9) - 1) * 1.1 + ((k * 7) % 3 - 1) * 0.2; B(g, '#f4f1e6', 0.32, 0.12, 0.32, x, 1.12, z, { shadow: false }); }
    return { g, tail, len: 12 };
  };
  const squid = () => {
    const g = new THREE.Group(), c = '#d0624f', d = '#a8433a';
    B(g, c, 2.6, 7, 2.6, 0, 4.6, 0); B(g, d, 4.2, 1.6, 0.4, 0, 8.4, 0); B(g, c, 3, 1.8, 3, 0, 0.6, 0);
    for (const s of [1, -1]) { B(g, '#fff6e0', 0.9, 0.9, 0.3, 0.8 * s, 0.9, 1.5); B(g, '#1d262c', 0.45, 0.45, 0.2, 0.8 * s, 0.9, 1.62); }
    const arms = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, arm = new THREE.Group();
      arm.position.set(Math.cos(a) * 1, -0.2, Math.sin(a) * 1); arm.rotation.y = -a;
      let node = arm;
      for (let s = 0; s < 4; s++) { const j = new THREE.Group(); if (s) j.position.x = 1.5; B(j, s % 2 ? d : c, 1.6, 0.5 - s * 0.08, 0.5 - s * 0.08, 0.8, 0, 0); node.add(j); node = j; }
      g.add(arm); arms.push(arm);
    }
    return { g, arms };
  };
  // 哥吉拉：站著從海裡升起，背鰭晚上會發藍光
  const plateMat = new THREE.MeshStandardMaterial({ color: '#cfd8c4', roughness: 0.6, flatShading: true, emissive: '#5fc8ff', emissiveIntensity: 0 });
  const godzilla = () => {
    const g = new THREE.Group(), c = '#56675a', d = '#3a463c';
    B(g, c, 7, 14, 6, 0, 7, 0); B(g, '#59675a', 4.6, 10, 0.6, 1.2, 7, 3, { rx: 0.08 }); // 身體、肚子
    B(g, c, 5, 6, 4.4, 0.5, 15.8, 0.6); // 脖子
    const head = new THREE.Group(); head.position.set(0.5, 19.4, 1.2); g.add(head);
    B(head, c, 4, 3, 5.4, 0, 0, 1.2); B(head, '#f2e6c8', 0.5, 0.6, 0.5, 1.2, 0.6, 3.4); B(head, '#f2e6c8', 0.5, 0.6, 0.5, -1.2, 0.6, 3.4);
    B(head, '#ffdd55', 0.5, 0.4, 0.3, 1.5, 0.7, 3.2, { shadow: false }); B(head, '#ffdd55', 0.5, 0.4, 0.3, -1.5, 0.7, 3.2, { shadow: false });
    const jaw = new THREE.Group(); jaw.position.set(0, -1.4, -0.6); head.add(jaw);
    B(jaw, d, 3.4, 1.1, 4.8, 0, -0.4, 2.2);
    for (const s of [1, -1]) {
      const arm = B(g, c, 1.6, 4.6, 1.6, s * 4, 11, 2.2, { rx: -0.9, rz: s * 0.2 });
      arm.userData.s = s;
      B(g, c, 3, 9, 3.4, s * 2.6, 0, 0); // 腿（多半在水裡）
    }
    B(g, c, 3, 3, 9, 0, 1.5, -6, { rx: -0.25 }); // 尾巴
    for (let k = 0; k < 7; k++) { const y = 3 + k * 2.6, s = 1 + Math.sin((k / 6) * Math.PI) * 1.4; B(g, null, 0.6, 2.2 * s, 1.8 * s, 0, y, -3.4, { material: plateMat, rx: -0.3 }); }
    g.rotation.y = 0;
    return { g, head, jaw };
  };

  const build = { whale, dolphins: () => { const g = new THREE.Group(); const pod = Array.from({ length: 6 }, (_, k) => { const d = dolphin(); d.position.set(-k * 3.2, 0, (k % 2 ? 1 : -1) * (1 + (k % 3))); g.add(d); return d; }); return { g, pod }; }, shark, squid, godzilla };
  const DUR = { whale: 18, dolphins: 13, shark: 20, squid: 11, godzilla: 16 };
  const RADIUS = { whale: 22, dolphins: 18, shark: 18, squid: 12, godzilla: 24 };
  const KINDS = ['whale', 'whale', 'dolphins', 'dolphins', 'dolphins', 'shark', 'shark', 'squid', 'squid', 'godzilla'];
  const pool = {};
  for (const k of Object.keys(build)) {
    const o = build[k]();
    o.splash = splash();
    o.g.visible = false;
    o.g.userData.dynamic = true; o.splash.userData.dynamic = true;
    scene.add(o.g, o.splash);
    pool[k] = o;
  }
  const live = [];
  let next = 3;
  const spot = (r) => {
    for (let i = 0; i < 60; i++) {
      const x = PARK.x + (Math.random() * 2 - 1) * PARK.rx * 0.95, z = PARK.z + (Math.random() * 2 - 1) * PARK.rz * 0.95;
      if (clearSea(x, z, r)) return [x, z];
    }
    return null;
  };
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function start(kind, t) {
    const o = pool[kind], p = spot(RADIUS[kind]);
    if (!p) return;
    o.g.visible = true;
    o.heading = Math.random() * Math.PI * 2;
    live.push({ kind, o, t0: t, x: p[0], z: p[1] });
  }
  // 浪花：u 是 0～1 的進度
  const splashAt = (o, x, z, u, size) => {
    o.splash.visible = u > 0 && u < 1;
    if (!o.splash.visible) return;
    o.splash.position.set(x, 0, z);
    o.splash.scale.set(size * (0.6 + u * 1.6), 1 - u * 0.7, size * (0.6 + u * 1.6));
  };
  const SPEED = { whale: 2.2, dolphins: 7, shark: 1.6, squid: 0, godzilla: 0 };
  function pose(L, t) {
    const { o, kind } = L, T = DUR[kind], u = (t - L.t0) / T, h = o.heading;
    const go = SPEED[kind] * (t - L.t0) - SPEED[kind] * T / 2; // 以出場點為中心前進
    const x = L.x + Math.cos(h) * go, z = L.z - Math.sin(h) * go;
    o.g.position.set(x, 0, z);
    o.g.rotation.set(0, h, 0);
    const rise = sm(0, 0.18, u) * (1 - sm(0.8, 1, u));
    if (kind === 'whale') {
      // 浮上來換氣、噴水，最後尾鰭高高翹起潛下去
      const dive = sm(0.72, 0.95, u);
      o.g.position.y = -5 + rise * 4.6 - dive * 3;
      o.g.rotation.z = -dive * 0.55 + Math.sin(t * 0.8) * 0.03;
      o.tail.rotation.z = Math.sin(t * 1.6) * 0.25 - dive * 0.6;
      o.spout.visible = u > 0.3 && u < 0.6 && Math.sin(t * 2.2) > -0.3;
      splashAt(o, x, z, (u - 0.72) / 0.25, 5);
    } else if (kind === 'dolphins') {
      // 一隻接一隻跳出水面（每隻 1.6 秒一個弧）
      o.pod.forEach((d, k) => {
        const ph = ((t - L.t0) * 1.25 + k * 0.37) % 2, j = ph < 1 ? Math.sin(ph * Math.PI) : -0.15 * Math.sin((ph - 1) * Math.PI);
        d.position.y = -1.2 + rise * (1 + j * 3.6) - (1 - rise) * 2;
        d.rotation.z = ph < 1 ? Math.cos(ph * Math.PI) * 0.8 : 0;
      });
      o.splash.visible = false;
    } else if (kind === 'shark') {
      // 鯨鯊貼著水面慢慢游，只露出背和背鰭
      o.g.position.y = -4 + rise * 3.1 + Math.sin(t * 0.9) * 0.1;
      o.tail.rotation.y = Math.sin(t * 1.4) * 0.35;
      o.splash.visible = false;
    } else if (kind === 'squid') {
      // 大王烏賊整隻衝出水面，觸手亂揮
      o.g.position.y = -12 + rise * 11.2; // 頭和觸手根部留在水裡，觸手從水面伸出來
      o.g.rotation.y = h + (t - L.t0) * 0.4;
      o.arms.forEach((a, k) => { a.rotation.z = 0.6 + Math.sin(t * 3 + k) * 0.5; let n = a.children[0]; while (n) { const nx = n.children.find((c) => c.isGroup); if (!nx) break; nx.rotation.z = Math.sin(t * 4 + k * 1.3) * 0.35; n = nx; } });
      splashAt(o, x, z, (u - 0.05) / 0.3, 4);
    } else if (kind === 'godzilla') {
      // 哥吉拉從海裡站起來，轉頭、張嘴吼一聲，再沉回海裡
      o.g.position.y = -26 + rise * 18;
      o.head.rotation.y = Math.sin((t - L.t0) * 0.7) * 0.6;
      const roar = sm(0.4, 0.48, u) * (1 - sm(0.62, 0.7, u));
      o.jaw.rotation.x = roar * 0.7; o.head.rotation.x = -roar * 0.35;
      splashAt(o, x, z, (u - 0.02) / 0.35, 8);
    }
    return u >= 1;
  }
  const fn = (t) => {
    if (t > next && live.length < 2) {
      const busy = new Set(live.map((L) => L.kind));
      const free = KINDS.filter((k) => !busy.has(k));
      start(free[Math.floor(Math.random() * free.length)], t);
      next = t + 7 + Math.random() * 10;
    }
    for (let i = live.length - 1; i >= 0; i--) {
      if (pose(live[i], t)) { live[i].o.g.visible = false; live[i].o.splash.visible = false; live.splice(i, 1); }
    }
  };
  fn.night = (on) => { plateMat.emissiveIntensity = on ? 1.6 : 0; };
  fn.live = live; fn.start = start; // 開發用（?debug）
  return fn;
}

// 第三版的海上大橋（資料在 islands.js 的 planViaducts）：遊園巴士從列車總站開到鳥園站、纜車南站。
// 橋面是一段段的厚板（淺藍綠的路面、白色護欄），海上每隔幾段一座拱形橋墩，兩側路燈；
// 海上最長的兩段各一座白色斜張橋塔，往兩邊拉出一排鋼索。巴士（兩節車廂）一站一站來回開，每站停一下
const PLAZA_GEO = new THREE.CylinderGeometry(1, 1, 1, 28);
function viaducts(scene, R, movers, { stone, stoneD, rail, lampMat }) {
  const VW = 4.6, buses = [];
  const road = mat('#7d9a9a'), line = mat('#fbf7ee'), cable = mat('#fbf7ee');
  for (const v of ISL.viaducts) {
    const P = v.pts.map(([x, z, h]) => new THREE.Vector3(x, ISLE_H + h, z));
    const over = P.map((p) => !islandAt(p.x, p.z)); // 在海上（不在島上）
    const slab = [], top = [], guard = [], marks = [];
    const frame = (i) => {
      const a = P[i], b = P[i + 1], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
      return { a, b, l, ry: Math.atan2(-dz, dx), rz: Math.atan2(b.y - a.y, l), nx: -dz / (l || 1), nz: dx / (l || 1), m: a.clone().add(b).multiplyScalar(0.5) };
    };
    for (let i = 0; i < P.length - 1; i++) {
      const f = frame(i);
      if (f.l < 0.01) continue;
      const len = Math.hypot(f.l, f.b.y - f.a.y) + 0.12, r = [0, f.ry, f.rz];
      slab.push({ p: [f.m.x, f.m.y - 0.55, f.m.z], r, s: [len, 0.9, VW], c: '#f3ead3' });
      top.push({ p: [f.m.x, f.m.y - 0.06, f.m.z], r, s: [len, 0.08, VW - 0.8] });
      if (over[i] || over[i + 1]) for (const sd of [-1, 1]) guard.push({ p: [f.m.x + f.nx * (VW / 2 - 0.15) * sd, f.m.y + 0.35, f.m.z + f.nz * (VW / 2 - 0.15) * sd], r, s: [len, 0.6, 0.3] });
      if (i % 2 === 0) marks.push({ p: [f.m.x, f.m.y + 0.0, f.m.z], r, s: [1, 0.04, 0.16] });
      // 海上：每 6 段（約 12 公尺）一座拱形橋墩（兩根柱子＋上面一道拱），旁邊不能是島或別的橋
      if (over[i] && over[i + 1] && i % 6 === 3 && !bridgeAt(f.m.x, f.m.z)) {
        const hgt = f.m.y - 1 - SEA_FLOOR;
        for (const sd of [-1, 1]) scene.add(mesh(GEO.box, null, { material: stoneD, x: f.m.x + f.nx * 1.4 * sd, z: f.m.z + f.nz * 1.4 * sd, y: SEA_FLOOR + hgt / 2, sx: 1.1, sy: hgt, sz: 1.1, ry: f.ry }));
        scene.add(mesh(GEO.box, null, { material: stone, x: f.m.x, z: f.m.z, y: f.m.y - 1.4, sx: 1.2, sy: 0.8, sz: VW, ry: f.ry }));
        if (hgt > 5) {
          const arch = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.28, 4, 12, Math.PI), stoneD);
          arch.position.set(f.m.x, f.m.y - 1.8 - 1.4, f.m.z);
          arch.rotation.set(0, f.ry + Math.PI / 2, 0);
          scene.add(arch);
        }
      }
      // 路燈：每 8 段一盞，左右輪流
      if (over[i] && i % 8 === 0) {
        const sd = (i / 8) % 2 ? 1 : -1, x = f.m.x + f.nx * (VW / 2 + 0.05) * sd, z = f.m.z + f.nz * (VW / 2 + 0.05) * sd;
        scene.add(mesh(GEO.box, null, { material: rail, x, z, y: f.m.y + 1.6, sx: 0.14, sy: 3.2, sz: 0.14, shadow: false }));
        scene.add(mesh(GEO.box, null, { material: rail, x: x - f.nx * 0.4 * sd, z: z - f.nz * 0.4 * sd, y: f.m.y + 3.2, sx: 0.16, sy: 0.1, sz: 0.16, ry: f.ry, shadow: false }));
        scene.add(mesh(GEO.sph, null, { material: lampMat, x: x - f.nx * 0.7 * sd, z: z - f.nz * 0.7 * sd, y: f.m.y + 3.05, sx: 0.28, sy: 0.22, sz: 0.28, shadow: false }));
      }
    }
    // 兩個終點：島上一塊圓形的迴車廣場＋公車站牌
    for (const k of [0, P.length - 1]) {
      const q = P[k], f = frame(k ? k - 1 : 0), sd = k ? 1 : -1;
      scene.add(mesh(PLAZA_GEO, null, { material: road, x: q.x, z: q.z, y: q.y - 0.1, sx: VW * 0.75, sy: 0.18, sz: VW * 0.75, shadow: false }));
      const sx = q.x + f.nx * (VW * 0.75 + 0.5) * sd, sz = q.z + f.nz * (VW * 0.75 + 0.5) * sd;
      scene.add(mesh(GEO.box, null, { material: rail, x: sx, z: sz, y: q.y + 1.2, sx: 0.12, sy: 2.4, sz: 0.12 }));
      scene.add(mesh(GEO.cyl, '#3f8f4e', { x: sx, z: sz, y: q.y + 2.45, sx: 0.45, sy: 0.08, sz: 0.45, rx: Math.PI / 2, ry: f.ry + Math.PI / 2 }));
    }
    scene.add(instanced(GEO.box, slab));
    scene.add(instanced(GEO.box, top, road));
    scene.add(instanced(GEO.box, guard, rail));
    if (marks.length) scene.add(instanced(GEO.box, marks, line));
    // 斜張橋塔：海上最長的兩段，各在中間立一座（不能在島上、別的橋上）
    const runs = [];
    for (let i = 0; i < P.length; ) { if (!over[i]) { i++; continue; } let j = i; while (j < P.length && over[j]) j++; runs.push([i, j - 1]); i = j; }
    runs.sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
    for (const [r0, r1] of runs.slice(0, 2)) {
      if (r1 - r0 < 40) continue;
      let mi = Math.round((r0 + r1) / 2);
      for (let d = 1; d < 20 && bridgeAt(P[mi].x, P[mi].z); d++) mi = Math.round((r0 + r1) / 2) + (d % 2 ? d : -d);
      const f = frame(mi), H = 14, base = f.m.y;
      for (const sd of [-1, 1]) {
        const x = f.m.x + f.nx * (VW / 2 + 0.5) * sd, z = f.m.z + f.nz * (VW / 2 + 0.5) * sd;
        scene.add(mesh(GEO.box, null, { material: stone, x, z, y: (SEA_FLOOR + base + H) / 2, sx: 1.2, sy: base + H - SEA_FLOOR, sz: 1.2, ry: f.ry }));
        scene.add(mesh(GEO.roof, TALL.terra, { x, z, y: base + H + 0.7, sx: 0.9, sy: 1.4, sz: 0.9, ry: f.ry + Math.PI / 4 }));
        // 鋼索：從塔頂拉到前後的橋面
        for (const dir of [-1, 1]) for (let k = 1; k <= 5; k++) {
          const j = Math.max(1, Math.min(P.length - 2, mi + dir * k * 3)), q = P[j];
          const ax = x, ay = base + H - 0.6 - k * 0.5, az = z, bx = q.x + f.nx * (VW / 2 - 0.15) * sd, by = q.y + 0.6, bz = q.z + f.nz * (VW / 2 - 0.15) * sd;
          const c = new THREE.Mesh(GEO.box, cable), d2 = new THREE.Vector3(bx - ax, by - ay, bz - az), l = d2.length();
          c.scale.set(0.07, l, 0.07);
          c.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
          c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d2.normalize());
          scene.add(c);
        }
      }
      scene.add(mesh(GEO.box, null, { material: stone, x: f.m.x, z: f.m.z, y: base + H - 1, sx: 1, sy: 0.8, sz: VW + 2.2, ry: f.ry }));
    }
    // 遊園巴士：綠色車頭＋奶油色車廂，沿著橋面中線來回
    const curve = new THREE.CatmullRomCurve3(P.map((p) => p.clone()), false, 'centripetal');
    const len = curve.getLength();
    const g = new THREE.Group(), cars = [];
    for (let k = 0; k < 2; k++) {
      const car = new THREE.Group();
      car.add(mesh(GEO.box, k ? '#f4ecdb' : '#3f8f4e', { y: 1.3, sx: 4.4, sy: 1.9, sz: 2.1 }));
      car.add(mesh(GEO.box, '#3f8f4e', { y: 2.35, sx: 4.6, sy: 0.2, sz: 2.3 }));
      car.add(mesh(GEO.box, '#9fb2d6', { y: 1.6, sx: 3.6, sy: 0.7, sz: 2.14, shadow: false }));
      for (const [x, z] of [[-1.4, 1], [1.4, 1], [-1.4, -1], [1.4, -1]]) car.add(mesh(GEO.cyl, '#2b2b2b', { x, z, y: 0.4, sx: 0.4, sy: 0.25, sz: 0.4, rx: Math.PI / 2 }));
      g.add(car);
      cars.push(car);
    }
    g.userData.dynamic = true;
    scene.add(g);
    buses.push(g);
    // 一站一站開：總站 → 中間站 → 終點站 → 中間站 → 總站，每站停 4 秒
    const N = P.length - 1, us = (v.stops || [0, N]).map((k) => k / N);
    const legs = [];
    for (let k = 0; k < us.length - 1; k++) legs.push([us[k], us[k + 1]]);
    for (let k = us.length - 1; k > 0; k--) legs.push([us[k], us[k - 1]]);
    const SP = 9, PAUSE = 4, dur = legs.map(([u0, u1]) => (Math.abs(u1 - u0) * len) / SP + PAUSE), cycle = dur.reduce((a, b) => a + b, 0);
    const ph = R() * cycle, p = new THREE.Vector3(), tg = new THREE.Vector3();
    movers.push((t) => {
      if (!g.visible) return;
      let w = (t + ph) % cycle, k = 0;
      while (w > dur[k]) w -= dur[k++];
      const [u0, u1] = legs[k], back = u1 < u0, x = Math.min(1, w / (dur[k] - PAUSE)), u = u0 + (u1 - u0) * x;
      cars.forEach((car, n) => {
        const uu = Math.max(0, Math.min(1, u + ((back ? 1 : -1) * n * 4.8) / len));
        curve.getPointAt(uu, p); curve.getTangentAt(uu, tg);
        car.position.set(p.x, p.y, p.z);
        car.rotation.set(0, Math.atan2(-tg.z, tg.x) + (back ? Math.PI : 0), Math.atan2(tg.y, Math.hypot(tg.x, tg.z)) * (back ? -1 : 1));
      });
    });
  }
  return buses;
}

// 第三版的小建築（只是造景，不能點進去）：鐘塔、燈塔、風車、小商店、涼亭、小屋、小攤子，都用統一的奶油、橘陶、鼠尾草綠
// 第三版的夜晚：燈塔燈頭、路燈、燈籠在晚上變亮；燈塔多兩道旋轉的光束；天上出現星星
const NIGHT = {
  beacon: new THREE.MeshStandardMaterial({ color: '#fff2c4', emissive: '#ffd27a', emissiveIntensity: 0.7 }),
  beamMat: new THREE.MeshBasicMaterial({ color: '#fff0b0', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }),
  beamGeo: new THREE.ConeGeometry(2.2, 18, 12, 1, true),
  beams: [],
};
const TOWN = {
  clock: (R) => {
    const g = new THREE.Group();
    g.add(mesh(GEO.box, '#f3ead3', { y: 3.2, sx: 2.6, sy: 6.4, sz: 2.6 }));
    g.add(mesh(GEO.box, '#e3d5b2', { y: 0.4, sx: 3.2, sy: 0.8, sz: 3.2 }));
    for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      g.add(mesh(GEO.cyl, '#fbf7ee', { x: Math.sin(r) * 1.32, z: Math.cos(r) * 1.32, y: 5, sx: 0.8, sy: 0.06, sz: 0.8, rx: Math.PI / 2, ry: r, shadow: false }));
      g.add(mesh(GEO.box, '#4a3b30', { x: Math.sin(r) * 1.38, z: Math.cos(r) * 1.38, y: 5.2, sx: 0.08, sy: 0.5, sz: 0.08, ry: r, shadow: false }));
    }
    g.add(mesh(GEO.roof, TALL.terra, { y: 7.6, sx: 2.3, sy: 2.4, sz: 2.3, ry: Math.PI / 4 }));
    g.add(mesh(GEO.box, '#8b6748', { y: 9.4, sx: 0.08, sy: 1.6, sz: 0.08 }));
    g.add(mesh(GEO.box, '#f3d58a', { x: 0.45, y: 9.9, sx: 0.9, sy: 0.55, sz: 0.04, shadow: false }));
    return { g, r: 2.4 };
  },
  lighthouse: (R) => {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) g.add(mesh(GEO.cyl, i % 2 ? TALL.terra : '#fbf7ee', { y: 0.8 + i * 1.5, sx: 1.4 - i * 0.12, sy: 1.5, sz: 1.4 - i * 0.12 }));
    g.add(mesh(GEO.cyl, '#5a4636', { y: 8.1, sx: 1.2, sy: 0.25, sz: 1.2 }));
    g.add(mesh(GEO.cyl, null, { material: NIGHT.beacon, y: 8.8, sx: 0.7, sy: 1.1, sz: 0.7, shadow: false }));
    g.add(mesh(GEO.roof, TALL.terra, { y: 9.9, sx: 1, sy: 1.1, sz: 1 }));
    // 晚上才出現的兩道光束，慢慢旋轉
    const beam = new THREE.Group();
    beam.position.y = 8.8;
    for (const sd of [-1, 1]) beam.add(mesh(NIGHT.beamGeo, null, { material: NIGHT.beamMat, x: sd * 9, rz: (sd * Math.PI) / 2, shadow: false }));
    beam.visible = false;
    beam.rotation.y = R() * 6;
    beam.userData.dynamic = true;
    g.add(beam);
    NIGHT.beams.push(beam);
    return { g, r: 2 };
  },
  windmill: (R, spin) => {
    const g = new THREE.Group();
    g.add(mesh(GEO.cyl, '#f3ead3', { y: 2.4, sx: 1.6, sy: 4.8, sz: 1.6 }));
    g.add(mesh(GEO.cone, TALL.terra, { y: 5.5, sx: 1.9, sy: 1.6, sz: 1.9 }));
    g.add(mesh(GEO.box, '#8b6748', { y: 0.9, z: 1.55, sx: 0.8, sy: 1.6, sz: 0.1, shadow: false }));
    const hub = new THREE.Group();
    hub.position.set(0, 4.6, 1.7);
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Group();
      arm.rotation.z = (k * Math.PI) / 2;
      arm.add(mesh(GEO.box, '#8b6748', { y: 1.7, sx: 0.14, sy: 3.4, sz: 0.1 }));
      arm.add(mesh(GEO.box, '#fbf7ee', { x: 0.38, y: 2.1, sx: 0.6, sy: 2.4, sz: 0.05 }));
      hub.add(arm);
    }
    hub.userData.dynamic = true;
    g.add(hub);
    spin.push(hub);
    return { g, r: 2.2 };
  },
  shop: (R) => {
    const g = new THREE.Group(), w = 3.6 + R() * 1.2, c = [TALL.terra, '#6f9a5a', '#5f9fae'][Math.floor(R() * 3)];
    g.add(mesh(GEO.box, '#f3ead3', { y: 1.3, sx: w, sy: 2.6, sz: 2.8 }));
    g.add(mesh(GEO.box, c, { y: 2.75, sx: w + 0.3, sy: 0.3, sz: 3.1 }));
    g.add(mesh(GEO.box, '#5f9fae', { y: 1.2, z: 1.41, sx: w * 0.6, sy: 1.1, sz: 0.05, shadow: false }));
    for (let i = 0; i < 5; i++) g.add(mesh(GEO.box, i % 2 ? '#fbf7ee' : c, { x: -w / 2 + (w / 5) * (i + 0.5), y: 2.2, z: 1.75, sx: w / 5, sy: 0.12, sz: 0.9, rx: 0.45, shadow: false }));
    g.add(mesh(GEO.box, '#f3d58a', { y: 3.3, sx: w * 0.5, sy: 0.6, sz: 0.12 }));
    return { g, r: w / 2 + 1 };
  },
  // 兒童遊戲場：軟墊地面、溜滑梯（爬梯平台＋斜滑道）、盪鞦韆、翹翹板、攀爬圓頂、沙坑、旋轉盤，顏色鮮豔
  playground: (R) => {
    const g = new THREE.Group(), C = ['#ef6f6c', '#f2c14e', '#5bc0eb', '#9bc53d', '#ff9f1c', '#c77dff'];
    const c = () => C[Math.floor(R() * C.length)];
    g.add(mesh(GEO.cyl, '#e98a6a', { y: 0.06, sx: 5.4, sy: 0.12, sz: 5.4, shadow: false })); // 軟墊
    g.add(mesh(GEO.cyl, '#f6c48f', { y: 0.07, sx: 4.6, sy: 0.12, sz: 4.6, shadow: false }));
    // 溜滑梯
    const sl = new THREE.Group(); sl.position.set(-2, 0, -1.4);
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) sl.add(mesh(GEO.box, '#fbf7ee', { x, z, y: 1, sx: 0.12, sy: 2, sz: 0.12 }));
    sl.add(mesh(GEO.box, c(), { y: 1.5, sx: 1.2, sy: 0.12, sz: 1.2 }));
    sl.add(mesh(GEO.roof, c(), { y: 2.45, sx: 0.95, sy: 0.9, sz: 0.95, ry: Math.PI / 4 }));
    sl.add(mesh(GEO.box, c(), { x: 1.55, y: 0.85, sx: 2.2, sy: 0.08, sz: 0.7, rz: -0.62 }));
    for (const z of [-0.36, 0.36]) sl.add(mesh(GEO.box, '#fbf7ee', { x: 1.55, y: 1.0, z, sx: 2.2, sy: 0.2, sz: 0.05, rz: -0.62 }));
    for (let k = 0; k < 4; k++) sl.add(mesh(GEO.box, '#fbf7ee', { x: -0.8, y: 0.3 + k * 0.36, sx: 0.08, sy: 0.06, sz: 0.8 })); // 爬梯
    g.add(sl);
    // 盪鞦韆：A 字架、兩個座位
    const sw = new THREE.Group(); sw.position.set(2, 0, -1.8); sw.rotation.y = 0.3;
    for (const x of [-1.4, 1.4]) for (const z of [-0.5, 0.5]) sw.add(mesh(GEO.box, '#3a8f8a', { x, y: 1.1, z: z * 0.6, sx: 0.12, sy: 2.3, sz: 0.12, rx: z * 0.45 }));
    sw.add(mesh(GEO.box, '#3a8f8a', { y: 2.2, sx: 3, sy: 0.12, sz: 0.12 }));
    for (const x of [-0.6, 0.6]) {
      for (const dx of [-0.22, 0.22]) sw.add(mesh(GEO.box, '#7a7a7a', { x: x + dx, y: 1.45, sx: 0.03, sy: 1.5, sz: 0.03, shadow: false }));
      sw.add(mesh(GEO.box, c(), { x, y: 0.68, sx: 0.55, sy: 0.07, sz: 0.3 }));
    }
    g.add(sw);
    // 翹翹板
    const ss = new THREE.Group(); ss.position.set(2.4, 0, 1.6); ss.rotation.y = -0.5;
    ss.add(mesh(GEO.prism, '#fbf7ee', { y: 0.25, sx: 0.4, sy: 0.5, sz: 0.4, ry: Math.PI / 2 }));
    ss.add(mesh(GEO.box, c(), { y: 0.5, sx: 3, sy: 0.08, sz: 0.3, rz: 0.18 }));
    for (const x of [-1.3, 1.3]) ss.add(mesh(GEO.box, '#fbf7ee', { x, y: 0.5 + x * 0.18 + 0.2, sx: 0.06, sy: 0.3, sz: 0.4 }));
    g.add(ss);
    // 攀爬圓頂：幾道彩色的半圓拱交叉
    const dome = new THREE.Group(); dome.position.set(-1.4, 0, 2.2);
    for (let k = 0; k < 4; k++) dome.add(mesh(new THREE.TorusGeometry(1.1, 0.06, 5, 16, Math.PI), C[k], { ry: (k / 4) * Math.PI }));
    dome.add(mesh(new THREE.TorusGeometry(0.95, 0.05, 5, 20), '#fbf7ee', { y: 0.55, rx: Math.PI / 2 }));
    g.add(dome);
    // 沙坑和旋轉盤
    g.add(mesh(GEO.box, '#d9b779', { x: 0.6, y: 0.18, z: 0.2, sx: 1.8, sy: 0.24, sz: 1.8 }));
    g.add(mesh(GEO.box, '#f2e2b8', { x: 0.6, y: 0.24, z: 0.2, sx: 1.5, sy: 0.2, sz: 1.5, shadow: false }));
    g.add(mesh(GEO.cone, c(), { x: 0.9, y: 0.45, z: 0.4, sx: 0.25, sy: 0.35, sz: 0.25 })); // 沙堆上的小水桶
    const mg = new THREE.Group(); mg.position.set(-3.4, 0, 0.9);
    mg.add(mesh(GEO.cyl, c(), { y: 0.3, sx: 1, sy: 0.12, sz: 1 }));
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; mg.add(mesh(GEO.box, '#fbf7ee', { x: Math.cos(a) * 0.7, z: Math.sin(a) * 0.7, y: 0.7, sx: 0.06, sy: 0.8, sz: 0.06 })); }
    mg.add(mesh(GEO.cyl, '#fbf7ee', { y: 1.1, sx: 0.75, sy: 0.05, sz: 0.75 }));
    g.add(mg);
    return { g, r: 5.6 };
  },
  gazebo: (R) => {
    const g = new THREE.Group();
    g.add(mesh(GEO.cyl, '#e3d5b2', { y: 0.15, sx: 2.2, sy: 0.3, sz: 2.2 }));
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; g.add(mesh(GEO.box, '#fbf7ee', { x: Math.cos(a) * 1.8, z: Math.sin(a) * 1.8, y: 1.3, sx: 0.16, sy: 2.2, sz: 0.16 })); }
    g.add(mesh(new THREE.ConeGeometry(1, 1, 6), '#6f9a5a', { y: 2.9, sx: 2.6, sy: 1.4, sz: 2.6 }));
    g.add(mesh(GEO.sph, TALL.lamp, { y: 3.75, sx: 0.25, sy: 0.25, sz: 0.25 }));
    return { g, r: 2.4 };
  },
  cottage: (R) => {
    const g = new THREE.Group();
    g.add(mesh(GEO.box, '#fbf7ee', { y: 1.1, sx: 3.4, sy: 2.2, sz: 2.6 }));
    g.add(mesh(GEO.prism, TALL.terra, { y: 2.8, sx: 3.8, sy: 1.3, sz: 3.2 }));
    g.add(mesh(GEO.box, '#6f9a5a', { y: 0.8, z: 1.31, sx: 0.8, sy: 1.5, sz: 0.06, shadow: false }));
    g.add(mesh(GEO.box, '#5f9fae', { x: 1, y: 1.3, z: 1.31, sx: 0.7, sy: 0.6, sz: 0.06, shadow: false }));
    g.add(mesh(GEO.box, '#e3d5b2', { x: -1, y: 3.4, sx: 0.4, sy: 1, sz: 0.4 }));
    return { g, r: 2.4 };
  },
  kiosk: (R) => {
    const g = new THREE.Group(), c = R() < 0.5 ? TALL.terra : '#6f9a5a';
    g.add(mesh(GEO.box, '#f3ead3', { y: 0.6, sx: 1.6, sy: 1.2, sz: 1.2 }));
    g.add(mesh(GEO.box, '#8b6748', { y: 1.9, sx: 0.1, sy: 1.6, sz: 0.1 }));
    g.add(mesh(new THREE.ConeGeometry(1, 1, 8), c, { y: 2.8, sx: 1.6, sy: 0.6, sz: 1.6 }));
    return { g, r: 1.6 };
  },
};
// 第三版的館舍（教育中心、大貓熊館、昆蟲館…）：不用灰色方塊，改成參考站那種童話小鎮的房子——
// 奶油色的牆、石頭台基、人字形斜屋頂（橘陶／鼠尾草綠／淺藍綠輪流）、側邊一間比較矮的廂房、煙囪、
// 有框的小方窗、木門和門口的小雨棚、牆角的花叢；大的館多一座圓塔。佔地和原本的方塊一樣大，正面朝 +z
const HALL = {
  wall: ['#f6eedb', '#f3e3c4', '#eef0e2', '#f7e6d6'],
  roof: [TALL.terra, '#6f9a5a', '#5f9fae', '#d9a25a'],
  trim: '#fbf7ee', wood: '#8b6748', base: '#e3d5b2', flower: ['#f39a5c', '#f2c94c', '#e86f6f', '#fbf7ee'],
};
function storyHall(g, b, i, windowMat) {
  const W = b.w, D = b.d, two = b.h >= 6.5, h1 = two ? 5.6 : 3.4;
  const wall = HALL.wall[i % 4], roof = HALL.roof[i % 4], roof2 = HALL.roof[(i + 1) % 4];
  const mw = W * 0.66, mx = -W * 0.17, ww = W - mw, wx = W / 2 - ww / 2, wd = D * 0.72, h2 = h1 * 0.72;
  const gable = (x, z, len, depth, top, color, ry = 0) => {
    const sy = Math.min(3.2, depth * 0.3) / 1.5; // 屋頂高＝進深的 0.3，最多 3.2 公尺
    g.add(mesh(GEO.prism, color, { x, z, y: top + 0.5 * sy, sx: len + 0.7, sy, sz: (depth + 0.9) / 1.73, ry }));
    return top + sy * 1.5;
  };
  g.add(mesh(GEO.box, HALL.base, { y: 0.25, sx: W + 0.6, sy: 0.5, sz: D + 0.6 }));
  g.add(mesh(GEO.box, null, { material: softMat(wall), x: mx, y: 0.5 + h1 / 2, sx: mw, sy: h1, sz: D }));
  g.add(mesh(GEO.box, null, { material: softMat(wall), x: wx, z: (D - wd) / 2, y: 0.5 + h2 / 2, sx: ww, sy: h2, sz: wd }));
  let top = gable(mx, 0, mw, D, 0.5 + h1, roof);
  gable(wx, (D - wd) / 2, wd, ww, 0.5 + h2, roof2, Math.PI / 2);
  // 屋簷下一圈白色飾條
  g.add(mesh(GEO.box, null, { material: softMat(HALL.trim), x: mx, y: 0.5 + h1 - 0.12, sx: mw + 0.12, sy: 0.24, sz: D + 0.12, shadow: false }));
  // 煙囪
  g.add(mesh(GEO.box, '#c9774f', { x: mx - mw * 0.28, z: -D * 0.18, y: (0.5 + h1 + top) / 2 + 0.6, sx: 0.8, sy: top - 0.5 - h1, sz: 0.8 }));
  // 窗：每層一排有框的小方窗（窗玻璃晚上會亮）
  const glass = [], frames = [];
  const win = (x, y, z, rot) => {
    glass.push({ p: [x, y, z], s: rot ? [0.06, 1, 0.9] : [0.9, 1, 0.06] });
    frames.push({ p: rot ? [x - Math.sign(x) * 0.02, y, z] : [x, y, z - Math.sign(z) * 0.02], s: rot ? [0.06, 1.3, 1.2] : [1.2, 1.3, 0.06] });
  };
  const rows = two ? [2.1, 4.6] : [2.1];
  for (const y of rows) {
    for (let x = mx - mw / 2 + 1.6; x < mx + mw / 2 - 1; x += 2.6) {
      if (y < 3 && Math.abs(x - mx) < 1.4) continue; // 正門
      win(x, y, D / 2 + 0.04); win(x, y, -D / 2 - 0.04);
    }
    for (let z = -D / 2 + 1.6; z < D / 2 - 1; z += 2.6) win(mx - mw / 2 - 0.04, y, z, true);
  }
  for (let z = (D - wd) / 2 - wd / 2 + 1.4; z < D / 2 - 0.8; z += 2.4) win(W / 2 + 0.04, 2.1, z, true);
  win(wx, 2.1, D / 2 + 0.04);
  g.add(instanced(GEO.box, frames, softMat(HALL.trim)));
  g.add(instanced(GEO.box, glass, windowMat));
  // 正門：木門、門口雨棚、兩盞燈籠
  g.add(mesh(GEO.box, HALL.wood, { x: mx, y: 1.55, z: D / 2 + 0.05, sx: 1.5, sy: 2.1, sz: 0.1, shadow: false }));
  g.add(mesh(GEO.box, roof2, { x: mx, y: 2.95, z: D / 2 + 0.55, sx: 2.6, sy: 0.14, sz: 1.2, rx: 0.25 }));
  for (const s of [-1, 1]) g.add(mesh(GEO.sph, null, { material: softMat(TALL.lamp), x: mx + s * 1.1, y: 2.4, z: D / 2 + 0.2, sx: 0.2, sy: 0.26, sz: 0.2, shadow: false }));
  // 大的館：轉角一座圓塔（圓錐屋頂）
  if (W >= 14) {
    const tx = mx - mw / 2, tz = D / 2, th = h1 + 2;
    g.add(mesh(GEO.cyl, null, { material: softMat(HALL.trim), x: tx, z: tz, y: 0.5 + th / 2, sx: 1.5, sy: th, sz: 1.5 }));
    g.add(mesh(GEO.cone, roof, { x: tx, z: tz, y: 0.5 + th + 1.1, sx: 1.8, sy: 2.2, sz: 1.8 }));
    g.add(mesh(GEO.box, null, { material: windowMat, x: tx, z: tz + 1.45, y: th - 0.6, sx: 0.6, sy: 0.9, sz: 0.06, shadow: false }));
    top = Math.max(top, 0.5 + th + 2.2);
  }
  // 牆角的花叢
  const fl = [];
  for (const [x, z] of [[-W / 2 - 0.5, D / 2 + 0.6], [mx + 1.8, D / 2 + 0.7], [mx - 1.8, D / 2 + 0.7], [W / 2 + 0.5, -D / 2 - 0.4], [-W / 2 - 0.4, -D / 2 - 0.3]]) {
    fl.push({ p: [x, 0.45, z], s: [0.75, 0.55, 0.75], c: '#7db46c' });
    for (let k = 0; k < 3; k++) fl.push({ p: [x + (k - 1) * 0.35, 0.9, z + ((k % 2) - 0.5) * 0.3], s: [0.16, 0.16, 0.16], c: HALL.flower[(i + k) % 4] });
  }
  g.add(instanced(GEO.sph, fl, mat('#ffffff')));
  return top;
}
// 第三版各園區的地標：非洲的圖騰柱、沙漠的金字塔／人面獅身／沙丘、鳥園的大樹和鳥籠
Object.assign(TOWN, {
  totem: (R) => {
    const g = new THREE.Group(), cols = ['#c0583a', '#e0a64a', '#3f7f8a', '#f3ead3', '#2f2a26'];
    const n = 3 + Math.floor(R() * 2);
    for (let i = 0; i < n; i++) {
      const y = 0.9 + i * 1.5, c = cols[(i + Math.floor(R() * 5)) % 5];
      g.add(mesh(GEO.box, '#7a5a3e', { y, sx: 1.1, sy: 1.5, sz: 1.1 }));
      g.add(mesh(GEO.box, c, { y, z: 0.56, sx: 1, sy: 1.3, sz: 0.06, shadow: false })); // 彩繪的臉
      for (const sd of [-1, 1]) g.add(mesh(GEO.box, i % 2 ? '#f3ead3' : '#2f2a26', { x: sd * 0.25, y: y + 0.2, z: 0.6, sx: 0.22, sy: 0.18, sz: 0.04, shadow: false }));
      g.add(mesh(GEO.box, '#2f2a26', { y: y - 0.3, z: 0.6, sx: 0.5, sy: 0.12, sz: 0.04, shadow: false }));
    }
    const top = 0.15 + n * 1.5;
    g.add(mesh(GEO.box, '#e0a64a', { y: top + 0.1, sx: 3, sy: 0.25, sz: 0.5 })); // 頂上展開的翅膀
    g.add(mesh(GEO.roof, '#c0583a', { y: top + 0.6, sx: 0.7, sy: 0.9, sz: 0.7, ry: Math.PI / 4 }));
    return { g, r: 1.6 };
  },
  pyramid: (R) => {
    const g = new THREE.Group(), s = 4 + R() * 3;
    // 四角錐一層層疊上去（方塊風），頂端金色
    for (let i = 0; i < 6; i++) { const w = s * 2 * (1 - i / 6); g.add(mesh(GEO.box, i % 2 ? '#e6c88c' : '#dcbb7c', { y: (i + 0.5) * s * 0.28, sx: w, sy: s * 0.28, sz: w })); }
    g.add(mesh(GEO.roof, '#f2c94c', { y: s * 1.85, sx: s * 0.3, sy: s * 0.35, sz: s * 0.3, ry: Math.PI / 4 }));
    return { g, r: s * 1.45 };
  },
  sphinx: (R) => {
    const g = new THREE.Group(), c = '#dcbb7c', d = '#c9a46a';
    g.add(mesh(GEO.box, d, { y: 0.4, sx: 3.4, sy: 0.8, sz: 7.4 }));
    g.add(mesh(GEO.box, c, { y: 1.6, z: -0.8, sx: 2.6, sy: 1.8, sz: 5 })); // 趴著的身體
    for (const sd of [-1, 1]) g.add(mesh(GEO.box, c, { x: sd * 0.8, y: 1, z: 2.6, sx: 0.8, sy: 0.6, sz: 2.6 })); // 前腳
    g.add(mesh(GEO.box, c, { y: 3.4, z: 1.4, sx: 1.6, sy: 2, sz: 1.6 })); // 頭
    g.add(mesh(GEO.box, '#3f6f9a', { y: 3.7, z: 1.3, sx: 2.4, sy: 1.6, sz: 1.2 })); // 頭巾（頂面比頭高 0.1，兩個頂面不會疊在同一個高度閃爍）
    for (let i = 0; i < 4; i++) g.add(mesh(GEO.box, '#f2c94c', { y: 2.9 + i * 0.4, z: 1.3, sx: 2.45, sy: 0.12, sz: 1.25, shadow: false }));
    g.add(mesh(GEO.box, c, { y: 3.3, z: 2.22, sx: 1.2, sy: 1.5, sz: 0.1 })); // 臉
    g.add(mesh(GEO.box, '#2f2a26', { y: 3.6, z: 2.28, sx: 0.8, sy: 0.12, sz: 0.04, shadow: false }));
    return { g, r: 4 };
  },
  dune: (R) => {
    const g = new THREE.Group(), s = 3 + R() * 3;
    g.add(mesh(new THREE.SphereGeometry(1, 16, 8), '#ecd49a', { y: 0, sx: s * 1.6, sy: s * 0.28, sz: s, ry: R() * 3 }));
    g.add(mesh(new THREE.SphereGeometry(1, 16, 8), '#e6c88c', { x: s * 0.5, y: 0, z: s * 0.3, sx: s, sy: s * 0.2, sz: s * 0.7, ry: R() * 3 }));
    return { g, r: s * 1.7 }; // 最外面那顆沙丘的半徑是 1.6s
  },
  birdTree: (R) => {
    // 高大的樹：粗樹幹、三層樹冠，枝上一個鳥巢
    const g = new THREE.Group(), s = 1.2 + R() * 0.5, leaf = ['#5f9a52', '#6fa65a', '#4f8a46'];
    g.add(mesh(GEO.cyl, '#7a5a3e', { y: 3.5 * s, sx: 0.45 * s, sy: 7 * s, sz: 0.45 * s }));
    [[0, 6.2, 0, 2.6], [1.1, 7.6, 0.4, 2], [-0.8, 8.6, -0.3, 1.7], [0.2, 9.8, 0.1, 1.2]].forEach(([x, y, z, r], i) => g.add(mesh(GEO.ico, leaf[i % 3], { x: x * s, y: y * s, z: z * s, sx: r * s, sy: r * 0.85 * s, sz: r * s })));
    g.add(mesh(GEO.cyl, '#a07a50', { x: 1.6 * s, y: 5 * s, sx: 0.6 * s, sy: 0.3 * s, sz: 0.6 * s }));
    g.add(mesh(GEO.sph, '#f3ead3', { x: 1.6 * s, y: 5.25 * s, sx: 0.18 * s, sy: 0.15 * s, sz: 0.18 * s, shadow: false }));
    return { g, r: 2.8 * s };
  },
  aviary: (R) => {
    // 圓頂鳥籠：白色骨架的半球，頂上一隻風向雞
    const g = new THREE.Group(), r = 3.4, rail = mat('#fbf7ee');
    g.add(mesh(GEO.cyl, '#e3d5b2', { y: 0.15, sx: r + 0.3, sy: 0.3, sz: r + 0.3 }));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI;
      const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 4, 24, Math.PI), rail);
      arc.rotation.y = a; arc.position.y = 0.3; arc.castShadow = true;
      g.add(arc);
    }
    for (const y of [1.2, 2.3]) { const rr = Math.sqrt(r * r - (y - 0.3) ** 2); const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.06, 4, 32), rail); ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring); }
    g.add(mesh(GEO.ico, '#6fa65a', { y: 1, sx: 1.6, sy: 1.4, sz: 1.6 }));
    g.add(mesh(GEO.box, '#e86f6f', { y: 1.6, x: 0.9, sx: 0.4, sy: 0.4, sz: 0.6 }));
    g.add(mesh(GEO.box, '#5f9fae', { y: 1.9, x: -0.7, z: 0.5, sx: 0.4, sy: 0.4, sz: 0.6 }));
    g.add(mesh(GEO.roof, TALL.terra, { y: r + 0.7, sx: 0.5, sy: 0.8, sz: 0.5 }));
    return { g, r: r + 0.6 };
  },
});
function glacier(R) {
  // 冰河：後面一小座參差的岩山（山頂積雪），一條冰舌從山谷裡彎彎地流下來、越往下越寬、表面微微隆起，
  // 橫向幾道藍色裂縫；末端是一整片崩裂的藍色冰塔（serac），腳下一小灘融水和幾塊碎冰。冰舌朝 +z（島中心）
  const g = new THREE.Group();
  const ice = new THREE.MeshStandardMaterial({ color: '#f2fafd', roughness: 0.35, flatShading: true, emissive: '#d6eef7', emissiveIntensity: 0.3 });
  const blue = new THREE.MeshStandardMaterial({ color: '#7fc4e2', roughness: 0.2, flatShading: true, emissive: '#5fb0d6', emissiveIntensity: 0.25 });
  const deep = new THREE.MeshStandardMaterial({ color: '#4d9cc4', roughness: 0.2, flatShading: true, emissive: '#3a8ab8', emissiveIntensity: 0.2 });
  // 參差的山峰：五角錐頂點亂數錯開；山腰灰藍色岩石、上半截罩一頂雪帽
  const peak = (x, z, r, h, rot) => {
    const geo = new THREE.ConeGeometry(r, h, 5, 2).toNonIndexed(), pos = geo.attributes.position;
    const jit = new Map();
    for (let i = 0; i < pos.count; i++) {
      const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      if (!jit.has(k)) jit.set(k, [(R() - 0.5) * r * 0.35, (R() - 0.5) * h * 0.08, (R() - 0.5) * r * 0.35]);
      const [dx, dy, dz] = jit.get(k);
      if (pos.getY(i) > -h / 2 + 0.01) pos.setXYZ(i, pos.getX(i) + dx, pos.getY(i) + dy, pos.getZ(i) + dz);
    }
    geo.computeVertexNormals();
    g.add(mesh(geo, '#b3c5d2', { x, y: h / 2, z, ry: rot }));
    g.add(mesh(GEO.cone, null, { material: ice, x, y: h * 0.78, z, sx: r * 0.52, sy: h * 0.46, sz: r * 0.52, ry: rot }));
  };
  peak(-0.6, -3.8, 3, 7.5, R());
  peak(-3, -2.8, 2.2, 5.2, R());
  peak(2.4, -3.2, 2.4, 5.8, R());
  // 冰舌：沿一條往前、往下的曲線取 12 段，每段一個隆起的截面（中間高、兩邊低），兩側一路接到地面
  const path = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.4, 3.6, -2.6), new THREE.Vector3(0.4, 2.2, 0), new THREE.Vector3(-0.3, 1.2, 2.6), new THREE.Vector3(0.5, 0.9, 5)]);
  const N = 12, P = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, c = path.getPointAt(t), d = path.getTangentAt(t), nx = -d.z, nz = d.x, l = Math.hypot(nx, nz) || 1;
    const w = (1.7 + t * 1.5) * (1 + (R() - 0.5) * 0.12), crown = 0.35 + t * 0.15;
    for (const [u, dy] of [[-1, -crown], [-0.45, 0], [0.45, 0], [1, -crown]]) P.push(c.x + (nx / l) * w * u, c.y + dy, c.z + (nz / l) * w * u);
    P.push(c.x - (nx / l) * w, 0, c.z - (nz / l) * w, c.x + (nx / l) * w, 0, c.z + (nz / l) * w); // 兩側落地的點
  }
  const S = 6;
  for (let i = 0; i < N; i++) {
    const a = i * S, b = a + S;
    for (let j = 0; j < 3; j++) idx.push(a + j, b + j, a + j + 1, a + j + 1, b + j, b + j + 1); // 頂面
    idx.push(a + 4, b + 4, a, a, b + 4, b); // 左側
    idx.push(a + 3, b + 3, a + 5, a + 5, b + 3, b + 5); // 右側
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  tg.setIndex(idx);
  const tongue = new THREE.Mesh(tg.toNonIndexed(), ice);
  tongue.geometry.computeVertexNormals();
  tongue.castShadow = tongue.receiveShadow = true;
  tongue.material.side = THREE.DoubleSide;
  g.add(tongue);
  // 橫向裂縫：藍色細條，順著冰舌的坡度
  for (const t of [0.22, 0.36, 0.5, 0.62, 0.74]) {
    const c = path.getPointAt(t), d = path.getTangentAt(t), w = 1.7 + t * 1.5;
    g.add(mesh(GEO.box, null, { material: blue, x: c.x + (R() - 0.5) * 0.4, y: c.y + 0.02, z: c.z, sx: w * (0.9 + R() * 0.5), sy: 0.08, sz: 0.22, ry: Math.atan2(d.x, d.z) + (R() - 0.5) * 0.25, rx: -Math.atan2(d.y, Math.hypot(d.x, d.z)), shadow: false }));
  }
  // 末端崩裂的冰塔：一排高低不一、歪斜的冰塊，藍白相間
  const end = path.getPointAt(1), w1 = 3.2;
  for (let k = 0; k < 7; k++) {
    const u = (k / 6 - 0.5) * 2 * w1 * 0.9, h = 1 + R() * 1.1;
    g.add(mesh(GEO.box, null, { material: [ice, blue, deep][k % 3 === 1 ? 1 : R() < 0.25 ? 2 : 0], x: end.x + u, y: h / 2, z: end.z + 0.3 + R() * 0.5, sx: 0.8 + R() * 0.5, sy: h, sz: 0.7 + R() * 0.4, ry: (R() - 0.5) * 0.6, rz: (R() - 0.5) * 0.2 }));
  }
  // 融水和碎冰
  g.add(mesh(GEO.disc, null, { material: blue, x: end.x, y: 0.05, z: end.z + 2, sx: 2.6, sy: 1.2, rx: -Math.PI / 2, shadow: false }));
  for (let k = 0; k < 5; k++) g.add(mesh(GEO.ico, null, { material: k % 2 ? blue : ice, x: end.x + (R() - 0.5) * 4, y: 0.15, z: end.z + 1.4 + R() * 1.4, sx: 0.3 + R() * 0.25, sy: 0.22, sz: 0.3 + R() * 0.25, ry: R() * 3 }));
  return g;
}
// 溫帶區的峽谷、楓樹、高大的針葉樹；極地的冰河
Object.assign(TOWN, {
  canyon: (R) => {
    // 兩道一層層紅褐色岩層疊成的台地，中間夾一條窄窄的溪谷
    const g = new THREE.Group(), cols = ['#b85f3a', '#cf7c4c', '#e2a06a', '#efc591'];
    for (const sd of [-1, 1]) {
      let w = 4.6, y = 0;
      for (let i = 0; i < 4; i++) {
        const h = 1.2 + R() * 0.6, l = 13 - i * 1.6 + R();
        g.add(mesh(GEO.box, cols[i], { x: sd * (1.6 + w / 2 + i * 0.25), y: y + h / 2, z: (R() - 0.5) * 1.2, sx: w, sy: h, sz: l }));
        y += h; w -= 0.9;
      }
      for (let k = 0; k < 3; k++) g.add(mesh(GEO.ico, '#9a5a3a', { x: sd * (1.7 + R() * 0.6), y: 0.3, z: (R() - 0.5) * 10, sx: 0.6, sy: 0.45, sz: 0.6 }));
    }
    g.add(mesh(GEO.box, null, { material: waterMat, y: 0.08, sx: 2.4, sy: 0.12, sz: 15 }));
    return { g, r: 8 };
  },
  maple: (R) => {
    const g = new THREE.Group(), s = 1 + R() * 0.5, leaf = ['#d9472b', '#e8743a', '#f2a53a', '#c93a2a'];
    g.add(mesh(GEO.cyl, '#6a4a34', { y: 1.6 * s, sx: 0.35 * s, sy: 3.2 * s, sz: 0.35 * s }));
    [[0, 3.8, 0, 1.9], [0.9, 4.4, 0.5, 1.4], [-0.9, 4.5, -0.3, 1.4], [0.1, 5.4, -0.2, 1.2]].forEach(([x, y, z, r], i) => g.add(mesh(GEO.ico, leaf[(i + Math.floor(R() * 4)) % 4], { x: x * s, y: y * s, z: z * s, sx: r * s, sy: r * 0.85 * s, sz: r * s })));
    return { g, r: 2.2 * s };
  },
  pine: (R) => {
    // 高大的針葉樹：細樹幹、四層越往上越小的深綠圓錐
    const g = new THREE.Group(), s = 1.1 + R() * 0.5, c = ['#2f5f3e', '#3a6f48', '#2a5537'][Math.floor(R() * 3)];
    g.add(mesh(GEO.cyl, '#5a4030', { y: 2 * s, sx: 0.4 * s, sy: 4 * s, sz: 0.4 * s }));
    for (let i = 0; i < 4; i++) g.add(mesh(GEO.cone, c, { y: (3.4 + i * 2) * s, sx: (2.6 - i * 0.5) * s, sy: 3 * s, sz: (2.6 - i * 0.5) * s }));
    return { g, r: 1.6 * s };
  },
  glacier: (R) => ({ g: glacier(R), r: 6.5 }),
});
// 第三版：這幾個園區的島不放一般的小鎮建築，改放各自的地標（種類, 數量, 離岸至少幾公尺, 放大倍數）
const ZONE_TOWN = {
  africa: [['totem', 5, 3, 1.7]],
  desert: [['pyramid', 1, 6], ['sphinx', 1, 4], ['pyramid', 2, 4], ['dune', 7, 2, 0.8]],
  birds: [['aviary', 2, 4], ['birdTree', 9, 2.5]],
  polar: [['glacier', 2, 4]],
  temperate: [['canyon', 1, 5], ['pine', 12, 2], ['maple', 9, 2]],
};
function buildTown(scene, R, blocked, blockers) {
  const spin = [];
  const kinds = ['clock', 'shop', 'gazebo', 'cottage', 'windmill', 'kiosk', 'shop', 'cottage'];
  let n = 0;
  const place = (I, kind, inset, sc = 1) => {
    for (let i = 0; i < 300; i++) {
      const x = I.x0 + R() * (I.x1 - I.x0), z = I.z0 + R() * (I.z1 - I.z0);
      if (!inPolygon(x, z, I.poly) || edgeDist(x, z, I.poly) < inset || (kind === 'lighthouse' && edgeDist(x, z, I.poly) > inset + 3)) continue;
      const { g, r: r0 } = TOWN[kind](R, spin), r = r0 * sc;
      if (kind !== 'lighthouse' && edgeDist(x, z, I.poly) < r + 0.5) continue; // 整個地標都要在島上（沙丘不會超出岸邊）
      if (blocked(x, z, r + 0.6)) continue;
      g.scale.setScalar(sc);
      g.position.set(x, 0, z);
      // 門口朝島中心
      g.rotation.y = Math.atan2(I.cx - x, I.cz - z);
      scene.add(g);
      blockers.push({ x, z, rx: r + 0.4, rz: r + 0.4 });
      return true;
    }
    return false;
  };
  for (const I of ISL.islands) {
    if (I.flora && I.flora !== 'camp') continue; // 非洲動物島留給動物
    if (I.flora === 'camp') { place(I, 'windmill', 2.5); continue; }
    if (!I.zone) { place(I, I.id === 'hub' ? 'clock' : 'lighthouse', I.id === 'hub' ? 6 : 2.2); if (I.id === 'hub') for (const k of ['playground', 'playground', 'shop', 'kiosk', 'gazebo']) place(I, k, 3); continue; } // 入口島（和兒童區合併）有兩座兒童遊戲場
    const zt = ZONE_TOWN[I.zone.id];
    if (zt) { for (const [kind, num, inset, sc] of zt) for (let k = 0; k < num; k++) place(I, kind, inset, sc); place(I, 'lighthouse', 1.6); continue; }
    const cnt = Math.max(1, Math.min(3, Math.round(I.rad / 28)));
    for (let k = 0; k < cnt; k++) place(I, kinds[n++ % kinds.length], 3);
    place(I, 'lighthouse', 1.6);
  }
  return { update(t) { for (const h of spin) h.rotation.z = t * 0.8; for (const b of NIGHT.beams) if (b.visible) b.rotation.y = t * 0.6; } };
}

function makeLabel(html, className) {
  const wrap = document.createElement('div');
  wrap.className = 'lbl';
  wrap.innerHTML = `<div class="${className}">${html}</div>`;
  return { obj: new CSS2DObject(wrap), el: wrap.firstElementChild };
}

export function buildWorld(scene, data, { onPick, onZone, onHover }) {
  const R = rng(11);
  const L = data.layout;
  if (data.islands) setupIslands(data); else setupLevels(data);
  if (!ISL?.float) scene.add(makeTerrain(data.zones)); // 浮空島底下沒有地面
  const sea = ISL ? buildIslands(scene, R) : null;
  const first = scene.children.length; // 這之後加進來的東西，最後再依地面高度抬起來

  // 步道
  const paths = [];
  const samples = [];
  const onTop = { polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }; // 步道、列車路線永遠畫在園區底色上面（沒有框線）
  const pathMat = mat('#f1e6cc', onTop);
  const trainMat = mat('#b4b6b2', onTop); // 列車行駛路線：灰色，遊客請勿進入
  const lay = (geometry) => { const m = new THREE.Mesh(geometry, pathMat); m.receiveShadow = true; m.userData.drape = true; scene.add(m); };
  // 第三版：步道的接頭做順。島上的步道先取樣（每 0.5 公尺），橋頭找得到落在哪一條步道上
  const hosts = ISL?.tall ? L.paths.filter((p) => !p.bridge && p.kind !== 'train').map((p) => {
    const c = curveOf(p.points, !!p.closed), len = c.getLength(), n = Math.max(2, Math.ceil(len * 2));
    return { p, c, len, n, pts: Array.from({ length: n + 1 }, (_, i) => c.getPointAt(i / n)) };
  }) : [];
  const hostAt = (x, z, d) => {
    let best = null, bd = d;
    for (const h of hosts) h.pts.forEach((q, i) => { const e = Math.hypot(q.x - x, q.z - z); if (e < bd) { bd = e; best = { h, i }; } });
    return best;
  };
  // 橋頭 E（橋面走上島的位置，朝 d 方向）順順地彎進步道：三次貝茲曲線，起點沿著橋的方向、終點和步道相切
  const merge = (E, d, h, i, sgn, w) => {
    const S = Math.min(7, Math.max(3, Math.hypot(h.pts[i].x - E[0], h.pts[i].z - E[1]) * 0.9 + 2));
    let j = i + sgn * Math.round(S * 2);
    if (h.p.closed) j = ((j % h.n) + h.n) % h.n;
    else if (j < 0 || j > h.n) return;
    const M = h.pts[j], t = h.c.getTangentAt(Math.min(1, j / h.n)).multiplyScalar(sgn);
    const L2 = Math.hypot(M.x - E[0], M.z - E[1]) * 0.45;
    const bz = new THREE.CubicBezierCurve3(new THREE.Vector3(E[0], 0, E[1]), new THREE.Vector3(E[0] + d[0] * L2, 0, E[1] + d[1] * L2), M.clone().addScaledVector(t, -L2), M.clone());
    lay(ribbon(bz.getPoints(12).map((v) => [v.x, v.z]), w, 0.1).geometry);
  };
  // 平放的圓形鋪面（步道端點的圓角、觀景台），直接用世界座標，drape 才抬得對
  const pad = (x, z, r, y = 0.1) => {
    const pos = [x, y, z], idx = [];
    for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI * 2; pos.push(x + Math.cos(a) * r, y, z - Math.sin(a) * r); if (k) idx.push(0, k, k + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  };
  const lookouts = [];
  for (const p of L.paths) {
    const train = p.kind === 'train';
    const r = ribbon(p.points, p.width, train ? 0.09 : 0.1, !!p.closed);
    const br = ISL?.tall && p.bridge ? ISL.bridges.find((q) => q.a[0] === p.points[0][0] && q.a[1] === p.points[0][1]) : null;
    if (br) {
      // 第三版：橋面、樓梯本身就是路，步道只畫兩頭在島上的那一小段；接到島上步道的地方往兩邊各彎一段（像路口的圓角）
      const at = (k) => [br.a[0] + (br.b[0] - br.a[0]) * k, br.a[1] + (br.b[1] - br.a[1]) * k];
      for (const [k0, k1, e, ke] of [[0, br.k0, br.a, br.k0], [br.k1, 1, br.b, br.k1]]) {
        if (k1 - k0 < 0.02) continue;
        lay(ribbon([at(k0), at(k1)], p.width, 0.1).geometry);
        lay(pad(e[0], e[1], p.width / 2));
        const E = at(ke), dl = Math.hypot(e[0] - E[0], e[1] - E[1]) || 1, d = [(e[0] - E[0]) / dl, (e[1] - E[1]) / dl];
        const hit = hostAt(e[0], e[1], 1.2);
        if (!hit) continue;
        const { h, i } = hit, end = !h.p.closed && (i === 0 || i === h.n);
        for (const sgn of end ? [i === 0 ? 1 : -1] : [1, -1]) merge(E, d, h, i, sgn, Math.min(p.width, h.p.width));
      }
    } else {
      const m = new THREE.Mesh(r.geometry, train ? trainMat : pathMat); m.receiveShadow = true; m.userData.drape = true; scene.add(m);
      // 第三版：步道兩頭補一塊圓形鋪面，兩條步道接在一起的轉角不會有缺口；走到岸邊的死路收成觀景台
      if (ISL?.tall && !train && !p.closed) for (const [e, prev] of [[p.points[0], p.points[1]], [p.points[p.points.length - 1], p.points[p.points.length - 2]]]) {
        const I = islandAt(e[0], e[1]), edge = I ? edgeDist(e[0], e[1], I.poly) : 99;
        const look = edge < 4.5 && !ISL.bridges.some((b) => Math.hypot(b.a[0] - e[0], b.a[1] - e[1]) < 0.5 || Math.hypot(b.b[0] - e[0], b.b[1] - e[1]) < 0.5) && !hosts.some((h) => h.p !== p && h.pts.some((q) => Math.hypot(q.x - e[0], q.z - e[1]) < 1.5));
        if (look) lookouts.push({ x: e[0], z: e[1], I, back: [prev[0] - e[0], prev[1] - e[1]] });
        else lay(pad(e[0], e[1], p.width / 2));
      }
    }
    paths.push({ id: p.id, curve: r.curve, closed: !!p.closed, width: p.width, walkers: p.walkers || 0 });
    const len = r.curve.getLength();
    for (let i = 0; i <= len * 2; i++) {
      const q = r.curve.getPointAt(i / (len * 2));
      samples.push([q.x, q.z, p.width / 2]);
    }
  }
  // 觀景台：走到岸邊的步道盡頭，一塊圓形鋪面（往島內收，不壓到圓角的島緣）＋朝海那一側半圈木欄杆＋一張長椅
  for (const o of lookouts) {
    // 沿著步道往回收，步道盡頭剛好在觀景台中間附近
    const R0 = 2, [dx, dz] = o.back, l = Math.hypot(dx, dz) || 1, s = Math.min(R0 - 0.9, Math.max(0, R0 + 1.3 - edgeDist(o.x, o.z, o.I.poly)));
    const x = o.x + (dx / l) * s, z = o.z + (dz / l) * s, out = Math.atan2(-dz, -dx); // 欄杆、長椅朝步道前進（朝海）的方向
    lay(pad(x, z, R0));
    const post = [], rail = [];
    for (let k = 0; k <= 8; k++) {
      const a = out - Math.PI * 0.55 + (k / 8) * Math.PI * 1.1, px = x + Math.cos(a) * (R0 - 0.15), pz = z + Math.sin(a) * (R0 - 0.15);
      post.push({ p: [px, 0.45, pz], s: [0.12, 0.9, 0.12] });
      if (k < 8) {
        const a2 = a + (Math.PI * 1.1) / 8 / 2, qx = x + Math.cos(a2) * (R0 - 0.15), qz = z + Math.sin(a2) * (R0 - 0.15);
        rail.push({ p: [qx, 0.85, qz], r: [0, -a2 + Math.PI / 2, 0], s: [(R0 - 0.15) * ((Math.PI * 1.1) / 8) + 0.1, 0.08, 0.1] });
      }
    }
    scene.add(instanced(GEO.box, post, mat('#a87a52')));
    scene.add(instanced(GEO.box, rail, mat('#c89a6a')));
    const bx = x + Math.cos(out) * 0.6, bz = z + Math.sin(out) * 0.6;
    scene.add(mesh(GEO.box, '#b98a5c', { x: bx, z: bz, y: 0.42, sx: 1.6, sy: 0.1, sz: 0.45, ry: -out + Math.PI / 2 }));
    for (const sd of [-1, 1]) scene.add(mesh(GEO.box, '#6f5039', { x: bx + Math.cos(out + Math.PI / 2) * 0.6 * sd, z: bz + Math.sin(out + Math.PI / 2) * 0.6 * sd, y: 0.2, sx: 0.1, sy: 0.4, sz: 0.4, ry: -out + Math.PI / 2 }));
    samples.push([x, z, R0]);
  }
  // 離步道邊緣 d 以內。整個園區的步道取樣點很多，先放進 8×8 的格子，只查附近的格子
  const CELL = 8, grid = new Map();
  const key = (i, j) => i * 100003 + j;
  for (const sm of samples) {
    const k = key(Math.floor(sm[0] / CELL), Math.floor(sm[1] / CELL));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(sm);
  }
  const near = (x, z, d) => {
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), span = Math.ceil((d + 2.5) / CELL);
    for (let i = ci - span; i <= ci + span; i++) for (let j = cj - span; j <= cj + span; j++) {
      const cell = grid.get(key(i, j));
      if (cell) for (const [sx, sz, w] of cell) if ((x - sx) ** 2 + (z - sz) ** 2 < (w + d) ** 2) return true;
    }
    return false;
  };

  // 最近的步道取樣點（離步道邊緣 d 以內才回傳）
  const nearestSample = (x, z, d) => {
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), span = Math.ceil((d + 2.5) / CELL);
    let best = null, bd = Infinity;
    for (let i = ci - span; i <= ci + span; i++) for (let j = cj - span; j <= cj + span; j++) {
      const cell = grid.get(key(i, j));
      if (cell) for (const sm of cell) {
        const g = Math.hypot(x - sm[0], z - sm[1]) - sm[2];
        if (g < d && g < bd) { bd = g; best = sm; }
      }
    }
    return best;
  };
  // 建築不要壓到步道：檢查整個佔地範圍，有碰到就往遠離步道的方向一點一點推開
  const clearOfPaths = (b, hw, hd) => {
    const c = Math.cos(b.ry || 0), sn = Math.sin(b.ry || 0);
    for (let it = 0; it < 120; it++) {
      let px = 0, pz = 0, hit = false;
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
        const lx = (i / 3) * hw, lz = (j / 3) * hd;
        const x = b.x + lx * c + lz * sn, z = b.z - lx * sn + lz * c;
        const n = nearestSample(x, z, 0.5);
        if (n) { hit = true; const dx = x - n[0], dz = z - n[1], l = Math.hypot(dx, dz) || 1; px += dx / l; pz += dz / l; }
      }
      if (!hit) return it;
      const l = Math.hypot(px, pz) || 1;
      b.x += (px / l) * 0.4; b.z += (pz / l) * 0.4;
    }
    return -1;
  };

  const blockers = [];
  const blocked = (x, z, pad) => {
    for (const b of blockers) {
      const u = (x - b.x) / (b.rx + pad), v = (z - b.z) / (b.rz + pad);
      if (u * u + v * v < 1) return true;
    }
    return near(x, z, pad);
  };
  // 第三版：橋頭（橋面走上島的地方）留一塊空地，燈塔、樹不會擠在橋頭旁邊
  for (const b of ISL?.tall ? ISL.bridges : []) for (const k of [b.k0, b.k1]) {
    const x = b.a[0] + (b.b[0] - b.a[0]) * k, z = b.a[1] + (b.b[1] - b.a[1]) * k;
    blockers.push({ x, z, rx: 3, rz: 3 });
  }
  // 第三版：海上大橋在島上的那幾段（車站前的路、迴車廣場、鳥園站旁）不能擺燈塔、種樹
  for (const v of ISL?.viaducts || []) v.pts.forEach(([x, z], k) => {
    if (islandAt(x, z) || ISL.islands.some((I) => edgeDist(x, z, I.poly) < 5)) blockers.push({ x, z, rx: k === 0 || k === v.pts.length - 1 ? 5.5 : 4, rz: k === 0 || k === v.pts.length - 1 ? 5.5 : 4 });
  });

  // 園區範圍的主題色畫在地形上（見 zoneTints），這裡不用再鋪一層底面

  // 晚上：點光源很吃效能（27 盞時 GPU 一幀要 68ms），所以不用燈照展場；
  // 改成所有展場地面和動物一起加一點自發光（見 setNight 和 animals.setNight）
  let night = false;
  const NIGHT_GROUND = 0x2e2618;
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffcf80', emissiveIntensity: 0.2 });
  const windowMat = new THREE.MeshStandardMaterial({ color: '#9fb2d6', roughness: 0.35, emissive: '#ffd27a', emissiveIntensity: 0 });

  // 展場：地面直接畫在草地上，邊界用植物和石頭圍出來
  const enclosures = new Map();
  const hits = [];
  const edgeTrees = [];
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false });
  const zoneById = new Map(data.zones.map((z) => [z.id, z]));
  for (const a of data.animals) {
    const e = a.enclosure;
    const theme = THEMES[e.theme];
    const outline = outlineOf(e, R);
    const g = new THREE.Group();
    g.position.set(e.x, 0, e.z);
    scene.add(g);
    blockers.push({ x: e.x, z: e.z, rx: e.rx * 1.22, rz: e.rz * 1.22 });

    // 外圈一層半透明的過渡色，讓展場地面和草地自然接起來
    // 第三版：展場地面和所在那座島同色系（使用者：同地區同一個顏色，只用深淺區分），同一區的展場輪流淺幾階；
    // 冰原那種很亮的島改成往深一點
    const floorC = ISL?.tall ? enclosureFloor(e, a.zone) : theme.top;
    const topMat = new THREE.MeshStandardMaterial({ color: floorC, roughness: 1, flatShading: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    // 第三版：外圈不往草綠色靠（土色展場會多一圈綠線），改成中央色塊的顏色再深一點點
    const fade = ISL?.tall ? new THREE.Color(floorC).offsetHSL(0, 0.02, -0.06) : new THREE.Color(theme.top).lerp(new THREE.Color(COLOR.grass), 0.55);
    const fadeMat = new THREE.MeshStandardMaterial({ color: fade, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    g.add(patch(outline(0.6, 1.12), fadeMat, 0.02));
    g.add(patch(outline(0.6), topMat, 0.03));
    const n0 = edgeTrees.length;
    if (!ISL) g.add(border(e, outline, theme, R, near, edgeTrees)); // 島嶼版：動物之間不隔開，沒有石頭、灌木、柵欄
    // 雨林區的展場邊緣也用深綠色的樹
    if (zoneById.get(a.zone)?.flora === 'rainforest') for (let k = n0; k < edgeTrees.length; k++) edgeTrees[k].c = RAIN_LEAF[k % RAIN_LEAF.length];

    const top = new THREE.Group();
    top.position.y = FLOOR;
    g.add(top);
    for (const p of e.props || []) {
      const o = PROPS[p.type](p, R);
      o.position.x += p.at[0];
      o.position.z += p.at[1];
      top.add(o);
    }

    const hit = new THREE.Mesh(GEO.hit, hitMat);
    hit.scale.set(e.rx, 4, e.rz); hit.position.y = 2; hit.userData.id = a.id; hit.userData.dynamic = true;
    g.add(hit); hits.push(hit);

    const ring = new THREE.Mesh(ribbon(outline(0.5, 1.16), 0.4, 0.18, true).geometry, ringMat);
    ring.visible = false;
    g.add(ring);

    // 名牌平常藏起來，滑到展場上（或選取時）才出現；編號圓圈用園區的色系
    const { obj, el } = makeLabel(
      `<span class="no">${a.no}</span><span class="nm">${a.name}<small>${a.habitat}</small></span><span class="dot" aria-hidden="true"></span>`,
      'tag3d'
    );
    el.style.setProperty('--c', a.color);
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.addEventListener('click', (ev) => { ev.stopPropagation(); onPick(a.id); });
    el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') onPick(a.id); });
    // 滑鼠移到名牌上時，畫布收不到 pointermove，要自己維持 hover
    el.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') onHover(a.id); });
    el.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') onHover(null); });
    obj.position.set(0, 5.2, 0);
    g.add(obj);

    // 步道旁立一支路燈，晚上燈泡會亮
    const pole = outline(1.2, 1.08).find(([x, z]) => near(e.x + x, e.z + z, 2.6)) || [e.rx, 0];
    g.add(mesh(GEO.cyl, '#4a4f52', { x: pole[0], z: pole[1], y: 1.8, sx: 0.09, sy: 3.6, sz: 0.09 }));
    g.add(mesh(GEO.sph, null, { material: bulbMat, x: pole[0], z: pole[1], y: 3.7, sx: 0.32, sy: 0.32, sz: 0.32, shadow: false }));
    // 晚上每個展場都亮：路燈一圈光暈，地上一大片暖色光（加法混色的貼片，不用點光源）
    halo(g, pole[0], 3.7, pole[1], '#ffd28a', 3);
    const glow = new THREE.Mesh(GEO.disc, LIGHTS.pool);
    glow.rotation.x = -Math.PI / 2;
    glow.scale.set(e.rx * 1.25, e.rz * 1.25, 1);
    glow.position.y = FLOOR + 0.25;
    glow.visible = false;
    glow.userData.dynamic = true;
    g.add(glow);
    LIGHTS.pools.push(glow);

    enclosures.set(a.id, { group: g, center: new THREE.Vector3(e.x, groundY(e.x, e.z), e.z), e, ground: topMat, ring, tag: el, label: obj });
  }

  // 展場以外的造景（穀倉、乾草堆）
  for (const d of L.decor || []) {
    const o = PROPS[d.type]({ ...d, at: [0, 0] }, R);
    o.position.set(d.x, 0, d.z);
    scene.add(o);
    blockers.push({ x: d.x, z: d.z, rx: d.r || 1.5, rz: d.r || 1.5 });
  }

  // 河流：沿著曲線的水面，兩岸堆石頭、種蕨類；周圍不種灌木
  for (const rv of L.rivers || []) {
    const { geometry, curve } = ribbon(rv.points, rv.width, 0.05);
    const water = new THREE.Mesh(geometry, riverMat);
    water.receiveShadow = true;
    water.userData.drape = true;
    scene.add(water);
    const len = curve.getLength(), banks = [], ferns = [];
    const pt = new THREE.Vector3(), tg = new THREE.Vector3();
    for (let u = 0; u <= len; u += 1.3) {
      curve.getPointAt(u / len, pt); curve.getTangentAt(u / len, tg);
      blockers.push({ x: pt.x, z: pt.z, rx: rv.width / 2 + 0.9, rz: rv.width / 2 + 0.9 });
      for (const side of [1, -1]) {
        const off = rv.width / 2 + 0.15 + R() * 0.3, sz = 0.3 + R() * 0.45;
        const bx = pt.x - tg.z * off * side, bz = pt.z + tg.x * off * side;
        banks.push({ p: [bx, sz * 0.25, bz], r: [R(), R() * 6, R()], s: [sz, sz * 0.6, sz], c: new THREE.Color(COLOR.rock).offsetHSL(0, 0, (R() - 0.5) * 0.1).getStyle() });
        if (R() < 0.45) {
          const f = off + 0.8 + R() * 0.6, fh = 0.7 + R() * 0.6;
          ferns.push({ p: [pt.x - tg.z * f * side, fh / 2, pt.z + tg.x * f * side], r: [(R() - 0.5) * 0.6, R() * 6, (R() - 0.5) * 0.6], s: [0.35, fh, 0.6], c: R() < 0.5 ? '#3f8a42' : '#5aa04c' });
        }
      }
    }
    scene.add(instanced(GEO.rock, banks));
    if (ferns.length) scene.add(instanced(GEO.cone, ferns));
  }

  // 保育廊道：有屋頂的步道與解說牌
  const C = L.corridor;
  blockers.push({ x: C.x, z: (C.z0 + C.z1) / 2, rx: 2.4, rz: (C.z1 - C.z0) / 2 + 1 });
  for (let z = C.z0; z <= C.z1 + 0.01; z += 2.75) {
    for (const dx of [-1.8, 1.8]) scene.add(mesh(GEO.cyl, COLOR.wood, { x: C.x + dx, z, y: 1.6, sx: 0.1, sy: 3.2, sz: 0.1 }));
    scene.add(mesh(GEO.box, COLOR.roof, { x: C.x, z: z + 1.35, y: 3.3, sx: 4.2, sy: 0.14, sz: 2.9 }));
  }
  for (let z = C.z0 + 1.4; z < C.z1; z += 5.5) {
    scene.add(mesh(GEO.box, COLOR.cream, { x: C.x - 1.65, z, y: 1.1, sx: 0.08, sy: 1, sz: 1.4 }));
  }

  // 服務設施小屋
  for (const H0 of L.houses) {
    const H = { ...H0 };
    clearOfPaths(H, 1.9, 2.3);
    blockers.push({ x: H.x, z: H.z, rx: 2.6, rz: 3 });
    scene.add(mesh(GEO.box, COLOR.cream, { x: H.x, z: H.z, y: 1.3, sx: 3.4, sy: 2.6, sz: 4.2 }));
    scene.add(mesh(GEO.roof, '#c8673f', { x: H.x, z: H.z, y: 3.2, sx: 2.8, sy: 1.2, sz: 3.4, ry: Math.PI / 4 }));
  }

  // 園區入口拱門（柱子沿 local z 排列，和步道垂直）
  const facilityLabels = [];
  for (const G of L.gates) {
    const w = G.w || 2.2;
    const h = G.h || 3.8;
    const gate = new THREE.Group();
    gate.position.set(G.x, 0, G.z);
    gate.rotation.y = G.ry;
    for (const s of [-w, w]) gate.add(mesh(GEO.box, COLOR.woodLight, { z: s, y: h / 2, sx: 0.5, sy: h, sz: 0.5 }));
    gate.add(mesh(GEO.box, G.color || zoneById.get(G.zone).color, { y: h + 0.15, sx: 0.7, sy: 0.8, sz: w * 2 + 0.8 }));
    scene.add(gate);
    blockers.push({ x: G.x, z: G.z, rx: w, rz: w });
    if (G.label) {
      const { obj } = makeLabel(G.label, 'zone3d zone-sm');
      obj.position.set(G.x, h + 2.2, G.z);
      scene.add(obj);
    }
  }

  // 入口廣場：鋪面圓形廣場＋噴水池，大門、兩個園區都從這裡出發
  const P = L.plaza;
  if (P) {
    scene.add(mesh(GEO.disc, null, { material: pathMat, rx: -Math.PI / 2, sx: P.r, sy: P.r, x: P.x, z: P.z, y: 0.1, shadow: false }));
    if (P.fountain !== false) {
      const f = PROPS.fountain();
      f.position.set(P.x, 0.1, P.z);
      f.scale.setScalar(1.5);
      scene.add(f);
    }
    blockers.push({ x: P.x, z: P.z, rx: P.r, rz: P.r });
    const { obj } = makeLabel(P.label, 'zone3d zone-sm');
    obj.position.set(P.x, 7, P.z);
    scene.add(obj);
  }

  // 園區建築：教育中心、行政大樓、動物行為學院、售票亭、入口閘門（位置照官方平面圖）
  // 每棟樓用深淺不一的灰階，女兒牆比牆面再亮一點
  const GRAYS = ['#f4f4f6', '#d2d4d9', '#b6b9c1', '#e6e6ea', '#a2a6b0', '#c6c8cf'];
  let gi = 0;
  for (const b0 of L.buildings || []) {
    const b = { ...b0 };
    // 入口閘門本來就橫跨步道，其他建築都要避開步道
    if (b.type === 'block') clearOfPaths(b, b.w / 2 + 2, b.d / 2 + 2);
    else if (b.type === 'shop') clearOfPaths(b, b.w / 2 + 0.3, b.d / 2 + 1.2);
    else if (b.type === 'booth') clearOfPaths(b, 2.2, 1.8);
    const g = new THREE.Group();
    g.position.set(b.x, 0, b.z);
    g.rotation.y = b.ry || 0;
    let top = 4;
    if (b.type === 'block' && ISL?.tall) {
      top = storyHall(g, b, gi++, windowMat) + 1.5;
      blockers.push({ x: b.x, z: b.z, rx: b.w / 2 + 1, rz: b.d / 2 + 1 });
    } else if (b.type === 'block') {
      // 灰階方塊建築：每層一圈有直櫺的藍色窗帶、女兒牆屋頂、牆角幾棵圓樹
      const W = b.w, D = b.d, H = b.h, B = 0;
      const floors = Math.max(1, Math.round(H / 3)), fh = H / floors;
      const wall = GRAYS[gi++ % GRAYS.length], cap = new THREE.Color(wall).lerp(new THREE.Color('#ffffff'), 0.35).getStyle();
      g.add(mesh(GEO.box, null, { material: softMat(wall), y: B + H / 2, sx: W, sy: H, sz: D }));
      const mullions = [];
      for (let k = 0; k < floors; k++) {
        const bh = fh * (k === 0 ? 0.62 : 0.44), y = B + k * fh + fh * (k === 0 ? 0.42 : 0.52);
        g.add(mesh(GEO.box, null, { material: windowMat, y, sx: W + 0.08, sy: bh, sz: D + 0.08, shadow: false }));
        const step = k === 0 ? 2.4 : 0.9;
        for (let x = -W / 2 + step; x < W / 2 - 0.2; x += step) for (const sz of [1, -1]) mullions.push({ p: [x, y, sz * (D / 2 + 0.06)], s: [0.1, bh, 0.06] });
        for (let z = -D / 2 + step; z < D / 2 - 0.2; z += step) for (const sx of [1, -1]) mullions.push({ p: [sx * (W / 2 + 0.06), y, z], s: [0.06, bh, 0.1] });
      }
      g.add(instanced(GEO.box, mullions, softMat(wall)));
      g.add(mesh(GEO.box, null, { material: softMat(cap), y: B + H + 0.3, sx: W + 0.7, sy: 0.6, sz: D + 0.7 }));
      g.add(mesh(GEO.box, null, { material: softMat(wall), y: B + H + 0.62, sx: W - 0.2, sy: 0.04, sz: D - 0.2, shadow: false }));
      for (const [tx, tz, ts] of [[-W / 2 - 1.2, D / 2 + 1.1, 0.9], [-W / 2 + 0.6, D / 2 + 1.4, 0.7], [W / 2 + 1.2, -D / 2 + 1, 1]]) {
        g.add(mesh(GEO.cyl, '#8a6a4a', { x: tx, z: tz, y: B + 0.7 * ts, sx: 0.12 * ts, sy: 1.4 * ts, sz: 0.12 * ts }));
        g.add(mesh(GEO.sph, null, { material: softMat('#6fae5e'), x: tx, z: tz, y: B + 2 * ts, sx: 0.8 * ts, sy: 1.15 * ts, sz: 0.8 * ts }));
      }
      top = H + 2.5;
      blockers.push({ x: b.x, z: b.z, rx: b.w / 2 + 1, rz: b.d / 2 + 1 });
    } else if (b.type === 'shop') {
      // 廣場旁的商店：白色小房子、彩色招牌帶、門口遮陽棚，正面朝向廣場
      const h = b.h || 3.2;
      const wall = ISL?.tall ? HALL.wall[gi++ % 4] : GRAYS[gi++ % GRAYS.length], cap = new THREE.Color(wall).lerp(new THREE.Color('#ffffff'), 0.35).getStyle();
      g.add(mesh(GEO.box, null, { material: softMat(wall), y: h / 2, sx: b.w, sy: h, sz: b.d }));
      g.add(mesh(GEO.box, null, { material: softMat(cap), y: h + 0.15, sx: b.w + 0.4, sy: 0.3, sz: b.d + 0.4 }));
      // 第三版：平頂上再加一個人字形斜屋頂，顏色跟招牌（白招牌就跟遮陽棚）
      if (ISL?.tall) g.add(mesh(GEO.prism, b.sign === '#ffffff' ? b.awning : b.sign, { y: h + 0.3 + 0.5 * (b.d * 0.4 / 1.5), sx: b.w + 0.6, sy: b.d * 0.4 / 1.5, sz: (b.d + 0.8) / 1.73 }));
      g.add(mesh(GEO.box, null, { material: windowMat, y: 1.1, z: b.d / 2 + 0.03, sx: b.w * 0.78, sy: 1.5, sz: 0.06, shadow: false }));
      g.add(mesh(GEO.box, null, { material: softMat(b.sign), y: h - 0.4, z: b.d / 2 + 0.07, sx: b.w + 0.02, sy: 0.7, sz: 0.12 }));
      if (b.stripe) g.add(mesh(GEO.box, null, { material: softMat(b.stripe), y: h - 0.85, z: b.d / 2 + 0.08, sx: b.w + 0.02, sy: 0.18, sz: 0.12 }));
      g.add(mesh(GEO.box, null, { material: softMat(b.awning), y: 2.05, z: b.d / 2 + 0.65, sx: b.w * 0.86, sy: 0.1, sz: 1.3, rx: 0.22 }));
      top = h + 1;
      blockers.push({ x: b.x, z: b.z, rx: b.w / 2 + 0.8, rz: b.d / 2 + 0.8 });
    } else if (b.type === 'booth') {
      g.add(mesh(GEO.box, COLOR.cream, { y: 1.2, sx: 3.6, sy: 2.4, sz: 2.8 }));
      g.add(mesh(GEO.box, null, { material: windowMat, y: 1.5, z: 1.42, sx: 2.6, sy: 0.9, sz: 0.05, shadow: false })); // 朝向遊客的售票窗口
      g.add(mesh(GEO.box, COLOR.roof, { y: 2.6, sx: 4.4, sy: 0.3, sz: 3.6 }));
      if (ISL?.tall) g.add(mesh(GEO.roof, TALL.terra, { y: 3.45, sx: 2.9, sy: 1.4, sz: 2.4, ry: Math.PI / 4 })); // 第三版：尖屋頂
      blockers.push({ x: b.x, z: b.z, rx: 2.6, rz: 2.2 });
    } else if (b.type === 'turnstiles') {
      const n = 6;
      for (let k = 0; k < n; k++) {
        const x = -b.w / 2 + ((k + 0.5) * b.w) / n;
        g.add(mesh(GEO.box, '#9aa3a6', { x, y: 0.55, sx: 0.35, sy: 1.1, sz: 1.2 }));
        g.add(mesh(GEO.cyl, '#c9cfd1', { x: x + 0.5, y: 0.85, sx: 0.04, sy: 0.9, sz: 0.04, rz: Math.PI / 2 }));
      }
      for (const sd of [-1, 1]) g.add(mesh(GEO.cyl, '#7d8a8f', { x: sd * (b.w / 2 + 0.4), y: 1.8, sx: 0.12, sy: 3.6, sz: 0.12 }));
      g.add(mesh(GEO.box, COLOR.roof, { y: 3.7, sx: b.w + 1.6, sy: 0.3, sz: 2.4 }));
      top = 5;
    }
    scene.add(g);
    const { obj } = makeLabel(b.name, 'zone3d zone-sm');
    obj.position.set(b.x, top + 1, b.z);
    scene.add(obj);
  }

  // 設施：只有圓形圖示，名稱看右下角圖例（滑過去也會出現提示）
  for (const f of L.facilities) {
    const def = FACILITIES[f.type];
    const { obj, el } = makeLabel(def.icon, 'fac');
    el.style.setProperty('--f', def.color);
    el.title = f.label;
    el.setAttribute('aria-label', f.label);
    obj.position.set(f.x, f.type === 'corridor' ? 4.2 : 3.6, f.z);
    scene.add(obj);
    facilityLabels.push(obj);
  }

  // 園區名稱：沒有底的大字，點了會飛到那一區；拉遠看全園時平常隱藏，滑鼠移到那座島上才出現
  const zoneTags = new Map();
  for (const z of data.zones) {
    const { obj, el } = makeLabel(`${z.name}<small>${z.en}</small>`, 'zone3d');
    zoneTags.set(z.id, el);
    el.style.setProperty('--z', z.color);
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.addEventListener('click', (ev) => { ev.stopPropagation(); onZone(z.id); });
    el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') onZone(z.id); });
    obj.position.set(z.label.x, 9, z.label.z);
    scene.add(obj);
  }

  // 貓空纜車：先決定鐵塔的位置（避開展場、步道、建築），樹才不會種在塔底下；纜線和車廂在最後蓋
  const CW = L.cableway;
  const towers = [];
  if (CW) {
    CW.stations.slice(0, -1).forEach(([ax, az], k) => {
      const [bx, bz] = CW.stations[k + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / CW.towerGap));
      for (let i = 1; i < n; i++) {
        let best = null;
        for (const dk of [0, 0.03, -0.03, 0.06, -0.06, 0.1, -0.1]) {
          const u = i / n + dk, x = ax + (bx - ax) * u, z = az + (bz - az) * u;
          if (!blocked(x, z, 1.5)) { best = { x, z, leg: k }; break; }
        }
        if (best) { towers.push(best); blockers.push({ x: best.x, z: best.z, rx: 1.8, rz: 1.8 }); }
      }
    });
  }

  // 第三版：島上加幾棟小建築（鐘塔、燈塔、風車、商店…），種樹前先擺，樹才會避開
  const town = ISL?.tall ? buildTown(scene, R, blocked, blockers) : null;

  // 樹與灌木：展場之間種滿，外圍山丘密集
  // 島嶼版：樹只種在島上，沿著岸邊一圈（離岸 1.5～7 公尺），島中間空出來看動物
  const shoreBand = (x, z) => { const I = islandAt(x, z, 1.5); return !!I && edgeDist(x, z, I.poly) < 7; };
  const inPark = (x, z, k) => (ISL ? shoreBand(x, z) : parkR(x, z) < k);
  // 非洲草原（flora: 'savanna'）和極地（'polar'）不種一般的圓樹：草原改種平頂金合歡樹，極地只有雪堆
  const curvePoly = (zn) => new THREE.CatmullRomCurve3(zn.outline.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal').getPoints(90).map((v) => [v.x, v.z]);
  // 第二版的非洲小島各有島型（flora）：草原、營地是草原，岩石島也不種圓樹；泥岸、森林、馬達加斯加島照常種樹
  const DRY = { savanna: 'savanna', camp: 'savanna', herd: 'savanna', rock: 'rock' };
  const dryZones = ISL
    ? ISL.islands.filter((I) => (I.flora ? DRY[I.flora] : I.zone && (I.zone.flora === 'savanna' || I.zone.flora === 'polar' || (ISL.tall && I.zone.id === 'desert')))).map((I) => ({ flora: I.flora ? DRY[I.flora] : ISL.tall && I.zone.id === 'desert' ? 'desert' : I.zone.flora, poly: I.poly }))
    : data.zones.filter((zn) => zn.outline && (zn.flora === 'savanna' || zn.flora === 'polar')).map((zn) => ({ flora: zn.flora, poly: curvePoly(zn) }));
  const dryAt = (x, z) => dryZones.find((d) => inPolygon(x, z, d.poly))?.flora;
  const acacias = [];
  const spots = [];
  for (const t of edgeTrees) {
    const f = dryAt(t.x, t.z);
    if (!f) spots.push(t);
    else if (f === 'savanna' && R() < 0.35) acacias.push({ x: t.x, z: t.z, s: 0.7 + R() * 0.4 });
  }
  for (let i = 0; i < 20000 && spots.length < edgeTrees.length + (ISL ? 450 : 1300); i++) {
    const x = PARK.x + (R() * 2 - 1) * PARK.rx, z = PARK.z + (R() * 2 - 1) * PARK.rz;
    if (!inPark(x, z, 0.98) || blocked(x, z, 1.3) || dryAt(x, z)) continue;
    spots.push({ x, z, y: 0, s: 0.8 + R() * 0.6, pine: R() < 0.2 });
  }
  for (let i = 0; i < (ISL?.float ? 0 : 1500); i++) { // 浮空島外圍沒有山
    const a = R() * Math.PI * 2, r = 1.02 + Math.pow(R(), 0.8) * 0.9;
    const x = PARK.x + Math.cos(a) * r * PARK.rx, z = PARK.z + Math.sin(a) * r * PARK.rz;
    if (Math.abs(x - PARK.x) > 495 || Math.abs(z - PARK.z) > 555) continue;
    if (PEAKS.some((p) => p.snow && peakShape(p, x, z) > p.h * p.snow * 0.85)) continue; // 雪線以上不長樹
    const y = terrainHeight(x, z);
    if (ISL && y < 1.5) continue; // 海裡、沙灘上不長樹
    spots.push({ x, z, y: -0.2, s: 1.3 + R() * 1.4, pine: R() < 0.25 + Math.min(0.5, y / 50) });
  }
  // 園區底色裡面種滿灌木、矮樹、草叢（約 85% 的空地），展場像是森林裡的一塊空地，而不是被圈起來
  const zoneBushes = [], tufts = [], snow = [];
  const inPoly = (x, z, poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  for (const zn of data.zones) {
    if (!zn.outline) continue;
    // 島嶼版：種在整座島上（離岸邊 1.2 公尺以內不種），密度只有一半，動物之間不會被植物隔開
    // 第二版的非洲區是很多座小島，每座島依島型（flora）種不同的植物
    // 兒童區和入口廣場合併成同一座島（hub）：整座島一起種，不再只照兒童區原本的輪廓種（原本左半邊很密、右半邊空的）
    const isles = ISL ? ISL.islands.filter((I) => I.zone === zn || (ISL.tall && zn.id === 'children' && I.id === 'hub')) : [];
    for (const isle of isles.length ? isles : [null]) {
      const poly = isle ? isle.poly : new THREE.CatmullRomCurve3(zn.outline.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal').getPoints(90).map((v) => [v.x, v.z]);
      const xs = poly.map((q) => q[0]), zs = poly.map((q) => q[1]);
      const STEP = 2.3;
      const fl = isle?.flora;
      const rain = zn.flora === 'rainforest' || fl === 'forest'; // 雨林、森林島：深綠色的灌木和蕨類，沒有橘紅色的樹
      const savanna = fl ? DRY[fl] === 'savanna' : zn.flora === 'savanna', polar = zn.flora === 'polar';
      const rocky = fl === 'rock' || (ISL?.tall && zn.id === 'desert'), wet = fl === 'wet'; // 第三版的沙漠島：和岩石島一樣只有石頭和乾草
      const leafOf = () => (rain ? RAIN_LEAF : COLOR.leaf)[Math.floor(R() * (rain ? RAIN_LEAF.length : COLOR.leaf.length))];
      for (let x = Math.min(...xs); x < Math.max(...xs); x += STEP) for (let z = Math.min(...zs); z < Math.max(...zs); z += STEP) {
        const px = x + (R() - 0.5) * STEP, pz = z + (R() - 0.5) * STEP;
        if (R() > (isle ? 0.45 : 0.85) || !inPoly(px, pz, poly) || blocked(px, pz, isle ? 1.2 : 0.5)) continue;
        const shore = isle ? edgeDist(px, pz, poly) : 0;
        if (isle && (shore < 1.2 || (shore > 7 && R() < 0.6))) continue; // 島中間種得更稀
        if (!savanna && !polar && !rocky && dryAt(px, pz)) continue; // 和草原、極地重疊的地方交給那一區種
        const k = R();
        if (rocky) {
          // 岩石島：灰褐色大石頭和稀疏的乾草
          if (k < 0.22) {
            const sz = 0.6 + R() * 1.1;
            zoneBushes.push({ p: [px, sz * 0.25, pz], r: [R(), R() * 6, R()], s: [sz, sz * 0.7, sz], c: ['#a89a86', '#9d8f7c', '#b8aa96'][Math.floor(R() * 3)] });
          } else if (k < 0.6) {
            for (let n = 0; n < 3; n++) {
              const h = 0.6 + R() * 0.7;
              tufts.push({ p: [px + (R() - 0.5) * 1, h / 2, pz + (R() - 0.5) * 1], r: [(R() - 0.5) * 0.4, 0, (R() - 0.5) * 0.4], s: [0.13, h, 0.13], c: ['#c9a24f', '#b89a4a', '#a8915a'][Math.floor(R() * 3)] });
            }
          }
          continue;
        }
        if (wet && shore < 4.5) {
          // 泥岸的島：岸邊一叢叢綠色蘆葦
          if (k < 0.85) for (let n = 0; n < 5; n++) {
            const h = 1.2 + R() * 1.1;
            tufts.push({ p: [px + (R() - 0.5) * 1.2, h / 2, pz + (R() - 0.5) * 1.2], r: [(R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.3], s: [0.12, h, 0.12], c: ['#5f8f3a', '#7aa046', '#4f7a32', '#8aa84e'][Math.floor(R() * 4)] });
          }
          continue;
        }
        if (savanna) {
          // 草原：枯黃的高草叢為主，零星的橄欖色灌木和金合歡樹
          if (k < 0.15) {
            const sz = 0.5 + R() * 0.5;
            zoneBushes.push({ p: [px, sz * 0.3, pz], r: [R(), R() * 6, R()], s: [sz, sz * 0.6, sz], c: ['#8a8a4a', '#9a9550', '#7a7a40'][Math.floor(R() * 3)] });
          } else if (k < 0.9) {
            for (let n = 0; n < 4; n++) {
              const h = 0.8 + R() * 0.9;
              tufts.push({ p: [px + (R() - 0.5) * 1.2, h / 2, pz + (R() - 0.5) * 1.2], r: [(R() - 0.5) * 0.4, 0, (R() - 0.5) * 0.4], s: [0.14, h, 0.14], c: ['#d9b86a', '#c9a24f', '#e2c27a', '#b89a4a'][Math.floor(R() * 4)] });
            }
          } else if (R() < 0.35 && !blocked(px, pz, 2.5)) acacias.push({ x: px, z: pz, s: 0.8 + R() * 0.5 });
          continue;
        }
        if (polar) {
          // 極地：白色雪堆
          if (k < 0.3) {
            const sz = 0.7 + R() * 1.0;
            snow.push({ p: [px, sz * 0.08, pz], r: [0, R() * 6, 0], s: [sz, sz * 0.3, sz * 0.85], c: R() < 0.5 ? '#ffffff' : '#eef6fa' });
          }
          continue;
        }
        if (fl === 'forest' && k < 0.4 && !blocked(px, pz, 2)) {
          // 森林島：樹種得比其他島密
          spots.push({ x: px, z: pz, y: 0, s: 0.75 + R() * 0.45, pine: false, c: leafOf() });
          continue;
        }
        if (k < 0.5) {
          const sz = 0.5 + R() * 0.7;
          zoneBushes.push({ p: [px, sz * 0.35, pz], r: [R(), R() * 6, R()], s: [sz, sz * 0.75, sz], c: new THREE.Color(leafOf()).offsetHSL(0, 0, (R() - 0.6) * 0.12).getStyle() });
        } else if (k < 0.8) {
          for (let n = 0; n < 3; n++) {
            const h = (0.5 + R() * 0.6) * (rain ? 1.6 : 1);
            tufts.push({ p: [px + (R() - 0.5) * 0.7, h / 2, pz + (R() - 0.5) * 0.7], r: [(R() - 0.5) * 0.5, 0, (R() - 0.5) * 0.5], s: [rain ? 0.3 : 0.12, h, rain ? 0.5 : 0.12], c: rain ? (R() < 0.5 ? '#3f8a42' : '#2f6f3a') : R() < 0.5 ? '#8dbf4e' : '#a4cc5c' });
          }
        } else if (!isle || shore < 7 || fl === 'forest') {
          spots.push({ x: px, z: pz, y: 0, s: (0.55 + R() * 0.35) * (rain ? 1.5 : 1), pine: !rain && R() < 0.15, c: rain ? leafOf() : null });
        }
      }
    }
  }
  if (zoneBushes.length) scene.add(instanced(GEO.ico, zoneBushes));
  if (snow.length) scene.add(instanced(GEO.ico, snow, new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1, emissive: '#d8e8f0', emissiveIntensity: 0.35 })));
  if (tufts.length) scene.add(instanced(GEO.cone, tufts));
  scene.add(forest(spots, R));
  const shrubs = [];
  for (let i = 0; i < 24000 && shrubs.length < (ISL ? 700 : 1800); i++) {
    const x = PARK.x + (R() * 2 - 1) * PARK.rx, z = PARK.z + (R() * 2 - 1) * PARK.rz;
    if (!inPark(x, z, 0.97) || blocked(x, z, 0.6) || dryAt(x, z)) continue;
    const s = 0.35 + R() * 0.45;
    shrubs.push({ p: [x, s * 0.35, z], r: [R(), R() * 6, R()], s: [s, s * 0.8, s], c: new THREE.Color(COLOR.leaf[Math.floor(R() * COLOR.leaf.length)]).offsetHSL(0, 0, (R() - 0.6) * 0.1).getStyle() });
  }
  scene.add(instanced(GEO.ico, shrubs));
  // 金合歡樹冠很寬：樹冠會伸進展場的就不種，動物走動時才不會穿過樹
  const canopyHits = (a) => { const r = 2.4 * a.s * (ISL?.tall ? 1.5 : 1); return data.animals.some(({ enclosure: e }) => ((a.x - e.x) / (e.rx + r)) ** 2 + ((a.z - e.z) / (e.rz + r)) ** 2 < 1); };
  for (const a of acacias) {
    if (canopyHits(a)) continue;
    const o = PROPS.acacia({ s: a.s * (ISL?.tall ? 1.5 : 1) }, R); // 第三版非洲的樹放大加高
    o.position.set(a.x, 0, a.z);
    o.rotation.y = R() * 6;
    scene.add(o);
  }

  // 遊園巴士：沿列車路線在「列車總站」和「鳥園站」之間來回
  const bus = (() => {
    const route = paths.find((p) => L.paths.find((q) => q.id === p.id)?.kind === 'train');
    if (!route || !L.shuttle) return null;
    const len = route.curve.getLength();
    const v = new THREE.Vector3();
    const uOf = ([x, z]) => {
      let best = 0, bd = Infinity;
      for (let i = 0; i <= 600; i++) {
        route.curve.getPointAt(i / 600, v);
        const d = (v.x - x) ** 2 + (v.z - z) ** 2;
        if (d < bd) { bd = d; best = i / 600; }
      }
      return best;
    };
    const u0 = uOf(L.shuttle.from), u1 = uOf(L.shuttle.to);
    const g = new THREE.Group();
    const cars = [];
    for (let k = 0; k < 3; k++) {
      const car = new THREE.Group();
      car.add(mesh(GEO.box, k ? '#f4ecdb' : '#3f8f4e', { y: 1.3, sx: 4.4, sy: 1.9, sz: 2.1 }));
      car.add(mesh(GEO.box, '#3f8f4e', { y: 2.35, sx: 4.6, sy: 0.2, sz: 2.3 }));
      car.add(mesh(GEO.box, null, { material: windowMat, y: 1.6, sx: 3.6, sy: 0.7, sz: 2.14, shadow: false }));
      for (const [x, z] of [[-1.4, 1], [1.4, 1], [-1.4, -1], [1.4, -1]]) car.add(mesh(GEO.cyl, '#2b2b2b', { x, z, y: 0.4, sx: 0.4, sy: 0.25, sz: 0.4, rx: Math.PI / 2 }));
      g.add(car);
      cars.push(car);
    }
    scene.add(g);
    // u 沿著較短的方向從總站走到鳥園站
    let span = u1 - u0;
    if (Math.abs(span) > 0.5) span -= Math.sign(span);
    let k = 0, dir = 1, pause = 3;
    const t = new THREE.Vector3();
    return {
      group: g,
      update(dt) {
        if (pause > 0) pause -= dt;
        else {
          k += (dir * dt * 7) / (Math.abs(span) * len);
          if (k >= 1 || k <= 0) { k = Math.min(1, Math.max(0, k)); dir *= -1; pause = 5; }
        }
        cars.forEach((car, n) => {
          const back = (n * 4.8 * dir) / len * Math.sign(span);
          const u = (((u0 + span * k - back) % 1) + 1) % 1;
          route.curve.getPointAt(u, v);
          route.curve.getTangentAt(u, t);
          car.position.set(v.x, 0.1 + groundY(v.x, v.z), v.z);
          car.rotation.y = Math.atan2(-t.z, t.x) + (Math.sign(span) * dir < 0 ? Math.PI : 0); // 回程時車頭轉向
        });
      },
    };
  })();
  if (bus) bus.group.userData.dynamic = true; // 巴士會移動，不能合併

  // 推薦路線：沿路流動的虛線
  const routeCurve = curveOf(data.route.points);
  const routeLen = routeCurve.getLength();
  const gap = 1.5;
  const dashN = Math.floor(routeLen / gap);
  const dashes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.7, 0.06, 0.24),
    new THREE.MeshStandardMaterial({ color: '#e07a4c', emissive: '#e07a4c', emissiveIntensity: 0.4, roughness: 0.6 }),
    dashN
  );
  dashes.visible = false;
  scene.add(dashes);
  const dummy = new THREE.Object3D();
  let dashOffset = 0;

  // 地形起伏：上面建好的東西都還在 y=0 的平面上，最後依所在位置抬到地面高度
  // （巴士、路線虛線每一幀自己算高度；燈的位置已經含高度）
  for (const o of scene.children.slice(first)) {
    if (o.isLight || o === dashes || o === bus?.group) continue;
    if (o.userData.drape) { drape(o); continue; }
    const inst = o.isInstancedMesh ? [o] : o.isGroup && o.position.lengthSq() === 0 ? o.children.filter((c) => c.isInstancedMesh) : [];
    if (inst.length) inst.forEach(liftInstances);
    else o.position.y += groundY(o.position.x, o.position.z);
  }

  // 貓空纜車（座標已經含地面高度，所以放在抬高之後）：鐵塔、兩條纜線（去程、回程），車廂沿著纜線一圈來回
  const cable = (() => {
    if (!CW) return null;
    const LANE = 1.8, HANG = 2.8;
    // 纜線經過的點：車站進站高度 5、鐵塔頂高度 16（不夠高就再拉高，纜線不會穿過山坡）
    const anchors = [], stops = new Set();
    CW.stations.forEach(([x, z], k) => {
      stops.add(anchors.length);
      anchors.push(new THREE.Vector3(x, groundY(x, z) + 5, z));
      for (const t of towers) if (t.leg === k) anchors.push(new THREE.Vector3(t.x, groundY(t.x, t.z) + 16, t.z));
    });
    for (let i = 1; i < anchors.length - 1; i++) {
      if (stops.has(i)) continue; // 車站不動，只拉高鐵塔
      const a = anchors[i - 1], b = anchors[i + 1], m = anchors[i];
      for (let k = 1; k < 4; k++) { // 兩根塔之間的地面比纜線還高時，把塔再拉高
        const u = k / 4;
        const ga = (x, z) => groundY(x, z) + HANG + 3;
        const p = a.clone().lerp(m, u), q = m.clone().lerp(b, u);
        m.y = Math.max(m.y, m.y + ga(p.x, p.z) - p.y, m.y + ga(q.x, q.z) - q.y);
      }
    }
    // 鐵塔：灰色方柱、上面一根橫臂掛兩條纜線
    const steel = mat('#7d858c');
    const g = new THREE.Group();
    for (const t of towers) {
      const a = anchors.find((v) => v.x === t.x && v.z === t.z), gy = groundY(t.x, t.z), h = a.y - gy;
      const prev = anchors[anchors.indexOf(a) - 1], ry = Math.atan2(-(a.z - prev.z), a.x - prev.x);
      g.add(mesh(GEO.box, null, { material: steel, x: t.x, z: t.z, y: gy + h / 2, sx: 0.7, sy: h, sz: 0.7 }));
      g.add(mesh(GEO.box, null, { material: steel, x: t.x, z: t.z, y: gy + 0.4, sx: 1.6, sy: 0.8, sz: 1.6 }));
      g.add(mesh(GEO.box, null, { material: steel, x: t.x, z: t.z, y: a.y + 0.2, sx: 0.5, sy: 0.4, sz: LANE * 2 + 0.8, ry }));
    }
    // 兩條車道：沿著前進方向往左右各偏 LANE
    const lane = (side) => anchors.map((p, i) => {
      const a = anchors[Math.max(0, i - 1)], b = anchors[Math.min(anchors.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      return new THREE.Vector3(p.x - (dz / l) * LANE * side, p.y, p.z + (dx / l) * LANE * side);
    });
    const go = lane(1), back = lane(-1).reverse();
    const ropeMat = mat('#3a3d40');
    for (const ln of [go, back]) for (let i = 0; i < ln.length - 1; i++) {
      const a = ln[i], b = ln[i + 1], mid = a.clone().add(b).multiplyScalar(0.5), d = b.clone().sub(a);
      const rope = mesh(GEO.box, null, { material: ropeMat, x: mid.x, y: mid.y, z: mid.z, sx: 0.08, sy: 0.08, sz: d.length(), shadow: false });
      rope.lookAt(b);
      g.add(rope);
    }
    scene.add(g);
    // 一圈：去程到山頂，換到回程纜線回來（在車站裡換線）
    const loop = [...go, ...back, go[0]];
    const cum = [0];
    for (let i = 1; i < loop.length; i++) cum.push(cum[i - 1] + loop[i].distanceTo(loop[i - 1]));
    const total = cum[cum.length - 1], n = Math.floor(total / CW.spacing);
    // 車廂：彩色方塊車身、白色車頂、藍色窗帶、吊臂（一起排成幾個 InstancedMesh，每幀更新位置）
    const parts = [
      { geo: new THREE.BoxGeometry(2.3, 2.4, 2.1).translate(0, -HANG - 1.2, 0), m: tintMat() },
      { geo: new THREE.BoxGeometry(2.5, 0.3, 2.3).translate(0, -HANG + 0.12, 0), m: mat('#f4f4f6') },
      { geo: new THREE.BoxGeometry(2.34, 0.8, 2.14).translate(0, -HANG - 0.95, 0), m: windowMat },
      { geo: new THREE.BoxGeometry(0.14, HANG, 0.14).translate(0, -HANG / 2, 0), m: mat('#4a4f52') },
    ].map(({ geo, m }) => {
      const im = new THREE.InstancedMesh(geo, m, n);
      im.frustumCulled = false;
      im.userData.dynamic = true;
      scene.add(im);
      return im;
    });
    const COLORS = ['#3b8fd0', '#f2c14e', '#e96b5c', '#5fb37a'], c = new THREE.Color();
    for (let i = 0; i < n; i++) parts[0].setColorAt(i, c.set(COLORS[i % COLORS.length]));
    const d = new THREE.Object3D(), p = new THREE.Vector3();
    let s = 0;
    const at = (u) => {
      u = ((u % total) + total) % total;
      let i = 1;
      while (cum[i] < u) i++;
      const a = loop[i - 1], b = loop[i];
      p.copy(a).lerp(b, (u - cum[i - 1]) / (cum[i] - cum[i - 1] || 1));
      return Math.atan2(-(b.z - a.z), b.x - a.x);
    };
    return {
      update(dt) {
        s += dt * CW.speed;
        for (let i = 0; i < n; i++) {
          const ry = at(s + i * CW.spacing);
          d.position.copy(p); d.rotation.set(0, ry, 0); d.updateMatrix();
          for (const im of parts) im.setMatrixAt(i, d.matrix);
        }
        for (const im of parts) im.instanceMatrix.needsUpdate = true;
      },
    };
  })();
  cable?.update(0);

  let hovered = null, selected = null;
  const layers = { labels: false, facilities: true, route: false };
  // 「名牌」開著就全部顯示；關著時只顯示滑到的和選取的
  const refreshTags = () => enclosures.forEach((s, id) => s.tag.classList.toggle('show', layers.labels || id === hovered || id === selected));

  function updateDashes(dt) {
    dashOffset = (dashOffset + dt * 1.6) % gap;
    for (let i = 0; i < dashN; i++) {
      const u = ((i * gap + dashOffset) % routeLen) / routeLen;
      const p = routeCurve.getPointAt(u), t = routeCurve.getTangentAt(u);
      dummy.position.set(p.x, 0.17 + groundY(p.x, p.z), p.z);
      dummy.rotation.set(0, Math.atan2(-t.z, t.x), 0);
      dummy.updateMatrix();
      dashes.setMatrixAt(i, dummy.matrix);
    }
    dashes.instanceMatrix.needsUpdate = true;
  }
  updateDashes(0);

  refreshTags();

  let zoneHover = null;
  return {
    enclosures, hits, paths, routeCurve, giants: sea?.giants,
    setZoneHover(id) {
      if (zoneHover === id) return;
      zoneTags.get(zoneHover)?.classList.remove('show');
      zoneHover = id;
      zoneTags.get(id)?.classList.add('show');
    },
    setHover(id) {
      if (hovered === id) return;
      if (hovered) enclosures.get(hovered).ground.emissive.set(night ? NIGHT_GROUND : 0x000000);
      hovered = id;
      if (id) enclosures.get(id).ground.emissive.set(night ? 0x4a4030 : 0x1c1a12);
      refreshTags();
    },
    setSelected(id) {
      if (selected) {
        const s = enclosures.get(selected);
        s.ring.visible = false; s.tag.classList.remove('sel');
      }
      selected = id;
      if (id) {
        const s = enclosures.get(id);
        s.ring.visible = true; s.tag.classList.add('sel');
      }
      refreshTags();
    },
    // 名牌放在動物頭上
    setTagHeight(id, y) {
      enclosures.get(id).label.position.y = y;
    },
    setStatus(id, active) {
      const el = enclosures.get(id).tag;
      el.classList.toggle('sleep', !active);
      el.title = active ? '這個時段多半在活動' : '這個時段多半在休息';
    },
    setLayer(name, on) {
      layers[name] = on;
      if (name === 'labels') refreshTags();
      if (name === 'facilities') facilityLabels.forEach((o) => (o.visible = on));
      if (name === 'route') dashes.visible = on;
    },
    // 晚上：展場燈、路燈、建築窗戶亮起來；巴士收班
    // 晚上每個展場一起亮：地面加一點暖色自發光（不再用跟著鏡頭焦點移動的燈池，看到哪才亮哪會很怪）
    setNight(on) {
      night = on;
      enclosures.forEach((s, id) => s.ground.emissive.set(id === hovered ? (on ? 0x4a4030 : 0x1c1a12) : on ? NIGHT_GROUND : 0x000000));
      bulbMat.emissiveIntensity = on ? 3 : 0.2;
      windowMat.emissiveIntensity = on ? 0.9 : 0;
      if (bus) bus.group.visible = !on;
      sea?.night?.(on);
    },
    update(dt, t, focus) {
      if (bus && bus.group.visible) bus.update(dt);
      cable?.update(dt);
      sea?.update(t);
      town?.update(t);
      if (selected) ringMat.opacity = 0.55 + 0.4 * Math.sin(t * 4);
      if (dashes.visible) updateDashes(dt);
    },
  };
}
