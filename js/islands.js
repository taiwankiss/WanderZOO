import { curveOf, rng } from './util.js';

// 海上厚台地（唯一的版本；原版、?islands、?islands=2 已刪除，舊程式在 backup/before-v3-only-2026-11-01）：每個園區變成一座立在海上的厚島，島和島之間用橋、樓梯相連。
// 做法：園區裡的展場、步道、建築、造景照原本的相對位置整組搬動，島的形狀＝這些東西外圍的凸包（所以島的大小跟著動物多寡）；
// 入口廣場一帶是一座「入口島」，不屬於任何園區、散在園區之間的建築自成小島。
// 整組搬動的量用推擠求出：每座島往入口島靠一點，互相重疊或太近（水道 GAP 公尺）就沿分離軸推開。
// 跨園區的步道在水面上的那一段換成橋。資料就地改寫，world.js 看到 data.islands 就改畫海和島。

const GAP = 15; // 島和島之間至少留的水道寬度（島最後會再往外長 GROW 公尺，水道實際約 10 公尺）
const PULL = 1; // 每座島往入口島靠近的比例（1 = 不動）
const HUB = { x0: -24, x1: 32, z0: -70, z1: 65 }; // 入口島的範圍（兩個園區中間、入口廣場一帶）

const inPoly = (x, z, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
const segDist = (x, z, [ax, az], [bx, bz]) => {
  const dx = bx - ax, dz = bz - az, k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - dx * k, z - az - dz * k);
};
const polyDist = (x, z, poly) => {
  if (inPoly(x, z, poly)) return 0;
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segDist(x, z, poly[j], poly[i]));
  return d;
};
// 到岸邊的距離（島內為正）；signed 時島外為負，用來找一個點最靠近哪座島
const edgeDist = (x, z, poly, signed = false) => {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segDist(x, z, poly[j], poly[i]));
  return inPoly(x, z, poly) ? d : signed ? -d : 0;
};
// 島整圈往外長 GROW 公尺；島上的東西離岸不到 SHORE_PAD 的方向再往外推。頂面草皮比岸線縮成 0.98 倍、邊緣倒圓角約 0.8 公尺，
// 所以要的半徑是（點到中心的距離 ÷ 0.98）＋ SHORE_PAD。島的外形是 soften 做出來的 n 個等角度的點，直接改每個方向的半徑
// 面對別的島的方向只長到水道剩 MIN_CHANNEL 公尺（兩邊各分一半），others 是還沒長大前的其他島
const GROW = 2.5, SHORE_PAD = 2.4, MIN_CHANNEL = 7;
function growToFit(g, pts, others) {
  const n = g.poly.length, T = Math.PI * 2;
  const need = g.poly.map(([x, z]) => {
    const gap = Math.min(Infinity, ...others.map((o) => -edgeDist(x, z, o, true)));
    return Math.hypot(x - g.cx, z - g.cz) + Math.max(0, Math.min(GROW, (gap - MIN_CHANNEL) / 2));
  });
  for (const [x, z] of pts) {
    const want = Math.hypot(x - g.cx, z - g.cz) / 0.98 + SHORE_PAD, b = Math.round((Math.atan2(z - g.cz, x - g.cx) / T) * n);
    for (let j = -2; j <= 2; j++) { const k = (((b + j) % n) + n) % n; need[k] = Math.max(need[k], want); }
  }
  // 推出去的地方和旁邊平順接起來（只會更大，不會比要的小）
  let r = need;
  for (let it = 0; it < 4; it++) r = r.map((v, i) => Math.max(need[i], (r[(i + n - 1) % n] + 2 * v + r[(i + 1) % n]) / 4));
  g.poly = r.map((v, i) => [g.cx + Math.cos((i / n) * T) * v, g.cz + Math.sin((i / n) * T) * v]);
}
// 凸包（逆時針）
function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
// 太短的邊合併掉，島的外形是幾刀切出來的多邊形（像政策島），不是圓滑的曲線
function facet(poly, minEdge) {
  let p = poly;
  for (let it = 0; it < 200 && p.length > 6; it++) {
    let best = -1, bl = minEdge;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l < bl) { bl = l; best = i; }
    }
    if (best < 0) break;
    // 短邊的兩個端點換成兩條鄰邊延長線的交點（凸多邊形會往外長一點，不會切到裡面的東西）
    const n = p.length, a0 = p[(best - 1 + n) % n], a1 = p[best], b0 = p[(best + 1) % n], b1 = p[(best + 2) % n];
    const d1 = [a1[0] - a0[0], a1[1] - a0[1]], d2 = [b0[0] - b1[0], b0[1] - b1[1]];
    const den = d1[0] * d2[1] - d1[1] * d2[0];
    let q = [(a1[0] + b0[0]) / 2, (a1[1] + b0[1]) / 2];
    if (Math.abs(den) > 1e-6) {
      const t = ((b1[0] - a0[0]) * d2[1] - (b1[1] - a0[1]) * d2[0]) / den;
      const c = [a0[0] + d1[0] * t, a0[1] + d1[1] * t];
      if (Math.hypot(c[0] - q[0], c[1] - q[1]) < bl * 1.2) q = c; // 兩條鄰邊快平行時交點會跑很遠，就取中點
    }
    p = p.slice();
    p.splice(best, 1, q);
    p.splice((best + 1) % p.length, 1);
  }
  return p;
}
// 第三版：凸多邊形改成圓潤、有一點起伏的海岸線（不要尖角）。從中心往外量每個方向到岸邊的距離，
// 平滑幾次，限制在原本岸線往內 cut、往外 grow 的範圍裡（往內只削一點，裡面的東西不會掉到海裡；往外不超過水道的一半）
function soften(poly, cx, cz, rand, keep = [], n = 72) {
  const reach = (t) => {
    const dx = Math.cos(t), dz = Math.sin(t);
    let best = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ex = b[0] - a[0], ez = b[1] - a[1];
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const ax = a[0] - cx, az = a[1] - cz, s = (ax * ez - az * ex) / den, u = (ax * dz - az * dx) / den;
      if (s > best && u >= -1e-6 && u <= 1 + 1e-6) best = s;
    }
    return best;
  };
  const r0 = Array.from({ length: n }, (_, i) => reach((i / n) * Math.PI * 2));
  // 步道、造景一定要留在島上：那個方向的岸線至少要再往外 1 公尺
  const floor = r0.map((v) => v - Math.min(1.5, v * 0.05));
  for (const [x, z] of keep) {
    const d = Math.hypot(x - cx, z - cz) + 1, b = Math.round((Math.atan2(z - cz, x - cx) / (Math.PI * 2)) * n);
    for (let j = -1; j <= 1; j++) { const k = (((b + j) % n) + n) % n; floor[k] = Math.max(floor[k], d); }
  }
  const size = Math.max(...r0), cut = Math.min(1.5, size * 0.05), grow = Math.min(3.2, size * 0.09);
  // 海岸線的起伏：幾個低頻的波（海灣和岬），振幅跟著島的大小
  const waves = [2, 3, 5].map((k) => ({ k, p: rand() * 6.28, a: (rand() * 0.6 + 0.4) * Math.min(1, size / 40) }));
  let r = r0.map((v, i) => v + 1.2 + waves.reduce((s, w) => s + w.a * Math.sin(w.k * (i / n) * Math.PI * 2 + w.p), 0));
  const W = [1, 2, 3, 2, 1];
  for (let it = 0; it < 14; it++) {
    r = r.map((_, i) => W.reduce((s, w, j) => s + w * r[(i + j - 2 + n) % n], 0) / 9);
    r = r.map((v, i) => Math.max(floor[i], Math.min(r0[i] + grow, Math.max(r0[i] - cut, v))));
  }
  return r.map((v, i) => { const t = (i / n) * Math.PI * 2; return [cx + Math.cos(t) * v, cz + Math.sin(t) * v]; });
}
// 第三版的園區調整（使用者回饋）：
// 非洲：斑馬群拿掉，展場裡的一般樹換成金合歡、猴麵包樹（只留特殊的樹）；沙漠：展場裡的樹換成仙人掌；
// 蝴蝶每個展場一隻；鳥園：鳥放大 1.3 倍、展場放大 1.1 倍，整區往中心收 0.8 倍（島變小）
function tweakV3(data, zones) {
  const L = data.layout;
  L.herds = (L.herds || []).filter((h) => !zones.some((z) => z.id === 'africa' && inPoly(h.x, h.z, z.outline)));
  L.decor = (L.decor || []).filter((d) => !d.herd);
  // 非洲區散落的造景（樹、蟻丘、岩丘）也放大加高
  const af = zones.find((z) => z.id === 'africa');
  for (const d of L.decor) if (af && 'x' in d && inPoly(d.x, d.z, af.outline) && ['acacia', 'baobab', 'tree', 'tallTree', 'termite', 'deadtree', 'giantTree'].includes(d.type)) { d.s = (d.s || 1) * 1.5; if (d.r) d.r *= 1.3; }
  let k = 0;
  for (const a of data.animals) {
    const e = a.enclosure;
    // 非洲的樹換成金合歡、猴麵包樹（放大 1.2 倍），並往外移到展場邊上：樹冠很寬，放在中間會和走動的動物重疊
    if (a.zone === 'africa') e.props = (e.props || []).map((p) => {
      if (p.type !== 'tree' && p.type !== 'tallTree') return p;
      const [x, z] = p.at, l = Math.hypot(x, z) || 1, r = Math.max(e.rx, e.rz) * 1.08;
      return { ...p, type: k++ % 3 === 2 ? 'baobab' : 'acacia', s: (p.s || 1) * 1.2, at: [(x / l) * r, (z / l) * r] };
    });
    if (a.model === 'ideabutterfly' || a.model === 'kallima') a.count = 1; // 蝴蝶一區一隻，不會疊在一起
    if (a.zone === 'polar') a.count = 1; // 企鵝一區一隻
    if (a.zone === 'desert') e.props = (e.props || []).map((p) => (p.type === 'tree' || p.type === 'tallTree' ? { ...p, type: 'cactus' } : p));
  }
  const bz = zones.find((z) => z.id === 'birds');
  if (!bz) return;
  const birds = data.animals.filter((a) => a.zone === 'birds');
  const cx = birds.reduce((s, a) => s + a.enclosure.x, 0) / birds.length, cz = birds.reduce((s, a) => s + a.enclosure.z, 0) / birds.length, K = 0.8;
  const inside = (x, z) => inPoly(x, z, bz.outline);
  const pull = (o) => { o.x = cx + (o.x - cx) * K; o.z = cz + (o.z - cz) * K; };
  const pullPt = (q) => { q[0] = cx + (q[0] - cx) * K; q[1] = cz + (q[1] - cz) * K; };
  for (const a of birds) {
    a.scale = (a.scale || 1) * 1.3;
    a.enclosure.rx *= 1.1; a.enclosure.rz *= 1.1;
    pull(a.enclosure);
  }
  for (const p of L.paths) for (const q of p.points) if (inside(q[0], q[1])) pullPt(q);
  for (const q of data.route.points) if (inside(q[0], q[1])) pullPt(q);
  for (const o of [...(L.decor || []), ...(L.buildings || []), ...(L.facilities || [])]) if ('x' in o && inside(o.x, o.z)) pull(o);
  pull(bz.label);
  if (bz.view) pull(bz.view);
  bz.outline.forEach(pullPt);
}
// 一圈八邊形的點（凸包用）
const ring = (x, z, r, n = 8, out = []) => {
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.2; out.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
  return out;
};

