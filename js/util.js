import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 可重現的亂數，讓每次載入的樹、動物位置都一樣
export function rng(seed = 1) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const cache = new Map();
export function mat(color, opts) {
  const key = color + (opts ? JSON.stringify(opts) : '');
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: true, ...opts }));
  }
  return cache.get(key);
}

export function curveOf(points, closed = false) {
  return new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), closed, 'centripetal', 0.5);
}

// 沿著曲線做一條平放的帶狀面（步道、選取外框）
export function ribbon(points, width, y = 0, closed = false) {
  const curve = curveOf(points, closed);
  const n = Math.max(16, Math.ceil(curve.getLength() * 2));
  const pos = [];
  const idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = curve.getPointAt(t);
    const d = curve.getTangentAt(t);
    const nx = -d.z, nz = d.x;
    pos.push(p.x + nx * width / 2, y, p.z + nz * width / 2, p.x - nx * width / 2, y, p.z - nz * width / 2);
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  return { geometry, curve };
}

export function ellipsePoints(rx, rz, n = 64) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * rx, Math.sin(a) * rz];
  });
}

export const lerp = (a, b, k) => a + (b - a) * k;
export const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
export const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const pad = (n) => String(n).padStart(2, '0');
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// 效能：把同材質的小物件合併成一個 mesh，繪製次數從幾千次降到幾百次。
// 合併後就不能再個別移動，所以會動、會切換顯示、要被點選的物件要標 userData.dynamic，或由 skip 排除
function mergeInto(parent, items) {
  const byKey = new Map();
  for (const it of items) {
    const k = `${it.mesh.material.uuid}|${it.mesh.castShadow}|${it.mesh.receiveShadow}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(it);
  }
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    const geos = list.map(({ mesh, matrix }) => {
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
      return g.applyMatrix4(matrix);
    });
    const merged = new THREE.Mesh(mergeGeometries(geos), list[0].mesh.material);
    merged.castShadow = list[0].mesh.castShadow;
    merged.receiveShadow = list[0].mesh.receiveShadow;
    for (const { mesh } of list) mesh.parent.remove(mesh);
    parent.add(merged);
  }
}
const movable = (o, root, skip) => {
  for (let p = o; p && p !== root; p = p.parent) if (!p.visible || p.userData.dynamic || skip?.(p)) return true;
  return false;
};
const mergeable = (o) => o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material);

// 整個場景裡不會動的東西（展場造景、建築、步道…）合併到 root 底下
export function bakeStatic(root, skip) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const items = [];
  root.traverse((o) => {
    if (mergeable(o) && !movable(o, root, skip)) items.push({ mesh: o, matrix: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
  });
  mergeInto(root, items);
}

// 會動的模型（動物、遊客）：每個關節群組裡，跟著同一個關節動的小零件各自合併
export function bakeRig(root, skip) {
  const groups = [];
  root.traverse((o) => { if (!o.isMesh) groups.push(o); });
  for (const g of groups) {
    const items = g.children.filter((c) => mergeable(c) && c.visible && !c.userData.dynamic && !skip?.(c)).map((c) => {
      c.updateMatrix();
      return { mesh: c, matrix: c.matrix.clone() };
    });
    mergeInto(g, items);
  }
}

// 效能：一整隻會動的動物合併成一個 SkinnedMesh。每個關節群組（髖、膝、頭、尾巴…）當成一根骨頭，
// 零件的頂點全部綁在它所在的關節上（權重 1，不會彎曲變形），顏色寫進頂點色。
// 原本一隻動物要畫幾十次（每個關節 × 每種顏色），現在只要一次（材質種類不同時才多幾次）。
// self(m)：自己會縮放的零件（呼吸的身體）就拿零件本身當骨頭；exclude(o)：不合併的子樹（會切換顯示的東西）
export function skinRig(root, { self, exclude } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), local = new THREE.Matrix4();
  const bones = [], boneIdx = new Map();
  const boneOf = (o) => { if (!boneIdx.has(o)) { boneIdx.set(o, bones.length); bones.push(o); } return boneIdx.get(o); };
  const hidden = (o) => { for (let p = o; p && p !== root; p = p.parent) if (!p.visible || p.userData.dynamic || exclude?.(p)) return true; return false; };
  const kinds = new Map();
  root.traverse((o) => {
    if (!mergeable(o) || o.material.transparent || hidden(o)) return;
    const m = o.material, k = `${m.type}|${m.roughness}|${m.metalness}|${m.flatShading}|${m.emissive?.getHex()}|${m.emissiveIntensity}|${o.castShadow}`;
    if (!kinds.has(k)) kinds.set(k, []);
    kinds.get(k).push(o);
  });
  const out = [];
  for (const list of kinds.values()) {
    const geos = list.map((o) => {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
      g.applyMatrix4(local.multiplyMatrices(inv, o.matrixWorld));
      const n = g.attributes.position.count, c = o.material.color, b = boneOf(self?.(o) ? o : o.parent);
      const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; si[i * 4] = b; sw[i * 4] = 1; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      return g;
    });
    const m0 = list[0].material;
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: m0.roughness, metalness: m0.metalness, flatShading: m0.flatShading, emissive: m0.emissive, emissiveIntensity: m0.emissiveIntensity });
    // 晚上動物一起亮起來：自發光用各零件自己的顏色（原本每種顏色一份材質，emissive 設成同色）
    const glow = { value: 0 };
    material.userData.glow = glow;
    material.onBeforeCompile = (sh) => {
      sh.uniforms.uGlow = glow;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * uGlow;');
    };
    material.customProgramCacheKey = () => 'skin-glow';
    const mesh = new THREE.SkinnedMesh(mergeGeometries(geos), material);
    mesh.castShadow = list[0].castShadow;
    mesh.receiveShadow = list[0].receiveShadow;
    out.push(mesh);
  }
  for (const list of kinds.values()) for (const o of list) {
    if (self?.(o)) o.visible = false; // 當骨頭用的零件留在原處（它的縮放會帶動頂點），只是不畫
    else o.parent.remove(o);
  }
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones, bones.map((b) => new THREE.Matrix4().copy(b.matrixWorld).invert()));
  for (const mesh of out) {
    root.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(skeleton, mesh.matrixWorld);
    // 包圍球用綁定時的姿勢算，動作（趴下、抬頭）可能超出一點：放大一些，免得被視錐裁掉
    mesh.computeBoundingSphere();
    mesh.boundingSphere.radius *= 1.5;
  }
  return out;
}
