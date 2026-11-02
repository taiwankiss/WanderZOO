import * as THREE from 'three';
import { rng, mat, bakeRig } from './util.js';
import { groundY } from './world.js';

const SHIRTS = ['#e07a4c', '#4f7cac', '#f2c14e', '#6aa36f', '#d65a7a', '#7a6bb0', '#f3f0e8', '#3a8f8a', '#ef9f6b'];
const KID_SHIRTS = ['#f2c14e', '#ef6f6c', '#5bc0eb', '#9bc53d', '#ff9f1c', '#c77dff'];
const PANTS = ['#2f3a4a', '#3d4f63', '#5b4a3a', '#2b2b2b', '#6c7a89'];
const HAIR = ['#1f1a17', '#3b2a20', '#2a2420', '#6b4a32'];
const SKIN = '#f0c9a4';
const PEOPLE_SCALE = 1.5; // 刻意放大，讓人和動物在鳥瞰時都看得清楚

const LEG = new THREE.CapsuleGeometry(0.065, 0.36, 2, 6).translate(0, -0.24, 0);
const ARM = new THREE.CapsuleGeometry(0.05, 0.3, 2, 6).translate(0, -0.2, 0);
const TORSO = new THREE.CylinderGeometry(0.17, 0.21, 0.5, 8);
const HEAD = new THREE.SphereGeometry(0.16, 10, 8);
const HAIRGEO = new THREE.SphereGeometry(0.17, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
const CAP = new THREE.CylinderGeometry(0.21, 0.21, 0.03, 10);
const SPH = new THREE.SphereGeometry(1, 10, 8);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const WHEEL = new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10).rotateX(Math.PI / 2);
const STICK = new THREE.CylinderGeometry(0.012, 0.012, 1, 4);

function m(geo, color, x = 0, y = 0, z = 0, scale) {
  const o = new THREE.Mesh(geo, mat(color));
  o.position.set(x, y, z);
  if (scale) o.scale.set(...scale);
  o.castShadow = false; // 遊客很小，影子看不太出來，省下陰影的繪製
  return o;
}

function person(R, kid) {
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const g = new THREE.Group();
  const legs = [], arms = [];
  for (const z of [-0.08, 0.08]) {
    const p = new THREE.Group();
    p.position.set(0, 0.52, z);
    p.add(m(LEG, pick(PANTS)));
    g.add(p);
    legs.push(p);
  }
  const shirt = kid ? pick(KID_SHIRTS) : pick(SHIRTS);
  g.add(m(TORSO, shirt, 0, 0.76, 0));
  for (const z of [-0.23, 0.23]) {
    const p = new THREE.Group();
    p.position.set(0, 0.97, z);
    p.add(m(ARM, shirt));
    g.add(p);
    arms.push(p);
  }
  g.add(m(HEAD, SKIN, 0, 1.16, 0));
  g.add(m(HAIRGEO, pick(HAIR), -0.02, 1.18, 0));
  if (R() < (kid ? 0.45 : 0.25)) g.add(m(CAP, kid ? pick(KID_SHIRTS) : pick(SHIRTS), 0.03, 1.3, 0));
  // 有些小朋友拿著氣球
  if (kid && R() < 0.35) {
    const s = m(STICK, '#ffffff', 0, 1.6, 0.26);
    s.scale.y = 1.3;
    g.add(s);
    g.add(m(SPH, pick(['#ff5d73', '#ffd23f', '#3bceac', '#5c7cfa']), 0, 2.4, 0.26, [0.2, 0.24, 0.2]));
  }
  if (kid) g.scale.setScalar(0.62);
  return { g, legs, arms, kid };
}

