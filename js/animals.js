import * as THREE from 'three';
import { rng, mat, lerp, approach, angleDiff, bakeRig } from './util.js';
import { FLOOR, groundY } from './world.js';

// 參數化的四足動物：每個物種只是一組比例與顏色
const SPECIES = {
  boar: { len: 1.2, h: 0.6, w: 0.5, leg: 0.36, legW: 0.1, color: '#4b3d33', head: 0.38, snout: 0.3, snoutColor: '#3f332b',
    foot: '#211a16', ear: 'pointy', earSize: 0.13, tail: 'thin', tailLen: 0.3, tailW: 0.03, tailAngle: -0.5, tusks: true, mane: '#2e2520', speed: 1.1, wallow: true },
  piglet: { len: 0.62, h: 0.34, w: 0.28, leg: 0.2, legW: 0.06, color: '#8a6a4a', head: 0.24, snout: 0.15, snoutColor: '#7a5c40',
    foot: '#3a2c22', ear: 'pointy', earSize: 0.08, tail: 'thin', tailLen: 0.15, tailW: 0.02, tailAngle: -0.5, stripes: '#e2cda4', speed: 1.3 },
  deer: { len: 1.05, h: 0.5, w: 0.36, leg: 0.72, legW: 0.06, color: '#a35f36', belly: '#ead8bf', foot: '#2a211c', neck: 0.5, head: 0.27, snout: 0.2,
    ear: 'pointy', earSize: 0.16, antlers: true, tail: 'short', tailColor: '#f6f0e3', spots: { n: 14, color: '#f8f1e3', size: 0.05 }, speed: 1.3, bounder: true },
  pangolin: { len: 0.9, h: 0.38, w: 0.4, leg: 0.15, legW: 0.08, color: '#7d5c3d', foot: '#4a3626', head: 0.19, snout: 0.22, ear: 'none',
    tail: 'thick', tailLen: 0.78, tailW: 0.17, tailAngle: -1.75, scales: '#5f432c', speed: 0.5, ball: true, dig: true },
  macaque: { len: 0.52, h: 0.36, w: 0.3, leg: 0.36, legW: 0.065, color: '#8f8169', belly: '#b0a38b', foot: '#7d6f58', head: 0.27, snout: 0.07,
    ear: 'round', earSize: 0.06, face: '#e8a898', tail: 'thin', tailLen: 0.42, tailW: 0.03, tailAngle: -0.9, speed: 1.2, sitter: true, climber: true },
  serow: { len: 0.95, h: 0.56, w: 0.4, leg: 0.55, legW: 0.085, color: '#3d342e', belly: '#57493e', foot: '#191513', neck: 0.25, head: 0.3, snout: 0.2,
    snoutColor: '#2f2823', ear: 'pointy', earSize: 0.17, horns: true, throat: '#d8c9a8', mane: '#2a231f', tail: 'short', speed: 1.1, climber: true },
  otter: { len: 0.85, h: 0.27, w: 0.27, leg: 0.12, legW: 0.065, color: '#5a4535', belly: '#c2ad90', foot: '#3e2f25', head: 0.22, snout: 0.08,
    ear: 'round', earSize: 0.04, tail: 'thick', tailLen: 0.55, tailW: 0.12, tailAngle: -1.45, speed: 1.0, swim: 0.85 },
  bear: { len: 1.3, h: 0.8, w: 0.72, leg: 0.46, legW: 0.17, color: '#1e1c1c', foot: '#141212', head: 0.46, snout: 0.2, snoutColor: '#8a6e55',
    ear: 'round', earSize: 0.12, tail: 'short', chestV: '#efe6cf', speed: 0.9, swim: 0.55 },
  // 大貓熊（新光特展館旁的戶外展場）：白身體、黑色四肢和肩帶、黑耳朵、黑眼圈
  panda: { len: 1.2, h: 0.78, w: 0.72, leg: 0.42, legW: 0.17, color: '#f4f2ec', legColor: '#1e1c1c', foot: '#141212', head: 0.48, snout: 0.16,
    snoutColor: '#f4f2ec', mask: '#1e1c1c', ear: 'round', earSize: 0.13, earColor: '#1e1c1c', saddle: '#1e1c1c', tail: 'short', tailColor: '#f4f2ec', speed: 0.6, sitter: true },
  leopardcat: { len: 0.56, h: 0.28, w: 0.22, leg: 0.28, legW: 0.05, color: '#b48d5c', belly: '#ecdfc6', foot: '#a07a4c', head: 0.21, snout: 0.06,
    ear: 'pointy', earSize: 0.09, tail: 'thin', tailLen: 0.42, tailW: 0.035, tailAngle: -1.25, spots: { n: 20, color: '#3a2a1d', size: 0.03 },
    foreheadStripes: '#f4ecdc', speed: 1.0, arboreal: true },
  clouded: { len: 0.95, h: 0.42, w: 0.33, leg: 0.38, legW: 0.08, color: '#b8a07a', belly: '#e3d6bb', foot: '#a08a66', head: 0.27, snout: 0.08,
    ear: 'round', earSize: 0.07, tail: 'thin', tailLen: 0.85, tailW: 0.06, tailAngle: -1.35, spots: { n: 9, color: '#5a4733', size: 0.11 }, speed: 1.0, arboreal: true },
  // 兒童動物區
  pony: { len: 1.1, h: 0.6, w: 0.42, leg: 0.6, legW: 0.085, color: '#8a5534', foot: '#2b211b', neck: 0.5, neckTilt: 0.4, head: 0.3, snout: 0.28,
    snoutColor: '#6f4228', ear: 'pointy', earSize: 0.12, mane: '#2d211a', neckMane: '#2d211a', tail: 'thin', tailLen: 0.62, tailW: 0.07,
    tailAngle: -0.3, tailColor: '#2d211a', speed: 1.3, jumper: true },
  alpaca: { len: 0.95, h: 0.62, w: 0.5, leg: 0.6, legW: 0.075, color: '#e6d6ba', foot: '#5b4a3a', neck: 0.72, neckTilt: 0.12, head: 0.25,
    snout: 0.12, snoutColor: '#d9c6a6', ear: 'pointy', earSize: 0.13, fluff: '#f1e6d0', tail: 'short', speed: 1.0, roller: true },
  donkey: { len: 1.0, h: 0.58, w: 0.42, leg: 0.55, legW: 0.08, color: '#8f8983', belly: '#e9e4da', foot: '#2b2622', neck: 0.45, head: 0.3,
    snout: 0.26, snoutColor: '#ece6db', ear: 'pointy', earSize: 0.22, neckMane: '#3e3833', tail: 'thin', tailLen: 0.5, tailW: 0.05,
    tailAngle: -0.25, tailColor: '#3e3833', speed: 1.1, scratcher: true },
  wildass: { len: 1.0, h: 0.56, w: 0.4, leg: 0.6, legW: 0.075, color: '#bdb7ad', belly: '#eeebe4', foot: '#2b2622', neck: 0.45, head: 0.29,
    snout: 0.25, snoutColor: '#efebe3', ear: 'pointy', earSize: 0.22, neckMane: '#3a3430', legColor: '#d9d4cb', legBands: { n: 5, color: '#2b2622' },
    tail: 'thin', tailLen: 0.5, tailW: 0.05, tailAngle: -0.25, tailColor: '#3a3430', speed: 1.2 },
  pig: { len: 0.9, h: 0.5, w: 0.44, leg: 0.24, legW: 0.085, color: '#2b2624', foot: '#151211', head: 0.34, snout: 0.2, snoutColor: '#3d3532',
    ear: 'pointy', earSize: 0.11, mane: '#1d1918', tail: 'thin', tailLen: 0.2, tailW: 0.025, tailAngle: -0.6, speed: 0.9, wallow: true },
  raccoon: { len: 0.66, h: 0.38, w: 0.36, leg: 0.22, legW: 0.07, color: '#8d8780', belly: '#bcb5ab', foot: '#3a3532', head: 0.3, snout: 0.1,
    snoutColor: '#efeae2', face: '#e9e3d9', mask: '#26211e', ear: 'round', earSize: 0.07, tail: 'thick', tailLen: 0.5, tailW: 0.09,
    tailAngle: -1.7, tailRings: '#3a3532', speed: 1.0, swim: 0.35, washer: true },
  coati: { len: 0.72, h: 0.32, w: 0.28, leg: 0.24, legW: 0.06, color: '#8a5a34', belly: '#cfa877', foot: '#3a2a20', head: 0.24, snout: 0.3,
    snoutColor: '#3a2a20', ear: 'round', earSize: 0.05, tail: 'thin', tailLen: 0.75, tailW: 0.05, tailAngle: -2.6, tailRings: '#4a3220', speed: 1.1, arboreal: true },
  meerkat: { len: 0.4, h: 0.25, w: 0.22, leg: 0.14, legW: 0.05, color: '#c8a679', belly: '#e3d0a9', foot: '#6b5238', head: 0.2, snout: 0.08,
    snoutColor: '#a88a62', mask: '#3a2c22', ear: 'round', earSize: 0.035, tail: 'thin', tailLen: 0.38, tailW: 0.035, tailAngle: -1.0,
    sitter: true, upright: true, speed: 1.4, burrow: true },
  gibbon: { len: 0.44, h: 0.36, w: 0.3, leg: 0.5, legW: 0.06, color: '#3b2f27', foot: '#f2ede2', head: 0.26, snout: 0.05, ear: 'round',
    earSize: 0.04, face: '#2a221d', faceRing: '#efe8da', sitter: true, upright: true, hanger: true, speed: 1.1 },
  // 熱帶雨林區
  // 大長臂猿：全身黑、比白手長臂猿大、手臂更長，喉嚨有會鼓起來的灰色喉囊
  siamang: { len: 0.5, h: 0.42, w: 0.36, leg: 0.52, legW: 0.07, armLen: 1.3, color: '#151312', foot: '#151312', head: 0.28, snout: 0.05,
    snoutColor: '#201c1a', ear: 'round', earSize: 0.04, face: '#1d1a19', sac: '#8a7c76', sitter: true, upright: true, hanger: true,
    howl: true, speed: 1.0 },
  elephant: { len: 1.5, h: 1.0, w: 0.95, leg: 0.9, legW: 0.2, color: '#8d8a86', foot: '#6f6c68', head: 0.62, snout: 0.12, ear: 'fan',
    earSize: 0.42, trunk: true, tusks: true, tuskLen: 0.35, tail: 'thin', tailLen: 0.5, tailW: 0.04, tailAngle: -0.3, speed: 0.8, swim: 0.28, sprayer: true },
  tiger: { len: 1.25, h: 0.5, w: 0.42, leg: 0.45, legW: 0.1, color: '#d9822b', belly: '#f4ead8', foot: '#e9d8bc', head: 0.34, snout: 0.1,
    snoutColor: '#f1e4cc', ear: 'round', earSize: 0.08, tail: 'thin', tailLen: 0.9, tailW: 0.07, tailAngle: -1.2, tailRings: '#2a1d14',
    bands: { n: 10, color: '#2a1d14' }, speed: 1.0, climber: true, swim: 0.55 },
  tapir: { len: 1.25, h: 0.62, w: 0.5, leg: 0.42, legW: 0.11, color: '#2b2826', saddle: '#ece7dc', head: 0.36, snout: 0.32, ear: 'round',
    earSize: 0.09, tail: 'short', speed: 0.8, swim: 0.6, wallow: true },
  anteater: { len: 1.2, h: 0.55, w: 0.38, leg: 0.4, legW: 0.09, color: '#5a4e42', foot: '#d9ccb6', head: 0.2, snout: 0.75, snoutThin: 0.45,
    ear: 'round', earSize: 0.05, sash: '#1d1915', sashEdge: '#efe7d5', tail: 'thick', tailLen: 0.95, tailW: 0.2, tailAngle: -1.4,
    tailColor: '#3f362e', speed: 0.8, dig: true },
  // 水豚（參考使用者給的 low-poly 圖）：方正的橘棕色身體、大方頭、深棕色鈍鼻頭、小深色耳朵、小腿和腳是深棕色
  capybara: { len: 1.0, h: 0.6, w: 0.52, leg: 0.32, legW: 0.1, color: '#b8763f', sock: '#4a3226', foot: '#5e4334', head: 0.46, snout: 0.26,
    snoutColor: '#5a3e30', ear: 'round', earSize: 0.075, earColor: '#5e4334', headUp: 0.12, speed: 0.7, swim: 0.75 },
  orangutan: { len: 0.55, h: 0.5, w: 0.45, leg: 0.38, legW: 0.1, armLen: 1.6, color: '#b4561f', foot: '#4a2c1c', head: 0.32, snout: 0.06,
    snoutColor: '#5a3a2a', face: '#5a3a2a', cheekPads: '#4b3122', ear: 'none', sitter: true, upright: true, hanger: true, speed: 0.8 },
  squirrelmonkey: { len: 0.42, h: 0.26, w: 0.22, leg: 0.28, legW: 0.05, color: '#8f8f74', legColor: '#e0b048', foot: '#e0b048', head: 0.24,
    snout: 0.05, snoutColor: '#1f1a17', face: '#f2ece0', cap: '#2a2420', ear: 'round', earSize: 0.05, tail: 'thin', tailLen: 0.75, tailW: 0.03,
    tailAngle: -1.9, sitter: true, arboreal: true, speed: 1.3 },
  howler: { len: 0.5, h: 0.34, w: 0.3, leg: 0.38, legW: 0.065, color: '#1e1b1a', head: 0.27, snout: 0.1, throat: '#2e2826', ear: 'round',
    earSize: 0.04, tail: 'thin', tailLen: 0.7, tailW: 0.04, tailAngle: -2.2, sitter: true, arboreal: true, howl: true, speed: 0.9 },
  // 無尾熊動物區
  // 無尾熊：灰色圓胖身體、大圓耳（earRim 是耳朵外圈的白毛）、黑色大鼻子、沒有尾巴；
  // treeDen：休息的地方在樹枝上，白天大多抱在樹上睡覺
  koala: { len: 0.5, h: 0.44, w: 0.4, leg: 0.22, legW: 0.075, color: '#9b9a98', belly: '#ece8e0', foot: '#55524f', head: 0.38, snout: 0.09,
    snoutColor: '#1c1b1d', ear: 'round', earSize: 0.13, earColor: '#c9c6c1', earRim: '#f4f2ed', throat: '#ece8e0', headUp: 0.08,
    sitter: true, arboreal: true, treeDen: true, speed: 0.5 },
  // 非洲動物區
  africanelephant: { len: 1.55, h: 1.05, w: 0.95, leg: 0.95, legW: 0.2, color: '#8a8580', foot: '#6f6a66', head: 0.62, snout: 0.12, ear: 'fan',
    earSize: 0.6, trunk: true, tusks: true, tuskLen: 0.45, tail: 'thin', tailLen: 0.5, tailW: 0.04, tailAngle: -0.3, speed: 0.8, swim: 0.28, sprayer: true },
  rhino: { len: 1.45, h: 0.8, w: 0.75, leg: 0.4, legW: 0.17, color: '#9a958c', foot: '#7d7870', head: 0.48, snout: 0.26, snoutColor: '#8f8a82',
    ear: 'pointy', earSize: 0.1, noseHorn: '#d8d0bf', tail: 'short', speed: 0.7, wallow: true },
  bongo: { len: 1.05, h: 0.52, w: 0.38, leg: 0.62, legW: 0.07, color: '#a8471f', foot: '#2a1d16', neck: 0.35, neckTilt: 0.5, head: 0.27, snout: 0.2,
    snoutColor: '#3a2a20', ear: 'pointy', earSize: 0.17, bands: { n: 11, color: '#f4efe2' }, longHorns: { len: 0.55, color: '#3a2e24', twist: true, back: 0.7 },
    tail: 'thin', tailLen: 0.3, tailW: 0.03, tailAngle: -0.4, speed: 1.0 },
  giraffe: { len: 1.0, h: 0.6, w: 0.42, leg: 1.25, legW: 0.08, color: '#e7b462', foot: '#5a4030', neck: 1.5, neckTilt: 0.25, head: 0.26, snout: 0.22,
    snoutColor: '#d9a352', ear: 'pointy', earSize: 0.1, horns: true, hornColor: '#6a4a30', spots: { n: 18, color: '#8a4e22', size: 0.14 },
    neckMane: '#8a4e22', tail: 'thin', tailLen: 0.5, tailW: 0.03, tailAngle: -0.3, speed: 0.9 },
  lion: { len: 1.15, h: 0.5, w: 0.42, leg: 0.45, legW: 0.1, color: '#c99b5a', belly: '#e6cfa4', foot: '#c4955a', head: 0.36, snout: 0.14,
    snoutColor: '#e2c79a', ear: 'round', earSize: 0.07, ruff: '#7a4a22', tail: 'thin', tailLen: 0.8, tailW: 0.05, tailAngle: -1.2, speed: 0.9, climber: true },
  hippo: { len: 1.5, h: 0.75, w: 0.85, leg: 0.28, legW: 0.16, color: '#7d6b6e', belly: '#c99a92', head: 0.55, snout: 0.35, snoutColor: '#8f7a7c',
    ear: 'round', earSize: 0.05, tail: 'short', speed: 0.6, swim: 0.75 },
  eland: { len: 1.25, h: 0.62, w: 0.45, leg: 0.7, legW: 0.08, color: '#b8936a', foot: '#3a2e24', neck: 0.4, neckTilt: 0.5, head: 0.3, snout: 0.24,
    snoutColor: '#8a6a4a', ear: 'pointy', earSize: 0.15, longHorns: { len: 0.5, color: '#2e2620', twist: true, back: 0.35, spread: 0.05 },
    bands: { n: 7, color: '#efe6d4' }, throat: '#8a6a4a', tail: 'thin', tailLen: 0.45, tailW: 0.03, tailAngle: -0.3, speed: 0.9 },
  zebra: { len: 1.05, h: 0.6, w: 0.4, leg: 0.6, legW: 0.08, color: '#f2efe8', foot: '#1b1918', neck: 0.5, neckTilt: 0.4, head: 0.3, snout: 0.28,
    snoutColor: '#2a2624', ear: 'pointy', earSize: 0.13, neckMane: '#1b1918', bands: { n: 12, color: '#1b1918' }, tail: 'thin', tailLen: 0.55,
    tailW: 0.05, tailAngle: -0.3, tailColor: '#1b1918', speed: 1.2, bounder: true },
  baboon: { len: 0.6, h: 0.4, w: 0.34, leg: 0.38, legW: 0.07, color: '#8a7d5e', foot: '#4a3f3a', head: 0.27, snout: 0.22, snoutColor: '#4a3f3a',
    face: '#5a4e48', ear: 'round', earSize: 0.04, tail: 'thin', tailLen: 0.5, tailW: 0.04, tailAngle: -0.9, sitter: true, climber: true, speed: 1.1 },
  chimp: { len: 0.5, h: 0.45, w: 0.4, leg: 0.42, legW: 0.09, armLen: 1.25, color: '#1f1b19', foot: '#2a2420', head: 0.3, snout: 0.08,
    snoutColor: '#c09a80', face: '#c9a48a', ear: 'round', earSize: 0.07, earColor: '#c9a48a', sitter: true, upright: true, climber: true, speed: 1.0 },
  gorilla: { len: 0.6, h: 0.62, w: 0.6, leg: 0.42, legW: 0.13, armLen: 1.35, color: '#1c1a1a', saddle: '#8a8a88', foot: '#151313', head: 0.36,
    snout: 0.08, snoutColor: '#2a2626', face: '#2a2626', ear: 'none', sitter: true, upright: true, speed: 0.7 },
  lemur: { len: 0.42, h: 0.26, w: 0.22, leg: 0.28, legW: 0.05, color: '#9a948c', belly: '#ece8e0', foot: '#2a2624', head: 0.22, snout: 0.12,
    snoutColor: '#1b1918', face: '#efeae2', mask: '#1b1918', ear: 'pointy', earSize: 0.06, tail: 'thin', tailLen: 0.9, tailW: 0.05,
    tailAngle: -2.5, tailColor: '#efeae2', tailRings: '#1b1918', sitter: true, arboreal: true, speed: 1.2 },
  // 沙漠動物區
  camel: { len: 1.2, h: 0.6, w: 0.48, leg: 0.85, legW: 0.09, color: '#b88a55', foot: '#8a6a45', neck: 0.7, neckTilt: 0.9, head: 0.3, snout: 0.25,
    snoutColor: '#a87a48', ear: 'round', earSize: 0.05, humps: 2, tail: 'thin', tailLen: 0.35, tailW: 0.03, tailAngle: -0.3, speed: 0.8, roller: true },
  addax: { len: 1.0, h: 0.5, w: 0.38, leg: 0.6, legW: 0.07, color: '#e9e0cc', headColor: '#d8ccb2', face: '#8a6a4a', foot: '#c9bca2', neck: 0.3,
    neckTilt: 0.5, head: 0.27, snout: 0.22, ear: 'pointy', earSize: 0.12, longHorns: { len: 0.75, color: '#c9b89a', twist: true, back: 0.55, spread: 0.25 },
    tail: 'thin', tailLen: 0.3, tailW: 0.03, tailAngle: -0.4, speed: 0.9 },
  // 澳洲動物區
  emu: { bird: true, len: 0.85, h: 0.68, w: 0.62, leg: 1.0, legW: 0.07, color: '#6a5848', neckColor: '#7a8a9a', headColor: '#2a2420', neckLen: 0.8,
    neckBend: 0.2, neckW: 0.14, head: 0.16, beak: 'short', beakColor: '#2a2420', wing: '#4a3c30', wingTip: '#3a2e24', legColor: '#5a5450',
    foot: '#4a4440', tail: 'short', tailColor: '#4a3c30', speed: 1.1, bounder: true },
  // 溫帶動物區
  asianbear: { len: 1.3, h: 0.8, w: 0.72, leg: 0.46, legW: 0.17, color: '#1a1818', foot: '#121010', head: 0.46, snout: 0.2, snoutColor: '#9a7e65',
    ear: 'round', earSize: 0.14, tail: 'short', chestV: '#f2ead6', speed: 0.9, swim: 0.55, climber: true },
  redpanda: { len: 0.6, h: 0.3, w: 0.3, leg: 0.22, legW: 0.06, color: '#b5482a', belly: '#2a1d18', legColor: '#2a1d18', headColor: '#c4572f',
    face: '#f2ebe2', head: 0.24, snout: 0.08, snoutColor: '#f2ebe2', ear: 'pointy', earSize: 0.08, earColor: '#f2ebe2', tail: 'thick', tailLen: 0.6,
    tailW: 0.1, tailAngle: -1.7, tailRings: '#7a2e18', arboreal: true, speed: 0.9 },
  cougar: { len: 1.1, h: 0.45, w: 0.36, leg: 0.42, legW: 0.08, color: '#b88a5a', belly: '#ece0cc', foot: '#a87a4a', head: 0.3, snout: 0.1,
    snoutColor: '#ece0cc', ear: 'round', earSize: 0.06, tail: 'thin', tailLen: 0.85, tailW: 0.06, tailAngle: -1.3, speed: 1.0, climber: true },
  przewalski: { len: 1.05, h: 0.58, w: 0.44, leg: 0.52, legW: 0.085, color: '#c69a5e', belly: '#eadbb8', sock: '#3a2e24', foot: '#2a221c', neck: 0.45,
    neckTilt: 0.45, head: 0.32, snout: 0.26, snoutColor: '#efe2c6', ear: 'pointy', earSize: 0.11, neckMane: '#3a2e24', tail: 'thin', tailLen: 0.6,
    tailW: 0.06, tailAngle: -0.3, tailColor: '#3a2e24', speed: 1.2, roller: true },
  // 鳥園
  crane: { bird: true, len: 0.7, h: 0.45, w: 0.4, leg: 1.0, legW: 0.03, color: '#f6f4ef', neckColor: '#1e1c1c', headColor: '#1e1c1c', crown: '#d62a2a',
    neckLen: 1.1, neckBend: 0.25, head: 0.16, beak: 'long', beakColor: '#c9c0a8', wing: '#f6f4ef', wingTip: '#1e1c1c', legColor: '#2a2624',
    foot: '#2a2624', tail: 'short', tailColor: '#1e1c1c', speed: 0.8, filter: true, swim: 0.2 },
  spoonbill: { bird: true, len: 0.55, h: 0.36, w: 0.32, leg: 0.75, legW: 0.03, color: '#f4f2ec', neckLen: 0.8, neckBend: 0.3, head: 0.15,
    beak: 'spoon', beakColor: '#1e1c1c', wing: '#f4f2ec', wingTip: '#e9e3d6', legColor: '#1e1c1c', foot: '#1e1c1c', tail: 'short', speed: 0.9,
    filter: true, swim: 0.22 },
  ibis: { bird: true, len: 0.52, h: 0.34, w: 0.3, leg: 0.7, legW: 0.03, color: '#e2382c', neckLen: 0.7, neckBend: 0.5, head: 0.14, beakColor: '#5a3424',
    wing: '#e2382c', wingTip: '#1b1512', legColor: '#d8483c', foot: '#d8483c', tail: 'short', speed: 0.9, filter: true, swim: 0.22 },
  pelican: { bird: true, len: 0.85, h: 0.5, w: 0.5, leg: 0.45, legW: 0.04, color: '#f4f0ea', neckLen: 0.7, neckBend: 0.6, neckW: 0.14, head: 0.2,
    beak: 'pouch', beakColor: '#e8c060', pouch: '#f2b26a', wing: '#f4f0ea', wingTip: '#2a2624', legColor: '#e8a87a', foot: '#e8a87a', tail: 'short',
    speed: 0.7, swim: 0.3, filter: true },
  eagle: { bird: true, len: 0.55, h: 0.45, w: 0.4, leg: 0.35, legW: 0.04, color: '#5a4632', neckColor: '#4a3a2a', headColor: '#2a2420', neckLen: 0.25,
    neckBend: 0, neckW: 0.2, head: 0.22, beak: 'hook', beakColor: '#e8c040', wing: '#4a3a2a', wingTip: '#1e1a16', legColor: '#e8c040',
    foot: '#e8c040', spots: { n: 8, color: '#efe6d4', size: 0.04 }, tail: 'short', tailColor: '#2a2420', speed: 0.7, arboreal: true },
  mandarin: { bird: true, len: 0.5, h: 0.3, w: 0.3, leg: 0.15, legW: 0.03, color: '#7a5a3a', neckColor: '#e8803a', headColor: '#2f6f5a', neckLen: 0.2,
    neckBend: 0, neckW: 0.18, head: 0.17, beak: 'duck', beakColor: '#d62a2a', crown: '#f4f2ec', wing: '#c96a2a', wingTip: '#2a3a6a',
    legColor: '#e8a040', foot: '#e8a040', tail: 'short', tailColor: '#4a3a2a', speed: 0.8, swim: 0.35 },
  pheasant: { bird: true, len: 0.6, h: 0.38, w: 0.3, leg: 0.35, legW: 0.035, color: '#2a2e5a', neckColor: '#1e2244', headColor: '#1e2244',
    crown: '#f4f2ec', neckLen: 0.3, neckBend: 0.1, neckW: 0.16, head: 0.16, beak: 'short', beakColor: '#c9c0a8', wing: '#3a4a7a', wingTip: '#8a2a2a',
    legColor: '#d62a2a', foot: '#d62a2a', tail: 'thin', tailLen: 0.7, tailW: 0.05, tailAngle: -0.4, tailColor: '#f4f2ec', speed: 1.0 },
  macaw: { bird: true, len: 0.45, h: 0.35, w: 0.3, leg: 0.2, legW: 0.035, color: '#d62a2a', neckLen: 0.3, neckBend: 0, neckW: 0.18, head: 0.2,
    beak: 'hook', beakColor: '#f2ece0', wing: '#2a6ad0', wingTip: '#f2c230', legColor: '#5a5450', foot: '#5a5450', tail: 'thin', tailLen: 0.8,
    tailW: 0.05, tailAngle: -1.2, tailColor: '#d62a2a', speed: 0.8, arboreal: true },
  // 極地動物區：企鵝（直立的高方塊身體、短脖子、翅膀變成鰭狀肢）
  kingpenguin: { bird: true, len: 0.42, h: 0.82, w: 0.44, leg: 0.1, legW: 0.05, color: '#2a2e36', headColor: '#141416', neckColor: '#141416',
    neckLen: 0.34, neckBend: 0, neckW: 0.2, head: 0.21, beak: 'long', beakColor: '#1e1c1c', front: '#f6f4ee', frontTop: '#f2b23a', cheek: '#f0901e',
    wing: '#2a2e36', wingTip: '#1e2026', legColor: '#1e1c1c', foot: '#1e1c1c', tail: 'short', tailColor: '#1e2026', speed: 0.5, swim: 0.55, climber: true },
  africanpenguin: { bird: true, len: 0.38, h: 0.62, w: 0.38, leg: 0.1, legW: 0.05, color: '#1e1e22', headColor: '#141416', neckColor: '#141416',
    neckLen: 0.28, neckBend: 0, neckW: 0.18, head: 0.19, beak: 'short', beakColor: '#1e1c1c', front: '#f6f4ee', bands: 1, faceStripe: '#f6f4ee',
    wing: '#1e1e22', wingTip: '#141416', legColor: '#1e1c1c', foot: '#2a2420', tail: 'short', tailColor: '#141416', speed: 0.55, swim: 0.55, climber: true },
  magellanic: { bird: true, len: 0.4, h: 0.66, w: 0.4, leg: 0.1, legW: 0.05, color: '#24262c', headColor: '#141416', neckColor: '#141416',
    neckLen: 0.28, neckBend: 0, neckW: 0.18, head: 0.19, beak: 'short', beakColor: '#2a2420', front: '#f6f4ee', bands: 2, faceStripe: '#f6f4ee',
    wing: '#24262c', wingTip: '#141416', legColor: '#2a2420', foot: '#d8a0a0', tail: 'short', tailColor: '#141416', speed: 0.55, swim: 0.55, climber: true },
  // 蟲蟲探索谷（insect：另一套產生器，六隻腳）
  // 大白斑蝶：白色半透明感的大翅膀、黑色翅脈和斑點
  ideabutterfly: { insect: true, flyer: true, len: 0.5, h: 0.12, w: 0.12, leg: 0.12, legW: 0.018, color: '#1a1410', head: 0.1, antennaLen: 0.32,
    wings: '#f4f2ea', hindWing: '#f0eee4', wingSize: 0.62, wingEdge: '#1a1410', spotColor: '#1a1410',
    wingSpots: [[0.05, 0.3, 0.12], [0.3, 0.55, 0.1], [0.05, 0.78, 0.1], [-0.3, 0.35, 0.12], [-0.45, 0.6, 0.1], [0.35, 0.85, 0.08]], speed: 0.9 },
  // 枯葉蝶：翅膀正面深藍紫色加一道橘色斜帶，合起來是枯葉的褐色
  kallima: { insect: true, flyer: true, len: 0.45, h: 0.12, w: 0.12, leg: 0.12, legW: 0.018, color: '#3a2a1e', head: 0.09, antennaLen: 0.28,
    wings: '#2a2a5a', hindWing: '#4a3a5a', wingSize: 0.52, wingEdge: '#8a6a44', wingBand: '#e8862a', speed: 0.9 },
  // 獨角仙：深紅褐色的亮殼、頭上分叉的長角
  beetle: { insect: true, len: 0.62, h: 0.28, w: 0.36, leg: 0.2, legW: 0.035, color: '#3a2418', thorax: '#2e1c12', shell: '#4a2c1a', head: 0.14,
    horn: '#2a1810', antennaLen: 0.12, speed: 0.4, arboreal: true },
  // 紅鶴：兩隻腿、S 形脖子、彎曲的喙（bird 走另一套頭部與腿）
  // 熱帶雨林（第五輪補上）：雙角犀鳥、馬來長吻鱷、小爪水獺、棉頭絹猴、熊狸
  hornbill: { bird: true, len: 0.7, h: 0.42, w: 0.36, leg: 0.3, legW: 0.04, color: '#1e1c1c', neckColor: '#f2e6b0', headColor: '#1e1c1c', neckLen: 0.35,
    neckBend: 0.1, neckW: 0.16, head: 0.2, beak: 'long', beakColor: '#f2c94c', casque: '#e8a83a', wing: '#1e1c1c', wingBand: '#f6f4ee', wingTip: '#f6f4ee',
    legColor: '#4a4442', foot: '#4a4442', tail: 'thin', tailLen: 0.8, tailW: 0.08, tailAngle: -1.3, tailColor: '#f6f4ee', speed: 0.8, arboreal: true },
  gharial: { len: 1.6, h: 0.28, w: 0.42, leg: 0.12, legW: 0.07, color: '#5a5a3e', belly: '#c9c08a', foot: '#4a4a32', head: 0.22, snout: 0.9, snoutThin: 0.35,
    snoutColor: '#5a5a3e', ear: 'none', ridge: '#46462e', tail: 'thick', tailLen: 1.2, tailW: 0.16, tailAngle: -1.55, tailColor: '#4f4f36', speed: 0.5, swim: 0.85 },
  clawedotter: { len: 0.7, h: 0.24, w: 0.24, leg: 0.11, legW: 0.06, color: '#7a5a40', belly: '#e2cfae', foot: '#5a4230', head: 0.2, snout: 0.07,
    snoutColor: '#e2cfae', ear: 'round', earSize: 0.035, tail: 'thick', tailLen: 0.45, tailW: 0.1, tailAngle: -1.45, speed: 1.2, swim: 0.85 },
  tamarin: { len: 0.32, h: 0.2, w: 0.18, leg: 0.2, legW: 0.04, color: '#5a4a3a', belly: '#f2eee6', legColor: '#f2eee6', foot: '#2a2420', head: 0.18,
    snout: 0.04, snoutColor: '#1e1c1c', face: '#1e1c1c', mane: '#f6f4ee', ear: 'none', tail: 'thin', tailLen: 0.7, tailW: 0.04, tailAngle: -2.4,
    tailColor: '#8a5a3a', sitter: true, arboreal: true, speed: 1.3 },
  binturong: { len: 0.95, h: 0.38, w: 0.34, leg: 0.24, legW: 0.08, color: '#1e1c1c', foot: '#151312', head: 0.26, snout: 0.12, snoutColor: '#2a2624',
    face: '#6a6460', ear: 'round', earSize: 0.06, earRim: '#e8e2d8', tail: 'thick', tailLen: 0.95, tailW: 0.12, tailAngle: -1.9, speed: 0.6, arboreal: true },
  // 兒童區：家禽（雞）、狐猴（和非洲區同一種模型）
  chicken: { bird: true, len: 0.42, h: 0.34, w: 0.28, leg: 0.22, legW: 0.035, color: '#f6f2e8', neckLen: 0.22, neckBend: 0, neckW: 0.16, head: 0.15,
    beak: 'short', beakColor: '#f2c94c', comb: '#d62a2a', wing: '#ece6d8', legColor: '#f2c94c', foot: '#f2c94c', tail: 'thin', tailLen: 0.35,
    tailW: 0.1, tailAngle: -0.6, tailColor: '#2a2420', speed: 0.9 },
  // 鳥園：維多利亞冠鴿（鳩鴿區）
  crownpigeon: { bird: true, len: 0.5, h: 0.36, w: 0.3, leg: 0.3, legW: 0.035, color: '#7d93b8', neckColor: '#8aa0c4', headColor: '#8aa0c4', neckLen: 0.25,
    neckBend: 0.1, neckW: 0.15, head: 0.15, beak: 'short', beakColor: '#3a3a40', crest: '#9fb2d6', crestTip: '#f6f4ee', wing: '#6a80a6', wingBand: '#9a3a4a',
    legColor: '#9a3a4a', foot: '#9a3a4a', tail: 'short', tailColor: '#5a6f94', speed: 0.8 },
  // 兩棲爬蟲動物館：緬甸蟒、輻射龜、綠鬣蜥、草莓箭毒蛙（都很小，展場是玻璃箱）
  python: { len: 1.8, h: 0.16, w: 0.2, leg: 0.02, legW: 0.012, color: '#d9c48a', foot: '#d9c48a', head: 0.16, snout: 0.1, snoutColor: '#c9b47a', ear: 'none',
    spots: { n: 9, size: 0.09, color: '#8a6a3a' }, tail: 'thick', tailLen: 1.2, tailW: 0.14, tailAngle: -1.5, tailColor: '#d9c48a', speed: 0.3 },
  tortoise: { len: 0.55, h: 0.22, w: 0.42, leg: 0.1, legW: 0.07, color: '#8a7a5a', foot: '#6a5a40', head: 0.15, snout: 0.05, ear: 'none',
    dome: '#3a3226', domeSpots: '#e8c85a', tail: 'short', tailColor: '#8a7a5a', speed: 0.2 },
  iguana: { len: 0.6, h: 0.2, w: 0.2, leg: 0.12, legW: 0.045, color: '#6fa64a', belly: '#a8c87a', foot: '#4f7f3a', head: 0.16, snout: 0.12, ear: 'none',
    ridge: '#4f7f3a', tail: 'thin', tailLen: 0.9, tailW: 0.06, tailAngle: -1.5, tailColor: '#5f8f42', tailRings: '#3f6a2e', speed: 0.5, arboreal: true },
  dartfrog: { len: 0.3, h: 0.16, w: 0.24, leg: 0.1, legW: 0.05, color: '#d6282a', legColor: '#2a4ad0', foot: '#2a4ad0', head: 0.15, snout: 0.03, ear: 'none',
    spots: { n: 5, size: 0.05, color: '#1e1c1c' }, speed: 0.6, hop: true },
  flamingo: { bird: true, len: 0.62, h: 0.4, w: 0.36, leg: 0.95, legW: 0.03, color: '#f4a6b6', legColor: '#e88aa0', foot: '#e88aa0',
    head: 0.16, tail: 'short', tailColor: '#f19aae', speed: 0.8, swim: 0.22, filter: true },
};

