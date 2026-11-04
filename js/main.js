import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildWorld, groundY } from './world.js';
import { spawnAnimals } from './animals.js';
import { spawnVisitors } from './people.js';
import { createUI } from './ui.js';
import { makeIslands } from './islands.js';
import { ease, pad, bakeStatic } from './util.js';
import { startOcean } from './ocean.js';
import { reveal, progress } from './opening.js';

// 文字的簡單雜湊（FNV-1a），只拿來比對快取是不是同一份來源
function hashText(t) { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 0x01000193); return (h >>> 0).toString(36); }
// 載入進度（布幕中間那條線）：每完成一段就往前推一點，見 opening.js 的 progress
progress(6, 12);
// 幾個檔案一起抓：園區資料、動物照片（Wikimedia Commons，授權資訊在 photos.json；抓不到就不顯示）、
// 島嶼排版的快取，和 islands.js 的原始碼（用來確認快取還是不是最新的）
const [zooText, photos, cache, islandsSrc] = await Promise.all([
  fetch('data/zoo.json').then((r) => r.text()),
  fetch('data/photos.json').then((r) => r.json()).catch(() => ({})),
  fetch('data/islands-cache.json').then((r) => r.json()).catch(() => null),
  fetch('js/islands.js').then((r) => r.text()).catch(() => ''),
]);
// 海上厚台地：每個園區是一座立在海上的厚島，島和島之間用橋、樓梯、海上大橋相連（只剩這一個版本）。
// 排島（makeIslands）要算一秒多，結果是固定的：預先存在 data/islands-cache.json，園區資料和 islands.js 都沒改過就直接用；
// 改過（key 對不上）就當場算。?debug 可以用 __zoo.islandsCache() 存一份新的快取
const cacheKey = `${hashText(zooText)}-${hashText(islandsSrc)}`;
let data;
if (cache?.key === cacheKey) {
  data = cache.data;
  for (const I of data.islands) if (I.zone) I.zone = data.zones.find((z) => z.id === I.zone.id); // JSON 拆開了物件參照，接回同一個園區物件
} else {
  data = JSON.parse(zooText);
  await progress(12, 24);
  makeIslands(data, { v3: true });
}
// 剛排好、還沒被其他程式加東西的那一份（只有 ?debug 才留，給 __zoo.islandsCache 存檔用）
const snapshot = new URLSearchParams(location.search).has('debug') && cache?.key !== cacheKey ? JSON.stringify({ key: cacheKey, data }) : null;
const islandsCache = () => snapshot;
data.photos = photos;
await progress(24, 58);
const stage = document.getElementById('stage');

// ---------- 場景 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // 高解析螢幕上 2 倍太吃效能，1.5 倍看起來差不多
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // 由 frame() 決定哪幾幀重算陰影
renderer.toneMapping = THREE.NeutralToneMapping;
stage.prepend(renderer.domElement);
const ocean = startOcean(renderer); // 海面水紋的波浪模擬

const labels = new CSS2DRenderer();
labels.domElement.className = 'label-layer';
stage.insertBefore(labels.domElement, renderer.domElement.nextSibling);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#cfe3ea');
scene.fog = new THREE.Fog('#cfe3ea', 520, 1500);

