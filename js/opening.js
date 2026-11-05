import { animate, stagger } from 'motion';

// 開場（用 Motion 做）：米色上下兩片布幕，中間的大標題一打開頁面就淡入（CSS 動畫，不必等任何程式載入）；
// 布幕中間那條線是載入進度條，跟著主程式真正的載入階段從左畫到右，下面的數字跟著跑到 100%；
// 園區準備好後標題淡出、布幕從這條線上下拉開，鏡頭同時轉進全景，畫面上的介面再依序進場。
const el = document.getElementById('opening');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const T = (s) => (reduce ? 0.01 : s);
const EASE = [0.22, 1, 0.36, 1]; // 很快起步、慢慢停下
const CURTAIN = [0.76, 0, 0.24, 1]; // 布幕：慢起、中段快、慢收

const seam = el.querySelector('.op-seam'), pct = el.querySelector('.op-pct'), run = el.querySelector('.op-run');
let shown = 0;

// 載入百分比下面原地跑的動物剪影：方塊風格（和園區的動物一樣），朝右。
// vb：畫布寬高；parts：身體、頭、脖子等不動的方塊 [x, y, 寬, 高]；
// legs：[髖關節 x, 髖關節 y, 腿寬, 相位]，腿長＝到畫布底；amp：腿前後擺的角度；cyc：跑一步的秒數
const RUNNERS = {
  elephant: { vb: [60, 40], amp: 18, cyc: 0.62, legs: [[12, 24, 7, 0], [21, 24, 7, 3], [36, 24, 7, 3], [45, 24, 7, 0]],
    parts: [[8, 8, 40, 19], [44, 6, 12, 13], [40, 8, 8, 13], [53, 14, 4, 18], [56, 28, 3, 4], [4, 11, 5, 2]] },
  giraffe: { vb: [50, 70], amp: 22, cyc: 0.7, legs: [[11, 40, 4, 0], [16, 40, 4, 3], [28, 40, 4, 3], [33, 40, 4, 0]],
    parts: [[8, 30, 28, 11], [30, 8, 6, 26], [30, 4, 15, 6], [31, 0, 2, 4], [35, 0, 2, 4], [3, 31, 6, 2]] },
  zebra: { vb: [50, 40], amp: 28, cyc: 0.46, legs: [[11, 22, 4, 0], [16, 22, 4, 2], [30, 22, 4, 3], [35, 22, 4, 5]],
    parts: [[8, 12, 30, 11], [32, 4, 7, 14], [34, 2, 14, 7], [34, 0, 3, 3], [3, 13, 6, 3]] },
  lion: { vb: [52, 34], amp: 30, cyc: 0.44, legs: [[13, 19, 4.5, 0], [18, 19, 4.5, 2], [32, 19, 4.5, 3], [37, 19, 4.5, 5]],
    parts: [[9, 10, 30, 10], [35, 4, 12, 15], [42, 7, 9, 8], [2, 10, 8, 2.5], [0, 8, 3, 4]] },
  rhino: { vb: [56, 34], amp: 18, cyc: 0.55, legs: [[11, 21, 6, 0], [17, 21, 6, 3], [30, 21, 6, 3], [36, 21, 6, 0]],
    parts: [[6, 8, 34, 14], [38, 11, 14, 9], [49, 4, 3, 8], [45, 7, 2.5, 5], [38, 7, 3, 4], [2, 10, 5, 2]] },
  bear: { vb: [48, 32], amp: 22, cyc: 0.5, legs: [[10, 20, 6, 0], [16, 20, 6, 3], [27, 20, 6, 3], [33, 20, 6, 0]],
    parts: [[6, 8, 31, 13], [34, 9, 11, 10], [35, 6, 3, 4], [43, 13, 5, 4], [3, 10, 4, 3]] },
};
const FRAMES = 6; // 和 ui.css 的 op-frame 一致
(function buildRunner() {
  const names = Object.keys(RUNNERS), pick = new URLSearchParams(location.search).get('runner'); // ?runner=giraffe 指定一隻（檢查用）
  const a = RUNNERS[pick] ?? RUNNERS[names[Math.floor(Math.random() * names.length)]];
  const [W, H] = a.vb, k = (matchMedia('(max-width: 760px)').matches ? 22 : 26) / Math.max(H, 40); // 一個單位幾 px：高的長頸鹿也不超過 26 px
  const box = ([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx=".6"/>`;
  let svgs = '';
  for (let f = 0; f < FRAMES; f++) {
    // 相位以 1/6 圈為單位：腿和身體對角的兩隻同步，像小跑步
    const legs = a.legs.map(([x, y, w, ph]) => {
      const ang = a.amp * Math.sin(((f + ph + 0.75) / FRAMES) * Math.PI * 2); // +0.75 格：沒有哪一格四條腿剛好都直立
      return `<rect x="${x - w / 2}" y="${y - 1}" width="${w}" height="${H - y + 1}" rx=".6" transform="rotate(${ang.toFixed(1)} ${x} ${y})"/>`;
    }).join('');
    svgs += `<svg style="--k:${f}" viewBox="0 0 ${W} ${H}" width="${W * k}" height="${H * k}" overflow="visible">${legs}${a.parts.map(box).join('')}</svg>`;
  }
  const ani = run.querySelector('.ani');
  Object.assign(ani.style, { width: `${W * k}px`, height: `${H * k}px` });
  ani.style.setProperty('--cyc', `${a.cyc}s`);
  ani.style.setProperty('--n', FRAMES);
  ani.querySelector('.bob').innerHTML = svgs;
})();

// 主程式每完成一個載入階段就呼叫一次（0–100），next 是下一個階段的數字。
// 蓋場景時主執行緒很忙、JS 停住、數字不會更新，所以：
//   1. 每一段先讓線和數字等速滑到新的位置（差越多滑越久）、等它畫完，再繼續下一段
//   2. 停在這一段的時候，線繼續往 next 慢慢爬（transform 動畫由瀏覽器另外畫，主執行緒忙也會動）
// 這樣線不會停住再忽然跳一大段，數字也是一路滑上去
const STEADY = [0.35, 0, 0.25, 1];
export async function progress(p, next = p) {
  const from = shown, dur = T(0.2 + (p - from) * 0.012);
  await Promise.all([
    animate(seam, { scaleX: p / 100 }, { duration: dur, ease: STEADY }), // 從線目前的位置接著畫
    animate(from, p, { duration: dur, ease: STEADY, onUpdate: (v) => { shown = v; pct.textContent = Math.round(v); } }),
  ]);
  shown = p;
  pct.textContent = p;
  if (next > p) animate(seam, { scaleX: (p + (next - p) * 0.85) / 100 }, { duration: T(2.4), ease: 'easeOut' });
}

// 園區好了以後呼叫；onOpen 在布幕開始拉開時呼叫（鏡頭在這時開始轉）
export async function reveal(onOpen) {
  await progress(100);
  await new Promise((r) => setTimeout(r, reduce ? 0 : 200));
  onOpen?.();
  animate(seam, { opacity: 0 }, { duration: T(0.3) }); // 布幕從這條線分開
  animate(el.querySelectorAll('.op-title'), { opacity: 0 }, { duration: T(0.6), ease: 'easeOut' });
  animate(el.querySelector('.op-curtain.top'), { y: ['0%', '-101%'] }, { duration: T(1.5), delay: T(0.15), ease: CURTAIN });
  const done = animate(el.querySelector('.op-curtain.bottom'), { y: ['0%', '101%'] }, { duration: T(1.5), delay: T(0.15), ease: CURTAIN });
  // 布幕拉開後，左上站名、時間軸、右側工具鈕依序淡入
  const ui = [...document.querySelectorAll('.brand, .time, .rail button')];
  const uiIn = animate(ui, { opacity: [0, 1], y: [-14, 0] }, { duration: T(0.8), delay: stagger(0.07, { startDelay: reduce ? 0 : 1.05 }), ease: EASE });
  await done;
  el.remove();
  await uiIn;
  // 拿掉 Motion 留下的行內樣式，按鈕原本 hover 時的縮放才會生效
  document.body.classList.remove('opening');
  for (const e of ui) { e.style.removeProperty('opacity'); e.style.removeProperty('transform'); }
}