// 方塊堆疊（voxel）風格：所有零件都是方塊，參考 Reference/ 裡的積木動物圖
const BOX = new THREE.BoxGeometry(1, 1, 1);
const BOXD = new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0); // 從頂端往下長（腿、尾巴、象鼻）
const CONE = new THREE.ConeGeometry(0.5, 1, 6);

function part(geo, color, sx, sy, sz, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat(color));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
const box = (color, sx, sy, sz, x, y, z) => part(BOX, color, sx, sy, sz, x, y, z);
// 貼在表面的花紋薄片：不投影
const patch = (color, sx, sy, sz, x, y, z) => { const m = box(color, sx, sy, sz, x, y, z); m.castShadow = false; return m; };

// 兩段式的腿：髖（藏在身體裡）→ 大腿 → 膝 → 小腿 → 蹄／掌，都是直直的方柱
function makeLeg(s, x, z, hind) {
  const hipY = -s.h * 0.1;
  const total = (s.leg + s.h * 0.32) * (hind ? 1 : s.armLen || 1); // 紅毛猩猩的手臂比腳長很多
  const footH = s.legW * 0.9;
  const up = total * 0.5;
  const low = total * 0.5 - footH * 0.5 + (hind ? total * 0.03 : 0);
  const wU = s.legW * (hind ? 2.5 : 2.2);
  const wL = s.legW * 1.9;
  const color = s.legColor || s.color;
  const hip = new THREE.Group();
  hip.position.set(x, hipY, z);
  hip.add(part(BOXD, color, wU, up + wL * 0.3, wU));
  const knee = new THREE.Group();
  knee.position.y = -up;
  hip.add(knee);
  knee.add(part(BOXD, s.sock || color, wL, low, wL)); // sock：小腿換深色（水豚）
  if (s.legBands) for (let k = 0; k < s.legBands.n; k++) knee.add(patch(s.legBands.color, wL * 1.06, low * 0.07, wL * 1.06, 0, -low * (0.12 + k * 0.17), 0)); // legBands：小腿一圈圈橫紋（非洲野驢）
  knee.add(box(s.foot || color, wL * 1.15, footH, wL * 1.1, wL * 0.08, -low - footH * 0.3, 0));
  return { hip, knee, hind, baseHip: hind ? 0.3 : 0, baseKnee: hind ? -0.55 : 0 };
}