const camera = new THREE.PerspectiveCamera(36, 1, 1, 2400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = 1.22;
controls.minDistance = 9;
controls.maxDistance = 820;
controls.screenSpacePanning = false;

const hemi = new THREE.HemisphereLight('#dcecff', '#c2b07e', 1.05);
const sun = new THREE.DirectionalLight('#ffffff', 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -118, right: 118, top: 118, bottom: -118, near: 1, far: 800 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.target.position.set(2, 0, -4);
scene.add(hemi, sun, sun.target);

// 每個時段的光線與天色
const SKY = {
  morning: { sky: '#d3e7ec', sun: '#ffe2bf', si: 2.4, pos: [-62, 40, 44], hs: '#dcecff', hg: '#c2b07e', hi: 1.05 },
  afternoon: { sky: '#d6e4da', sun: '#ffd8a3', si: 2.5, pos: [58, 46, -8], hs: '#e8ecdf', hg: '#c4a978', hi: 1.0 },
  dusk: { sky: '#efd2b8', sun: '#ffb07e', si: 2.3, pos: [70, 24, -20], hs: '#f6e2d2', hg: '#a8927a', hi: 1.05 },
  // 晚上：月光偏藍、整體變暗，靠展場燈照亮動物
  night: { sky: '#1c2742', sun: '#9fb4ff', si: 0.45, pos: [-40, 70, 30], hs: '#3a4a78', hg: '#161a22', hi: 0.38 },
};
// 第三版：天色偏奶油色，和島的配色一致
if (data.tall) { SKY.morning.sky = '#eaf1e6'; SKY.afternoon.sky = '#eff0e0'; }
const skyTarget = { sky: new THREE.Color(), sun: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color(), pos: new THREE.Vector3(), si: 0, hi: 0 };
function setSky(id, instant) {
  const s = SKY[id];
  skyTarget.sky.set(s.sky); skyTarget.sun.set(s.sun); skyTarget.hs.set(s.hs); skyTarget.hg.set(s.hg);
  skyTarget.pos.set(...s.pos); // 太陽相對於陰影中心的方向（實際位置每幀跟著鏡頭的中心走，見 followShadow）
  skyTarget.si = s.si; skyTarget.hi = s.hi;
  if (instant) stepSky(1);
}
const sunOff = new THREE.Vector3(-62, 40, 44);
// 陰影跟著鏡頭：陰影的範圍以鏡頭看的中心為準（每 8 公尺跳一格，免得陰影邊緣一直抖），拉得越遠範圍越大；
// 原本固定在入口附近 ±118 公尺，外圍的島都沒有影子
let shadowHalf = 118;
function followShadow(dist) {
  const c = controls.target, g = 8;
  sun.target.position.set(Math.round(c.x / g) * g, 0, Math.round(c.z / g) * g);
  sun.position.copy(sun.target.position).addScaledVector(v3s.copy(sunOff).normalize(), 360);
  const half = Math.min(480, Math.max(118, Math.round((dist * 0.55) / 20) * 20));
  if (half !== shadowHalf) {
    shadowHalf = half;
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half });
    sun.shadow.camera.updateProjectionMatrix();
  }
}
const v3s = new THREE.Vector3();
function stepSky(k) {
  scene.background.lerp(skyTarget.sky, k);
  scene.fog.color.copy(scene.background);
  sun.color.lerp(skyTarget.sun, k);
  hemi.color.lerp(skyTarget.hs, k);
  hemi.groundColor.lerp(skyTarget.hg, k);
  sunOff.lerp(skyTarget.pos, k);
  sun.intensity += (skyTarget.si - sun.intensity) * k;
  hemi.intensity += (skyTarget.hi - hemi.intensity) * k;
}

// ---------- 內容 ----------
const ui = createUI(data, {
  select: (id) => { stopTour(); select(id); },
  close: () => (activeZone ? showZone(activeZone) : select(null)), // 關掉動物卡片：回到牠所在園區的介紹
  slot: (id) => setSlot(id),
  layer: (name, value) => world.setLayer(name, value),
  overview: () => toOverview(),
  tour: () => startTour(),
  zone: (id) => showZone(id),
});
const world = buildWorld(scene, data, {
  onPick: (id) => { stopTour(); select(id); },
  onZone: (id) => showZone(id),
  onHover: (id) => world.setHover(id),
});
await progress(58, 70);
bakeStatic(scene); // 場景裡不會動的東西依材質合併，減少繪製次數
await progress(70, 84);
const animals = spawnAnimals(scene, data);
for (const [id, top] of animals.tops) world.setTagHeight(id, top + 1.2);
const visitors = spawnVisitors(scene, world.paths);
await progress(84, 96);

function setSlot(id) {
  ui.setSlot(id);
  setSky(id);
  for (const a of data.animals) world.setStatus(a.id, a.active.includes(id));
  // 晚上閉園：沒有遊客、巴士收班，展場燈亮起
  world.setNight(id === 'night');
  ui.setNight(id === 'night');
  animals.setNight(id === 'night');
  visitors.setVisible(id !== 'night');
  // 晚上月光不投影：展場的光是加法貼片、不會被遮，月光的影子壓在燈光上會變成一塊塊暗斑，
  // 而且陰影範圍跟著鏡頭距離縮放，拉到某個距離才突然出現
  sun.castShadow = id !== 'night';
}

