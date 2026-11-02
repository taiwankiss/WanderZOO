import { animate, stagger } from 'motion';

// 開場（用 Motion 做）：米色上下兩片布幕，中間的大標題一打開頁面就淡入（CSS 動畫，不必等任何程式載入）；
// 布幕中間那條線是載入進度條，跟著主程式真正的載入階段從左畫到右，下面的數字跟著跑到 100%；
// 園區準備好後標題淡出、布幕從這條線上下拉開，鏡頭同時轉進全景，畫面上的介面再依序進場。
const el = document.getElementById('opening');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const T = (s) => (reduce ? 0.01 : s);
const EASE = [0.22, 1, 0.36, 1]; // 很快起步、慢慢停下
const CURTAIN = [0.76, 0, 0.24, 1]; // 布幕：慢起、中段快、慢收

const seam = el.querySelector('.op-seam'), pct = el.querySelector('.op-pct');
let shown = 0;

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