// 昆蟲（insect）：頭、胸、腹三節方塊，六隻細腳、兩根觸角；蝴蝶有前後兩對大翅膀（wings），獨角仙有長角（horn）
function buildInsect(s, R) {
  const root = new THREE.Group(), rig = new THREE.Group(), body = new THREE.Group();
  root.add(rig); rig.add(body);
  const { len: L, h: H, w: W, leg } = s;
  body.position.y = leg + H * 0.5;
  const torso = box(s.color, L * 0.55, H, W); // 腹部
  torso.position.x = -L * 0.22;
  body.add(torso);
  if (s.shell) { // 甲蟲的翅鞘：腹部上面一片亮亮的硬殼，中間一道縫
    body.add(box(s.shell, L * 0.6, H * 0.5, W * 1.08, -L * 0.2, H * 0.32, 0));
    body.add(patch('#120c08', L * 0.6, 0.012, 0.02, -L * 0.2, H * 0.58, 0));
  }
  body.add(box(s.thorax || s.color, L * 0.3, H * 0.95, W * 0.85, L * 0.2, H * 0.05, 0)); // 胸
  if (s.stripes) for (let k = 0; k < 3; k++) body.add(patch(s.stripes, L * 0.06, H * 1.02, W * 1.02, -L * (0.05 + k * 0.14), 0, 0));
  const head = new THREE.Group();
  head.position.set(L * 0.42, H * 0.1, 0);
  body.add(head);
  const hs = s.head;
  head.add(box(s.headColor || s.color, hs, hs * 0.9, hs * 1.1));
  for (const side of [1, -1]) {
    head.add(patch('#0e0a08', hs * 0.3, hs * 0.4, 0.02, hs * 0.2, hs * 0.1, side * hs * 0.56));
    head.add(patch('#ffffff', hs * 0.1, hs * 0.1, 0.022, hs * 0.26, hs * 0.2, side * hs * 0.565));
    // 觸角：往前上方伸，蝴蝶的末端膨大
    const an = new THREE.Group();
    an.position.set(hs * 0.3, hs * 0.4, side * hs * 0.2);
    an.rotation.set(side * 0.35, 0, -0.6);
    an.add(part(BOXD, s.antenna || '#1a1410', 0.02, s.antennaLen || 0.3, 0.02).rotateZ(Math.PI));
    if (s.wings) an.add(box(s.antenna || '#1a1410', 0.05, 0.06, 0.05, 0, s.antennaLen || 0.3, 0));
    head.add(an);
  }
  // 獨角仙：頭上一根往上彎、末端分叉的長角，胸前再一根短角
  if (s.horn) {
    const hn = new THREE.Group();
    hn.position.set(hs * 0.4, hs * 0.2, 0);
    hn.rotation.z = -0.9;
    hn.add(part(BOXD, s.horn, 0.07, 0.42, 0.07).rotateZ(Math.PI));
    const tip = new THREE.Group(); tip.position.y = 0.42; tip.rotation.z = 0.7; hn.add(tip);
    tip.add(part(BOXD, s.horn, 0.06, 0.18, 0.06).rotateZ(Math.PI));
    for (const side of [1, -1]) tip.add(box(s.horn, 0.04, 0.1, 0.04, 0, 0.2, side * 0.05));
    head.add(hn);
    const th = part(BOXD, s.horn, 0.06, 0.22, 0.06, L * 0.24, H * 0.5, 0).rotateZ(Math.PI - 0.4);
    body.add(th);
  }
  // 六隻腳：每隻先往外張開（外層群組），髖、膝和四腳動物一樣給 pose 擺動
  const legs = [];
  for (const [x, hind] of [[L * 0.3, false], [L * 0.15, false], [L * 0.0, true]]) for (const side of [1, -1]) {
    const splay = new THREE.Group();
    splay.position.set(x, -H * 0.3, side * W * 0.4);
    splay.rotation.x = side * 0.75;
    const hip = new THREE.Group();
    splay.add(hip);
    hip.add(part(BOXD, s.legColor || '#1a1410', s.legW, leg * 0.6, s.legW));
    const knee = new THREE.Group();
    knee.position.y = -leg * 0.6;
    hip.add(knee);
    knee.add(part(BOXD, s.legColor || '#1a1410', s.legW * 0.8, leg * 0.75, s.legW * 0.8));
    knee.rotation.x = -side * 0.9; // 小腿往下折回地面
    body.add(splay);
    legs.push({ hip, knee, hind, baseHip: 0, baseKnee: 0, insect: true });
  }
  // 蝴蝶翅膀：前翅＋後翅兩片薄板，花紋是貼在上面的方塊（wingSpots）
  let wings = null;
  if (s.wings) {
    wings = [1, -1].map((side) => {
      const w = new THREE.Group();
      w.position.set(L * 0.15, H * 0.4, side * W * 0.3);
      const fw = s.wingSize;
      w.add(box(s.wings, fw * 0.75, 0.025, fw, fw * 0.2, 0, side * fw * 0.5));
      w.add(box(s.hindWing || s.wings, fw * 0.6, 0.024, fw * 0.75, -fw * 0.3, -0.004, side * fw * 0.4));
      if (s.wingEdge) {
        w.add(box(s.wingEdge, fw * 0.75, 0.03, fw * 0.12, fw * 0.2, 0, side * fw * 0.96));
        w.add(box(s.wingEdge, fw * 0.12, 0.03, fw, fw * 0.55, 0, side * fw * 0.5));
      }
      for (const [u, v, k] of s.wingSpots || []) w.add(box(s.spotColor || '#1a1410', fw * k, 0.032, fw * k, fw * u, 0, side * fw * v));
      if (s.wingBand) w.add(box(s.wingBand, fw * 0.16, 0.031, fw * 0.8, fw * 0.32, 0, side * fw * 0.55));
      w.userData.side = side;
      body.add(w);
      return w;
    });
  }
  return { root, rig, body, legs, head, torso, tail: null, ball: null, wings, trunk: null, sac: null, spec: s };
}

