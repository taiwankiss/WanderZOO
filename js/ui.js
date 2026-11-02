import { pad } from './util.js';
import { FACILITIES } from './icons.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function createUI(data, on) {
  const animals = [...data.animals].sort((a, b) => a.no - b.no);
  const byId = new Map(animals.map((a) => [a.id, a]));
  const slotById = new Map(data.slots.map((s) => [s.id, s]));
  const zoneById = new Map(data.zones.map((z) => [z.id, z]));
  const panel = $('#panel');
  const card = $('#card');
  const isMobile = () => matchMedia('(max-width: 760px)').matches;
  let slot = data.slots[0].id;
  let selected = null;
  let zoneCard = null; // 目前介紹的園區（沒有選動物時，左邊卡片介紹這個園區）

  const rail = $('#tools');
  const menuBtn = rail.querySelector('[data-action="menu"]');
  $('#panel-sub').textContent = `${data.zones.length} 個園區、${animals.length} 種動物，點園區看看裡面有誰。`;
  $('#disclaimer').textContent = data.meta.disclaimer;

  // 手機版地圖兩側的箭頭：照編號換到上一個／下一個動物
  document.querySelectorAll('.map-nav').forEach((b) => b.addEventListener('click', () => {
    const i = animals.findIndex((a) => a.id === selected), next = animals[i + Number(b.dataset.step)];
    if (next) on.select(next.id);
  }));

  // 時段：像 3D Home 的時間軸，一條細線串起四個點，墨線填到目前的時段，外圈會滑過去
  const slotsEl = $('#slots');
  slotsEl.innerHTML = '<i class="ring" aria-hidden="true"></i>' + data.slots
    .map((s) => `<button type="button" data-slot="${s.id}" aria-pressed="false"><span class="t">${s.hours.split('–')[0]}:00</span><span class="dot"></span><small>${s.label}</small></button>`)
    .join('');
  slotsEl.style.setProperty('--n', data.slots.length);
  slotsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-slot]');
    if (b) on.slot(b.dataset.slot);
  });

  // 右側的圓形工具鈕：選單、全景、名牌、導覽
  rail.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.layer) setLayer(b.dataset.layer, b.getAttribute('aria-pressed') !== 'true');
    if (b.dataset.action === 'menu') setMenu(!menuOpen());
    if (b.dataset.action === 'overview') on.overview();
    if (b.dataset.action === 'tour') on.tour();
  });
  function setLayer(name, value) {
    const b = document.querySelector(`[data-layer="${name}"]`);
    b.setAttribute('aria-pressed', String(value));
    on.layer(name, value);
  }

  // 選單：電腦版平常收在右邊，只露出工具鈕；手機版是可拉起的底部抽屜
  const app = $('#app');
  const menuOpen = () => app.classList.contains('menu-open');
  function setMenu(open) {
    app.classList.toggle('menu-open', open);
    panel.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  }

  // 設施：放在選單最下面，開關控制地圖上的圖示
  const types = [...new Set(data.layout.facilities.map((f) => f.type))];
  $('#legend-list').innerHTML = types
    .map((t) => `<li><span class="fac" style="--f:${FACILITIES[t].color}">${FACILITIES[t].icon}</span>${esc(FACILITIES[t].name)}</li>`)
    .join('');
  $('#legend .lg-switch').addEventListener('click', (e) => {
    setLayer('facilities', e.currentTarget.getAttribute('aria-pressed') !== 'true');
  });

  // 園區清單：預設只列園區名稱，點了才展開那一區的動物（一次只展開一區）
  const list = $('#zone-list');
  list.innerHTML = data.zones
    .map((z) => {
      const kids = animals.filter((a) => a.zone === z.id);
      return `<li class="zone" data-z="${z.id}" style="--c:${z.color}">
        <button type="button" class="zone-btn" data-zone="${z.id}" aria-expanded="false">
          <span class="zi">${esc(z.mark || z.name[0])}</span><span class="zn">${esc(z.name)}<small>${esc(z.en)}</small></span><span class="cnt">${kids.length}</span><i class="chev" aria-hidden="true"></i>
        </button>
        <ol class="animals">${kids.map((a) => `<li><button type="button" class="row" data-id="${a.id}" style="--c:${a.color}">
          <span class="no">${pad(a.no)}</span>
          <span class="nm">${esc(a.name)}<small>${esc(a.en)}</small></span>
          <span class="pill" data-pill></span></button></li>`).join('')}</ol>
      </li>`;
    })
    .join('');
  let openZone = null;
  function expandZone(id) {
    openZone = id;
    list.querySelectorAll('.zone').forEach((li) => {
      const on = li.dataset.z === id;
      li.classList.toggle('open', on);
      li.querySelector('.zone-btn').setAttribute('aria-expanded', String(on));
    });
    if (id) requestAnimationFrame(() => list.querySelector(`.zone[data-z="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) return on.select(b.dataset.id);
    const z = e.target.closest('[data-zone]');
    if (!z) return;
    if (openZone === z.dataset.zone) return expandZone(null);
    if (isMobile()) setMenu(false);
    on.zone(z.dataset.zone);
  });

  panel.querySelector('.handle').addEventListener('click', () => setMenu(!menuOpen()));
  panel.querySelector('.panel-head h2').addEventListener('click', () => isMobile() && setMenu(!menuOpen()));

  const isActive = (a) => a.active.includes(slot);
  const activeNow = (a) => isActive(a)
    ? `${slotById.get(slot).label}這個時段，牠通常比較活躍。`
    : `${slotById.get(slot).label}這個時段，牠多半在休息。`;

  function renderStatus() {
    document.querySelectorAll('#slots [data-slot]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.slot === slot)));
    slotsEl.style.setProperty('--k', data.slots.findIndex((s) => s.id === slot));
    document.querySelectorAll('[data-id]').forEach((row) => {
      const a = byId.get(row.dataset.id);
      const pill = row.querySelector('.pill');
      if (!a || !pill) return;
      pill.className = `pill ${isActive(a) ? 'on' : 'off'}`;
      pill.textContent = isActive(a) ? '活動中' : '休息中';
    });
    if (selected) {
      const st = card.querySelector('.status');
      if (st) {
        const a = byId.get(selected);
        st.className = `status ${isActive(a) ? '' : 'off'}`;
        st.textContent = activeNow(a);
      }
    }
  }

  // 洗牌（每次打開卡片都重新抽題、打亂選項）
  function shuffle(arr) {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function sessionState(time) {
    const [h, m] = time.split(':').map(Number);
    const now = new Date();
    const diff = h * 60 + m - (now.getHours() * 60 + now.getMinutes());
    if (diff < 0) return ['done', '已結束'];
    if (diff <= 60) return ['soon', `${diff} 分鐘後`];
    return ['', ''];
  }

  const QUIZ_N = 5;
  // 依分數給評價（分數只算第一次就答對的題目）
  function rating(score, name) {
    if (score === 100) return ['滿分！', `你是${name}小專家，可以當小小解說員了。`];
    if (score >= 80) return ['好厲害！', '只差一點點就滿分，再看一次介紹就沒問題。'];
    if (score >= 60) return ['不錯喔！', '已經認識牠大半了，把錯的題目再讀一次吧。'];
    if (score >= 40) return ['再加油！', '往上捲回去讀讀介紹，再挑戰一次。'];
    return ['剛認識牠', '先看看上面的介紹，再來挑戰會更順利。'];
  }

  // 卡片頂端固定的關閉鈕（捲動時跟著卡片頂端）
  const closeBtn = '<div class="card-top"><button type="button" class="close" aria-label="關閉"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>';
  const ICON = {
    diet: '<svg viewBox="0 0 24 24"><path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M16 3c-1.7 0-3 2-3 5s1.3 4.5 3 4.5V21"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  };

  function renderCard(a) {
    const i = animals.indexOf(a);
    const prev = animals[i - 1], next = animals[i + 1];
    const tx = a.taxonomy, z = zoneById.get(a.zone);
    card.dataset.kind = 'animal';
    card.style.setProperty('--c', a.color);
    card.style.setProperty('--z', z.color);
    const photos = data.photos?.[a.id] || [];
    card.innerHTML = `
      ${closeBtn}
      <header class="hero${photos.length ? '' : ' bare'}">
        ${photos.length ? `<div class="track">${photos.map((ph, n) => `<img src="${esc(ph.file)}" alt="${esc(a.name)}照片 ${n + 1}" loading="lazy" draggable="false" data-n="${n}">`).join('')}</div>
        <div class="dots">${photos.map((_, n) => `<i class="${n ? '' : 'on'}"></i>`).join('')}</div>` : ''}
        <span class="num" aria-hidden="true"><small>No.</small>${pad(a.no)}</span>
      </header>
      <div class="body">
        ${photos.length ? '<p class="credit"></p>' : ''}
        <p class="eyebrow"><i></i>${esc(z.name)} · ${esc(a.habitat)}</p>
        <h3>${esc(a.name)}</h3>
        <p class="en">${esc(a.en)} · <span class="sci">${esc(a.sci)}</span></p>
        <p class="status ${isActive(a) ? '' : 'off'}">${activeNow(a)}</p>
        <p class="lead">${esc(a.summary)}</p>
        <dl class="facts">
          <div><dt>${ICON.diet}吃什麼</dt><dd>${esc(a.diet)}</dd></div>
          <div><dt>${ICON.clock}作息</dt><dd>${esc(a.activity)}</dd></div>
        </dl>
        <div class="tags">${a.tags.map((t) => `<span class="${t.includes('待查核') ? 'warn' : ''}">${esc(t)}</span>`).join('')}</div>

        <h4><span>介紹</span></h4>
        <section class="about collapsed">
          <div class="about-body">
            ${(a.intro || []).map((p) => `<p>${esc(p)}</p>`).join('')}
            <ol class="taxo">
              <li><small>門</small>${esc(tx.phylum)}</li>
              <li><small>綱</small>${esc(tx.class)}</li>
              <li><small>目</small>${esc(tx.order)}</li>
              <li><small>科</small>${esc(tx.family)}</li>
            </ol>
          </div>
          <button type="button" class="more" aria-expanded="false">閱讀完整介紹 ▾</button>
        </section>

        <h4><span>今日場次</span><em>示意</em></h4>
        <ul class="sessions">${a.sessions.map((s) => {
          const [cls, label] = sessionState(s.time);
          return `<li class="${cls}"><time>${s.time}</time><span>${esc(s.type)}</span>${label ? `<b>${label}</b>` : ''}</li>`;
        }).join('')}</ul>

        <h4><span>隨堂小考</span><span class="score" data-progress></span></h4>
        <div class="quiz" data-quiz></div>

        <div class="card-nav">
          <button type="button" data-go="${prev?.id || ''}" ${prev ? '' : 'disabled'}><small>上一站</small>${prev ? esc(prev.name) : '—'}</button>
          <button type="button" data-go="${next?.id || ''}" ${next ? '' : 'disabled'}><small>下一站</small>${next ? esc(next.name) : '—'}</button>
        </div>
        <p class="note">資料為草稿，發布前需對照臺北市立動物園官網查核；場次時間為示意。</p>
      </div>`;
    card.querySelector('.close').addEventListener('click', () => on.close());
    card.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => b.dataset.go && on.select(b.dataset.go)));

    // 介紹超過一個篇幅就先收起來，按「閱讀完整介紹」才展開
    const about = card.querySelector('.about');
    const more = about.querySelector('.more');
    requestAnimationFrame(() => {
      const body = about.querySelector('.about-body');
      if (body.scrollHeight <= body.clientHeight + 4) { about.classList.remove('collapsed'); more.hidden = true; }
    });
    more.addEventListener('click', () => {
      const open = about.classList.toggle('collapsed') === false;
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? '收起介紹 ▴' : '閱讀完整介紹 ▾';
    });

    // 照片：卡片頂端整排滿版，可以左右滑（scroll-snap），點一下換下一張；下方顯示目前這張的作者與授權
    const track = card.querySelector('.hero .track');
    if (track) {
      const dots = [...card.querySelectorAll('.hero .dots i')];
      const credit = card.querySelector('.credit');
      const showCredit = (n) => {
        const ph = photos[n];
        dots.forEach((d, k) => d.classList.toggle('on', k === n));
        credit.innerHTML = `照片：${esc(ph.author || '未具名')}・<a href="${esc(ph.source)}" target="_blank" rel="noopener">${esc(ph.license)}</a>（Wikimedia Commons）`;
      };
      const imgs = [...track.querySelectorAll('img')];
      const stride = () => imgs[1] ? imgs[1].offsetLeft - imgs[0].offsetLeft : track.clientWidth;
      const current = () => Math.min(photos.length - 1, Math.round(track.scrollLeft / stride()));
      track.addEventListener('scroll', () => showCredit(current()), { passive: true });
      track.addEventListener('click', (e) => {
        const n = Number(e.target.dataset?.n);
        if (!Number.isNaN(n)) track.scrollTo({ left: (n === current() ? (n + 1) % photos.length : n) * stride(), behavior: 'smooth' });
      });
      showCredit(0);
    }

    quizIntro(a);
    card.scrollTop = 0;
  }

  // 園區卡片：頂端是園區色＋三張動物照片拼貼和園區大字，下面是數字、介紹、住在這裡的動物
  function renderZoneCard(id) {
    const z = zoneById.get(id), n = data.zones.indexOf(z);
    const kids = animals.filter((a) => a.zone === id);
    const shots = kids.map((a) => data.photos?.[a.id]?.[0]?.file).filter(Boolean).slice(0, 3);
    card.dataset.kind = 'zone';
    card.style.setProperty('--c', z.color);
    card.style.setProperty('--z', z.color);
    card.innerHTML = `
      ${closeBtn}
      <header class="zhero">
        <div class="mosaic m${shots.length}">${shots.map((f) => `<img src="${esc(f)}" alt="" loading="lazy" draggable="false">`).join('')}</div>
        <span class="zmark" aria-hidden="true">${esc(z.mark || z.name[0])}</span>
        <div class="ztitle">
          <p class="eyebrow">Zone ${pad(n + 1)} / ${pad(data.zones.length)}</p>
          <h3>${esc(z.name)}</h3>
          <p class="en">${esc(z.en)}</p>
        </div>
      </header>
      <div class="body">
        <div class="zstats">
          <div><b>${kids.length}</b><small>種動物</small></div>
          <div><b data-awake>${kids.filter(isActive).length}</b><small>${esc(slotById.get(slot).label)}醒著</small></div>
          <div><b>${esc(slotById.get(slot).hours)}</b><small>目前時段</small></div>
        </div>
        <p class="lead">${esc(z.intro || '')}</p>
        <h4><span>住在這裡的動物</span></h4>
        <ul class="zanimals">${kids.map((a) => {
          const ph = data.photos?.[a.id]?.[0]?.file;
          return `<li><button type="button" data-go="${a.id}" style="--c:${a.color}">
            <span class="th">${ph ? `<img src="${esc(ph)}" alt="" loading="lazy">` : `<b>${esc(a.name[0])}</b>`}</span>
            <span class="nm">${esc(a.name)}<small>${esc(a.en)}</small></span>
            <i class="awake ${isActive(a) ? 'on' : ''}" title="${isActive(a) ? '活動中' : '休息中'}"></i>
          </button></li>`;
        }).join('')}</ul>
        <p class="note">園區介紹為草稿，發布前需對照臺北市立動物園官網查核。</p>
      </div>`;
    card.querySelector('.close').addEventListener('click', () => on.overview());
    card.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => on.select(b.dataset.go)));
    card.scrollTop = 0;
  }

  // 小考第一頁：整張深色卡片就是一個大按鈕，上面散著幾個白色的動物圖示
  const QUIZ_ICONS = [
    // 腳印
    '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="16" rx="5" ry="4.2"/><circle cx="5.5" cy="10" r="2.2"/><circle cx="9.5" cy="6" r="2.2"/><circle cx="14.5" cy="6" r="2.2"/><circle cx="18.5" cy="10" r="2.2"/></svg>',
    // 鳥
    '<svg viewBox="0 0 24 24"><path d="M3 14c3 0 5-2 7-5 1.5-2.2 3.6-3 5.6-2.4L19 5l-1 3c1.2 1.6 1.2 4-.4 6-2 2.5-6 4-11 3l-3 2 1-3-2-2z"/></svg>',
    // 魚
    '<svg viewBox="0 0 24 24"><path d="M2 12c3-4.5 7-6 11-6 4 0 7 3 8 6-1 3-4 6-8 6-4 0-8-1.5-11-6zm0 0-1-4 4 4-4 4z"/><circle cx="16.5" cy="11" r="1.1" fill="currentColor" style="fill:var(--qbg)"/></svg>',
    // 蝴蝶
    '<svg viewBox="0 0 24 24"><path d="M12 7c-2-4-9-5-9 0 0 3 3 5 7 5-3 1-5 3-4 6 1 2 4 1 6-3 2 4 5 5 6 3 1-3-1-5-4-6 4 0 7-2 7-5 0-5-7-4-9 0z"/></svg>',
    // 烏龜
    '<svg viewBox="0 0 24 24"><path d="M4 15c0-4.5 3.5-8 8-8s8 3.5 8 8H4z"/><circle cx="21.5" cy="13" r="1.8"/><rect x="5" y="15" width="3" height="3" rx="1"/><rect x="16" y="15" width="3" height="3" rx="1"/></svg>',
  ];
  function quizIntro(a) {
    const box = card.querySelector('[data-quiz]');
    card.querySelector('[data-progress]').textContent = '';
    const icons = QUIZ_ICONS.map((svg, i) => `<i class="qi qi${i}" aria-hidden="true">${svg}</i>`).join('');
    box.innerHTML = `
      <button type="button" class="q start">
        ${icons}
        <span class="go">開始隨堂小考 →</span>
        <small>${QUIZ_N} 題・認識${esc(a.name)}</small>
      </button>`;
    box.querySelector('.start').addEventListener('click', () => startQuiz(a));
  }

  // 隨堂小考：從題庫隨機抽五題，一次一題；答對才出現下一題，最後給分數和評價
  function startQuiz(a) {
    const box = card.querySelector('[data-quiz]');
    const progress = card.querySelector('[data-progress]');
    const picked = shuffle(a.quiz).slice(0, QUIZ_N);
    let k = 0, firstTry = 0;

    function show() {
      const q = picked[k];
      let missed = false;
      progress.textContent = `第 ${k + 1} / ${picked.length} 題`;
      box.innerHTML = `
        <div class="q">
          <p><span>Q${k + 1}</span>${esc(q.q)}</p>
          <div class="opts">${shuffle(q.options.map((_, o) => o)).map((o) => `<button type="button" data-opt="${o}">${esc(q.options[o])}</button>`).join('')}</div>
          <p class="explain" hidden></p>
        </div>`;
      const ex = box.querySelector('.explain');
      box.querySelector('.opts').addEventListener('click', (e) => {
        const b = e.target.closest('[data-opt]');
        if (!b || b.disabled) return;
        // 資料裡 options[0] 是正解
        if (b.dataset.opt !== '0') {
          missed = true;
          b.disabled = true;
          b.classList.add('wrong');
          ex.textContent = '不對喔，再試一次！';
          ex.className = 'explain no';
          ex.hidden = false;
          return;
        }
        if (!missed) firstTry++;
        box.querySelectorAll('[data-opt]').forEach((o) => (o.disabled = true));
        b.classList.add('right');
        ex.textContent = `答對了！${q.explain}`;
        ex.className = 'explain ok';
        const last = k === picked.length - 1;
        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'q-next';
        nextBtn.textContent = last ? '看成績 →' : '下一題 →';
        nextBtn.addEventListener('click', () => { k++; last ? result() : show(); });
        box.querySelector('.q').append(nextBtn);
      });
    }

    function result() {
      const score = Math.round((firstTry / picked.length) * 100);
      const [title, text] = rating(score, a.name);
      progress.textContent = `${score} 分`;
      box.innerHTML = `
        <div class="q result">
          <p class="big">${score}<small> / 100</small></p>
          <p class="rate"><b>${title}</b>${esc(text)}</p>
          <p class="sub">第一次就答對 ${firstTry} / ${picked.length} 題</p>
          <button type="button" class="q-next">再挑戰一次（重新抽題）</button>
        </div>`;
      box.querySelector('.q-next').addEventListener('click', () => startQuiz(a));
    }

    show();
  }

  return {
    byId,
    animals,
    get slot() { return slot; },
    setSlot(id) {
      slot = id;
      renderStatus();
      if (!selected && zoneCard && !card.hidden) renderZoneCard(zoneCard);
    },
    setSelected(id) {
      selected = id;
      document.querySelectorAll('.row').forEach((r) => r.setAttribute('aria-current', String(r.dataset.id === id)));
      if (!id) {
        // 關掉動物卡片時，如果還在某個園區，就換回那個園區的卡片
        if (zoneCard) renderZoneCard(zoneCard); else card.hidden = true;
        return;
      }
      renderCard(byId.get(id));
      card.hidden = false;
      const i = animals.findIndex((x) => x.id === id);
      document.querySelector('.map-nav.prev').disabled = i === 0;
      document.querySelector('.map-nav.next').disabled = i === animals.length - 1;
      expandZone(byId.get(id).zone);
      setMenu(!isMobile()); // 手機版卡片蓋住下半部，抽屜先收起來
      requestAnimationFrame(() => document.querySelector(`.row[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    },
    // 選到一個園區：展開那一區的動物清單（電腦版同時打開選單）
    showZone(id) {
      zoneCard = id;
      expandZone(id);
      if (id && !isMobile()) setMenu(true);
      if (id && !selected) { renderZoneCard(id); card.hidden = false; }
      if (!id && !selected) card.hidden = true;
    },
    setMenu,
    setNight(on) { document.body.classList.toggle('night', on); },
    caption(title, text) {
      const c = $('#caption');
      if (!title) { c.hidden = true; return; }
      c.querySelector('b').textContent = title;
      c.querySelector('span').textContent = text;
      c.hidden = false;
    },
    onCaptionSkip(fn) { $('#caption .cap-skip').addEventListener('click', fn); },
    isMobile,
    cardOpen: () => !card.hidden,
  };
}