// ---------- 鏡頭 ----------
let flight = null;
function flyTo(pos, target, dur = 1.5) {
  spinOnArrive = false;
  controls.autoRotate = false;
  flight = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, k: 0, dur };
}
// 以 (x, z) 為中心、d 為遠近倍數的鳥瞰鏡頭；直式螢幕拉遠一點才放得下
const aspectK = (aspect = stage.clientWidth / Math.max(1, stage.clientHeight)) => {
  return aspect < 0.6 ? 2.05 : aspect < 0.8 ? 1.75 : aspect < 1.2 ? 1.3 : 1;
};
function birdsEye(x, z, d, aspect) {
  const f = d * aspectK(aspect);
  const y = groundY(x, z); // 地形有高低，鏡頭跟著抬高
  return { pos: new THREE.Vector3(x + 5, y + 46 * f, z + 51 * f), target: new THREE.Vector3(x, y, z) };
}
// 全景：兩個園區都放進畫面；直式螢幕寬度不夠，只看臺灣動物區
function overviewPose() {
  const aspect = stage.clientWidth / Math.max(1, stage.clientHeight);
  const A = data.archipelago;
  // 島嶼版：整個群島放進畫面（直式螢幕受鏡頭最遠距離限制，只放得下中間幾座島）
  if (A) return birdsEye((A.x0 + A.x1) / 2, (A.z0 + A.z1) / 2 + (aspect < 0.8 ? 45 : 28), aspect < 0.8 ? 5.6 : aspect < 1.9 ? 11.2 : 9.8); // 選單平常收起來，畫面用整個寬度
  return aspect < 0.8 ? birdsEye(3, 2, 1.45) : birdsEye(-62, -122, 8.4);
}
// 全景：飛到位後鏡頭就開始慢慢繞圈（自動展示），直到有人操作
let spinOnArrive = false;
function overview() {
  const p = overviewPose();
  flyTo(p.pos, p.target, 1.6);
  spinOnArrive = true;
}
// 回到全景：關掉卡片、收起選單
function toOverview() {
  stopTour();
  select(null);
  activeZone = null;
  ui.showZone(null);
  ui.setMenu(false);
  overview();
}
let activeZone = null;
function showZone(id) {
  stopTour();
  select(null);
  activeZone = id;
  ui.showZone(id);
  const v = data.zones.find((z) => z.id === id).view;
  // 園區卡片（和電腦版的選單）擋掉一部分畫面：照剩下那塊的長寬比決定要拉多遠
  measureCover();
  const w = stage.clientWidth - coverTo.l - (ui.isMobile() ? 0 : panelEl.offsetWidth + 44), h = stage.clientHeight - coverTo.b;
  // 手機寬度太窄，照長寬比算會太近：維持原本直式的距離再拉遠一點
  const p = ui.isMobile() ? birdsEye(v.x, v.z, v.d * 1.5) : birdsEye(v.x, v.z, v.d, Math.max(1, w) / Math.max(1, h));
  flyTo(p.pos, p.target, 1.6);
}
function focus(id, withCard) {
  const c = world.enclosures.get(id).center.clone();
  const dir = camera.position.clone().sub(controls.target).setY(0);
  if (dir.lengthSq() < 0.01) dir.set(0.3, 0, 1);
  dir.normalize();
  const mobile = ui.isMobile();
  // 動物放在畫面上沒被卡片擋住的區域正中間（見 applyView 的 setViewOffset），鏡頭壓低一點、接近平視
  const target = c.clone().setY(c.y + 2);
  const dist = mobile ? 104 : 36; // 手機畫面窄（又被卡片蓋掉下面一半），要拉遠才放得下整隻
  const up = mobile ? 40 : 15;
  // 鏡頭壓低後容易被展場邊的樹擋住：從目前方向開始左右找，挑一個看得到動物的角度
  const seeRay = new THREE.Raycaster(), d2 = new THREE.Vector3();
  seeRay.camera = camera; // 場景裡有光暈 Sprite，射線需要鏡頭
  let pos = null;
  for (const da of [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2, -2, Math.PI]) {
    d2.copy(dir).applyAxisAngle(THREE.Object3D.DEFAULT_UP, da);
    const p = c.clone().addScaledVector(d2, dist).setY(c.y + up);
    const to = target.clone().sub(p), len = to.length();
    seeRay.set(p, to.normalize());
    seeRay.far = len - 9; // 展場本身（半徑約 7）不算擋住
    const hit = seeRay.intersectObjects(scene.children, true).find((h) => h.object.isMesh && h.object.visible && !h.object.userData.id);
    if (!hit) { pos = p; break; }
  }
  flyTo(pos || c.clone().addScaledVector(dir, dist).setY(c.y + up), target);
}