export function makeIslands(data, opts = {}) {
  const L = data.layout;
  const zones = data.zones.filter((z) => z.outline);
  // 第三版（?islands=3）：島是立在海上的厚台地（參考 Penny 的工作生活島），高低差更大，陡的地方用樓梯；非洲區和第一版一樣是一座島
  if (opts.v3) tweakV3(data, zones);
  // 第三版：兒童動物區和入口廣場合併成一座島（兒童區的東西都歸到入口島）
  const MERGE = opts.v3 ? { children: 'hub' } : {};
  const mid = (id) => MERGE[id] || id;
  const zoneOf = (x, z) => {
    for (const zn of zones) if (inPoly(x, z, zn.outline)) return mid(zn.id); // 先看在哪一區裡面，再看邊界外 4 公尺的緩衝
    for (const zn of zones) if (polyDist(x, z, zn.outline) < 4) return mid(zn.id);
    if (x > HUB.x0 && x < HUB.x1 && z > HUB.z0 && z < HUB.z1) return 'hub';
    return null;
  };
  const far = (x, z) => Math.hypot((x + 48) / 212, (z + 165) / 246) > 1.3; // 遠在園區外的山上（指南宮站），留在原地
  if (opts.v3 && L.cableway) {
    // 第三版有海也有山：纜車只留南站到旁邊那座山的山頂（指南宮站搬到山頂）
    const top = [155, -584];
    L.cableway.stations = [L.cableway.stations[1], top];
    const st = (L.buildings || []).find((b) => far(b.x, b.z));
    if (st) { st.x = top[0]; st.z = top[1] - 6; }
  }

  // ---- 1. 每樣東西歸到一座島 ----
  const groups = new Map(); // id → { pts: 凸包用的點, moves: 搬動時要改的東西 }
  const G = (id0) => {
    const id = mid(id0);
    if (!groups.has(id)) groups.set(id, { id, pts: [], moves: [] });
    return groups.get(id);
  };
  const loose = []; // 不屬於任何園區的建築、造景：之後分群做成小島
  const put = (x, z, r, move, zid = zoneOf(x, z)) => {
    if (far(x, z)) return;
    if (zid) { const g = G(zid); ring(x, z, r, 8, g.pts); g.moves.push(move); }
    else loose.push({ x, z, r, move });
  };
  const moveXZ = (o) => (dx, dz) => { o.x += dx; o.z += dz; };
  const movePt = (p) => (dx, dz) => { p[0] += dx; p[1] += dz; };

  for (const a of data.animals) {
    const e = a.enclosure;
    put(e.x, e.z, Math.max(e.rx, e.rz) * 1.28 + 2, moveXZ(e), a.zone);
  }
  for (const b of L.buildings || []) {
    const mv = moveXZ(b);
    mv.building = true;
    if (opts.v3 && b.name === '列車總站') mv.terminal = true;
    // 第三版：鳥園站自己一座小島（之後放到鳥園和極地島的外側）
    if (opts.v3 && b.name === '鳥園站') { const g = G('birdStation'); g.islet = g.hasBuilding = true; ring(b.x, b.z, Math.hypot(b.w, b.d) / 2 + 3, 8, g.pts); g.moves.push(mv); continue; }
    put(b.x, b.z, Math.hypot(b.w || 4, b.d || 4) / 2 + 3, mv);
  }
  for (const h of L.houses || []) put(h.x, h.z, 4.5, moveXZ(h));
  // 散在園區之間的水池：周圍已經是海了，拿掉
  L.decor = (L.decor || []).filter((d) => !(d.type === 'pond' && !zoneOf(d.x, d.z) && !far(d.x, d.z)));
  for (const d of L.decor) put(d.x, d.z, (d.r || 1.5) + 1.5, moveXZ(d));
  for (const g of L.gates || []) put(g.x, g.z, 3.5, moveXZ(g), g.zone);
  for (const f of L.facilities || []) put(f.x, f.z, 2, moveXZ(f));
  for (const hd of L.herds || []) put(hd.x, hd.z, hd.r + 2, moveXZ(hd));
  if (L.plaza) put(L.plaza.x, L.plaza.z, L.plaza.r + 3, moveXZ(L.plaza), 'hub');
  if (L.corridor) {
    const C = L.corridor;
    put(C.x, (C.z0 + C.z1) / 2, (C.z1 - C.z0) / 2 + 3, (dx, dz) => { C.x += dx; C.z0 += dz; C.z1 += dz; });
  }
  for (const rv of L.rivers || []) {
    const zid = zoneOf(...rv.points[0]);
    rv.points.forEach((p) => put(p[0], p[1], rv.width / 2 + 2.5, movePt(p), zid));
  }
  for (const zn of zones) {
    const g = G(zn.id);
    g.moves.push(moveXZ(zn.label), moveXZ(zn.view), (dx, dz) => zn.outline.forEach((p) => { p[0] += dx; p[1] += dz; }));
  }

  // 步道：沿著實際的曲線取樣，依所在的島切成幾段；兩段之間（離開一座島、走進另一座島）之後換成橋
  const pieces = [];
  const links = []; // [前一段, 下一段]
  L.paths = L.paths.filter((p) => p.kind !== 'train'); // 遊園列車路線拿掉（會穿過海）
  delete L.shuttle;
  for (const p of L.paths) {
    const curve = curveOf(p.points, !!p.closed), len = curve.getLength();
    const n = Math.max(2, Math.ceil(len / 1.5));
    const s = Array.from({ length: n + 1 }, (_, i) => { const v = curve.getPointAt(i / n); return [v.x, v.z, zoneOf(v.x, v.z)]; });
    const ids = new Set(s.map((q) => q[2]).filter(Boolean));
    if (ids.size <= 1 && s.every((q) => q[2])) {
      // 整條都在同一座島上：原樣保留
      const zid = s[0][2];
      p.points.forEach((q) => put(q[0], q[1], p.width / 2 + 3, movePt(q), zid));
      s.forEach((q) => ring(q[0], q[1], p.width / 2 + 3, 8, G(zid).pts));
      continue;
    }
    // 中途短暫走出島外又回到同一座島的空檔，算在那座島上
    let last = null;
    for (let i = 0; i < s.length; i++) {
      if (s[i][2]) { last = i; continue; }
      let j = i;
      while (j < s.length && !s[j][2]) j++;
      if (last !== null && j < s.length && s[j][2] === s[last][2]) for (let k = i; k < j; k++) s[k][2] = s[last][2];
      i = j - 1;
    }
    let cur = null;
    const out = [];
    for (const q of s) {
      if (!q[2]) { cur = null; continue; }
      if (!cur || cur.zid !== q[2]) { cur = { zid: q[2], pts: [], width: p.width, walkers: 0, id: `${p.id}-${out.length}` }; out.push(cur); }
      cur.pts.push([q[0], q[1]]);
    }
    const kept = out.filter((c) => c.pts.length >= 2);
    kept.forEach((c, i) => {
      // 太密的取樣點留每 3 個一個就好（端點一定留）
      c.pts = c.pts.filter((_, k) => k % 3 === 0 || k === c.pts.length - 1);
      c.walkers = Math.round(((p.walkers || 0) * c.pts.length) / (n / 3 + 1));
      c.pts.forEach((q) => put(q[0], q[1], p.width / 2 + 3, movePt(q), c.zid));
      pieces.push(c);
      if (i > 0) links.push([kept[i - 1], c]);
    });
  }
  L.paths = L.paths.filter((p) => !pieces.some((c) => c.id.startsWith(p.id + '-')));

  // 散落的建築、造景：彼此 30 公尺以內的歸成同一座小島
  const islets = [];
  for (const it of loose) {
    const hit = islets.find((g) => g.items.some((o) => Math.hypot(o.x - it.x, o.z - it.z) < 30));
    if (hit) hit.items.push(it); else islets.push({ items: [it] });
  }
  islets.forEach((s, i) => {
    const g = G(`islet${i}`);
    g.islet = true;
    for (const it of s.items) { ring(it.x, it.z, it.r, 8, g.pts); g.moves.push(it.move); if (it.move.building) g.hasBuilding = true; }
  });

  // ---- 2. 凸包＋推擠 ----
  const list = [...groups.values()];
  for (const g of list) {
    g.poly = facet(hull(g.pts), 7);
    g.cx = g.poly.reduce((s, q) => s + q[0], 0) / g.poly.length;
    g.cz = g.poly.reduce((s, q) => s + q[1], 0) / g.poly.length;
    g.ox = 0; g.oz = 0;
  }
  const hub = groups.get('hub');
  for (const g of list) if (g.islet) g.near = list.filter((o) => !o.islet).sort((a, b) => Math.hypot(a.cx - g.cx, a.cz - g.cz) - Math.hypot(b.cx - g.cx, b.cz - g.cz))[0];
  const axesOf = (poly) => poly.map((a, i) => { const b = poly[(i + 1) % poly.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(a[1] - b[1]) / l, (b[0] - a[0]) / l]; });
  const proj = (poly, [ux, uz]) => {
    let lo = Infinity, hi = -Infinity;
    for (const [x, z] of poly) { const v = x * ux + z * uz; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    return [lo, hi];
  };
  // 島的形狀不會變，只會平移：每一對島的分離軸和投影先算好，推擠時只要加上平移量
  for (const g of list) g.rad = Math.max(...g.poly.map(([x, z]) => Math.hypot(x - g.cx, z - g.cz)));
  const pairs = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const A = list[i], B = list[j];
    pairs.push({ A, B, gap: A.islet || B.islet ? GAP * 0.8 : GAP, axes: [...axesOf(A.poly), ...axesOf(B.poly)].map((u) => ({ u, a: proj(A.poly, u), b: proj(B.poly, u) })) });
  }
  for (let it = 0; it < 700; it++) {
    for (const g of list) {
      if (g === hub || it >= 600) continue; // 最後 100 輪只推開、不再拉近，確保沒有重疊
      // 小島往最近的大島靠（纜車站、館舍不會孤零零漂在遠處），其他的島往入口島靠
      const near = g.islet && g.near;
      const tx = near ? near.ox + (near.cx - g.cx) * 0.6 : (hub.cx - g.cx) * (1 - PULL), tz = near ? near.oz + (near.cz - g.cz) * 0.6 : (hub.cz - g.cz) * (1 - PULL);
      g.ox += (tx - g.ox) * 0.04; g.oz += (tz - g.oz) * 0.04;
    }
    pushApart();
  }
  function pushApart() {
    for (const { A, B, gap, axes } of pairs) {
      if (Math.hypot(B.cx + B.ox - A.cx - A.ox, B.cz + B.oz - A.cz - A.oz) > A.rad + B.rad + gap) continue; // 離很遠
      // 分離軸：兩個凸多邊形在某個邊的法線方向上投影不重疊就分得開；取分得最開的那個軸
      let best = -Infinity, axis = null;
      for (const { u, a, b } of axes) {
        const sh = (B.ox - A.ox) * u[0] + (B.oz - A.oz) * u[1];
        const s1 = b[0] + sh - a[1], s2 = a[0] - b[1] - sh;
        if (s1 > best) { best = s1; axis = u; }
        if (s2 > best) { best = s2; axis = [-u[0], -u[1]]; }
      }
      if (best >= gap) continue;
      const push = gap - best;
      // 入口島不動；小島碰到大島時由小島讓開
      const ka = A === hub || (B.islet && !A.islet) ? 0 : B === hub || (A.islet && !B.islet) ? 1 : 0.5, kb = 1 - ka;
      A.ox -= axis[0] * push * ka; A.oz -= axis[1] * push * ka;
      B.ox += axis[0] * push * kb; B.oz += axis[1] * push * kb;
    }
  }
  // 第三版：島和島的距離拉開成 1.3 倍（以入口島為中心往外放大；小島跟著它旁邊的大島走），再推開一次確保沒有重疊
  if (opts.v3) {
    const S = 1.3, d = new Map();
    for (const g of list) if (g !== hub && !g.islet) { const dx = (g.cx + g.ox - hub.cx) * (S - 1), dz = (g.cz + g.oz - hub.cz) * (S - 1); g.ox += dx; g.oz += dz; d.set(g, [dx, dz]); }
    for (const g of list) if (g.islet) { const [dx, dz] = d.get(g.near) || [0, 0]; g.ox += dx + (g.cx + g.ox - hub.cx) * 0.06; g.oz += dz + (g.cz + g.oz - hub.cz) * 0.06; }
    for (let it = 0; it < 100; it++) pushApart();
    placeV3();
  }
  // 第三版的位置調整（使用者回饋）：列車總站的小島放到入口島和兒童島中間；鳥園站放到鳥園和極地島的外側；
  // 蟲蟲探索谷往臺灣島靠（中間的水道縮成一半）。搬完再推擠一次確保不重疊
  function placeV3() {
    const at = (g) => [g.cx + g.ox, g.cz + g.oz];
    const moved = (g) => g.poly.map(([x, z]) => [x + g.ox, z + g.oz]);
    const gapOf = (A, B) => { const pa = moved(A), pb = moved(B); let d = Infinity; for (const q of pa) d = Math.min(d, polyDist(q[0], q[1], pb)); for (const q of pb) d = Math.min(d, polyDist(q[0], q[1], pa)); return d; };
    const closest = (A, B) => { const pa = moved(A), pb = moved(B); let best = null, bd = Infinity; for (const a of pa) for (const b of pb) { const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d < bd) { bd = d; best = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; } } return best; };
    const moveTo = (g, [x, z]) => { g.ox = x - g.cx; g.oz = z - g.cz; };
    const term = list.find((g) => g.moves.some((m) => m.terminal));
    // 列車總站：兒童區和入口廣場合併成一座島之後，放在這座島北岸、兒童區那一側的外面（留一道水道，之後接橋）
    const kids = data.animals.filter((a) => a.zone === 'children');
    if (term && term !== hub && kids.length) {
      const kx = kids.reduce((t, a) => t + a.enclosure.x, 0) / kids.length;
      const top = moved(hub).filter((q) => Math.abs(q[0] - kx) < 25).reduce((b, q) => (q[1] < b[1] ? q : b), [kx, Infinity]);
      const rad = Math.max(...term.poly.map(([x, z]) => Math.hypot(x - term.cx, z - term.cz)));
      moveTo(term, [top[0] + 12, top[1] - rad - GAP * 0.8]);
    }
    const B = groups.get('birds'), P = groups.get('polar'), st = groups.get('birdStation');
    if (B && P && st) {
      const [bx, bz] = at(B), [px, pz] = at(P), mx = (bx + px) / 2, mz = (bz + pz) / 2, [hx, hz] = at(hub);
      const l = Math.hypot(mx - hx, mz - hz) || 1, ux = (mx - hx) / l, uz = (mz - hz) / l;
      // 從兩座島的外緣往外走，走到和兩座島都留出水道為止
      // 從兩座島最外緣的連線開始（要在外側，不是夾在兩座島中間的水道裡）
      const t0 = Math.max(...[...moved(B), ...moved(P)].map(([x, z]) => (x - mx) * ux + (z - mz) * uz)) - 4;
      for (let t = t0; t < t0 + 160; t += 2) { moveTo(st, [mx + ux * t, mz + uz * t]); if (gapOf(st, B) >= GAP * 0.7 && gapOf(st, P) >= GAP * 0.7) break; }
    }
    const ins = groups.get('insects'), tw = groups.get('taiwan');
    if (ins && tw) {
      const d = gapOf(ins, tw), [ix, iz] = at(ins), [tx, tz] = at(tw), l = Math.hypot(ix - tx, iz - tz) || 1, k = d / 2;
      ins.ox -= ((ix - tx) / l) * k; ins.oz -= ((iz - tz) / l) * k;
      for (const g of list) if (g.islet && g.near === ins) { g.ox -= ((ix - tx) / l) * k; g.oz -= ((iz - tz) / l) * k; }
    }
    for (let it = 0; it < 60; it++) pushApart();
  }

  // ---- 3. 套用搬動 ----
  const offsetOf = (x, z) => {
    const zid = zoneOf(x, z);
    if (zid) return groups.get(zid);
    return list.filter((g) => g.islet).find((g) => polyDist(x, z, g.poly) < 6) || null;
  };
  // 路線、纜車站這些只記座標的東西，要在搬動前先決定屬於哪一座島
  const routeOwners = data.route.points.map(([x, z]) => offsetOf(x, z));
  const stationOwners = L.cableway ? L.cableway.stations.map(([x, z]) => (far(x, z) ? null : offsetOf(x, z))) : [];
  for (const g of list) {
    for (const mv of g.moves) mv(g.ox, g.oz);
    g.poly = g.poly.map(([x, z]) => [x + g.ox, z + g.oz]);
    g.cx += g.ox; g.cz += g.oz;
  }
  if (opts.v3) {
    const rs = rng(31), pts = [...L.paths, ...pieces].flatMap((p) => p.points || p.pts || []).concat((L.decor || []).filter((o) => 'x' in o).map((o) => [o.x, o.z]));
    for (const g of list) g.poly = soften(g.poly, g.cx, g.cz, rs, pts.filter(([x, z]) => inPoly(x, z, g.poly)));
  }
  data.route.points = data.route.points.flatMap((p, i) => (routeOwners[i] ? [[p[0] + routeOwners[i].ox, p[1] + routeOwners[i].oz]] : []));
  if (L.cableway) L.cableway.stations.forEach((p, i) => { const g = stationOwners[i]; if (g) { p[0] += g.ox; p[1] += g.oz; } });

  // ---- 4. 步道與橋 ----
  // 第三版：極地島、兩棲爬蟲館島上原本的步道是零碎的幾段，改成沿岸一圈環狀步道（離岸 RING_IN 公尺），橋頭再各拉一小段接到環上
  const LOOP = opts.v3 ? ['polar', 'reptiles'] : [];
  const loops = new Map();
  for (const id of LOOP) {
    const g = groups.get(id);
    if (!g) continue;
    const RING_IN = 3.2, n = g.poly.length, step = Math.max(1, Math.round(n / 28));
    const loop = g.poly.filter((_, i) => i % step === 0).map(([x, z]) => { const dx = g.cx - x, dz = g.cz - z, l = Math.hypot(dx, dz) || 1; return [x + (dx / l) * RING_IN, z + (dz / l) * RING_IN]; });
    loops.set(id, loop);
    for (let i = pieces.length - 1; i >= 0; i--) if (pieces[i].zid === id) pieces.splice(i, 1);
    L.paths = L.paths.filter((p) => !p.points.every(([x, z]) => inPoly(x, z, g.poly)));
    L.paths.push({ id: `${id}-loop`, points: loop, width: 1.8, walkers: 2, closed: true });
  }
  for (const c of pieces) L.paths.push({ id: c.id, points: c.pts, width: c.width, walkers: c.walkers });
  const bridges = [];
  const connected = new Map(list.map((g) => [g.id, g.id]));
  const root = (id) => (connected.get(id) === id ? id : root(connected.get(id)));
  const join = (a, b) => connected.set(root(a), root(b));
  const addBridge = (a, b, width) => {
    bridges.push({ a, b, width });
    L.paths.push({ id: `bridge-${bridges.length}`, points: [a, b], width, walkers: 1, bridge: true });
  };
  const linked = new Set();
  for (const [p, q] of links) {
    const key = [p.zid, q.zid].sort().join('|');
    if (p.zid === q.zid || linked.has(key)) continue;
    linked.add(key);
    addBridge(p.pts[p.pts.length - 1].slice(), q.pts[0].slice(), Math.min(p.width, q.width));
    join(p.zid, q.zid);
  }
  // 還沒接上的島（散落的小島）：從最近的步道拉一座橋過去，橋頭接到小島上最大的建築
  const samples = [];
  for (const p of L.paths) {
    if (p.bridge) continue;
    const curve = curveOf(p.points, !!p.closed), len = curve.getLength();
    for (let i = 0; i <= len; i += 2) { const v = curve.getPointAt(i / len); samples.push([v.x, v.z, list.find((g) => inPoly(v.x, v.z, g.poly))?.id]); } // 依搬動後所在的島
  }
  // 橋不能穿過展場、建築，也不能經過第三座島
  const clear = (a, b, ids) => {
    const ends = list.filter((g) => ids.includes(g.id)); // 小島上的建築就是橋要接過去的地方，不算擋路
    for (let t = 0; t <= 1; t += 0.02) {
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      if (data.animals.some(({ enclosure: e }) => ((x - e.x) / (e.rx + 0.5)) ** 2 + ((z - e.z) / (e.rz + 0.5)) ** 2 < 1)) return false;
      // 建築是長方形：轉到建築自己的座標再外擴 0.8 公尺判斷，比外接圓準，橋才能貼著建築旁邊過
      if ((L.buildings || []).some((B) => {
        const c = Math.cos(B.ry || 0), sn = Math.sin(B.ry || 0), dx = x - B.x, dz = z - B.z;
        return Math.abs(dx * c - dz * sn) < (B.w || 4) / 2 + 0.8 && Math.abs(dx * sn + dz * c) < (B.d || 4) / 2 + 0.8 && !ends.some((g) => inPoly(B.x, B.z, g.poly) && g.islet);
      })) return false;
      if (list.some((g) => !ids.includes(g.id) && inPoly(x, z, g.poly))) return false;
    }
    return true;
  };
  // 只有造景（沒有建築）的小島是看的，不用接橋
  const needsBridge = (g) => !g.islet || g.hasBuilding;
  // 從島 g 拉一座橋到別的島的步道（only：限定接到哪些島；any：已經連通的島也可以接）
  const tryLink = (g, only = null, any = false) => {
    const mine = new Set(any ? [g.id] : list.filter((o) => root(o.id) === root(g.id)).map((o) => o.id));
    const own = samples.filter((s) => s[2] === g.id);
    // 小島沒有步道：橋頭是離那個步道點最近的岸邊再往島中心走 2 公尺
    const landing = (s) => {
      let edge = null, ed = Infinity;
      for (let i = 0; i < g.poly.length; i++) {
        const a = g.poly[i], b = g.poly[(i + 1) % g.poly.length];
        for (let k = 0; k <= 10; k++) {
          const x = a[0] + (b[0] - a[0]) * k / 10, z = a[1] + (b[1] - a[1]) * k / 10, d = Math.hypot(x - s[0], z - s[1]);
          if (d < ed) { ed = d; edge = [x, z]; }
        }
      }
      const dx = g.cx - edge[0], dz = g.cz - edge[1], l = Math.hypot(dx, dz) || 1;
      return [edge[0] + (dx / l) * 2, edge[1] + (dz / l) * 2];
    };
    // 每個步道點配上這座島離它最近的橋頭，由近到遠找第一座不會擋到東西的橋
    const cands = [];
    for (const s of samples) {
      if (!s[2] || mine.has(s[2]) || (only && !only.includes(s[2])) || polyDist(s[0], s[1], g.poly) > 90) continue;
      let o = null, od = Infinity;
      for (const q of own.length ? own : [landing(s)]) { const d = Math.hypot(q[0] - s[0], q[1] - s[1]); if (d < od) { od = d; o = q; } }
      cands.push({ s, o, d: od });
    }
    cands.sort((a, b) => a.d - b.d);
    const pick = cands.find((c) => clear(c.o, c.s, [g.id, c.s[2]]));
    if (!pick) return false;
    addBridge([pick.s[0], pick.s[1]], [pick.o[0], pick.o[1]], 1.8);
    join(g.id, pick.s[2]);
    return true;
  };
  // 第三版：列車總站的小島接到入口島；鳥園站接到鳥園和極地兩座島
  if (opts.v3) {
    const term = list.find((g) => g.moves.some((m) => m.terminal));
    if (term && term !== hub) tryLink(term, ['hub'], true);
    const st = groups.get('birdStation');
    if (st) { tryLink(st, ['birds'], true); tryLink(st, ['polar'], true); }
    const B = groups.get('birds');
    if (B) tryLink(B, ['africa'], true); // 鳥園和非洲區之間也接一座橋
    const Rp = groups.get('reptiles');
    if (Rp) { tryLink(Rp, ['birds'], true); tryLink(Rp, ['polar'], true); } // 兩棲爬蟲館接鳥園，另外再接一座橋到極地區 // 兩棲爬蟲館直接接一座橋到極地區
  }
  for (let pass = 0; pass < 12; pass++) {
    const todo = list.filter((g) => needsBridge(g) && root(g.id) !== root('hub'));
    if (!todo.length) break;
    for (const g of todo) if (root(g.id) !== root('hub')) tryLink(g);
  }

  // 環狀步道：每座橋落在這座島上的那一頭，拉一小段步道接到環上最近的點
  for (const [id, loop] of loops) {
    const g = groups.get(id);
    for (const b of bridges) for (const e of [b.a, b.b]) {
      if (!inPoly(e[0], e[1], g.poly)) continue;
      const q = loop.reduce((m, p) => (Math.hypot(p[0] - e[0], p[1] - e[1]) < Math.hypot(m[0] - e[0], m[1] - e[1]) ? p : m));
      if (Math.hypot(q[0] - e[0], q[1] - e[1]) > 0.8) L.paths.push({ id: `${id}-link-${L.paths.length}`, points: [e.slice(), q.slice()], width: 1.8, walkers: 0 });
    }
  }

  // 展場不重疊、盡量不壓到步道：展場地面畫出來大約是半徑的 1.2 倍，照這個大小把展場彼此推開、推離最近的步道，
  // 但不推出島外（離岸太近的那一步就不走）；推不開的展場最多縮到原本的八成
  if (opts.v3) {
    const F = 1.2, encl = data.animals.map((a) => a.enclosure);
    const pts = [];
    for (const p of L.paths) {
      if (p.bridge) continue;
      const c = curveOf(p.points, !!p.closed), len = c.getLength();
      for (let t = 0; t <= len; t += 1) { const v = c.getPointAt(t / len); pts.push([v.x, v.z, (p.width || 1.8) / 2 + 0.3]); }
    }
    const isle = new Map(encl.map((e) => [e, list.find((g) => inPoly(e.x, e.z, g.poly))]));
    const r0 = new Map(encl.map((e) => [e, [e.rx, e.rz]]));
    const R = (e) => Math.max(e.rx, e.rz) * F;
    for (let it = 0; it < 120; it++) {
      let worst = 0;
      for (const e of encl) {
        let fx = 0, fz = 0, pen = 0;
        for (const o of encl) {
          if (o === e) continue;
          const dx = e.x - o.x, dz = e.z - o.z, d = Math.hypot(dx, dz) || 0.01, m = R(e) + R(o) + 0.4 - d;
          if (m > 0) { fx += (dx / d) * m * 0.5; fz += (dz / d) * m * 0.5; pen = Math.max(pen, m); }
        }
        let near = null, nd = Infinity;
        for (const q of pts) { const d = Math.hypot(e.x - q[0], e.z - q[1]) - q[2]; if (d < nd) { nd = d; near = q; } }
        if (near && nd < R(e)) {
          const dx = e.x - near[0], dz = e.z - near[1], d = Math.hypot(dx, dz) || 0.01, m = R(e) - nd;
          fx += (dx / d) * m * 0.5; fz += (dz / d) * m * 0.5; pen = Math.max(pen, m);
        }
        worst = Math.max(worst, pen);
        if (!pen) continue;
        const l = Math.hypot(fx, fz), k = l > 1.2 ? 1.2 / l : 1, g = isle.get(e);
        const x = e.x + fx * k, z = e.z + fz * k;
        const ok = !g || (inPoly(x, z, g.poly) && edgeDist(x, z, g.poly) >= Math.min(edgeDist(e.x, e.z, g.poly), R(e) + 1)); // 離岸要用到岸邊的距離（polyDist 在島內一律是 0）
        if (ok) { e.x = x; e.z = z; }
        else if (it > 40 && e.rx > r0.get(e)[0] * 0.8) { e.rx *= 0.98; e.rz *= 0.98; } // 擠不開：縮小一點
      }
      if (worst < 0.05) break;
    }
  }

  // 島加大，而且島上的東西都要完整落在頂面上：展場外圈、建築四角、造景、步道邊、象群
  if (opts.v3) {
    const pts = [];
    const circle = (x, z, r, k = 8) => { for (let i = 0; i < k; i++) pts.push([x + Math.cos((i / k) * Math.PI * 2) * r, z + Math.sin((i / k) * Math.PI * 2) * r]); };
    for (const { enclosure: e } of data.animals) for (let i = 0; i < 16; i++) { const t = (i / 16) * Math.PI * 2; pts.push([e.x + Math.cos(t) * e.rx * 1.2, e.z + Math.sin(t) * e.rz * 1.2]); }
    for (const d of L.decor || []) if ('x' in d && !far(d.x, d.z)) circle(d.x, d.z, (d.r || 1) * (d.s || 1));
    for (const b of L.buildings || []) {
      if (far(b.x, b.z)) continue;
      const c = Math.cos(b.ry || 0), sn = Math.sin(b.ry || 0), w = (b.w || 4) / 2, d = (b.d || 4) / 2;
      for (const [u, v] of [[w, d], [-w, d], [w, -d], [-w, -d]]) pts.push([b.x + u * c + v * sn, b.z - u * sn + v * c]);
    }
    for (const f of L.facilities || []) circle(f.x, f.z, 1.2, 4);
    for (const h of L.houses || []) circle(h.x, h.z, 3);
    for (const hd of L.herds || []) circle(hd.x, hd.z, hd.r);
    for (const p of L.paths) if (!p.bridge) for (const [x, z] of p.points) circle(x, z, (p.width || 1.8) / 2, 4);
    // 每個點歸給它所在（或最近）的那座島
    const owner = pts.map(([x, z]) => list.find((g) => inPoly(x, z, g.poly)) || list.reduce((b, o) => (edgeDist(x, z, o.poly, true) > edgeDist(x, z, b.poly, true) ? o : b)));
    const before = new Map(list.map((g) => [g, g.poly]));
    for (const g of list) growToFit(g, pts.filter((_, i) => owner[i] === g), list.filter((o) => o !== g).map((o) => before.get(o)));
  }

  // ---- 5. 給 world.js 的資料 ----
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  data.islands = list.flatMap((g) => {
    return [{ id: g.id, zone: zoneById.get(g.id) || null, poly: g.poly, cx: g.cx, cz: g.cz, ox: g.ox, oz: g.oz, islet: !!g.islet, near: g.near?.id }];
  });
  data.bridges = bridges;
  floatHeights(data, true);
  const xs = list.flatMap((g) => g.poly.map((q) => q[0])), zs = list.flatMap((g) => g.poly.map((q) => q[1]));
  data.archipelago = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  if (opts.v3) planViaducts(data);
  return data;
}

