/*
 * Логика визуальной новеллы. Все тексты и числа — в data.js.
 */
(() => {
  'use strict';

  const D = window.GAME_DATA;
  const C = D.config;
  const STAGE_W = 1536;
  const STAGE_H = 1024;

  // Зоны «посмотреть на другую сторону» (кликабельная дальняя стена)
  const TURN_ZONES = {
    front: { x: 440, y: 60, w: 690, h: 230 },   // окна
    back: { x: 585, y: 115, w: 390, h: 210 },   // доска
  };

  const $ = (s) => document.querySelector(s);
  const el = {
    stage: $('#stage'),
    bgFront: $('#bg-front'),
    bgBack: $('#bg-back'),
    actors: $('#actors'),
    hotspots: $('#hotspots'),
    turnZone: $('#turn-zone'),
    avatar: $('#avatar'),
    avatarImg: $('#avatar-img'),
    fill: $('#shock-fill'),
    head: $('#shock-head'),
    headImg: $('#shock-head-img'),
    float: $('#shock-float'),
    dayInfo: $('#day-info'),
    btnTurn: $('#btn-turn'),
    turnAlert: $('#turn-alert'),
    cards: $('#cards'),
    choices: $('#choices'),
    dialog: $('#dialog'),
    name: $('#dialog-name'),
    text: $('#dialog-text'),
    menu: $('#menu'),
    history: $('#history-list'),
    title: $('#title-screen'),
    daySelect: $('#day-select'),
    dayList: $('#day-list'),
    slides: $('#title-slides'),
    dayCard: $('#day-card'),
    result: $('#result-screen'),
  };

  // ------------------------------------------------------------ утилиты
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const charOf = (id) => D.characters[id] || { name: id, color: '#fff' };
  // Имя для показа: с небольшим шансом — альтернативное (altNames в data.js)
  const displayName = (id) => {
    const ch = charOf(id);
    if (ch.altNames && ch.altNames.length && Math.random() < (ch.altNameChance || 0)) return rand(ch.altNames);
    return ch.name;
  };
  const fmt = (text, vars = {}) =>
    String(text).replace(/\{(\w+)\}/g, (m, k) => {
      if (k in vars) return vars[k];
      if (D.characters[k]) return displayName(k);
      return m;
    });
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ------------------------------------------------------------ настройки
  const SETTINGS_KEY = 'popov-vn-settings';
  const DEFAULTS = { speed: 45, auto: 1.5, odds: true, answer: true, shake: true };
  let settings = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    settings = { ...DEFAULTS, ...saved };
  } catch (e) { /* хранилище недоступно — работаем с настройками по умолчанию */ }
  const saveSettings = () => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  };

  // ------------------------------------------------------------ прогресс (открытые дни)
  const PROGRESS_KEY = 'popov-vn-progress';
  let progress = { unlocked: 1, best: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null');
    if (saved && typeof saved === 'object') progress = { unlocked: saved.unlocked || 1, best: saved.best || {} };
  } catch (e) { /* хранилище недоступно — открыт только первый день */ }
  progress.unlocked = Math.max(1, Math.min(D.days.length, progress.unlocked));
  const saveProgress = () => {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (e) { /* ignore */ }
  };
  const isUnlocked = (i) => i < progress.unlocked;

  // Записывает победу; возвращает true, если открылся новый день
  function recordWin(dayIdx, g, asked) {
    const prev = progress.best[dayIdx];
    if (!prev || asked < prev.asked) progress.best[dayIdx] = { stars: g.stars, asked, grade: g.grade };
    const before = progress.unlocked;
    progress.unlocked = Math.max(progress.unlocked, Math.min(D.days.length, dayIdx + 2));
    saveProgress();
    return progress.unlocked > before;
  }

  // ------------------------------------------------------------ состояние
  const S = {
    day: 0,
    shock: 0,
    asked: 0,
    wrongCount: 0,
    view: 'front',
    absent: new Set(),
    used: {},
    cards: null,
    plan: [],
    lastStudent: null,
    faceOverride: null,
    phase: 'idle',
    auto: false,
    skip: false,
    ctrlSkip: false,
    pickResolve: null,
    choiceResolve: null,
    log: [],
  };

  // ------------------------------------------------------------ прерываемые ожидания
  const ABORT = { abort: true };
  const pending = new Set();
  function waitFor(executor) {
    return new Promise((resolve, reject) => {
      const entry = { reject };
      pending.add(entry);
      executor((v) => {
        if (!pending.has(entry)) return;
        pending.delete(entry);
        resolve(v);
      });
    });
  }
  function abortAll() {
    for (const e of pending) e.reject(ABORT);
    pending.clear();
    stopTyping();
    advanceResolve = null;
    clearTimeout(autoTimer);
    S.pickResolve = null;
    S.choiceResolve = null;
  }
  const isSkipping = () => S.skip || S.ctrlSkip;
  const wait = (ms) => waitFor((res) => setTimeout(res, isSkipping() ? Math.min(ms, 80) : ms));
  const runSafe = (p) => p.catch((e) => { if (e !== ABORT) console.error(e); });

  // ------------------------------------------------------------ масштаб
  // Сцена ставится в целые пиксели: при дробном смещении края кадра мерцают
  function fit() {
    const s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    el.stage.style.left = Math.round((window.innerWidth - STAGE_W * s) / 2) + 'px';
    el.stage.style.top = Math.round((window.innerHeight - STAGE_H * s) / 2) + 'px';
    el.stage.style.transform = `scale(${s})`;
  }
  window.addEventListener('resize', fit);

  // ------------------------------------------------------------ история
  function log(entry) {
    S.log.push(entry);
    if (el.menu.classList.contains('show')) renderHistory();
  }

  function renderHistory() {
    if (!S.log.length) {
      el.history.innerHTML = '<div class="h-empty">История пока пуста.</div>';
      return;
    }
    el.history.innerHTML = S.log.map((e) => {
      switch (e.kind) {
        case 'day':
          return `<div class="h-item day">${escapeHtml(e.text)}</div>`;
        case 'system':
          return `<div class="h-item system">${escapeHtml(e.text)}</div>`;
        case 'question': {
          const d = D.difficulties[e.diff];
          return `<div class="h-item question ${d.color}"><span class="h-badge">${escapeHtml(d.label)}</span>` +
            `${escapeHtml(e.text)} <span style="color:var(--ink-dim)">→ ${escapeHtml(e.student)}</span></div>`;
        }
        case 'result':
          return `<div class="h-item result ${e.delta > 0 ? 'bad' : 'ok'}">${escapeHtml(e.text)} ` +
            `(${e.delta > 0 ? '+' : ''}${e.delta} к ошеломлению)</div>`;
        case 'line': {
          if (e.speaker === 'narrator') return `<div class="h-item narrator">${escapeHtml(e.text)}</div>`;
          const ch = charOf(e.speaker);
          return `<div class="h-item"><span class="h-name" style="color:${ch.color}">${escapeHtml(e.name || ch.name)}</span>${escapeHtml(e.text)}</div>`;
        }
        default:
          return '';
      }
    }).join('');
    const tab = $('#tab-history');
    tab.scrollTop = tab.scrollHeight;
  }

  // ------------------------------------------------------------ диалог
  let typing = null;
  let advanceResolve = null;
  let autoTimer = null;

  function stopTyping() {
    if (typing) clearInterval(typing.timer);
    typing = null;
  }

  function typeText(text, onDone) {
    stopTyping();
    el.text.textContent = '';
    if (isSkipping() || settings.speed >= 120) {
      el.text.textContent = text;
      onDone();
      return;
    }
    const start = performance.now();
    let shown = 0;
    const t = {
      finish() {
        clearInterval(t.timer);
        if (typing === t) typing = null;
        el.text.textContent = text;
        onDone();
      },
    };
    t.timer = setInterval(() => {
      const n = Math.floor(((performance.now() - start) / 1000) * settings.speed);
      if (n >= text.length || isSkipping()) {
        t.finish();
      } else if (n > shown) {
        shown = n;
        el.text.textContent = text.slice(0, n);
      }
    }, 16);
    typing = t;
  }

  function setSpeaker(speaker, name) {
    const ch = charOf(speaker);
    el.name.textContent = speaker === 'narrator' ? '' : name || ch.name;
    el.name.style.color = speaker === 'popov' ? '#fff' : ch.color;
    el.text.classList.toggle('narrator', speaker === 'narrator');
  }

  // Показать реплику без ожидания клика (фон во время выбора)
  function present(speaker, text) {
    setSpeaker(speaker);
    el.dialog.classList.remove('ready');
    advanceResolve = null;
    typeText(text, () => {});
  }

  function say(speaker, text) {
    text = fmt(text);
    const name = speaker === 'narrator' ? '' : displayName(speaker);
    log({ kind: 'line', speaker, name, text });
    return waitFor((resolve) => {
      setSpeaker(speaker, name);
      el.dialog.classList.remove('ready');
      const finish = () => {
        clearTimeout(autoTimer);
        advanceResolve = null;
        el.dialog.classList.remove('ready');
        resolve();
      };
      typeText(text, () => {
        el.dialog.classList.add('ready');
        advanceResolve = finish;
        scheduleAuto(text);
      });
    });
  }

  function scheduleAuto(text) {
    clearTimeout(autoTimer);
    if (!advanceResolve) return;
    if (isSkipping()) {
      autoTimer = setTimeout(() => advanceResolve && advanceResolve(), 70);
    } else if (S.auto && !el.menu.classList.contains('show')) {
      const len = text ? text.length : el.text.textContent.length;
      autoTimer = setTimeout(() => advanceResolve && advanceResolve(), settings.auto * 1000 + len * 18);
    }
  }

  function advance() {
    if (typing) { typing.finish(); return; }
    if (advanceResolve) advanceResolve();
  }

  // ------------------------------------------------------------ Попов: лицо и шкала
  const pct = () => (S.shock / C.maxShock) * 100;

  function baseFace() {
    return C.avatarThresholds.filter((t) => pct() >= t).length;
  }

  function updateFace(animate) {
    const face = S.faceOverride != null ? S.faceOverride : baseFace();
    const src = D.ui.popovAvatars[clamp(face, 0, 3)];
    if (el.avatarImg.getAttribute('src') !== src) {
      el.avatarImg.src = src;
      if (animate) {
        el.avatar.classList.remove('pop');
        void el.avatar.offsetWidth;
        el.avatar.classList.add('pop');
      }
    }
  }

  function setFace(face) {
    S.faceOverride = face;
    updateFace(true);
  }

  function updateBar() {
    const p = clamp(pct(), 0, 100);
    el.fill.style.width = (500 * p) / 100 + 'px';
    const lvl = C.barHeadThresholds.filter((t) => p >= t).length;
    el.headImg.src = D.ui.barHeads[lvl];
    el.head.className = 'lvl-' + lvl;
  }

  function addShock(delta, silent) {
    if (!delta) return;
    S.shock = clamp(S.shock + delta, 0, C.maxShock);
    updateBar();
    updateFace(true);
    if (!silent) {
      el.float.textContent = (delta > 0 ? '+' : '') + delta;
      el.float.className = delta > 0 ? 'plus' : 'minus';
      void el.float.offsetWidth;
      el.float.classList.add('go');
    }
    if (delta >= 25 && settings.shake) {
      el.stage.classList.remove('shake');
      void el.stage.offsetWidth;
      el.stage.classList.add('shake');
    }
  }

  function updateDayInfo() {
    const day = D.days[S.day];
    const n = Math.min(S.asked + 1, C.questionsPerDay);
    el.dayInfo.innerHTML = `<b>${C.dayLabel} ${S.day + 1}</b> · ${escapeHtml(day.topic)} · Вопрос ${n} / ${C.questionsPerDay}`;
  }

  // ------------------------------------------------------------ ракурсы и спрайты
  const actors = new Map();
  let popovBack = null;

  function placeActor(img, at) {
    const pos = typeof at === 'object' ? at : D.positions[at] || D.positions.center;
    img.style.left = pos.x + 'px';
    img.style.bottom = STAGE_H - pos.y + 'px';
    img.style.height = pos.h + 'px';
  }

  // Сцена: 'class' — группа за столом, 'empty' — пустая аудитория (для событий),
  // id ученика — Попов стоит над душой у этого ученика.
  function sceneSrc(view) {
    const sc = D.ui.scenes[view];
    if (S.scene === 'empty') return D.ui.backgrounds[view];
    if (S.scene === 'class') return sc.seated;
    return sc.at[S.scene] || sc.seated;
  }

  function crossfade(img, src) {
    const ghost = img.cloneNode();
    ghost.removeAttribute('id');
    ghost.style.transition = 'none';
    ghost.style.opacity = '1';
    img.after(ghost);
    img.src = src;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ghost.style.transition = 'opacity 0.35s ease';
      ghost.style.opacity = '0';
    }));
    setTimeout(() => ghost.remove(), 450);
  }

  function setScene(scene) {
    S.scene = scene;
    for (const [view, img] of [['front', el.bgFront], ['back', el.bgBack]]) {
      const src = sceneSrc(view);
      if (img.getAttribute('src') === src) continue;
      if (view === S.view && img.getAttribute('src')) crossfade(img, src);
      else img.src = src;
    }
    // спина Попова нужна только в пустой аудитории — на сценах он уже нарисован
    if (popovBack) popovBack.style.display = scene === 'empty' ? '' : 'none';
  }

  // Портрет ставим на сторону, противоположную месту ученика на картинке
  function portraitSpot(id) {
    const seat = charOf(id).seat;
    return seat && seat[S.view] === 'left' ? 'sideRight' : 'sideLeft';
  }

  function setView(view) {
    S.view = view;
    el.bgFront.classList.toggle('active', view === 'front');
    el.bgBack.classList.toggle('active', view === 'back');
    for (const img of el.actors.children) {
      img.classList.toggle('hidden-view', img.dataset.view !== view);
    }
    const z = TURN_ZONES[view];
    Object.assign(el.turnZone.style, { left: z.x + 'px', top: z.y + 'px', width: z.w + 'px', height: z.h + 'px' });
    renderHotspots();
  }

  function toggleView() {
    if (S.phase !== 'choose') return;
    setView(S.view === 'front' ? 'back' : 'front');
    if (activeEvent()) presentEventHint();
  }

  function presentEventHint() {
    const p = activeEvent();
    const hs = D.hotspots[p.ev.hotspot];
    const where = hs.view === S.view ? '' : ' (обернитесь ↻)';
    present('narrator', `Что-то происходит: «${p.ev.title}»${where}. Можно отреагировать — или проигнорировать и задать вопрос.`);
  }

  function showActor(id, sprite, at) {
    const ch = charOf(id);
    const src = ch.sprites && (ch.sprites[sprite] || ch.sprites.neutral);
    if (!src) return;
    let img = actors.get(id);
    if (!img) {
      img = document.createElement('img');
      img.className = 'actor enter-from-left';
      img.alt = ch.name;
      el.actors.appendChild(img);
      actors.set(id, img);
    }
    img.src = src;
    img.dataset.view = S.view;
    img.classList.remove('hidden-view');
    placeActor(img, at || 'center');
    requestAnimationFrame(() => img.classList.add('in'));
  }

  function setActorSprite(id, sprite, bump) {
    const img = actors.get(id);
    const ch = charOf(id);
    if (!img || !ch.sprites || !ch.sprites[sprite]) return;
    img.src = ch.sprites[sprite];
    if (bump) {
      img.classList.remove('bump');
      void img.offsetWidth;
      img.classList.add('bump');
    }
  }

  function hideActor(id) {
    const ids = id === '*' ? [...actors.keys()] : [id];
    for (const k of ids) {
      const img = actors.get(k);
      if (!img) continue;
      actors.delete(k);
      img.classList.remove('in');
      setTimeout(() => img.remove(), 320);
    }
  }

  // ------------------------------------------------------------ вопросы
  function drawQuestion(diff, exclude = []) {
    const pool = D.days[S.day].questions[diff];
    const used = S.used[diff];
    let free = pool.filter((q) => !used.has(q) && !exclude.includes(q));
    if (!free.length) {
      used.clear();
      free = pool.filter((q) => !exclude.includes(q));
    }
    return rand(free.length ? free : pool);
  }

  function pickStudent() {
    const roster = D.group.filter((id) => !S.absent.has(id));
    const options = roster.length > 1 ? roster.filter((id) => id !== S.lastStudent) : roster;
    const id = rand(options.length ? options : D.group);
    S.lastStudent = id;
    return id;
  }

  // mode: 'targeted' — Попов подходит к ученику; 'class' — вопрос всей группе, отвечает вызвавшийся
  async function askQuestion(studentId, diffKey, q, bonus = 1, mode = 'targeted') {
    const diff = D.difficulties[diffKey];
    const ch = charOf(studentId);
    S.used[diffKey].add(q);

    hideActor('*');
    setScene(mode === 'targeted' ? studentId : 'class');
    await wait(300);
    const spot = portraitSpot(studentId);

    if (mode === 'targeted') {
      showActor(studentId, 'neutral', spot);
      log({ kind: 'question', diff: diffKey, text: q.q, student: ch.name });
      const askLine = ch.askLines && ch.askLines.length
        ? rand(ch.askLines)
        : rand(D.popovLines.ask);
      await say('popov', fmt(askLine, { name: displayName(studentId) }));
      setActorSprite(studentId, ch.answer.thinking);
      await say('popov', q.q);
    } else {
      log({ kind: 'question', diff: diffKey, text: q.q, student: 'вся группа' });
      await say('popov', rand(D.popovLines.classAsk));
      await say('popov', q.q);
      await say('narrator', fmt(rand(D.popovLines.volunteer), { name: displayName(studentId) }));
      showActor(studentId, ch.answer.thinking, spot);
      await wait(250);
    }

    const chance = clamp(diff.chance + (ch.skill || 0), 0.02, 0.98);
    const ok = Math.random() < chance;
    setActorSprite(studentId, ok ? ch.answer.right : ch.answer.wrong, true);
    const answer = ok
      ? rand(ch.rightPrefix || ['']) + q.a
      : rand(ch.wrongPrefix || ['']) + rand(q.wrong);
    await say(studentId, answer);

    const delta = ok ? diff.right : Math.round(diff.wrong * bonus);
    if (!ok) S.wrongCount++;
    setFace(ok ? diff.faceRight : diff.faceWrong);
    addShock(delta);
    log({ kind: 'result', delta, text: ok ? `${ch.name} ответил правильно.` : `${ch.name} ответил неправильно.` });
    await say('popov', rand(D.popovLines[ok ? 'right' : 'wrong'][diffKey]));
    if (!ok && settings.answer) {
      await say('popov', fmt(D.popovLines.correctAnswer, { answer: q.a }));
    }
    return ok;
  }

  // ------------------------------------------------------------ выбор вопроса
  function renderCards() {
    el.cards.innerHTML = '';
    S.cards.forEach((card, i) => {
      const d = D.difficulties[card.diff];
      const b = document.createElement('button');
      b.className = 'card ' + d.color;
      const odds = settings.odds
        ? `<div class="card-odds">Шанс ответа <b>${Math.round(d.chance * 100)}%</b> · провал <b>+${d.wrong}</b> · ответ <b>${d.right > 0 ? '+' : ''}${d.right}</b></div>`
        : '';
      b.innerHTML =
        `<span class="card-tag">${escapeHtml(d.label)}</span>` +
        `<span class="card-icon">?</span>` +
        `<span class="card-body"><div class="card-text">${escapeHtml(card.q.q)}</div>${odds}</span>` +
        `<span class="card-arrow">›</span><span class="card-key">${i + 1}</span>`;
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        pickCard(i);
      });
      el.cards.appendChild(b);
      setTimeout(() => b.classList.add('show'), 60 + i * 70);
    });
  }

  function pickCard(i) {
    if (!S.pickResolve || !S.cards || !S.cards[i]) return;
    const c = S.cards[i];
    S.pickResolve({ type: 'question', diff: c.diff, q: c.q });
  }

  function activeEvent() {
    return S.plan.find((p) => p.state === 'shown');
  }

  function renderHotspots() {
    el.hotspots.innerHTML = '';
    const p = activeEvent();
    const show = p && S.phase === 'choose';
    const hs = show ? D.hotspots[p.ev.hotspot] : null;
    el.turnAlert.classList.toggle('on', !!(hs && hs.view !== S.view));
    if (!hs || hs.view !== S.view) return;

    const wrap = document.createElement('div');
    wrap.className = 'hotspot';
    wrap.style.left = hs.x + 'px';
    wrap.style.top = hs.y + 'px';
    const main = document.createElement('button');
    main.className = 'hotspot-main';
    main.innerHTML = `<i>!</i>${escapeHtml(p.ev.title)}`;
    main.addEventListener('click', (e) => {
      e.stopPropagation();
      if (S.pickResolve) S.pickResolve({ type: 'event', plan: p });
    });
    const skip = document.createElement('button');
    skip.className = 'hotspot-skip';
    skip.title = 'Пропустить событие';
    skip.textContent = '✕';
    skip.addEventListener('click', (e) => {
      e.stopPropagation();
      skipEvent(p);
      renderHotspots();
      present('narrator', 'Попов решает не отвлекаться.');
    });
    wrap.append(main, skip);
    el.hotspots.appendChild(wrap);
  }

  function skipEvent(p) {
    p.state = 'skipped';
    log({ kind: 'system', text: fmt(D.popovLines.eventSkipped, { title: p.ev.title }) });
    // опоздавший всё равно тихо садится на место
    if (p.ev.absent) S.absent.delete(p.ev.absent);
  }

  async function choosePhase(introLine) {
    S.phase = 'choose';
    updateDayInfo();
    if (!S.cards) {
      const taken = [];
      S.cards = D.difficultyOrder.map((diff) => {
        const q = drawQuestion(diff, taken);
        taken.push(q);
        return { diff, q };
      });
    }
    // событие на этом вопросе?
    const due = S.plan.find((p) => p.state === 'pending' && p.at === S.asked + 1);
    if (due) due.state = 'shown';
    if (activeEvent()) presentEventHint();
    else present('popov', introLine || rand(D.popovLines.turnStart));

    renderCards();
    el.stage.classList.add('can-turn');
    el.btnTurn.disabled = false;
    renderHotspots();

    const pick = await waitFor((resolve) => { S.pickResolve = resolve; });
    S.pickResolve = null;
    S.phase = 'busy';
    el.stage.classList.remove('can-turn');
    el.btnTurn.disabled = true;
    el.cards.innerHTML = '';
    renderHotspots();
    return pick;
  }

  // ------------------------------------------------------------ выбор в событиях
  function showChoices(options) {
    return waitFor((resolve) => {
      el.choices.innerHTML = '';
      options.forEach((opt, i) => {
        const b = document.createElement('button');
        b.className = 'choice';
        b.innerHTML = `${escapeHtml(fmt(opt.label))}<small>${i + 1}</small>`;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          done(i);
        });
        el.choices.appendChild(b);
        setTimeout(() => b.classList.add('show'), 50 + i * 70);
      });
      const done = (i) => {
        S.choiceResolve = null;
        el.choices.innerHTML = '';
        log({ kind: 'system', text: 'Выбор: ' + fmt(options[i].label) });
        resolve(i);
      };
      S.choiceResolve = (i) => { if (options[i]) done(i); };
    });
  }

  // ------------------------------------------------------------ сценарии
  // stopOnMax: прервать сценарий, если шкала заполнилась (для концовок — false)
  async function runSteps(steps, stopOnMax = true) {
    for (const step of steps || []) {
      if (step.scene) setScene(step.scene);
      if (step.view) setView(step.view);
      if (step.show) showActor(step.show, step.sprite || 'neutral', step.at);
      if (step.hide) hideActor(step.hide);
      if (step.join) S.absent.delete(step.join);
      if (step.say) {
        if (step.sprite && step.say !== 'popov') setActorSprite(step.say, step.sprite);
        if (step.face != null) setFace(step.face);
        await say(step.say, step.text);
      }
      if (step.shock) {
        addShock(step.shock);
        log({ kind: 'result', delta: step.shock, text: 'Событие' });
        await wait(450);
      }
      if (step.ask) {
        const diff = step.difficulty || 'medium';
        await askQuestion(step.ask, diff, drawQuestion(diff), step.bonus || 1);
      }
      if (step.chance != null) {
        await runSteps(Math.random() < step.chance ? step.success : step.fail, stopOnMax);
      }
      if (step.choice) {
        const i = await showChoices(step.choice);
        await runSteps(step.choice[i].steps, stopOnMax);
      }
      if (stopOnMax && S.shock >= C.maxShock) return;
    }
  }

  function planEvents() {
    const dayNo = S.day + 1;
    const eligible = D.events.filter((e) => e.days === 'all' || (Array.isArray(e.days) && e.days.includes(dayNo)));
    const [min, max] = C.eventsPerDay;
    const count = Math.min(randInt(min, max), eligible.length);
    const chosen = [];
    const bag = eligible.slice();
    while (chosen.length < count && bag.length) {
      const total = bag.reduce((s, e) => s + (e.weight || 1), 0);
      let r = Math.random() * total;
      const idx = bag.findIndex((e) => (r -= e.weight || 1) < 0);
      chosen.push(bag.splice(idx < 0 ? 0 : idx, 1)[0]);
    }
    const slots = shuffle(
      Array.from({ length: Math.max(1, C.questionsPerDay - 3 - C.eventFirstQuestion + 1) }, (_, i) => i + C.eventFirstQuestion),
    );
    S.plan = chosen.map((ev, i) => ({ ev, at: slots[i % slots.length], state: 'pending' }));
    // Проверка своего события: index.html?event=<id> — оно появится на первом вопросе
    const forced = new URLSearchParams(location.search).get('event');
    const forcedEv = forced && D.events.find((e) => e.id === forced);
    if (forcedEv) S.plan = [{ ev: forcedEv, at: 1, state: 'pending' }];
    for (const p of S.plan) if (p.ev.absent) S.absent.add(p.ev.absent);
  }

  // ------------------------------------------------------------ день
  function resetDay(idx) {
    S.day = idx;
    S.shock = C.startShock;
    S.asked = 0;
    S.wrongCount = 0;
    S.cards = null;
    S.absent = new Set();
    S.lastStudent = null;
    S.faceOverride = null;
    S.skip = false;
    S.used = {};
    for (const k of Object.keys(D.difficulties)) S.used[k] = new Set();
    hideActor('*');
    el.choices.innerHTML = '';
    el.cards.innerHTML = '';
    updateControls();
    planEvents();
    updateBar();
    updateFace(false);
    updateDayInfo();
    setScene('class');
    setView('front');
  }

  async function playDay(idx) {
    abortAll();
    hideScreens();
    resetDay(idx);
    const day = D.days[idx];
    log({ kind: 'day', text: `${C.dayLabel} ${idx + 1}. ${day.topic}` });

    el.stage.classList.add('no-dialog');
    el.dayCard.classList.add('show');
    $('#day-card-num').textContent = `${C.dayLabel.toUpperCase()} ${idx + 1}`;
    $('#day-card-topic').textContent = day.topic;
    const inner = el.dayCard.querySelector('.day-card-inner');
    inner.style.animation = 'none';
    void inner.offsetWidth;
    inner.style.animation = '';
    await wait(2300);
    el.dayCard.classList.remove('show');
    el.stage.classList.remove('no-dialog');

    await runSteps(day.intro);

    let intro = null;
    while (S.asked < C.questionsPerDay && S.shock < C.maxShock) {
      hideActor('*');
      setScene('class');
      S.faceOverride = null;
      updateFace(false);
      const pick = await choosePhase(intro);
      intro = null;
      if (pick.type === 'event') {
        pick.plan.state = 'done';
        log({ kind: 'system', text: `Событие: ${pick.plan.ev.title}` });
        setScene(pick.plan.ev.scene || 'empty');
        await runSteps(pick.plan.ev.steps);
        hideActor('*');
        if (pick.plan.ev.absent) S.absent.delete(pick.plan.ev.absent);
        intro = 'Так. Вернёмся к теме.';
        continue;
      }
      const shown = activeEvent();
      if (shown) skipEvent(shown);
      S.asked++;
      S.cards = null;
      const targeted = Math.random() < C.targetedChance;
      await askQuestion(pickStudent(), pick.diff, pick.q, 1, targeted ? 'targeted' : 'class');
    }

    const win = S.shock >= C.maxShock;
    hideActor('*');
    S.skip = false;
    updateControls();
    await runSteps(win ? D.dayWin : D.dayLose, false);
    showResult(win);
  }

  // ------------------------------------------------------------ экраны
  function hideScreens() {
    el.title.classList.remove('show');
    stopSlides();
    el.result.classList.remove('show');
    el.dayCard.classList.remove('show');
    el.stage.classList.remove('hud-off');
  }

  function gradeFor(asked) {
    return D.grades.find((g) => asked <= g.maxQuestions) || D.grades[D.grades.length - 1];
  }

  const stars = (n) => '★'.repeat(n) + `<span class="off">${'★'.repeat(Math.max(0, 5 - n))}</span>`;

  function button(label, cls, fn) {
    const b = document.createElement('button');
    b.className = 'big-btn ' + (cls || '');
    b.textContent = label;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      fn();
    });
    return b;
  }

  function showResult(win) {
    S.phase = 'result';
    const day = D.days[S.day];
    const isLast = S.day === D.days.length - 1;
    const btns = $('#result-buttons');
    btns.innerHTML = '';
    const evDone = S.plan.filter((p) => p.state === 'done').length;

    if (win) {
      const g = gradeFor(S.asked);
      const opened = recordWin(S.day, g, S.asked);
      log({ kind: 'system', text: `Итог дня: ${g.grade} (${S.asked} вопр.)` });
      $('#result-kicker').textContent = `${C.dayLabel} ${S.day + 1} · ${day.topic} · шкала заполнена`;
      $('#result-grade').textContent = g.grade;
      $('#result-stars').innerHTML = stars(g.stars);
      $('#result-text').textContent = g.text;
      let stats = `Понадобилось вопросов: <b>${S.asked}</b> из ${C.questionsPerDay} · ошибок студентов: <b>${S.wrongCount}</b> · событий: <b>${evDone}</b>`;
      if (opened) {
        const next = D.days[S.day + 1];
        stats += `<div class="unlock-note">🔓 Открыт ${C.dayLabel.toLowerCase()} ${S.day + 2}: <b>${escapeHtml(next.topic)}</b></div>`;
      }
      if (isLast) {
        const rows = D.days.map((d, i) => {
          const r = progress.best[i];
          return `<tr><td>${C.dayLabel} ${i + 1}. ${escapeHtml(d.topic)}</td><td>${r ? `${escapeHtml(r.grade)} · ${r.asked} вопр.` : '—'}</td></tr>`;
        }).join('');
        const total = D.days.reduce((sum, d, i) => sum + (progress.best[i] ? progress.best[i].stars : 0), 0);
        stats += `<br><br><b>Итоговая оценка разочарования группой</b> <span style="font-size:15px">(лучшие результаты)</span><table>${rows}</table>` +
          `<div style="margin-top:8px">Всего: <b style="color:var(--yellow)">${total} ★</b> из ${D.days.length * 5}</div>`;
        $('#result-kicker').textContent = 'Курс окончен';
        btns.append(
          button('Сыграть заново', '', () => { S.log = []; runSafe(playDay(0)); }),
          button('Главное меню', 'ghost', goTitle),
        );
      } else {
        btns.append(
          button('Следующий день', '', () => runSafe(playDay(S.day + 1))),
          button('Переиграть день', 'ghost', () => runSafe(playDay(S.day))),
          button('Главное меню', 'ghost', goTitle),
        );
      }
      $('#result-stats').innerHTML = stats;
    } else {
      log({ kind: 'system', text: 'Пара окончена. Шкала не заполнена.' });
      $('#result-kicker').textContent = `${C.dayLabel} ${S.day + 1} · ${day.topic} · пара окончена`;
      $('#result-grade').textContent = 'Попов не впечатлён';
      $('#result-stars').innerHTML = stars(0);
      $('#result-text').textContent = `Шкала ошеломления заполнилась только на ${Math.round(pct())}%. Группа сегодня отвечала подозрительно прилично.`;
      $('#result-stats').innerHTML = `Вопросов: <b>${S.asked}</b> · ошибок студентов: <b>${S.wrongCount}</b> · событий: <b>${evDone}</b>`;
      btns.append(
        button('Попробовать снова', '', () => runSafe(playDay(S.day))),
        button('Главное меню', 'ghost', goTitle),
      );
    }
    el.result.classList.add('show');
  }

  // ------------------------------------------------------------ начальный экран
  let slideTimer = null;
  let slideIdx = -1;

  function buildSlides() {
    el.slides.innerHTML = '';
    for (const sl of D.ui.preclass || []) {
      const img = document.createElement('img');
      img.src = sl.src;
      img.alt = '';
      el.slides.appendChild(img);
    }
  }

  function buildCredits() {
    const cr = C.credits;
    if (!cr) return;
    $('#credits-list').innerHTML = cr.list
      .map((c) => `<li><b>${escapeHtml(c.name)}</b><span>${escapeHtml(c.role)}</span></li>`)
      .join('');
    for (const side of ['left', 'right']) {
      const ch = charOf(cr[side].id);
      $(`#credits-${side}`).src = ch.sprites[cr[side].sprite] || ch.sprites.neutral;
      $(`#credits-${side}-name`).textContent = ch.name;
    }
  }

  function showSlide(i) {
    const imgs = el.slides.children;
    if (!imgs.length) return;
    const prev = imgs[slideIdx];
    const next = imgs[i];
    // Новый слайд проявляется поверх старого; старый гасим только когда новый уже непрозрачен,
    // иначе на полпути сквозь оба просвечивает сцена игры
    if (prev && prev !== next) {
      prev.classList.remove('front');
      setTimeout(() => { if (!prev.classList.contains('front')) prev.classList.remove('on'); }, 1700);
    }
    next.classList.add('on', 'front');
    slideIdx = i;
  }

  function startSlides() {
    stopSlides();
    const n = el.slides.children.length;
    if (!n) return;
    showSlide((slideIdx + 1) % n);
    slideTimer = setInterval(() => showSlide((slideIdx + 1) % n), (C.slideSeconds || 6) * 1000);
  }

  function stopSlides() {
    clearInterval(slideTimer);
    slideTimer = null;
  }

  // День, с которого продолжать: первый открытый без победы, иначе последний открытый
  function nextDay() {
    for (let i = 0; i < progress.unlocked; i++) if (!progress.best[i]) return i;
    return progress.unlocked - 1;
  }

  function refreshTitle() {
    const started = Object.keys(progress.best).length > 0;
    const allDone = D.days.every((d, i) => progress.best[i]);
    const n = nextDay();
    const total = D.days.reduce((sum, d, i) => sum + (progress.best[i] ? progress.best[i].stars : 0), 0);
    $('#btn-start-label').textContent = allDone ? 'Сыграть снова' : started ? 'Продолжить' : 'Начать';
    $('#btn-start-sub').textContent = allDone
      ? `Курс пройден · ${total} ★ из ${D.days.length * 5}`
      : `${C.dayLabel} ${n + 1} · ${D.days[n].topic}`;
    $('#btn-days-sub').textContent = `Открыто ${progress.unlocked} из ${D.days.length}`;
    renderDayList();
  }

  function renderDayList() {
    el.dayList.innerHTML = '';
    D.days.forEach((d, i) => {
      const b = document.createElement('button');
      const best = progress.best[i];
      const locked = !isUnlocked(i);
      if (locked) b.className = 'locked';
      let extra;
      if (locked) extra = '🔒 ' + escapeHtml(fmt(C.lockedText, { n: i }));
      else if (best) extra = `<span class="stars">${stars(best.stars)}</span>`;
      else extra = 'Новый';
      b.innerHTML = `<b>${C.dayLabel} ${i + 1}</b>${escapeHtml(d.topic)}<small>${extra}</small>`;
      b.addEventListener('click', () => {
        if (locked) {
          b.classList.remove('shake-x');
          void b.offsetWidth;
          b.classList.add('shake-x');
          return;
        }
        S.log = [];
        runSafe(playDay(i));
      });
      el.dayList.appendChild(b);
    });
  }

  function goTitle() {
    abortAll();
    closeMenu();
    hideScreens();
    hideActor('*');
    el.cards.innerHTML = '';
    el.choices.innerHTML = '';
    S.phase = 'idle';
    S.plan = [];
    renderHotspots();
    el.stage.classList.remove('can-turn');
    el.stage.classList.add('hud-off');
    el.daySelect.classList.remove('show');
    refreshTitle();
    el.title.classList.add('show');
    startSlides();
    setScene('class');
    setView('back');
  }

  // ------------------------------------------------------------ меню
  function openMenu(tab) {
    if (S.phase === 'idle' && !el.title.classList.contains('show')) return;
    el.menu.classList.add('show');
    clearTimeout(autoTimer);
    selectTab(tab || 'history');
    $('#btn-to-title').style.display = el.title.classList.contains('show') ? 'none' : '';
  }
  function closeMenu() {
    el.menu.classList.remove('show');
    scheduleAuto();
    if (el.cards.children.length) renderCards();
  }
  function selectTab(tab) {
    document.querySelectorAll('.menu-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + tab));
    if (tab === 'history') renderHistory();
  }

  function bindSettings() {
    const speed = $('#set-speed');
    const auto = $('#set-auto');
    const speedVal = $('#set-speed-val');
    const autoVal = $('#set-auto-val');
    const sync = () => {
      speed.value = settings.speed;
      auto.value = settings.auto;
      speedVal.textContent = settings.speed >= 120 ? 'мгнов.' : settings.speed;
      autoVal.textContent = settings.auto + ' с';
      $('#set-odds').checked = settings.odds;
      $('#set-answer').checked = settings.answer;
      $('#set-shake').checked = settings.shake;
    };
    speed.addEventListener('input', () => { settings.speed = +speed.value; saveSettings(); sync(); });
    auto.addEventListener('input', () => { settings.auto = +auto.value; saveSettings(); sync(); });
    for (const [id, key] of [['#set-odds', 'odds'], ['#set-answer', 'answer'], ['#set-shake', 'shake']]) {
      $(id).addEventListener('change', (e) => { settings[key] = e.target.checked; saveSettings(); });
    }
    sync();
  }

  function updateControls() {
    document.querySelector('[data-ctl="auto"]').classList.toggle('on', S.auto);
    document.querySelector('[data-ctl="skip"]').classList.toggle('on', S.skip);
  }

  // ------------------------------------------------------------ ввод
  function isUiTarget(t) {
    return !!t.closest('button, .card, .choice, .hotspot, #turn-zone, .modal, .screen, input, label');
  }

  function bindInput() {
    el.stage.addEventListener('click', (e) => {
      if (isUiTarget(e.target)) return;
      if (S.phase === 'idle' || S.phase === 'result') return;
      advance();
    });

    el.turnZone.addEventListener('click', (e) => { e.stopPropagation(); toggleView(); });
    el.btnTurn.addEventListener('click', (e) => { e.stopPropagation(); toggleView(); });
    $('#btn-menu').addEventListener('click', (e) => { e.stopPropagation(); openMenu('history'); });
    $('#menu-close').addEventListener('click', closeMenu);
    $('#btn-resume').addEventListener('click', closeMenu);
    $('#btn-to-title').addEventListener('click', goTitle);
    el.menu.addEventListener('click', (e) => { if (e.target === el.menu) closeMenu(); });
    document.querySelectorAll('.menu-tabs button').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));

    document.querySelectorAll('#dialog-controls button').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const ctl = b.dataset.ctl;
        if (ctl === 'log') { openMenu('history'); return; }
        if (ctl === 'auto') { S.auto = !S.auto; if (S.auto) S.skip = false; }
        if (ctl === 'skip') { S.skip = !S.skip; if (S.skip) S.auto = false; }
        updateControls();
        scheduleAuto();
      });
    });

    $('#btn-start').addEventListener('click', () => {
      const allDone = D.days.every((d, i) => progress.best[i]);
      S.log = [];
      runSafe(playDay(allDone ? 0 : nextDay()));
    });
    $('#btn-days').addEventListener('click', () => { renderDayList(); el.daySelect.classList.toggle('show'); });
    $('#btn-reset-progress').addEventListener('click', (e) => {
      e.preventDefault();
      if (!window.confirm('Сбросить прогресс? Откроется только первый день, лучшие оценки удалятся.')) return;
      progress = { unlocked: 1, best: {} };
      saveProgress();
      refreshTitle();
    });
    $('#btn-title-settings').addEventListener('click', () => openMenu('settings'));
    $('#btn-credits').addEventListener('click', () => $('#credits').classList.add('show'));
    $('#credits-close').addEventListener('click', () => $('#credits').classList.remove('show'));
    $('#credits').addEventListener('click', (e) => { if (e.target.id === 'credits') $('#credits').classList.remove('show'); });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Control') {
        if (!S.ctrlSkip) { S.ctrlSkip = true; advance(); scheduleAuto(); }
        return;
      }
      if (e.key === 'Escape') {
        if ($('#credits').classList.contains('show')) $('#credits').classList.remove('show');
        else if (el.menu.classList.contains('show')) closeMenu();
        else if (!el.title.classList.contains('show')) openMenu('history');
        return;
      }
      if (el.menu.classList.contains('show')) return;
      if (el.title.classList.contains('show') || el.result.classList.contains('show')) return;

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        advance();
      } else if (/^[1-9]$/.test(e.key)) {
        const i = +e.key - 1;
        if (S.choiceResolve) S.choiceResolve(i);
        else if (S.pickResolve) pickCard(i);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        toggleView();
      } else if (e.key === 'l' || e.key === 'L' || e.key === 'д' || e.key === 'Д') {
        openMenu('history');
      }
    });
    window.addEventListener('keyup', (e) => { if (e.key === 'Control') S.ctrlSkip = false; });
    window.addEventListener('blur', () => { S.ctrlSkip = false; });
  }

  // ------------------------------------------------------------ старт
  function preload() {
    const srcs = new Set([
      ...D.ui.popovAvatars, ...D.ui.barHeads, D.ui.popovBack,
      ...['front', 'back'].flatMap((v) => [D.ui.scenes[v].seated, ...Object.values(D.ui.scenes[v].at)]),
      D.ui.backgrounds.front, D.ui.backgrounds.back,
    ]);
    for (const ch of Object.values(D.characters)) {
      for (const s of Object.values(ch.sprites || {})) srcs.add(s);
    }
    for (const s of srcs) { const i = new Image(); i.src = s; }
  }

  function init() {
    fit();
    preload();
    $('#title-head').src = D.ui.barHeads[1];
    buildSlides();
    buildCredits();

    popovBack = document.createElement('img');
    popovBack.className = 'actor in';
    popovBack.alt = '';
    popovBack.src = D.ui.popovBack;
    popovBack.dataset.view = 'back';
    placeActor(popovBack, 'popovBack');
    el.actors.appendChild(popovBack);

    bindInput();
    bindSettings();
    updateControls();
    updateBar();
    updateFace(false);
    goTitle();
  }

  init();
})();