let selected = null;
function select(id) {
  if (id === selected && id) return;
  selected = id;
  world.setSelected(id);
  ui.setSelected(id);
  if (id) activeZone = ui.byId.get(id).zone;
  else if (!activeZone) ui.setMenu(false); // 沒有選到園區也沒有選到動物：選單收起來
  if (id) {
    focus(id, true);
    animals.poke(id, flight ? flight.p1 : camera.position); // 被點到的動物轉頭看你、跳兩下
    history.replaceState(null, '', `#${id}`);
  } else {
    history.replaceState(null, '', location.pathname + location.search);
  }
}

// ---------- 導覽 ----------
let tourToken = 0;
let touring = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function startTour() {
  const my = ++tourToken;
  touring = true;
  select(null);
  activeZone = null;
  ui.showZone(null);
  ui.setMenu(false);
  for (const id of data.route.stops) {
    if (my !== tourToken) return;
    const a = ui.byId.get(id);
    world.setSelected(id);
    focus(id, false);
    ui.caption(`${pad(a.no)}　${a.name}`, a.summary);
    await sleep(3000);
  }
  if (my !== tourToken) return;
  touring = false;
  world.setSelected(null);
  ui.caption(null);
  overview();
}
function stopTour() {
  if (!touring) return;
  touring = false;
  tourToken++;
  ui.caption(null);
  world.setSelected(selected);
}
ui.onCaptionSkip(() => { stopTour(); overview(); });
controls.addEventListener('start', () => {
  flight = null;
  intro = null;
  stopTour();
});
// 一有操作（點、拖、滾輪、按鍵）就停止自動旋轉
const poke = () => { spinOnArrive = false; controls.autoRotate = false; };
for (const ev of ['pointerdown', 'wheel', 'keydown', 'touchstart']) addEventListener(ev, poke, { capture: true, passive: true });
controls.autoRotateSpeed = 0.45;

// ---------- 點擊與滑過 ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObjects(world.hits, false)[0]?.object.userData.id || null;
}
// 滑鼠底下是哪個園區：島的頂面是平的，用射線和每座島頂面高度的平面求交點，再看落在哪座島的範圍裡
const islandZone = (I) => I.zone?.id || (I.id === 'hub' ? 'children' : data.islands.find((J) => J.id === I.near)?.zone?.id) || null;
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
const inPoly = (x, z, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
function zoneAt() {
  let best = null, bd = Infinity;
  for (const I of data.islands || []) {
    plane.constant = -(I.h ?? 0);
    if (!ray.ray.intersectPlane(plane, hitP) || !inPoly(hitP.x, hitP.z, I.poly)) continue;
    const d = hitP.distanceTo(ray.ray.origin);
    if (d < bd) { bd = d; best = I; }
  }
  return best ? islandZone(best) : null;
}
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
  const id = pick(e);
  if (id) { stopTour(); select(id); return; }
  const z = zoneAt();
  if (z) showZone(z); // 點到園區的島：展開那一區的動物清單
  else toOverview(); // 點到海上（空白的地方）：回到全景、選單收起來
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || e.buttons) return;
  const id = pick(e);
  world.setHover(id);
  const z = id ? ui.byId.get(id).zone : zoneAt();
  world.setZoneHover(z);
  renderer.domElement.style.cursor = id || z ? 'pointer' : '';
});
renderer.domElement.addEventListener('pointerleave', () => world.setZoneHover(null));
addEventListener('keydown', (e) => { if (e.key === 'Escape') toOverview(); });