function buildAnimal(s, R) {
  if (s.insect) return buildInsect(s, R);
  const root = new THREE.Group();
  const rig = new THREE.Group();
  const body = new THREE.Group();
  root.add(rig); rig.add(body);
  const { len: L, h: H, w: W, leg } = s;
  body.position.y = leg + H * 0.42;

  // 身體：中段＋略高的胸＋臀，三塊方塊疊出階梯狀的輪廓
  const torso = box(s.color, L, H, W);
  body.add(torso);
  body.add(box(s.color, L * 0.45, H * 1.06, W * 1.04, L * 0.26, H * 0.03, 0));
  body.add(box(s.color, L * 0.42, H * 0.98, W * 1.02, -L * 0.27, 0, 0));
  // 某個 x 位置身體外側的半寬與頂面高度（花紋要貼在最外層）
  const sideAt = (x) => (x > L * 0.04 ? W * 0.52 : x < -L * 0.06 ? W * 0.51 : W * 0.5);
  const topAt = (x) => (x > L * 0.04 ? H * 0.56 : x < -L * 0.06 ? H * 0.49 : H * 0.5);
  if (s.belly) body.add(box(s.belly, L * 0.78, H * 0.3, W * 1.06, 0, -H * 0.37, 0));
  if (s.mane) body.add(box(s.mane, L * 0.7, H * 0.16, W * 0.5, L * 0.1, H * 0.6, 0));
  // 馬來貘：身體中後段一圈白色
  if (s.saddle) body.add(box(s.saddle, L * 0.5, H * 1.02, W * 1.06, -L * 0.16, 0, 0));
  // 大食蟻獸：從胸口斜到背上的黑色寬帶，外緣一道白邊（一階一階的方塊）
  if (s.sash) for (let k = 0; k < 4; k++) {
    const f = k / 3, x = L * (0.32 - f * 0.34), y = H * (-0.28 + f * 0.62);
    for (const side of [1, -1]) {
      body.add(patch(s.sashEdge, L * 0.16, H * 0.24, 0.02, x + L * 0.09, y, side * (sideAt(x) + 0.012)));
      body.add(patch(s.sash, L * 0.16, H * 0.26, 0.02, x, y, side * (sideAt(x) + 0.016)));
    }
    if (k === 3) body.add(patch(s.sash, L * 0.16, 0.02, W * 1.05, x, topAt(x) + 0.01, 0));
  }

  // 腿：[左前, 右前, 左後, 右後]
  const legs = s.bird
    ? [makeLeg(s, 0, W * 0.22, false), makeLeg(s, 0, -W * 0.22, false)]
    : [
      makeLeg(s, L * 0.3, W * 0.27, false), makeLeg(s, L * 0.3, -W * 0.27, false),
      makeLeg(s, -L * 0.3, W * 0.27, true), makeLeg(s, -L * 0.3, -W * 0.27, true),
    ];
  legs.forEach((l) => body.add(l.hip));

  // 頭
  const head = new THREE.Group();
  const hs = s.head * (s.bird ? 1 : 1.2); // 積木風格的頭比較大
  let wings = null;
  if (s.bird) {
    // 長脖子：一節節方塊往上疊成 S 形
    // neckLen：脖子長度倍數；neckBend：S 形彎曲程度（紅鶴 1，鶴、鴯鶓比較直）
    const nk = s.neckLen ?? 1, bend = s.neckBend ?? 1, nw = s.neckW || 0.11;
    const pts = [0, 0.22, -0.04, 0.1].map((dx, k) => [L * (0.4 + dx * bend), H * (k ? 0.3 : 0.25) + [0, 0.42, 0.86, 1.22][k] * nk]);
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const seg = box(s.neckColor || s.color, nw, len + 0.08, nw, (x0 + x1) / 2, (y0 + y1) / 2, 0);
      seg.rotation.z = -Math.atan2(x1 - x0, y1 - y0);
      body.add(seg);
    }
    head.position.set(...pts[3], 0);
    head.add(box(s.headColor || s.neckColor || s.color, hs * 1.15, hs * 0.85, hs * 0.8, 0, 0, 0));
    const bc = s.beakColor || '#f2e6dc';
    if (!s.beak) {
      // 紅鶴：往下彎的喙，前端黑色
      const beak = box(bc, hs * 0.95, hs * 0.38, hs * 0.36, hs * 0.85, -hs * 0.12, 0);
      beak.rotation.z = -0.45;
      head.add(beak);
      const tip = box('#1b1512', hs * 0.5, hs * 0.36, hs * 0.34, hs * 1.15, -hs * 0.5, 0);
      tip.rotation.z = -1.0;
      head.add(tip);
    } else if (s.beak === 'long') {
      head.add(box(bc, hs * 1.7, hs * 0.22, hs * 0.22, hs * 1.35, -hs * 0.1, 0)); // 鶴：又長又直
    } else if (s.beak === 'spoon') {
      head.add(box(bc, hs * 1.5, hs * 0.18, hs * 0.2, hs * 1.25, -hs * 0.12, 0)); // 琵鷺：前端扁平的湯匙
      head.add(box(bc, hs * 0.45, hs * 0.14, hs * 0.5, hs * 2.05, -hs * 0.12, 0));
    } else if (s.beak === 'pouch') {
      head.add(box(bc, hs * 2.2, hs * 0.2, hs * 0.34, hs * 1.6, 0, 0)); // 鵜鶘：長長的上喙＋下面的喉囊
      head.add(box(s.pouch || '#f2b8a0', hs * 1.7, hs * 0.5, hs * 0.3, hs * 1.4, -hs * 0.32, 0));
    } else if (s.beak === 'hook') {
      head.add(box(bc, hs * 0.5, hs * 0.4, hs * 0.34, hs * 0.75, -hs * 0.02, 0)); // 猛禽：短而彎的鉤喙
      head.add(box(bc, hs * 0.22, hs * 0.36, hs * 0.26, hs * 0.98, -hs * 0.24, 0));
    } else if (s.beak === 'duck') {
      head.add(box(bc, hs * 0.8, hs * 0.2, hs * 0.5, hs * 0.85, -hs * 0.16, 0)); // 鴨：扁平的喙
    } else {
      head.add(box(bc, hs * 0.55, hs * 0.26, hs * 0.3, hs * 0.75, -hs * 0.1, 0)); // short：鴯鶓
    }
    if (s.crown) head.add(box(s.crown, hs * 0.6, hs * 0.12, hs * 0.6, -hs * 0.05, hs * 0.46, 0)); // 丹頂鶴頭頂的紅色
    if (s.casque) head.add(box(s.casque, hs * 1.3, hs * 0.38, hs * 0.32, hs * 0.85, hs * 0.3, 0)); // 犀鳥喙上的盔突
    if (s.comb) { // 雞冠和肉垂
      head.add(box(s.comb, hs * 0.7, hs * 0.42, hs * 0.14, 0, hs * 0.6, 0));
      head.add(box(s.comb, hs * 0.22, hs * 0.36, hs * 0.12, hs * 0.55, -hs * 0.5, 0));
    }
    if (s.crest) for (let k = 0; k < 5; k++) { // 冠鴿頭上一把扇形的蕾絲羽冠
      const f = box(s.crest, hs * 0.08, hs * 0.8, hs * 0.08, -hs * 0.1 + (k - 2) * hs * 0.14, hs * 0.75, 0);
      f.rotation.z = (k - 2) * 0.25;
      head.add(f);
      head.add(box(s.crestTip || '#f6f4ee', hs * 0.14, hs * 0.12, hs * 0.14, -hs * 0.1 + (k - 2) * hs * 0.32, hs * 1.12, 0));
    }
    // 企鵝：白色的前胸（front）、國王企鵝胸口上方的橘黃色（frontTop）和耳後的橘色斑（cheek）、
    // 黑腳企鵝和麥哲倫企鵝胸前的黑色環帶（bands：1 或 2 條）和臉上繞過眼睛的白色條紋（faceStripe）
    if (s.front) {
      body.add(patch(s.front, 0.02, H * 0.86, W * 0.86, L / 2 + 0.012, -H * 0.06, 0));
      for (const side of [1, -1]) body.add(patch(s.front, L * 0.42, H * 0.7, 0.02, L * 0.28, -H * 0.12, side * (W * 0.52 + 0.014))); // 側面靠前的半邊也是白的
      if (s.frontTop) body.add(patch(s.frontTop, 0.02, H * 0.22, W * 0.7, L / 2 + 0.016, H * 0.3, 0));
      for (let k = 0; k < (s.bands || 0); k++) {
        body.add(patch(s.bandColor || '#141414', 0.02, H * 0.07, W * 0.88, L / 2 + 0.018, H * (0.22 - k * 0.16), 0));
        for (const side of [1, -1]) body.add(patch(s.bandColor || '#141414', L * 0.5, H * 0.07, 0.02, L * 0.25, H * (0.22 - k * 0.16), side * (W / 2 + 0.012)));
      }
    }
    if (s.cheek) for (const side of [1, -1]) head.add(patch(s.cheek, hs * 0.5, hs * 0.4, 0.02, -hs * 0.15, -hs * 0.05, side * (hs * 0.41)));
    if (s.faceStripe) for (const side of [1, -1]) {
      head.add(patch(s.faceStripe, hs * 0.9, hs * 0.1, 0.02, -hs * 0.05, hs * 0.26, side * (hs * 0.41)));
      head.add(patch(s.faceStripe, hs * 0.1, hs * 0.55, 0.02, -hs * 0.5, -hs * 0.02, side * (hs * 0.41)));
    }
    for (const side of [1, -1]) head.add(box('#14100e', hs * 0.18, hs * 0.18, hs * 0.06, hs * 0.22, hs * 0.12, side * hs * 0.41));
    // 翅膀收在身體兩側，點牠時會拍動
    wings = [1, -1].map((side) => {
      const w = new THREE.Group();
      w.position.set(0, H * 0.3, side * W * 0.5);
      if (s.front) w.add(box(s.wing, L * 0.36, H * 0.62, 0.06, -L * 0.24, -H * 0.18, 0)); // 企鵝：窄窄的鰭狀肢貼在身體後半
      else {
        w.add(box(s.wing || '#ec7d95', L * 0.72, H * 0.55, 0.06, -L * 0.05, -H * 0.2, 0));
        w.add(box(s.wingTip || '#1b1512', L * 0.26, H * 0.24, 0.07, -L * 0.36, -H * 0.3, 0));
      }
      w.userData.side = side;
      body.add(w);
      return w;
    });
    body.add(head);
  } else if (s.neck) {
    // neckTilt：脖子往前傾的角度，0 是直立（羊駝），梅花鹿約 0.45
    const nw = W * 0.5, tilt = s.neckTilt ?? 0.45;
    const sn = Math.sin(tilt), cs = Math.cos(tilt);
    const nx = L * 0.44 + sn * s.neck * 0.35, ny = H * 0.2 + cs * s.neck * 0.47;
    const neck = box(s.fluff || s.color, nw, s.neck + H * 0.3, nw, nx, ny, 0);
    neck.rotation.z = -tilt;
    body.add(neck);
    if (s.neckMane) {
      const mane = box(s.neckMane, nw * 0.35, s.neck + H * 0.2, nw * 0.4, nx - cs * nw * 0.58, ny + sn * nw * 0.58, 0);
      mane.rotation.z = -tilt;
      body.add(mane);
    }
    head.position.set(L * 0.5 + sn * s.neck * 0.74, H * 0.2 + cs * s.neck * 1.02, 0);
  } else {
    head.position.set(L * 0.47, H * 0.16 + (s.headUp || 0), 0);
  }
  if (!s.bird) body.add(head);
  const hc = hs * 0.35;
  const headColor = s.headColor || s.color;
  let sac = null;
  if (!s.bird) {
    const hx = hs * 1.05, hy = hs * 0.95, hz = hs * 0.95;
    const xf = hc + hx / 2; // 臉的正面
    head.add(box(headColor, hx, hy, hz, hc, 0, 0));
    // 靈長類、狐獴：眼睛長在正面；其他動物長在兩側
    const front = !!(s.upright || s.face);
    let faceX = xf;
    if (s.faceRing) { head.add(patch(s.faceRing, hs * 0.04, hy * 0.86, hz * 0.9, xf + hs * 0.01, -hs * 0.02, 0)); faceX += hs * 0.03; }
    if (s.face) { head.add(patch(s.face, hs * 0.05, hy * 0.66, hz * 0.7, faceX + hs * 0.01, -hs * 0.06, 0)); faceX += hs * 0.035; }
    const thin = s.snoutThin || 1; // 大食蟻獸的長管狀吻部
    const sl = s.snout * 1.1 + hs * 0.1, sh = hs * 0.48 * thin, sw = hs * 0.58 * thin;
    const sx = faceX + sl / 2 - hs * 0.06, sy = -hs * 0.2 - (1 - thin) * hs * 0.12;
    head.add(box(s.snoutColor || headColor, sl, sh, sw, sx, sy, 0));
    // 鼻頭：吻部前端上緣一塊深色方塊
    head.add(patch('#1b1512', hs * 0.1, sh * 0.42, sw * 0.62, sx + sl / 2 + hs * 0.02, sy + sh * 0.22, 0));
    // 眼睛：黑色方塊＋左上角一小格白色亮點
    for (const side of [1, -1]) {
      const ex = front ? faceX + hs * 0.02 : xf - hs * 0.14;
      const ey = hs * 0.12, ez = front ? side * hs * 0.2 : side * (hz / 2 + hs * 0.01);
      const ew = hs * 0.2, eh = hs * 0.22;
      if (s.mask) head.add(patch(s.mask, front ? 0.01 : hs * 0.4, hs * 0.32, front ? hs * 0.34 : 0.01, front ? ex - 0.002 : ex - hs * 0.04, ey, front ? ez : ez - side * 0.004));
      head.add(front ? patch('#14100e', hs * 0.05, eh, ew, ex, ey, ez) : patch('#14100e', ew, eh, hs * 0.05, ex, ey, ez));
      head.add(front
        ? patch('#ffffff', hs * 0.06, hs * 0.06, hs * 0.06, ex + hs * 0.01, ey + hs * 0.05, ez + side * hs * 0.04)
        : patch('#ffffff', hs * 0.06, hs * 0.06, hs * 0.06, ex + hs * 0.04, ey + hs * 0.05, ez + side * hs * 0.01));
    }
    if (s.cap) head.add(box(s.cap, hx * 1.04, hs * 0.22, hz * 1.04, hc - hs * 0.04, hy / 2 - hs * 0.06, 0));
    if (s.cheekPads) for (const side of [1, -1]) head.add(box(s.cheekPads, hs * 0.14, hs * 1.0, hs * 0.34, xf - hs * 0.04, -hs * 0.02, side * (hz / 2 + hs * 0.13)));
    if (s.throat) head.add(box(s.throat, hs * 0.62, hs * 0.26, hz * 0.7, hc + hs * 0.12, -hy / 2 - hs * 0.06, 0));
    // 大長臂猿的喉囊：唱歌時鼓起來（scale 由 pose 控制，不合併）
    if (s.sac) {
      sac = box(s.sac, hs * 0.6, hs * 0.6, hs * 0.6, hc + hs * 0.2, -hy / 2 - hs * 0.12, 0);
      sac.userData.dynamic = true;
      sac.userData.r = hs * 0.6;
      head.add(sac);
    }
    if (s.foreheadStripes) for (const z of [hs * 0.1, -hs * 0.1]) head.add(patch(s.foreheadStripes, hx * 0.62, 0.012, hs * 0.08, hc + hx * 0.18, hy / 2 + 0.004, z));
    const es = s.earSize || 0;
    const earColor = s.earColor || headColor;
    for (const side of [1, -1]) {
      if (s.ear === 'pointy') {
        // 兩層方塊疊成三角形的耳朵
        const e = new THREE.Group();
        e.position.set(hc - hs * 0.12, hy / 2, side * hs * 0.3);
        e.rotation.x = side * 0.3;
        e.add(box(earColor, es * 0.4, es * 0.9, es * 0.9, 0, es * 0.42, 0));
        e.add(box(earColor, es * 0.36, es * 0.8, es * 0.48, 0, es * 1.2, 0));
        head.add(e);
      } else if (s.ear === 'round') {
        const ey = hy / 2 + es * 0.2, ez = side * (hz / 2 - es * 0.2);
        head.add(box(earColor, es * 0.5, es * 1.3, es * 1.3, hc - hs * 0.12, ey, ez));
        // 無尾熊耳朵外圈的白毛：後面墊一塊比耳朵大一圈的淺色方塊
        if (s.earRim) head.add(box(s.earRim, es * 0.4, es * 1.65, es * 1.65, hc - hs * 0.12 - es * 0.12, ey + es * 0.05, ez + side * es * 0.1));
      } else if (s.ear === 'fan') {
        // 大象的大耳朵：貼在頭兩側的扁方片
        const e = box(headColor, es * 1.4, es * 1.8, es * 0.16, hc - hs * 0.3, -hs * 0.02, side * (hz / 2 + es * 0.1));
        e.rotation.y = side * 0.35; // 往後張開一點
        head.add(e);
      } else if (s.ear === 'long') {
        const e = new THREE.Group();
        e.position.set(hc - hs * 0.2, hy / 2, side * hs * 0.2);
        e.rotation.set(side * 0.15, 0, 0.2);
        e.add(box(headColor, es * 0.9, es * 4.2, es * 1.6, 0, es * 2, 0));
        e.add(patch('#f0c4c0', es * 0.3, es * 3.2, es * 1.0, es * 0.32, es * 2.1, 0));
        head.add(e);
      }
      if (s.horns) {
        const h = new THREE.Group();
        h.position.set(hc - hs * 0.02, hy / 2, side * hs * 0.18);
        h.rotation.z = 0.55;
        h.add(box(s.hornColor || '#1a1614', 0.06, 0.14, 0.06, 0, 0.06, 0));
        h.add(box(s.hornColor || '#1a1614', 0.045, 0.12, 0.045, -0.01, 0.17, 0));
        head.add(h);
      }
      // 羚羊的長角：一節節往後上方伸，螺旋角每節左右錯開一點（longHorns：長度、顏色、往後傾、往外張）
      if (s.longHorns) {
        const lh = s.longHorns, h = new THREE.Group(), n = 5, sl = lh.len / n;
        h.position.set(hc - hs * 0.08, hy / 2, side * hs * 0.16);
        h.rotation.set(side * (lh.spread || 0.15), 0, lh.back ?? 0.5);
        for (let k = 0; k < n; k++) {
          const tw = lh.twist ? (k % 2 ? 1 : -1) * 0.02 : 0, w = 0.07 * (1 - k * 0.12);
          h.add(box(lh.color || '#3a2e24', w, sl * 1.05, w, tw, sl * (k + 0.5), lh.curve ? -k * k * 0.01 : 0));
        }
        head.add(h);
      }
      if (s.tusks) {
        const tl = s.tuskLen || 0.12;
        const t = box('#f2ead8', tl * 0.28, tl, tl * 0.28, sx + sl * 0.25, sy - (tl > 0.2 ? tl * 0.45 : -sh * 0.3), side * sw * 0.5);
        t.rotation.set(side * 0.25, 0, tl > 0.2 ? -2.2 : 0); // 長象牙往前下方伸出去
        head.add(t);
      }
      if (s.antlers) {
        // 鹿角：一根主幹往後上方，前面分出一叉
        const a = new THREE.Group();
        a.position.set(hc - hs * 0.05, hy / 2, side * hs * 0.2);
        a.rotation.x = side * -0.3;
        a.add(part(BOXD, '#d9c7a3', 0.05, 0.44, 0.05).rotateZ(Math.PI - 0.35));
        const b = part(BOXD, '#d9c7a3', 0.045, 0.18, 0.045, 0.07, 0.2, 0);
        b.rotation.z = Math.PI + 0.5;
        a.add(b);
        head.add(a);
      }
    }
  }

  if (!s.bird) {
    // 犀牛：鼻子上一大一小兩支角
    if (s.noseHorn) {
      const hx0 = hc + hs * 0.6;
      head.add(box(s.noseHorn, hs * 0.22, hs * 0.5, hs * 0.22, hx0 + hs * 0.25, -hs * 0.02 + hs * 0.25, 0));
      head.add(box(s.noseHorn, hs * 0.16, hs * 0.28, hs * 0.16, hx0 - hs * 0.08, hs * 0.18 + hs * 0.1, 0));
    }
    // 公獅的鬃毛：頭後面一圈比頭大的方塊，胸前再垂一塊
    if (s.ruff) {
      head.add(box(s.ruff, hs * 0.7, hs * 1.6, hs * 1.6, hc - hs * 0.55, hs * 0.02, 0));
      head.add(box(s.ruff, hs * 0.6, hs * 0.5, hs * 1.1, hc - hs * 0.2, -hs * 0.65, 0));
    }
  }
  // 駱駝的駝峰（humps：1 或 2 個）
  if (s.humps) for (let k = 0; k < s.humps; k++) {
    const x = s.humps === 1 ? 0 : (k ? -0.2 : 0.2) * L;
    body.add(box(s.humpColor || s.color, L * 0.26, H * 0.5, W * 0.7, x, H * 0.62, 0));
    body.add(box(s.humpColor || s.color, L * 0.16, H * 0.2, W * 0.5, x, H * 0.92, 0));
  }

  // 象鼻：一節節往下垂、越來越細的方塊，trunk 群組可以整條捲起來
  let trunk = null;
  if (s.trunk) {
    trunk = new THREE.Group();
    trunk.position.set(hc + hs * 0.5, -hs * 0.12, 0);
    let node = trunk;
    for (let k = 0; k < 5; k++) {
      const r = hs * (0.26 - k * 0.03), seg = hs * 0.32;
      const j = new THREE.Group();
      if (k) j.position.y = -seg;
      j.add(part(BOXD, headColor, r * 2, seg * 1.1, r * 2));
      j.rotation.z = k === 0 ? 0.3 : -0.07; // 根部往前伸，末端往身體捲一點
      node.add(j);
      node = j;
    }
    // 噴水：鼻尖一束半透明的水柱，只在洗澡時出現
    const spray = new THREE.Mesh(CONE, new THREE.MeshStandardMaterial({ color: '#cfeefa', transparent: true, opacity: 0.7, emissive: '#7fd0e8', emissiveIntensity: 0.3 }));
    spray.scale.set(hs * 0.5, hs * 1.6, hs * 0.5);
    spray.position.y = -hs * 0.32 - hs * 0.8;
    spray.visible = false;
    node.add(spray);
    trunk.userData.spray = spray;
    head.add(trunk);
  }
  // 臺灣黑熊胸前的白色 V 字
  if (s.chestV) for (const side of [1, -1]) {
    const v = patch(s.chestV, 0.02, H * 0.4, W * 0.12, L * 0.485 + 0.01, H * 0.02, side * W * 0.11);
    v.rotation.x = side * 0.55;
    body.add(v);
  }
  // 斑點：方形色塊貼在身體兩側和背上
  if (s.spots) for (let i = 0; i < s.spots.n * 1.6; i++) {
    const sz = s.spots.size * (0.8 + R() * 0.5) * 1.2;
    const x = (R() * 2 - 1) * L * 0.42;
    if (R() < 0.3) body.add(patch(s.spots.color, sz, 0.012, sz, x, topAt(x) + 0.004, (R() * 2 - 1) * W * 0.36));
    else {
      const side = R() < 0.5 ? 1 : -1;
      body.add(patch(s.spots.color, sz, sz, 0.012, x, (R() * 2 - 1) * H * 0.34 + H * 0.06, side * (sideAt(x) + 0.004)));
    }
  }
  // 老虎的直條紋：兩側直條＋背上一段
  if (s.bands) for (let i = 0; i < s.bands.n; i++) {
    const x = (-0.42 + (0.84 * i) / (s.bands.n - 1)) * L;
    for (const side of [1, -1]) body.add(patch(s.bands.color, L * 0.04, H * (0.45 + (i % 2) * 0.15), 0.012, x, H * 0.18, side * (sideAt(x) + 0.004)));
    body.add(patch(s.bands.color, L * 0.04, 0.012, W * 0.7, x, topAt(x) + 0.004, 0));
  }
  // 羊毛：身體表面一顆顆蓬鬆的小方塊
  if (s.fluff) for (let i = 0; i < 14; i++) {
    const sz = W * (0.3 + R() * 0.12), x = (R() * 2 - 1) * L * 0.4;
    const v = 0.2 + R() * (Math.PI - 0.4);
    body.add(box(s.fluff, sz, sz * 0.8, sz, x, H * 0.45 * Math.sin(v), W * 0.45 * Math.cos(v)));
  }
  // 小野豬背上的淡色縱紋
  if (s.stripes) for (const side of [1, -1]) for (let k = 0; k < 3; k++) {
    body.add(patch(s.stripes, L * 0.8, H * 0.07, 0.012, 0, H * (0.05 + k * 0.13), side * (W * 0.52 + 0.004)));
  }
  // 穿山甲的鱗片：一圈圈比身體略大的方環，疊出一節節的盔甲
  if (s.scales) for (let i = 0; i < 6; i++) {
    const x = (i / 5 - 0.5) * L * 0.84;
    body.add(box(s.scales, L * 0.1, topAt(x) * 2 + H * 0.06, sideAt(x) * 2 + W * 0.06, x, H * 0.03, 0));
  }

  // 烏龜的殼：比身體寬一圈的高拱殼，上面幾塊深色的盾片；鱷魚背上一排鱗脊（ridge）
  if (s.dome) {
    body.add(box(s.dome, L * 1.08, H * 0.75, W * 1.2, 0, H * 0.45, 0));
    body.add(box(s.dome, L * 0.8, H * 0.35, W * 0.9, 0, H * 0.95, 0));
    if (s.domeSpots) for (const [x, z] of [[0, 0], [0.28, 0.25], [-0.28, 0.25], [0.28, -0.25], [-0.28, -0.25]]) body.add(patch(s.domeSpots, L * 0.18, 0.03, W * 0.18, x * L, H * 1.13, z * W));
  }
  if (s.ridge) for (let i = 0; i < 7; i++) body.add(box(s.ridge, L * 0.06, H * 0.16, W * 0.5, (i / 6 - 0.5) * L * 0.85, topAt((i / 6 - 0.5) * L * 0.85) + H * 0.05, 0));

  // 尾巴
  let tail = null;
  if (s.tail === 'short') {
    body.add(box(s.tailColor || s.color, 0.12, 0.14, 0.1, -L * 0.52, H * 0.18, 0));
  } else if (s.tail) {
    tail = new THREE.Group();
    tail.position.set(-L * 0.46, s.tail === 'thick' ? -H * 0.02 : H * 0.12, 0);
    tail.rotation.z = s.tailAngle;
    const tw = (s.tailW || 0.03) * 2;
    tail.add(part(BOXD, s.tailColor || s.color, tw, s.tailLen * 0.55, tw));
    tail.add(part(BOXD, s.tailColor || s.color, tw * 0.7, s.tailLen * 0.47, tw * 0.7, 0, -s.tailLen * 0.53, 0));
    // 環紋尾巴（浣熊、長鼻浣熊）：比尾巴略粗的一圈圈色帶
    if (s.tailRings) for (let k = 1; k <= 4; k++) {
      const f = k / 5, rr = (f < 0.5 ? tw : tw * 0.7) * 1.12;
      tail.add(box(s.tailRings, rr, s.tailLen * 0.09, rr, 0, -f * s.tailLen, 0));
    }
    if (s.scales) for (let i = 1; i < 4; i++) tail.add(box(s.scales, tw * (1.25 - i * 0.12), 0.06, tw * (1.25 - i * 0.12), 0, -i * s.tailLen * 0.24, 0));
    body.add(tail);
  }

  // 穿山甲睡覺時捲成方方的球
  let ball = null;
  if (s.ball) {
    ball = new THREE.Group();
    ball.add(box(s.color, 0.62, 0.56, 0.58));
    for (const a of [-0.2, 0, 0.2]) ball.add(box(s.scales, 0.1, 0.62, 0.64, a, 0, 0));
    ball.position.y = 0.28;
    ball.visible = false;
    root.add(ball);
  }

  return { root, rig, body, legs, head, torso, tail, ball, wings, trunk, sac, spec: s };
}