function stroller(R) {
  const g = new THREE.Group();
  const c = ['#4f7cac', '#e07a4c', '#6aa36f', '#d65a7a', '#f2c14e'][Math.floor(R() * 5)];
  g.add(m(BOX, c, 0, 0.4, 0, [0.55, 0.3, 0.4]));
  const hood = m(new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), c, -0.08, 0.52, 0);
  hood.rotation.z = 0.9;
  g.add(hood);
  g.add(m(SPH, SKIN, 0.1, 0.62, 0, [0.1, 0.1, 0.1]));
  for (const [x, z] of [[0.2, 0.18], [0.2, -0.18], [-0.2, 0.18], [-0.2, -0.18]]) g.add(m(WHEEL, '#2b2b2b', x, 0.09, z));
  const bar = m(BOX, '#3a3a3a', -0.36, 0.68, 0, [0.04, 0.55, 0.04]);
  bar.rotation.z = 0.7;
  g.add(bar);
  g.add(m(BOX, '#3a3a3a', -0.53, 0.88, 0, [0.04, 0.04, 0.42]));
  return g;
}

// 溜滑板、騎滑板車、穿直排輪的遊客：一個人（大人或小孩），戴安全帽，滑得比走路快
const RIDES = ['skate', 'scooter', 'inline'];
const HELMET = new THREE.SphereGeometry(0.2, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
function rider(R) {
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const kind = pick(RIDES), kid = R() < 0.4;
  const p = person(R, kid);
  const root = new THREE.Group(), g = p.g;
  g.add(m(HELMET, pick(['#ef6f6c', '#5bc0eb', '#f2c14e', '#9bc53d', '#2f3a4a', '#ffffff']), 0, 1.2, 0));
  const deckC = pick(['#e07a4c', '#3a8f8a', '#7a6bb0', '#2b2b2b', '#f2c14e']);
  if (kind === 'skate') {
    // 滑板：人側站在板子上，兩腳張開、雙手平舉保持平衡
    const board = new THREE.Group();
    board.add(m(BOX, deckC, 0, 0.1, 0, [0.95, 0.04, 0.26]));
    for (const x of [-0.3, 0.3]) for (const z of [-0.09, 0.09]) board.add(m(WHEEL, '#f3f0e8', x, 0.05, z, [0.5, 0.5, 0.6]));
    root.add(board);
    for (const [i, l] of p.legs.entries()) l.position.z = i ? 0.17 : -0.17;
    g.rotation.y = Math.PI / 2; // 身體朝側面，板子朝前
    g.position.y = 0.12;
  } else if (kind === 'scooter') {
    // 滑板車：一腳踩踏板、一腳往後蹬，雙手握把手
    const sc = new THREE.Group();
    sc.add(m(BOX, '#d9dde0', 0.02, 0.1, 0, [0.62, 0.04, 0.16]));
    for (const x of [-0.3, 0.32]) sc.add(m(WHEEL, '#2b2b2b', x, 0.07, 0, [0.75, 0.75, 1]));
    const stem = m(BOX, deckC, 0.33, 0.58, 0, [0.04, 0.95, 0.04]);
    stem.rotation.z = -0.12;
    sc.add(stem);
    sc.add(m(BOX, '#2b2b2b', 0.39, 1.04, 0, [0.04, 0.04, 0.46]));
    root.add(sc);
    g.position.set(-0.05, 0.12, 0);
  } else {
    // 直排輪：兩隻腳各一雙輪鞋，身體前傾、左右交替往外蹬
    for (const l of p.legs) {
      l.add(m(BOX, deckC, 0.03, -0.47, 0, [0.24, 0.1, 0.11]));
      for (const x of [-0.07, 0.03, 0.13]) l.add(m(WHEEL, '#2b2b2b', x, -0.54, 0, [0.4, 0.4, 0.8]));
    }
    g.position.y = 0.08;
    g.rotation.z = -0.18;
  }
  root.add(g);
  p.ride = kind;
  root.scale.setScalar(PEOPLE_SCALE);
  return { root, members: [p], width: 0.55 * PEOPLE_SCALE, ride: kind };
}

// 一組遊客：一家人推嬰兒車、大人牽小孩、兩個小朋友、情侶或單人；也有人溜滑板、騎滑板車、穿直排輪
function party(R) {
  if (R() < 0.22) return rider(R);
  const root = new THREE.Group();
  const members = [];
  const add = (p, x, z) => { p.g.position.set(x, 0, z); root.add(p.g); members.push(p); return p; };
  const r = R();
  if (r < 0.28) {
    const adult = add(person(R, false), -0.15, 0);
    adult.push = true;
    const s = stroller(R);
    s.position.x = 0.55;
    root.add(s);
    if (R() < 0.5) add(person(R, true), 0.05, 0.6);
  } else if (r < 0.6) {
    add(person(R, false), 0, -0.25);
    add(person(R, true), 0.05, 0.35);
    if (R() < 0.4) add(person(R, true), -0.45, 0.2);
  } else if (r < 0.75) {
    add(person(R, true), 0, -0.25);
    add(person(R, true), 0.1, 0.25);
  } else if (r < 0.88) {
    add(person(R, false), 0, -0.3);
    add(person(R, false), 0, 0.3);
  } else {
    add(person(R, false), 0, 0);
  }
  root.scale.setScalar(PEOPLE_SCALE);
  return { root, members, width: 0.7 * PEOPLE_SCALE };
}

// 滑行的姿勢：滑板雙手平舉、身體隨節奏輕晃；滑板車後腳一下一下往後蹬；直排輪兩腳輪流往外蹬、手前後擺
function ridePose(mb, ph, moving) {
  const [l0, l1] = mb.legs, [a0, a1] = mb.arms, s = Math.sin(ph);
  if (mb.ride === 'skate') {
    l0.rotation.x = 0.16; l1.rotation.x = -0.16;
    a0.rotation.x = 1.15 + s * 0.12; a1.rotation.x = -1.15 + s * 0.12;
    mb.g.rotation.x = s * 0.06;
  } else if (mb.ride === 'scooter') {
    l0.rotation.z = 0;
    l1.rotation.z = moving ? -Math.max(0, s) * 0.75 : 0;
    a0.rotation.z = a1.rotation.z = 1.2;
  } else {
    const k = moving ? 1 : 0;
    l0.rotation.x = Math.max(0, s) * 0.35 * k; l1.rotation.x = -Math.max(0, -s) * 0.35 * k;
    l0.rotation.z = l1.rotation.z = 0.12;
    a0.rotation.z = s * 0.6 * k; a1.rotation.z = -s * 0.6 * k;
  }
}

// 遊客沿著步道散步，偶爾停下來看動物
export function spawnVisitors(scene, paths) {
  const R = rng(5);
  const walkers = [];
  for (const path of paths) {
    const len = path.curve.getLength();
    for (let i = 0; i < path.walkers; i++) {
      const p = party(R);
      bakeRig(p.root);
      scene.add(p.root);
      const room = Math.max(0, path.width / 2 - p.width - 0.1);
      walkers.push({
        ...p, path, len,
        u: (i + R() * 0.6) / path.walkers,
        dir: R() < 0.5 ? 1 : -1,
        lane: (R() < 0.5 ? -1 : 1) * (0.3 + R() * room),
        speed: p.ride ? 2.4 + R() * 1.2 : 0.9 + R() * 0.4, phase: R() * 6, pause: 0, // 滑的比走的快
        dodge: 0, slow: 1, ox: 0, oz: 0, x: 0, z: 0, tx: 1, tz: 0, room: path.width / 2 + 0.15, // 讓路時可以走到步道邊緣
      });
    }
  }

  const t = new THREE.Vector3();
  const p = new THREE.Vector3();
  let night = false, far = false;
  const show = () => { for (const w of walkers) w.root.visible = !night && !far; };
  // 互相避讓：迎面來的各自往自己那一側讓開；同方向追上前面的人就放慢（前面的人停下來時改成繞過去）；
  // 步道交會處撞在一起的往兩邊推開。用 4×4 的格子只比對附近的人
  const CELL = 4;
  function avoid(dt) {
    const grid = new Map();
    for (const w of walkers) {
      w.want = 0; w.blocked = false; w.px = 0; w.pz = 0;
      const k = `${Math.floor(w.x / CELL)},${Math.floor(w.z / CELL)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(w);
    }
    for (const a of walkers) {
      const cx = Math.floor(a.x / CELL), cz = Math.floor(a.z / CELL);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        for (const b of grid.get(`${cx + i},${cz + j}`) || []) {
          if (b === a) continue;
          const rx = b.x - a.x, rz = b.z - a.z, min = (a.width + b.width) * 0.75;
          const along = rx * a.tx + rz * a.tz, lat = rx * -a.tz + rz * a.tx; // lat 沿著 a 的左手法線
          const same = a.path === b.path;
          if (same && along > 0 && along < min * 3 && Math.abs(lat) < min) {
            const headOn = a.tx * b.tx + a.tz * b.tz < 0;
            if (headOn || b.pause > 0) {
              const side = lat > 0.05 ? -1 : lat < -0.05 ? 1 : -1; // 往遠離對方的那一側；正對面時都往自己的右手邊
              a.want += side * (min - Math.abs(lat));
            } else if (along < min * 1.8) a.blocked = true;
          }
          const d = Math.hypot(rx, rz);
          if (d < min && d > 1e-3 && (!same || a.pause > 0 || b.pause > 0)) {
            a.px -= (rx / d) * (min - d);
            a.pz -= (rz / d) * (min - d);
          }
        }
      }
    }
    for (const w of walkers) {
      const target = Math.max(-w.room - w.lane, Math.min(w.room - w.lane, w.want * 1.2));
      w.dodge += (target - w.dodge) * Math.min(1, dt * (w.want ? 3 : 0.8));
      w.slow += ((w.blocked ? 0.35 : 1) - w.slow) * Math.min(1, dt * 3);
      w.ox = (w.ox + w.px * dt * 4) * (1 - Math.min(1, dt * 0.6));
      w.oz = (w.oz + w.pz * dt * 4) * (1 - Math.min(1, dt * 0.6));
    }
  }
  return {
    // 晚上閉園、或鏡頭拉遠看全園（遊客只剩小點）時把遊客藏起來，也不用更新
    setVisible(v) { night = !v; show(); },
    setFar(f) { if (f !== far) { far = f; show(); } },
    walkers, // 開發用（?debug）
    update(dt) {
      if (night || far) return;
      avoid(dt);
      for (const w of walkers) {
        let moving = true;
        if (w.pause > 0) {
          w.pause -= dt;
          moving = false;
        } else if (!w.ride && R() < dt * 0.05) { // 滑板、直排輪的人不會停下來看
          w.pause = 2 + R() * 4;
        }
        if (moving) {
          w.u += (w.dir * w.speed * w.slow * dt) / w.len;
          if (w.path.closed) w.u = ((w.u % 1) + 1) % 1;
          else if (w.u > 1 || w.u < 0) {
            w.u = Math.min(1, Math.max(0, w.u));
            w.dir *= -1;
            w.lane *= -1;
          }
          w.phase += w.ride ? dt * 2.6 * w.slow : dt * w.speed * w.slow * 6; // 滑行的節奏比走路慢
        }
        w.path.curve.getPointAt(w.u, p);
        w.path.curve.getTangentAt(w.u, t).multiplyScalar(w.dir);
        const nx = -t.z, nz = t.x;
        const off = w.lane + w.dodge;
        w.x = p.x + nx * off + w.ox;
        w.z = p.z + nz * off + w.oz;
        w.tx = t.x; w.tz = t.z;
        w.root.position.set(w.x, 0.1 + groundY(w.x, w.z), w.z); // 沿著地形上下坡
        let heading = Math.atan2(-t.z, t.x);
        // 停下來時轉向步道外側（通常就是展場）
        if (!moving) heading += w.lane > 0 ? -Math.PI / 2 : Math.PI / 2;
        w.root.rotation.y = heading;
        for (const mb of w.members) {
          if (mb.ride) { ridePose(mb, w.phase, moving); continue; }
          const sw = moving ? Math.sin(w.phase * (mb.kid ? 1.4 : 1)) * 0.55 : 0;
          mb.legs[0].rotation.z = sw;
          mb.legs[1].rotation.z = -sw;
          if (mb.push) {
            mb.arms[0].rotation.z = mb.arms[1].rotation.z = 1.05; // 雙手推著嬰兒車
          } else {
            mb.arms[0].rotation.z = -sw * 0.7;
            mb.arms[1].rotation.z = sw * 0.7;
          }
        }
      }
    },
  };
}