// ---------- 尺寸 ----------
// 卡片（手機在下方、電腦在左邊）和電腦版右側選單會蓋住畫面：用 setViewOffset 把 3D 畫面的中心
// 移到沒被擋住的區域正中間；蓋住的寬度每幀量一次，平滑地移過去
const cover = { l: 0, r: 0, b: 0 }, coverTo = { l: 0, r: 0, b: 0 };
const cardEl = document.getElementById('card'), panelEl = document.getElementById('panel'), appEl = document.getElementById('app');
function measureCover() {
  const w = stage.clientWidth, h = stage.clientHeight, mobile = ui.isMobile();
  coverTo.l = coverTo.r = coverTo.b = 0;
  if (!cardEl.hidden) {
    const r = cardEl.getBoundingClientRect();
    if (mobile) coverTo.b = Math.max(0, h - r.top); else coverTo.l = Math.max(0, r.right);
  }
  if (!mobile && appEl.classList.contains('menu-open')) coverTo.r = Math.max(0, w - panelEl.getBoundingClientRect().left + 12);
}
function applyView() {
  const w = stage.clientWidth, h = stage.clientHeight;
  const W = w + cover.l + cover.r, H = h + cover.b;
  camera.aspect = W / H;
  if (W === w && H === h) camera.clearViewOffset();
  else camera.setViewOffset(W, H, cover.r, cover.b, w, h);
  camera.updateProjectionMatrix();
}
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h);
  labels.setSize(w, h);
  applyView();
}
new ResizeObserver(resize).observe(stage);
resize();

// ---------- 開始 ----------
// 預設早上：動物大多在活動，光線也最好看
setSlot('morning');
setSky(ui.slot, true);
const start = overviewPose();
camera.position.copy(start.pos);
controls.target.copy(start.target);
// 進場：從高空幾乎正上方往下 zoom in，一路穿過三層雲，降到全景的角度（取代原本從側面繞過來）
let intro = { k: 0, dur: 5, from: start.pos.clone().sub(start.target), target: start.target.clone() };
const AUTO_SPIN = (2 * Math.PI / 60) * controls.autoRotateSpeed; // 自動旋轉每秒轉幾弧度（OrbitControls 的算法）
const INTRO_TURN = 0.3; // 進場時順便多轉的角度（使用者覺得轉太多、等太久，一路從 1.5 弧度減下來）
const INTRO_HIGH = 2.1, INTRO_TOP = 0.3; // 起點的距離是全景的幾倍、離正上方幾弧度
const fromSph = new THREE.Spherical().setFromVector3(intro.from), sph = new THREE.Spherical();
// 進度 k（0–1）時鏡頭的位置：一開始就往下衝、快到全景時慢慢停
function introPos(k, out) {
  const u = Math.pow(1 - k, 2.4);
  const spin = INTRO_TURN * u + AUTO_SPIN * intro.dur * (1 - k); // 加一段等速的量，結尾的轉速剛好接上自動旋轉
  sph.set(fromSph.radius * (1 + (INTRO_HIGH - 1) * u), fromSph.phi + (INTRO_TOP - fromSph.phi) * u, fromSph.theta + spin);
  return out.setFromSpherical(sph).add(intro.target);
}
// 四層雲：放在鏡頭路徑上，每層是一片面向鏡頭、圓滾滾的雲團（每團 4–6 顆球，和場景裡的雲同一種畫法），
// 中間留幾個破洞看得到下面；大小照「上一層到這一層的距離」算，鏡頭看過去剛好蓋滿畫面。鏡頭靠近時整層淡掉，像穿過去
const cloudLayers = [];
{
  const R = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const geo = new THREE.SphereGeometry(1, 18, 12), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), aspect = Math.max(1, stage.clientWidth / Math.max(1, stage.clientHeight));
  let prev = introPos(0, new THREE.Vector3());
  for (const [li, k] of [0.06, 0.15, 0.26, 0.4].entries()) {
    const at = introPos(k, new THREE.Vector3());
    const look = intro.target.clone().sub(at).normalize();
    const gap = Math.max(40, at.distanceTo(prev) * 1.6);
    prev = at;
    const hh = gap * tanH * 1.25, hw = hh * aspect; // 這一層要蓋住的半高、半寬
    const right = new THREE.Vector3().crossVectors(look, THREE.Object3D.DEFAULT_UP).normalize(), up = new THREE.Vector3().crossVectors(right, look);
    // 第一層整片蓋滿（布幕拉開時看到的是雲海），後面幾層才開破洞
    const holes = li === 0 ? [] : [0, 1].map(() => [(R() - 0.5) * hw, (R() - 0.5) * hh, hh * (0.3 + R() * 0.2)]);
    const N = 4000;
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: '#eef4f8', emissive: '#ffffff', emissiveIntensity: 0.72, transparent: true, depthWrite: false, fog: false }), N);
    let n = 0;
    // 雲團排在錯開的格子上（不會有一大片空的），每格一團
    const cell = hh * 0.2;
    for (let gy = -hh * 1.6; gy <= hh * 1.6; gy += cell) for (let gx = -hw * 1.4; gx <= hw * 1.4; gx += cell) {
      const a = gx + (R() - 0.5) * cell * 0.8, b = gy + (R() - 0.5) * cell * 0.8;
      if (n > N - 6 || holes.some(([hx, hy, hr]) => Math.hypot(a - hx, b - hy) < hr)) continue;
      const r = cell * (0.55 + R() * 0.3), c = v.copy(at).addScaledVector(right, a).addScaledVector(up, b).addScaledVector(look, (R() - 0.5) * hh * 0.3).clone();
      for (let j = 0, m = 4 + Math.floor(R() * 3); j < m; j++) {
        const s2 = r * (0.6 + R() * 0.5);
        v.copy(c).addScaledVector(right, (R() - 0.5) * r * 2.2).addScaledVector(up, (R() - 0.5) * r * 1.1).addScaledVector(look, (R() - 0.5) * r * 0.8);
        mesh.setMatrixAt(n++, m4.compose(v, q, sc.set(s2 * 1.15, s2, s2)));
      }
    }
    mesh.count = n;
    mesh.frustumCulled = false;
    mesh.renderOrder = 10; // 雲在最上面（透明、不寫深度）
    scene.add(mesh);
    cloudLayers.push({ mesh, center: at, look, thick: gap * 0.25 });
  }
}
function updateClouds() {
  for (const L of cloudLayers) {
    // 鏡頭在這層前面多遠（沿著視線）：遠的時候是一片白，靠近到雲團的厚度內慢慢淡掉
    const ahead = v3.copy(L.center).sub(camera.position).dot(L.look);
    L.mesh.material.opacity = Math.max(0, Math.min(1, ahead / L.thick)) * 0.96;
    L.mesh.visible = ahead > 0;
  }
}
function dropClouds() {
  for (const L of cloudLayers) { scene.remove(L.mesh); L.mesh.geometry.dispose(); L.mesh.material.dispose(); }
  cloudLayers.length = 0;
}
const v3 = new THREE.Vector3();