const SIZE = 0.85; // 全部動物一起縮放（資料裡的 scale 再乘上這個）
const REACT = 1.6; // 點動物時的反應長度（秒）

function pose(a, st, t) {
  const s = a.spec;
  const move = Math.min(1, st.speed / s.speed);
  const react = st.react > 0 ? st.react / REACT : 0;
  // 紅鶴停下來時收起一隻腳
  const tuck = s.bird && st.wait > 0 ? 1 - move : 0;
  const lie = s.sitter ? 0 : Math.max(st.restK, st.lieK || 0);
  const sit = s.sitter ? Math.max(st.restK, st.sitK) : 0;

  a.legs.forEach((lg, i) => {
    // 對角線兩兩同步（左前＋右後、右前＋左後）
    const ph = st.phase + (i === 0 || i === 3 ? 0 : Math.PI);
    const swing = Math.sin(ph) * 0.5 * move;
    const lift = Math.max(0, Math.cos(ph)) * move; // 往前擺的那半步把腳抬起來
    let hip = lg.baseHip + swing;
    let knee = lg.baseKnee - lift * 0.95;
    if (!lg.insect) {
      hip = lerp(hip, lg.hind ? 1.25 : -1.25, lie);
      knee = lerp(knee, lg.hind ? -2.3 : 2.3, lie);
    }
    hip = lerp(hip, lg.hind ? 1.35 : -0.75, sit);
    knee = lerp(knee, lg.hind ? -1.9 : 0.1, sit);
    // 跳躍時四腳收起來
    if (st.airK) {
      hip = lerp(hip, lg.hind ? 0.9 : -0.9, st.airK * 0.7);
      knee = lerp(knee, lg.hind ? -1.6 : 1.6, st.airK * 0.7);
    }
    // 浣熊洗東西：兩隻前腳在水邊輪流搓
    if (!lg.hind && st.washK) hip += Math.sin(t * 9 + i * Math.PI) * 0.45 * st.washK;
    if (i === 1 && tuck) {
      hip = lerp(hip, 0.5, tuck);
      knee = lerp(knee, -2.4, tuck);
    }
    lg.hip.rotation.z = hip;
    lg.knee.rotation.z = knee;
  });
  // upright：狐獴、長臂猿坐著時幾乎直立
  a.body.rotation.z = sit * (s.upright ? 1.3 : 0.75) + (st.pitch || 0);
  // 打滾：躺下來左右翻；蹭背：身體貼著木樁前後磨
  a.body.rotation.x = Math.sin(t * 2.4 + st.seed) * 1.1 * (st.rollK || 0) + Math.sin(t * 6) * 0.14 * (st.scratchK || 0);
  // 長臂猿吊在樹枝上：身體直立、雙手往上抓樹枝、雙腳垂下，輕輕擺盪
  const hang = st.hangK || 0;
  if (hang) {
    a.body.rotation.z = lerp(a.body.rotation.z, Math.PI / 2, hang);
    a.body.rotation.x = Math.sin(t * 1.6 + st.seed) * 0.14 * hang;
    a.legs.forEach((lg) => {
      lg.hip.rotation.z = lerp(lg.hip.rotation.z, lg.hind ? -Math.PI / 2 + 0.15 : Math.PI / 2, hang);
      lg.knee.rotation.z = lerp(lg.knee.rotation.z, lg.hind ? -0.3 : 0, hang);
      // 盪著前進：兩手輪流往前抓
      if (!lg.hind && st.brachK) lg.hip.rotation.z += Math.sin(t * 3.2 + (lg === a.legs[0] ? 0 : Math.PI)) * 0.45 * st.brachK;
    });
  }
  const bounce = s.hop ? 0.9 * s.h : 0.04 * s.leg; // 兔子用跳的
  // 被點到時開心地跳兩下
  const jump = react ? Math.abs(Math.sin((1 - react) * Math.PI * 2)) * (s.h * 0.9 + 0.08) : 0;
  a.rig.position.y = -lie * (s.leg * 0.95 + s.h * 0.12) - sit * s.leg * 0.35 + Math.abs(Math.sin(st.phase)) * bounce * move + jump;
  if (hang) {
    // 手掌剛好碰到樹枝：身體中心 + 前半身 + 整條手臂 = 樹枝高度
    const hangY = st.barY - (s.leg + s.h * 0.42) - s.len * 0.3 - (s.leg + s.h * 0.32) * (s.armLen || 1);
    a.rig.position.y = lerp(a.rig.position.y, hangY, hang);
  }
  a.head.rotation.z = -st.headDown * 0.65 - lie * 0.18 - sit * (s.upright ? 1.15 : 0.6) + Math.sin(t * 0.9 + st.seed) * 0.05 + react * 0.25;
  a.head.rotation.y = Math.sin(t * 0.5 + st.seed * 3) * 0.3 * (1 - move) + Math.sin(t * 14) * 0.35 * react;
  // 站哨：頭左右來回張望
  if (st.alertK) a.head.rotation.y = lerp(a.head.rotation.y, Math.sin(t * 1.7 + st.seed) * 1.0 + Math.sin(t * 4.3) * 0.15, st.alertK);
  if (hang) a.head.rotation.z = lerp(a.head.rotation.z, -1.45, hang);
  // 吼猴吼叫：抬頭朝天
  if (st.howlK) a.head.rotation.z += 0.8 * st.howlK;
  if (a.sac) a.sac.scale.setScalar(a.sac.userData.r * (0.35 + (st.howlK || 0) * (1.25 + Math.sin(t * 6) * 0.15)));
  // 象鼻平常輕輕擺；洗澡時整條捲上來往背上噴水
  if (a.trunk) {
    const up = st.sprayK || 0;
    // 噴水時象鼻往前上方舉起，水柱朝前上方噴出去（往後捲會讓水柱穿過身體）
    a.trunk.rotation.z = Math.sin(t * 1.3 + st.seed) * 0.15 + up * 2.0;
    a.trunk.rotation.x = Math.sin(t * 0.9 + st.seed) * 0.12 * (1 - up);
    a.trunk.userData.spray.visible = up > 0.95;
    a.trunk.userData.spray.scale.y = s.head * (1.4 + Math.sin(t * 25) * 0.25);
  }
  // 紅鶴伸展時把翅膀張開，偶爾拍兩下
  const spread = (st.stretchK || 0) * (1.35 + Math.max(0, Math.sin(t * 9)) * 0.35);
  if (a.wings) {
    for (const w of a.wings) {
      // 負號才是往外張開（正的會轉進身體裡）
      w.rotation.x = -w.userData.side * (react ? 0.6 + Math.sin(t * 20) * 0.5 : spread);
      w.scale.y = 1 + (st.stretchK || 0) * 0.6; // 張開時翅膀看起來比較大
      if (s.flyer) {
        // 蝴蝶：飛的時候一直拍，停在花上時翅膀慢慢開合，休息時合起來豎直
        const fly = st.flyK || 0, beat = Math.abs(Math.sin(t * 11 + st.seed));
        const rest = 1.35 - Math.max(0, Math.sin(t * 0.8 + st.seed)) * 0.9;
        w.rotation.x = -w.userData.side * lerp(lerp(rest, 1.45, st.restK), -0.2 + beat * 1.3, fly); // 正的角度＝翅膀往上
      }
    }
  }
  // 紅鶴濾食：頭整個埋進水裡左右掃
  if (st.filterK) {
    a.head.rotation.z -= 0.9 * st.filterK;
    a.head.rotation.y = lerp(a.head.rotation.y, Math.sin(t * 3 + st.seed) * 0.6, st.filterK);
  }
  a.torso.scale.y = s.h * (1 + Math.sin(t * 2.2 + st.seed) * 0.025 * (0.4 + st.restK));
  if (a.tail) a.tail.rotation.x = Math.sin(t * (react ? 14 : 3) + st.seed) * (react ? 0.6 : 0.25) * (1 - st.restK);
  if (a.ball) {
    const curled = st.restK > 0.6;
    a.rig.visible = !curled;
    a.ball.visible = curled;
    a.ball.rotation.y = st.heading;
  }
}

