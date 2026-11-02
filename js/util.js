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