// 開發用：網址加 ?debug 可以從 console 操作鏡頭
if (new URLSearchParams(location.search).has('debug')) {
  window.__zoo = { ocean, camera, controls, flyTo, THREE, setSlot, scene, animals, visitors, renderer, labels, world, ui,
    introAt: (k) => { if (intro) { intro.k = k; intro.go = false; } return !!intro; }, // 進場停在某個進度（檢查雲層用）
    introGo: () => { if (intro) intro.go = true; }, islandsCache };
}

// 建築名稱互相重疊時（手機最明顯，例如「便當攤販」和「售票亭」），離鏡頭近的（畫面上比較下面的）留著，被壓到的先藏起來
function declutter() {
  const els = [...labels.domElement.querySelectorAll('.zone-sm')];
  const boxes = [];
  for (const el of els) {
    el.classList.remove('clash');
    const lbl = el.parentElement;
    if (lbl.style.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width) boxes.push({ el, r });
  }
  boxes.sort((a, b) => b.r.bottom - a.r.bottom);
  const kept = [];
  for (const b of boxes) {
    if (kept.some((k) => b.r.left < k.right + 4 && b.r.right > k.left - 4 && b.r.top < k.bottom + 2 && b.r.bottom > k.top - 2)) b.el.classList.add('clash');
    else kept.push(b.r);
  }
}
const clock = new THREE.Clock();
let frameNo = 0;
const lastView = new THREE.Matrix4();
const sunDir = new THREE.Vector3(); // 給卡通海算三階明暗
function frame() {
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.05);
  const t = clock.elapsedTime;
  if (intro) {
    if (intro.go) intro.k = Math.min(1, intro.k + Math.min(raw, 1 / 30) / intro.dur); // 偶爾一幀比較久時寧可慢一點，也不要跳一格
    introPos(intro.k, camera.position);
    controls.target.copy(intro.target);
    // 高空時霧也跟著推遠，不然整片群島都被霧蓋住
    const extra = camera.position.distanceTo(intro.target) - fromSph.radius;
    scene.fog.near = 520 + extra; scene.fog.far = 1500 + extra;
    if (intro.k >= 1) {
      intro = null;
      controls.autoRotate = true; // 降到全景後接著慢慢繞
      // OrbitControls 的阻尼會讓自動旋轉從 0 慢慢加速（看起來像停一下再轉）：直接把累積的旋轉量填成穩定時的值
      const f = controls.dampingFactor, a = AUTO_SPIN / 60;
      if (controls._sphericalDelta) controls._sphericalDelta.theta = (-a * (1 - f)) / f;
    }
  }
  // 進場從高空下來，不受拉遠的上限限制；結束後上限至少要放得下全景（直式或偏窄的視窗全景比 820 遠，原本會一下子被拉近）
  controls.maxDistance = intro ? Infinity : Math.max(820, fromSph.radius * 1.02);
  if (cloudLayers.length) {
    if (intro) updateClouds();
    else { dropClouds(); scene.fog.near = 520; scene.fog.far = 1500; } // 進場結束（或被操作打斷）就拿掉
  }
  if (flight) {
    // 鏡頭用實際經過時間，掉幀時也能準時到位
    flight.k = Math.min(1, flight.k + raw / flight.dur);
    const k = ease(flight.k);
    camera.position.lerpVectors(flight.p0, flight.p1, k);
    controls.target.lerpVectors(flight.t0, flight.t1, k);
    if (flight.k >= 1) {
      flight = null;
      if (spinOnArrive) { spinOnArrive = false; controls.autoRotate = true; }
    }
  }
  measureCover();
  let moved = false;
  for (const k of ['l', 'r', 'b']) {
    const d = coverTo[k] - cover[k];
    if (Math.abs(d) > 0.5) { cover[k] += d * (1 - Math.exp(-raw * 6)); moved = true; } else if (d) { cover[k] = coverTo[k]; moved = true; }
  }
  if (moved) applyView();
  controls.update();
  stepSky(1 - Math.exp(-dt * 2.5));
  animals.update(dt, t, ui.slot);
  visitors.update(dt);
  world.update(dt, t, controls.target);
  ocean.update(dt);
  ocean.setSky(scene.background, ui.slot === 'night', sunDir.copy(sun.position).sub(sun.target.position).normalize());
  // 拉遠看全園時只留園區名稱；建築名稱、設施圖示、動物名牌拉近才出現（前後留一段緩衝，不會在門檻上閃爍）
  const dist = camera.position.distanceTo(controls.target), far = 220 * aspectK();
  followShadow(dist);
  if (dist > far * 1.08) labels.domElement.classList.add('far');
  else if (dist < far) labels.domElement.classList.remove('far');
  // 遊客（含滑板、滑板車、直排輪）在園區鏡頭也要看得到：門檻比名牌遠 1.5 倍（手機的園區鏡頭比較遠），只有全景才藏
  if (dist > far * 1.6) visitors.setFar(true); else if (dist < far * 1.5) visitors.setFar(false);
  // 效能：拉遠看全園時動物很小，陰影每 4 幀重算一次就夠；拉近才每幀更新
  frameNo++;
  // 進場轉圈時不重算陰影（每 4 幀算一次會讓那一幀特別久，轉起來一頓一頓的）
  renderer.shadowMap.needsUpdate = intro ? frameNo < 3 : dist < far || frameNo % 4 === 0;
  renderer.render(scene, camera);
  // 名牌只跟著鏡頭動：鏡頭沒動時不必每幀重排 66 個名牌（每 10 幀補一次，讓圖層切換等變化跟上）
  if (!lastView.equals(camera.matrixWorld) || frameNo % 10 === 0) {
    lastView.copy(camera.matrixWorld);
    labels.render(scene, camera);
    if (frameNo % 6 === 0) declutter();
  }
  requestAnimationFrame(frame);
}
frame();
// 開場：先把所有材質的著色器編譯好（不然轉進全景時第一次看到的東西才編譯，會卡一下），布幕拉開的那一刻鏡頭才開始轉
await renderer.compileAsync(scene, camera).catch(() => {});
await progress(96, 100);
reveal(() => { if (intro) intro.go = true; });

// 網址帶 #id 時直接打開那隻動物（不播進場動畫）
const hashId = location.hash.slice(1);
if (ui.byId.has(hashId)) { intro = null; select(hashId); }