// 展場造景的碰撞半徑（以造景的 s 縮放）；水池、草叢這類矮的東西可以踩過去
const PROP_R = {
  tree: 1, tallTree: 1.2, pine: 0.9, rock: 0.75, cliff: 1.9, mountain: 2.3, waterfall: 1.2, bamboo: 0.85, branch: 1, climb: 1.4,
  hut: 1.3, den: 1.35, termite: 0.7, trough: 0.9, post: 0.4, platform: 1.6, jump: 1.2, mound: 1.35, hangtree: 0.8,
  acacia: 2.2, baobab: 1.6, // 非洲的樹：用樹冠的半徑擋住，動物不會走到樹冠底下
};
function obstaclesOf(e, spec) {
  const out = [];
  for (const p of e.props || []) {
    if (p.type === 'jump' && spec.jumper) continue; // 迷你馬會跳過跨欄
    const [x, z] = p.at;
    if (p.type === 'log') {
      const len = p.len || 2.2, rot = p.rot || 0;
      for (const k of [-0.35, 0, 0.35]) out.push({ x: e.x + x - Math.cos(rot) * len * k, z: e.z + z + Math.sin(rot) * len * k, r: 0.45 });
    } else if (p.type === 'hay') {
      out.push({ x: e.x + x, z: e.z + z, r: 0.6 * (p.n || 2) });
    } else if (PROP_R[p.type]) {
      out.push({ x: e.x + x, z: e.z + z, r: PROP_R[p.type] * (p.s || 1) });
    }
  }
  return out;
}
// 把點推出所有障礙物外面（沿著圓周滑開，不會穿過去）
function pushOut(pos, obstacles, pad) {
  for (const o of obstacles) {
    const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz), min = o.r + pad;
    if (d < min) {
      const k = d > 1e-4 ? min / d : 1;
      pos.x = o.x + (d > 1e-4 ? dx * k : min);
      pos.z = o.z + (d > 1e-4 ? dz * k : 0);
    }
  }
  return pos;
}
const inside = (pos, obstacles, pad) => obstacles.some((o) => Math.hypot(pos.x - o.x, pos.z - o.z) < o.r + pad);