// 浮空島的高度：入口島 0，各園區照原本的地形高度（zones[].level）壓低再錯開一點，散落的小島比旁邊的大島低一點；
// 非洲小島在園區高度上依島型加減（h0）。最後沿著橋放鬆，橋的坡度不超過 MAX_SLOPE
const MAX_SLOPE_FLOAT = 0.24;
// 第三版（tall）：島立在海上，最低的入口島也比海面高 2 公尺；高低差放大，坡度限制放寬到 TALL_SLOPE（陡的連接畫成樓梯）
const TALL_SLOPE = 0.42;
const TALL_BOOST = { taiwan: 5, children: 4.5 }; // 第三版：臺灣、兒童兩座大島原本最低最薄，墊高加厚
function floatHeights(data, tall = false) {
  const rand = rng(5), isles = data.islands;
  const byId = new Map(isles.map((I) => [I.id, I]));
  const base = tall ? 2.6 : 0, k = tall ? 0.36 : 0.42, rise = tall ? 1.2 : 1, jit = tall ? 5 : 3;
  const lv = (zn) => base + (zn?.level || 0) * k;
  for (const I of isles) {
    if (I.id === 'hub') I.h = base + (tall ? 3.5 : 0); // 第三版的入口島含兒童區，墊高一點
    else if (I.h0 !== undefined) I.h = lv(I.zone) + I.h0 * rise;
    else if (I.islet) I.h = Math.max(base, lv(byId.get(I.near)?.zone) - 1.5 - rand() * 2);
    else I.h = lv(I.zone) + (rand() - 0.5) * jit + (tall ? TALL_BOOST[I.zone?.id] || 0 : 0);
  }
  const MAX_SLOPE = tall ? TALL_SLOPE : MAX_SLOPE_FLOAT;
  const which = (p) => isles.find((I) => inPoly(p[0], p[1], I.poly));
  const ends = data.bridges.map((b) => [which(b.a), which(b.b), Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1])]);
  for (let it = 0; it < 300; it++) for (const [A, B, len] of ends) {
    if (!A || !B || A === B) continue;
    const d = B.h - A.h, lim = len * MAX_SLOPE;
    if (Math.abs(d) <= lim) continue;
    const ex = (Math.abs(d) - lim) * Math.sign(d), ka = A.id === 'hub' ? 0 : B.id === 'hub' ? 1 : 0.5;
    A.h += ex * ka; B.h -= ex * (1 - ka);
  }
  data.bridges.forEach((b, i) => {
    const [A, B] = ends[i];
    b.ha = (A || B)?.h || 0; b.hb = (B || A)?.h || 0;
    // 第三版的橋有三種：陡的是樓梯、園區之間的主要道路是白色石橋、其他是木板吊橋
    if (tall) b.kind = Math.abs(b.hb - b.ha) > ends[i][2] * 0.15 ? 'stairs' : b.width >= 1.8 ? 'stone' : 'wood';
  });
  if (tall) data.tall = true; else data.floating = true;
}