// 展場裡可以互動的地形（世界座標）：
// climbs 石堆／沙丘一層層的平台、pools 水池和泥坑、burrows 洞口、hurdles 跨欄、mounds 白蟻丘
function habitatOf(e) {
  const H = { climbs: [], limbs: [], pools: [], burrows: [], hurdles: [], mounds: [], dusts: [], posts: [], troughs: [] };
  for (const p of e.props || []) {
    const x = e.x + p.at[0], z = e.z + p.at[1];
    if (p.type === 'crag') H.climbs.push({ x, z, tiers: p.tiers });
    else if (p.type === 'pond' || p.type === 'mud') H.pools.push({ x, z, rx: p.size[0], rz: p.size[1], mud: p.type === 'mud' });
    else if (p.type === 'burrows') for (const [hx, hz] of p.holes) H.burrows.push({ x: x + hx, z: z + hz });
    else if (p.type === 'jump') {
      const r = p.rot || 0;
      H.hurdles.push({ x, z, dx: Math.sin(r), dz: Math.cos(r), nx: Math.cos(r), nz: -Math.sin(r), w: (p.s || 1) * 1.2 });
    } else if (p.type === 'termite') H.mounds.push({ x, z, r: PROP_R.termite * (p.s || 1) });
    else if (p.type === 'perchtree') H.limbs.push({ x, z, ex: x + p.to[0], ez: z + p.to[1], h: p.h || 3, w: 0.9 });
    else if (p.type === 'dust') H.dusts.push({ x, z, rx: p.size[0], rz: p.size[1] });
    else if (p.type === 'post') H.posts.push({ x, z, r: PROP_R.post });
    else if (p.type === 'trough') H.troughs.push({ x, z, r: PROP_R.trough });
  }
  return H;
}
function groundAt(H, x, z) {
  let y = 0;
  for (const c of H.climbs) {
    const d = Math.hypot(x - c.x, z - c.z);
    for (const [r, h] of c.tiers) if (d < r && h > y) y = h;
  }
  // 樹枝：離樹幹到枝端這條線夠近就算站在樹枝上
  for (const l of H.limbs) {
    const dx = l.ex - l.x, dz = l.ez - l.z, L2 = dx * dx + dz * dz;
    const k = Math.max(0, Math.min(1, ((x - l.x) * dx + (z - l.z) * dz) / L2));
    if (Math.hypot(x - l.x - dx * k, z - l.z - dz * k) < l.w && l.h > y) y = l.h;
  }
  return y;
}
const poolAt = (H, x, z) => H.pools.find((p) => ((x - p.x) / p.rx) ** 2 + ((z - p.z) / p.rz) ** 2 < 0.8);
const inPool = (p, R, k = 0.6) => {
  const ang = R() * Math.PI * 2, r = Math.sqrt(R()) * k;
  return { x: p.x + Math.cos(ang) * p.rx * r, z: p.z + Math.sin(ang) * p.rz * r };
};

export function spawnAnimals(scene, data) {
  const R = rng(23);
  const herd = [];
  const tops = new Map(); // 每種動物站著時的高度，名牌放在牠頭上
  const box = new THREE.Box3();
  for (const info of data.animals) {
    const e = info.enclosure;
    for (let i = 0; i < 1; i++) { // 每種動物只放一隻（使用者：動物不要有複數）
      const spec = { ...SPECIES[info.model] };
      if (info.model === 'deer' && i === 0) spec.antlers = true;
      const a = buildAnimal(spec, R);
      a.root.scale.setScalar((info.scale || 1) * SIZE * (0.94 + R() * 0.12));
      scene.add(a.root);
      if (!tops.has(info.id)) {
        a.root.updateMatrixWorld(true);
        tops.set(info.id, box.setFromObject(a.root).max.y);
      }
      bakeRig(a.root, (m) => m === a.torso); // 身體會呼吸縮放，不合併

      const obstacles = obstaclesOf(e, spec);
      const hab = habitatOf(e);
      const pad = spec.len * a.root.scale.x * 0.3; // 動物身體的半徑（大概）
      const roam = e.roam || 0.35; // 動物放大很多，活動範圍收在展場中間
      const randomPoint = () => {
        for (let k = 0; k < 24; k++) {
          const ang = R() * Math.PI * 2, r = Math.sqrt(R()) * roam;
          const p = { x: e.x + Math.cos(ang) * e.rx * r, z: e.z + Math.sin(ang) * e.rz * r };
          if (!inside(p, obstacles, pad)) return p;
        }
        return { x: e.x, z: e.z };
      };
      // 依展場地形挑目的地：山羊爬石堆、水獺下水、野豬滾泥巴、狐獴鑽洞或站哨、迷你馬跳跨欄
      // 站到某個造景旁邊（朝展場中心那一側），身體剛好貼著
      const beside = (o, k = 0.95) => {
        const dx = e.x - o.x, dz = e.z - o.z, dl = Math.hypot(dx, dz) || 1;
        return { x: o.x + (dx / dl) * (o.r + pad * k), z: o.z + (dz / dl) * (o.r + pad * k) };
      };
      const pickTask = (st) => {
        if (spec.arboreal && hab.limbs.length && R() < 0.45) {
          // 先走到樹幹爬上去，再沿著樹枝走到枝端趴著
          const l = hab.limbs[Math.floor(R() * hab.limbs.length)];
          return { task: 'trunk', p: { x: l.x, z: l.z }, then: { x: lerp(l.x, l.ex, 0.75), z: lerp(l.z, l.ez, 0.75) } };
        }
        if (spec.bounder && R() < 0.35) {
          // 跳躍奔跑到展場另一頭
          const ang = Math.atan2(st.pos.z - e.z, st.pos.x - e.x) + Math.PI + (R() - 0.5) * 0.8;
          return { task: 'bound', p: { x: e.x + Math.cos(ang) * e.rx * 0.5, z: e.z + Math.sin(ang) * e.rz * 0.5 } };
        }
        if (spec.washer && R() < 0.35) {
          // 走到水池邊（靠近自己的那一側），面向水面
          const w = hab.pools.find((q) => !q.mud);
          if (w) {
            const dx = st.pos.x - w.x, dz = st.pos.z - w.z, dl = Math.hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl;
            const r = 1 / Math.hypot(ux / w.rx, uz / w.rz) + pad * 0.4;
            return { task: 'wash', p: { x: w.x + ux * r, z: w.z + uz * r }, look: { x: w.x, z: w.z } };
          }
        }
        if (spec.filter && R() < 0.5) {
          const w = hab.pools.find((q) => !q.mud);
          if (w && R() < 0.65) return { task: 'filter', p: inPool(w, R, 0.5) };
          return { task: 'stretch', p: randomPoint() };
        }
        if (spec.howl && R() < 0.3) return { task: 'howl', p: randomPoint() };
        if (spec.roller && hab.dusts.length && R() < 0.4) return { task: 'roll', p: inPool(hab.dusts[0], R, 0.3) };
        if (spec.scratcher) {
          const k = R();
          if (k < 0.25 && hab.posts.length) return { task: 'scratch', p: beside(hab.posts[0], 1.02) };
          if (k < 0.5 && hab.troughs.length) return { task: 'eat', p: beside(hab.troughs[0]) };
        }
        if (spec.climber && hab.climbs.length && R() < 0.6) {
          const c = hab.climbs[Math.floor(R() * hab.climbs.length)];
          const ti = R() < 0.55 ? c.tiers.length - 1 : Math.floor(R() * c.tiers.length);
          const [r] = c.tiers[ti], ang = R() * Math.PI * 2, rr = ti === c.tiers.length - 1 ? R() * r * 0.4 : r * (0.6 + R() * 0.25);
          return { task: ti === c.tiers.length - 1 ? 'summit' : null, p: { x: c.x + Math.cos(ang) * rr, z: c.z + Math.sin(ang) * rr } };
        }
        if (spec.burrow && hab.burrows.length) {
          const k = R();
          if (k < 0.35) return { task: 'dive', p: { ...hab.burrows[Math.floor(R() * hab.burrows.length)] } };
          if (k < 0.65 && hab.climbs.length) {
            const c = hab.climbs[0];
            return { task: 'summit', p: { x: c.x + (R() - 0.5) * 0.6, z: c.z + (R() - 0.5) * 0.6 } };
          }
        }
        if (spec.swim && R() < 0.5) {
          const w = hab.pools.filter((p) => !p.mud);
          if (w.length) return { task: null, p: inPool(w[Math.floor(R() * w.length)], R) };
        }
        if (spec.wallow && R() < 0.4) {
          const m = hab.pools.filter((p) => p.mud);
          if (m.length) return { task: 'wallow', p: inPool(m[Math.floor(R() * m.length)], R, 0.4) };
        }
        if (spec.dig && hab.mounds.length && R() < 0.45) {
          const m = hab.mounds[Math.floor(R() * hab.mounds.length)];
          return { task: 'dig', p: beside(m) };
        }
        if (spec.jumper && hab.hurdles.length && R() < 0.45) {
          const hd = hab.hurdles[0], side = R() < 0.5 ? 1 : -1, off = spec.len * a.root.scale.x * 0.9;
          return { task: 'runup', p: { x: hd.x + hd.nx * off * side, z: hd.z + hd.nz * off * side }, then: { x: hd.x - hd.nx * off * side, z: hd.z - hd.nz * off * side } };
        }
        return { task: null, p: randomPoint() };
      };
      // 休息點在窩的前方（朝展場中心），才不會被窩擋住
      const dl = Math.hypot(e.den[0], e.den[1]) || 1;
      const back = Math.min(dl * 0.6, 1.6);
      const den = {
        x: e.x + e.den[0] * (1 - back / dl) + Math.cos(i * 2.4) * 0.7 * Math.min(i, 1),
        z: e.z + e.den[1] * (1 - back / dl) + Math.sin(i * 2.4) * 0.7 * Math.min(i, 1),
      };
      pushOut(den, obstacles, pad);
      // 狐獴晚上躲進洞裡
      if (spec.burrow && hab.burrows.length) Object.assign(den, hab.burrows[i % hab.burrows.length]);
      // 無尾熊的窩在樹枝上（靠樹幹那一段），休息時就趴在樹上睡
      if (spec.treeDen && hab.limbs.length) {
        const l = hab.limbs[i % hab.limbs.length];
        Object.assign(den, { x: lerp(l.x, l.ex, 0.55), z: lerp(l.z, l.ez, 0.55) });
      }
      const st = {
        pos: randomPoint(), heading: R() * 6.28, target: randomPoint(), wait: R() * 3, graze: false,
        speed: 0, phase: 0, restK: 0, sitK: 0, headDown: 0, seed: R() * 10, started: false,
      };
      st.react = 0; st.stuck = 0; st.gy = groundAt(hab, st.pos.x, st.pos.z); st.sinkK = 0;
      if (spec.hanger && e.bar) {
        st.barPoint = { x: e.x + e.bar.at[0], z: e.z + e.bar.at[1] };
        st.barY = (e.bar.y - FLOOR) / a.root.scale.x;
      }
      herd.push({ a, st, info, den, randomPoint, pickTask, hab, obstacles, pad, base: groundY(e.x, e.z) }); // base：展場所在的地面高度
    }
  }

  // 遠景的動物群（非洲草原上的斑馬群）：只是擺著的造景，不會動、不能點，有的低頭吃草
  for (const hd of []) { // 停用：每種動物只放一隻，草原上不再擺斑馬群（資料留在 layout.herds）
    const R2 = rng(hd.seed || 5);
    for (let k = 0; k < hd.n; k++) {
      const a = buildAnimal({ ...SPECIES[hd.model] }, R2);
      const ang = R2() * Math.PI * 2, r = Math.sqrt(R2()) * hd.r;
      const x = hd.x + Math.cos(ang) * r, z = hd.z + Math.sin(ang) * r;
      a.root.scale.setScalar((hd.scale || 5) * SIZE * (0.85 + R2() * 0.25));
      a.root.position.set(x, groundY(x, z) + FLOOR, z);
      a.root.rotation.y = (hd.ry || 0) + (R2() - 0.5) * 0.9;
      if (R2() < 0.5) a.head.rotation.z = -0.65;
      bakeRig(a.root);
      scene.add(a.root);
    }
  }

  // 晚上所有動物一起亮起來：動物用自己的一份材質（和場景共用的材質分開），晚上加一點同色的自發光
  const glow = new Map();
  for (const h of herd) h.a.root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || o.material.transparent) return;
    if (!glow.has(o.material)) glow.set(o.material, o.material.clone());
    o.material = glow.get(o.material);
  });
  return {
    tops,
    herd, // 開發用（?debug）
    setNight(on) {
      for (const m of glow.values()) { m.emissive.copy(m.color); m.emissiveIntensity = on ? 0.55 : 0; }
    },
    // 點到動物：轉頭看鏡頭、跳兩下、搖頭擺尾（睡著的也會醒來一下）
    poke(id, cam) {
      for (const h of herd) if (h.info.id === id) { h.st.react = REACT; h.st.look = { x: cam.x, z: cam.z }; }
    },
    update(dt, t, slot) {
      for (const h of herd) {
        const { a, st, info, den } = h;
        const s = a.spec;
        const active = info.active.includes(slot);
        // 第一次載入時直接就位，不要看到所有動物同時走回窩
        if (!st.started) {
          st.started = true;
          if (!active) { st.pos = { ...den }; st.restK = 1; st.gy = groundAt(h.hab, den.x, den.z); }
        }

        const goal = active ? st.target : den;
        const dx = goal.x - st.pos.x, dz = goal.z - st.pos.z;
        const dist = Math.hypot(dx, dz);
        let want = 0;
        if (st.react > 0) {
          st.react = Math.max(0, st.react - dt);
          st.restK = approach(st.restK, 0, dt * 4);
          const d = angleDiff(Math.atan2(-(st.look.z - st.pos.z), st.look.x - st.pos.x), st.heading);
          st.heading += Math.max(-dt * 5, Math.min(dt * 5, d));
          if (!st.react && active) st.wait = 1;
        } else if (!active) {
          if (dist > 0.3 && st.restK < 0.05) want = s.speed * 0.7;
          else st.restK = approach(st.restK, 1, dt * 0.8);
        } else if (st.restK > 0.01) {
          st.restK = approach(st.restK, 0, dt * 1.2);
        } else if (st.wait > 0) {
          st.wait -= dt;
        } else if (dist < 0.3 && st.diving) {
          // 從另一個洞口鑽出來，先站起來張望一下
          const b = h.hab.burrows.filter((q) => Math.hypot(q.x - st.pos.x, q.z - st.pos.z) > 1);
          const out = b.length ? b[Math.floor(R() * b.length)] : st.pos;
          st.pos = { x: out.x, z: out.z }; st.target = { ...st.pos };
          st.heading = R() * 6.28;
          st.diving = false; st.alert = true; st.graze = false;
          st.wait = 2.5 + R() * 2.5;
        } else if (dist < 0.3 && st.task) {
          const tk = st.task;
          st.task = null;
          if (tk === 'dive') { st.diving = true; st.wait = 2.5 + R() * 3; }
          else if (tk === 'summit') { st.alert = true; st.graze = false; st.wait = 4 + R() * 4; }
          else if (tk === 'wallow') { st.lying = true; st.wait = 5 + R() * 5; }
          else if (tk === 'dig') { st.graze = true; st.wait = 3 + R() * 3; }
          else if (tk === 'runup') { st.target = st.then; st.task = 'land'; st.wait = 0.4; }
          else if (tk === 'trunk') { st.target = st.then; st.task = 'lounge'; st.wait = 0.3; }
          else if (tk === 'lounge') { st.lying = true; st.wait = 6 + R() * 6; }
          else if (tk === 'roll') { st.lying = st.rolling = true; st.wait = 5 + R() * 4; }
          else if (tk === 'scratch') { st.scratching = true; st.graze = false; st.wait = 4 + R() * 3; }
          else if (tk === 'eat') { st.graze = true; st.wait = 4 + R() * 3; }
          else if (tk === 'wash') { st.washing = st.graze = true; st.wait = 5 + R() * 3; st.heading = Math.atan2(-(st.look.z - st.pos.z), st.look.x - st.pos.x); }
          else if (tk === 'filter') { st.filtering = st.graze = true; st.wait = 4 + R() * 4; }
          else if (tk === 'howl') { st.howling = true; st.graze = false; st.wait = 3 + R() * 2; }
          else if (tk === 'stretch') { st.stretching = true; st.graze = false; st.wait = 2.5 + R() * 1.5; }
          else st.wait = 1 + R() * 2;
        } else if (dist < 0.3) {
          st.alert = st.lying = st.rolling = st.scratching = st.washing = st.filtering = st.stretching = st.howling = false;
          if (st.hangGo && !st.hanging) {
            // 走到樹枝下：盪上去吊一陣子
            st.hanging = true;
            st.wait = 6 + R() * 6;
          } else {
            st.hanging = false;
            st.hangGo = !!st.barPoint && R() < 0.5;
            st.wait = st.hangGo ? 0.3 : 1.5 + R() * 4.5;
            st.graze = R() < 0.55;
            if (st.hangGo) st.target = { ...st.barPoint };
            else {
              const k = h.pickTask(st);
              st.target = k.p; st.task = k.task; st.then = k.then; st.look = k.look;
              if (k.task) st.graze = false;
            }
          }
        } else {
          want = st.task === 'bound' ? s.speed * 1.8 : s.speed;
        }
        if (!active) { st.hanging = st.hangGo = st.diving = st.alert = st.lying = st.rolling = st.scratching = st.washing = st.filtering = st.stretching = st.howling = false; st.task = null; }
        if (st.react > 0) st.alert = false;
        st.alertK = approach(st.alertK || 0, st.alert && st.wait > 0 ? 1 : 0, dt * 2);
        st.lieK = approach(st.lieK || 0, st.lying && st.wait > 0 ? 1 : 0, dt * 1.2);
        st.rollK = approach(st.rollK || 0, st.rolling && st.wait > 0 && st.lieK > 0.8 ? 1 : 0, dt * 1.5);
        st.scratchK = approach(st.scratchK || 0, st.scratching && st.wait > 0 ? 1 : 0, dt * 2);
        st.washK = approach(st.washK || 0, st.washing && st.wait > 0 ? 1 : 0, dt * 2);
        st.filterK = approach(st.filterK || 0, st.filtering && st.wait > 0 ? 1 : 0, dt * 1.5);
        st.howlK = approach(st.howlK || 0, st.howling && st.wait > 0 ? 1 : 0, dt * 2.5);
        st.stretchK = approach(st.stretchK || 0, st.stretching && st.wait > 0 ? 1 : 0, dt * 3);
        // 長臂猿吊上樹枝後，沿著樹枝一手換一手來回盪
        const brach = st.hanging && st.hangK > 0.9 && st.wait > 0.8;
        st.brachK = approach(st.brachK || 0, brach ? 1 : 0, dt * 1.5);
        if (st.brachK > 0) {
          st.swingPh = (st.swingPh || 0) + dt * 0.7 * st.brachK;
          const vx = Math.cos(st.swingPh);
          st.pos.x = st.barPoint.x + Math.sin(st.swingPh) * 2.2;
          st.target = { ...st.pos };
          st.heading = approach(st.heading, vx >= 0 ? 0 : Math.PI, dt * 3);
        }
        st.hangK = approach(st.hangK || 0, st.hanging ? 1 : 0, dt * 0.9);
        st.headDown = approach(st.headDown, active && st.wait > 0 && st.graze && !st.hanging ? 1 : 0, dt * 2);
        st.sitK = approach(st.sitK, s.sitter && active && st.wait > 0 && !st.hanging ? 1 : 0, dt * 2);
        if (st.alert) st.headDown = 0;
        st.speed = approach(st.speed, want, dt * 3);

        const scale = a.root.scale.x;
        if (st.speed > 0.01) {
          const d = angleDiff(Math.atan2(-dz, dx), st.heading);
          st.heading += Math.max(-dt * 2.5, Math.min(dt * 2.5, d));
          const step = st.speed * Math.sqrt(scale) * 0.9 * dt * Math.max(0, Math.cos(d)); // 大隻的走慢一點，不會滑來滑去
          const ox = st.pos.x, oz = st.pos.z;
          st.pos.x += Math.cos(st.heading) * step;
          st.pos.z -= Math.sin(st.heading) * step;
          if (st.gy < 1.5) pushOut(st.pos, h.obstacles, h.pad); // 在樹枝、石堆上面就不會撞到地上的造景
          st.phase += (step / (s.leg * scale * 1.1)) * Math.PI;
          // 被造景卡住走不動時，換一個目的地
          const moved = Math.hypot(st.pos.x - ox, st.pos.z - oz);
          st.stuck = moved < step * 0.25 ? st.stuck + dt : 0;
          if (st.stuck > 1.2) {
            st.stuck = 0;
            if (active) { st.target = h.randomPoint(); st.task = null; st.wait = 0.5; } else { den.x = st.pos.x; den.z = st.pos.z; }
          }
        }
        // 地面高度：爬上石堆時一階一階跳上去，跨欄時跳過去
        const gy = groundAt(h.hab, st.pos.x, st.pos.z);
        if (!st.hop) {
          if (s.arboreal && gy - st.gy > 1) st.hop = { t: 0, dur: 0.6 + (gy - st.gy) * 0.3, y0: st.gy, y1: gy, peak: 0.15, climb: true };
          else if (Math.abs(gy - st.gy) > 0.15) st.hop = { t: 0, dur: 0.42 + Math.abs(gy - st.gy) * 0.06, y0: st.gy, y1: gy, peak: Math.abs(gy - st.gy) * 0.45 + 0.5 };
          else st.gy = gy;
          if (!st.hop && st.task === 'bound' && st.speed > s.speed) st.hop = { t: 0, dur: 0.55, y0: st.gy, y1: st.gy, peak: s.leg * scale * 0.45 };
          if (s.jumper && st.speed > s.speed * 0.5) {
            for (const hd of h.hab.hurdles) {
              const rx = st.pos.x - hd.x, rz = st.pos.z - hd.z;
              const d = rx * hd.nx + rz * hd.nz, along = rx * hd.dx + rz * hd.dz;
              const toward = (Math.cos(st.heading) * hd.nx - Math.sin(st.heading) * hd.nz) * Math.sign(d) < -0.3;
              if (toward && Math.abs(d) < 1.3 && Math.abs(along) < hd.w * 1.6) st.hop = { t: 0, dur: 0.75, y0: st.gy, y1: st.gy, peak: 1.6 };
            }
          }
        }
        let y = st.gy;
        if (st.hop) {
          st.hop.t += dt;
          const k = Math.min(1, st.hop.t / st.hop.dur);
          y = lerp(st.hop.y0, st.hop.y1, st.hop.climb ? k * k * (3 - 2 * k) : k) + Math.sin(k * Math.PI) * st.hop.peak;
          // 爬樹時身體朝上、四腳抓著樹幹；一般跳躍四腳收起來
          st.pitch = st.hop.climb ? Math.min(1, Math.sin(k * Math.PI) * 2) * 1.2 : 0;
          st.airK = st.hop.climb ? 0 : Math.sin(k * Math.PI);
          if (k >= 1) { st.gy = st.hop.y1; st.hop = null; st.airK = st.pitch = 0; }
        }
        // 下水只露出背和頭；滾泥巴陷下去一點；鑽洞整隻不見
        const body = (s.leg + s.h * 0.5) * scale;
        const pool = poolAt(h.hab, st.pos.x, st.pos.z);
        const sinkTo = st.diving || (s.burrow && !active && dist < 0.5 && st.restK > 0.5) ? (s.leg + s.h) * scale * 1.6
          : pool && !pool.mud && s.swim ? body * s.swim
          : pool && pool.mud && st.lieK > 0.1 ? body * 0.15 * st.lieK : 0;
        // 大象在水裡停下來時，用鼻子往背上噴水
        st.sprayK = approach(st.sprayK || 0, s.sprayer && active && pool && !pool.mud && st.wait > 0 && Math.sin(t * 0.8 + st.seed) > -0.2 ? 1 : 0, dt * 1.5);
        st.sinkK = approach(st.sinkK, sinkTo, dt * (st.diving ? 3.5 : 2) * Math.max(1, body));
        // 蝴蝶：活動時在花叢上方忽高忽低地飛，休息時停在地上
        st.flyK = approach(st.flyK || 0, s.flyer && active && st.restK < 0.1 && !(st.wait > 0 && Math.sin(t * 0.3 + st.seed) > 0.3) ? 1 : 0, dt * 0.8);
        const flyY = s.flyer ? st.flyK * (1.6 + Math.sin(t * 1.9 + st.seed) * 0.6 + Math.sin(t * 5.3 + st.seed * 2) * 0.15) * a.root.scale.x * 0.35 : 0;
        a.root.position.set(st.pos.x, h.base + FLOOR + y - st.sinkK + flyY, st.pos.z);
        a.root.rotation.y = st.heading;
        pose(a, st, t);
      }
    },
  };
}

export { SPECIES, buildAnimal, pose }; // 開發用：dev/lineup.html 一次排出所有動物