// ---- 第三版：海上大橋（遊園巴士：列車總站 → 中間站鳥園站 → 終點纜車南站，一條路線）----
// 從列車總站旁的岸邊沿水道（格子上找最短路，離島岸至少 VIA_CLEAR 公尺）走到群島外圍的環（離最外面的岸 VIA_RING 公尺），
// 沿著環的弧線繞到鳥園站、再繞到纜車南站。橋面高度在車站之間照長度內插，經過其他橋的上方時拱起來（至少高 VIA_OVER 公尺），坡度不超過 VIA_SLOPE
const VIA_CLEAR = 4, VIA_OVER = 4.2, VIA_SLOPE = 0.09, VIA_CELL = 2.5, VIA_RING = 16;
function planViaducts(data) {
  const B = data.layout.buildings || [];
  const st = (name) => B.find((b) => b.name === name);
  const hubSt = st('列車總站');
  const isleOf = (x, z) => data.islands.find((I) => inPoly(x, z, I.poly));
  const routes = [st('鳥園站'), st('貓空纜車動物園南站')].filter(Boolean);
  if (!hubSt) return;
  const A = data.archipelago, x0 = A.x0 - 50, z0 = A.z0 - 50, nx = Math.ceil((A.x1 - x0 + 50) / VIA_CELL), nz = Math.ceil((A.z1 - z0 + 50) / VIA_CELL);
  const free = new Uint8Array(nx * nz);
  const rad = new Map(data.islands.map((I) => [I, Math.max(...I.poly.map(([x, z]) => Math.hypot(x - I.cx, z - I.cz)))]));
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * VIA_CELL, z = z0 + j * VIA_CELL;
    free[j * nx + i] = data.islands.every((I) => Math.hypot(x - I.cx, z - I.cz) > rad.get(I) + VIA_CLEAR || polyDist(x, z, I.poly) > VIA_CLEAR) ? 1 : 0;
  }
  const cellOf = (x, z) => [Math.round((x - x0) / VIA_CELL), Math.round((z - z0) / VIA_CELL)];
  // 車站附近的岸邊：岸上的點兼顧「離車站近」和「朝目的地」，再往海裡推到可以走的格子
  // 島長大後水道變窄，最想要的那一點往外可能走不到開闊水域：依分數由好到差逐一試岸上的點
  const shore = (S, I, toward) => {
    const score = (q) => Math.hypot(q[0] - S.x, q[1] - S.z) + 0.35 * Math.hypot(q[0] - toward[0], q[1] - toward[1]);
    for (const best of I.poly.slice().sort((p, q) => score(p) - score(q))) {
      const dx = best[0] - I.cx, dz = best[1] - I.cz, l = Math.hypot(dx, dz) || 1;
      for (let r = 0; r < 40; r += 0.5) {
        const x = best[0] + (dx / l) * r, z = best[1] + (dz / l) * r, [i, j] = cellOf(x, z);
        if (isleOf(x, z) && isleOf(x, z) !== I) break; // 撞到別的島：這個方向不行
        if (free[j * nx + i]) return { land: [best[0] - (dx / l) * 1.5, best[1] - (dz / l) * 1.5], sea: [x0 + i * VIA_CELL, z0 + j * VIA_CELL], cell: [i, j] };
      }
    }
    return null;
  };
  // 格子上的最短路（8 個方向）
  const astar = ([si, sj], [ti, tj]) => {
    const N = nx * nz, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    // 二元堆積（[估計總長, 格子]）
    const heap = [];
    const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; }
      }
      return top;
    };
    push([0, sj * nx + si]);
    g[sj * nx + si] = 0;
    const T = tj * nx + ti;
    while (heap.length) {
      const [, c] = pop();
      if (done[c]) continue;
      done[c] = 1;
      if (c === T) break;
      const ci = c % nx, cj = (c - ci) / nx;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
        const n = j * nx + i;
        if (!free[n] || done[n]) continue;
        const ng = g[c] + Math.hypot(di, dj);
        if (ng < g[n]) { g[n] = ng; from[n] = c; push([ng + Math.hypot(ti - i, tj - j), n]); }
      }
    }
    if (from[T] < 0 && T !== sj * nx + si) return null;
    const out = [];
    for (let c = T; c >= 0; c = from[c]) { const i = c % nx; out.push([x0 + i * VIA_CELL, z0 + ((c - i) / nx) * VIA_CELL]); }
    return out.reverse();
  };
  // 拉直：只要直線經過的格子都是水，就跳過中間的點
  const seeLine = (a, b) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1);
    for (let k = 0; k <= n; k++) { const [i, j] = cellOf(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n); if (!free[j * nx + i]) return false; }
    return true;
  };
  const pull = (p) => { const out = [p[0]]; let i = 0; while (i < p.length - 1) { let j = p.length - 1; while (j > i + 1 && !seeLine(p[i], p[j])) j--; out.push(p[j]); i = j; } return out; };
  const segX = (a, b, c, d) => {
    const r = [b[0] - a[0], b[1] - a[1]], s2 = [d[0] - c[0], d[1] - c[1]], den = r[0] * s2[1] - r[1] * s2[0];
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0] - a[0]) * s2[1] - (c[1] - a[1]) * s2[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? u : null;
  };
  // 一條路線：列車總站 →（往外海）→ 沿著群島外圍的弧線 → 中間站鳥園站 → 再沿弧線 → 終點纜車南站
  const [bSt, cSt] = routes;
  const Ih = isleOf(hubSt.x, hubSt.z), Ib = bSt && isleOf(bSt.x, bSt.z), Ic = cSt && isleOf(cSt.x, cSt.z);
  data.viaducts = [];
  if (!Ih || !Ib || !Ic || new Set([Ih, Ib, Ic]).size < 3) return;
  // 群島外圍的環：每個方向（1°）量到最外面的岸再往外 VIA_RING 公尺，平滑成圓潤的弧（只往外推，不會切進島）
  const C = [(A.x0 + A.x1) / 2, (A.z0 + A.z1) / 2], NB = 360;
  const raw = new Array(NB).fill(0);
  for (const I of data.islands) {
    if (I === Ic) continue; // 纜車站在外圍，環直接開進去
    const M = I === Ib ? 1 : VIA_RING; // 鳥園站：主線貼著車站小島的岸邊經過（橋面稍微壓到島）
    for (let k = 0; k < I.poly.length; k++) {
      const a = I.poly[k], b = I.poly[(k + 1) % I.poly.length];
      for (let t = 0; t < 1; t += 0.25) {
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, ang = Math.atan2(z - C[1], x - C[0]);
        const bin = ((Math.round((ang / (Math.PI * 2)) * NB) % NB) + NB) % NB, d = Math.hypot(x - C[0], z - C[1]) + M;
        for (let w = -3; w <= 3; w++) { const q = (bin + w + NB) % NB; raw[q] = Math.max(raw[q], d); }
      }
    }
  }
  // 先取這些點的凸包（弧線不會往內凹），再把轉角磨圓
  const H = hull(raw.map((r, k) => [C[0] + Math.cos((k / NB) * Math.PI * 2) * r, C[1] + Math.sin((k / NB) * Math.PI * 2) * r]));
  const reach = (ang) => {
    const dx = Math.cos(ang), dz = Math.sin(ang);
    let best = 0;
    for (let i = 0; i < H.length; i++) {
      const a = H[i], b = H[(i + 1) % H.length], ex = b[0] - a[0], ez = b[1] - a[1], den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const ax = a[0] - C[0], az = a[1] - C[1], t = (ax * ez - az * ex) / den, u = (ax * dz - az * dx) / den;
      if (t > best && u >= -1e-6 && u <= 1 + 1e-6) best = t;
    }
    return best;
  };
  const hullR = raw.map((_, k) => reach((k / NB) * Math.PI * 2));
  let ringR = hullR.slice();
  for (let it = 0; it < 40; it++) ringR = ringR.map((v, k) => Math.max(raw[k], hullR[k] - 6, [-4, -3, -2, -1, 0, 1, 2, 3, 4].reduce((s2, w) => s2 + ringR[(k + w + NB) % NB], 0) / 9));
  const ringAt = (ang) => { const f = (((ang / (Math.PI * 2)) * NB) % NB + NB) % NB, k = Math.floor(f), u = f - k, r = ringR[k] * (1 - u) + ringR[(k + 1) % NB] * u; return [C[0] + Math.cos(ang) * r, C[1] + Math.sin(ang) * r]; };
  const angOf = (x, z) => Math.atan2(z - C[1], x - C[0]);
  const tA = angOf(hubSt.x, hubSt.z), bA = angOf(bSt.x, bSt.z), cA = angOf(cSt.x, cSt.z);
  const fwd = (a, b, dir) => ((((b - a) * dir) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const dir = fwd(tA, bA, 1) < fwd(tA, cA, 1) ? 1 : -1; // 先經過鳥園站再到纜車站的方向
  const arc = (a0, a1) => { const out = [], span = fwd(a0, a1, dir); for (let t = 0; t <= span; t += Math.PI / 90) out.push(ringAt(a0 + t * dir)); return out; };
  // 起點：列車總站北側的岸邊，沿水道（A*）往北走到環上（環上、往鳥園站方向、在總站北邊、離總站最近的點）
  let eA = tA, ed = Infinity;
  for (let t = 0; t <= fwd(tA, bA, dir); t += Math.PI / 180) {
    const q = ringAt(tA + t * dir), d = Math.hypot(q[0] - hubSt.x, q[1] - hubSt.z);
    if (q[1] < hubSt.z - 10 && d < ed) { ed = d; eA = tA + t * dir; }
  }
  const start = ringAt(eA), sc = cellOf(...start);
  const a = shore(hubSt, Ih, [hubSt.x, hubSt.z - 80]); // 從總站小島的北側出發
  if (!a || !free[sc[1] * nx + sc[0]]) return;
  const leg = astar(a.cell, sc);
  if (!leg) return;
  // 終點站附近：環上離纜車站最近的一段換成直接進站
  const near = (I, S) => (q) => polyDist(q[0], q[1], I.poly) < 10 || Math.hypot(q[0] - S.x, q[1] - S.z) < 16;
  const arc1 = arc(eA, bA), arc2 = arc(bA, cA).filter((q) => !near(Ic, cSt)(q));
  // 兩個終點：路面接上島、停在車站正面前方（離建築 3 公尺），不再停在岸邊或開進建築裡
  const front = (S, I, from) => {
    const dx = from[0] - S.x, dz = from[1] - S.z, l = Math.hypot(dx, dz) || 1, half = Math.hypot(S.w || 8, S.d || 8) / 2;
    for (let r = half + 3; r > half; r -= 0.5) { const q = [S.x + (dx / l) * r, S.z + (dz / l) * r]; if (polyDist(q[0], q[1], I.poly) > 3.5 && inPoly(q[0], q[1], I.poly)) return q; }
    return [S.x + (dx / l) * (half + 1), S.z + (dz / l) * (half + 1)];
  };
  const tail = arc2.length ? arc2[arc2.length - 1] : arc1[arc1.length - 1];
  const ctrl = [front(hubSt, Ih, a.land), a.land, ...pull([a.sea, ...leg]), ...arc1.slice(1), ...arc2.slice(1), front(cSt, Ic, tail)];
  // 圓滑：控制點接成 Catmull-Rom 曲線，每 2 公尺取一點
  const curve = curveOf(ctrl);
  const N = Math.max(10, Math.ceil(curve.getLength() / 2));
  const pts = Array.from({ length: N + 1 }, (_, k) => { const v = curve.getPointAt(k / N); return [v.x, v.z]; });
  // 轉彎全部磨成大圓弧：每一點換成前後 ±8 點（約 32 公尺）的平均，反覆 24 次；會碰到別的島（3 公尺內）的點就不動
  const rad2 = new Map(data.islands.map((I) => [I, Math.max(...I.poly.map(([x, z]) => Math.hypot(x - I.cx, z - I.cz)))]));
  const bad = (q) => data.islands.some((I) => I !== Ih && I !== Ib && I !== Ic && Math.hypot(q[0] - I.cx, q[1] - I.cz) < rad2.get(I) + 3 && polyDist(q[0], q[1], I.poly) < 3);
  for (let it = 0, W = 8; it < 24; it++) {
    const next = pts.map((q, k) => {
      if (k < 2 || k > N - 2) return q;
      let sx = 0, sz = 0, c = 0;
      for (let j = Math.max(0, k - W); j <= Math.min(N, k + W); j++) { sx += pts[j][0]; sz += pts[j][1]; c++; }
      const r = [sx / c, sz / c];
      return bad(r) ? q : r;
    });
    pts.splice(0, pts.length, ...next);
  }
  const idxOf = (S) => pts.reduce((bi, q, k) => (Math.hypot(q[0] - S.x, q[1] - S.z) < Math.hypot(pts[bi][0] - S.x, pts[bi][1] - S.z) ? k : bi), 0);
  const stops = [3, idxOf(bSt), N - 3]; // 兩頭各留 6 公尺，巴士兩節車廂停站時不會疊在一起
  // 高度：車站之間照長度內插；在車站那座島上就是島的高度；經過其他橋、其他島的上空要高出 VIA_OVER
  const need = pts.map((q, k) => {
    const I = isleOf(q[0], q[1]);
    if (I === Ih || I === Ib || I === Ic) return I.h + 0.12; // 在車站島上是一條貼地的路，稍微高出草皮
    const [s0, s1, H0, H1] = k <= stops[1] ? [0, stops[1], Ih.h, Ib.h] : [stops[1], N, Ib.h, Ic.h];
    const h = H0 + ((H1 - H0) * (k - s0)) / (s1 - s0 || 1);
    return I ? Math.max(h, I.h + VIA_OVER) : h;
  });
  for (let k = 0; k < N; k++) for (const br of data.bridges) {
    const u = segX(pts[k], pts[k + 1], br.a, br.b);
    if (u !== null) for (let j = Math.max(0, k - 1); j <= Math.min(N, k + 2); j++) need[j] = Math.max(need[j], br.ha + (br.hb - br.ha) * u + VIA_OVER);
  }
  const h = need.slice();
  for (let k = 1; k <= N; k++) h[k] = Math.max(h[k], h[k - 1] - VIA_SLOPE * 2);
  for (let k = N - 1; k >= 0; k--) h[k] = Math.max(h[k], h[k + 1] - VIA_SLOPE * 2);
  data.viaducts.push({ pts: pts.map(([x, z], k) => [x, z, h[k]]), stops, names: ['列車總站', bSt.name, cSt.name] });
}
