const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A deterministic clock exercises the real scenario code without waiting in real time.
function loadRuntime() {
  let now = 0, nextId = 0;
  const timers = new Map(), nodes = new Map(), events = new Map();
  const timeout = (fn, ms = 0, interval = 0) => {
    const id = ++nextId;
    timers.set(id, { fn, at: now + ms, interval });
    return id;
  };
  function element(selector) {
    if (nodes.has(selector)) return nodes.get(selector);
    const classes = new Set();
    const node = {
      style: { setProperty() {} }, children: [], textContent: '', innerHTML: '',
      classList: {
        add: (...names) => names.forEach(n => classes.add(n)),
        remove: (...names) => names.forEach(n => classes.delete(n)),
        contains: n => classes.has(n),
        toggle(n, force = !classes.has(n)) { force ? classes.add(n) : classes.delete(n); },
      },
      addEventListener() {}, querySelector: s => element(s),
    };
    nodes.set(selector, node);
    return node;
  }
  const document = {
    hidden: false, querySelector: element, querySelectorAll: () => [],
    addEventListener: (name, fn) => events.set('document:' + name, fn),
  };
  const context = vm.createContext({
    window: { addEventListener: (name, fn) => events.set(name, fn) }, document,
    localStorage: { getItem: () => null }, location: { search: '' },
    URLSearchParams, console, performance: { now: () => now },
    setTimeout: timeout, clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => timeout(fn, ms, ms), clearInterval: id => timers.delete(id),
  });
  const read = name => fs.readFileSync(path.join(__dirname, '../games/popov', name), 'utf8');
  vm.runInContext(read('data.js'), context);
  vm.runInContext(read('game.js').replace('  init();', `
    window.test = { S, wait, say, typeText, advance, openMenu, closeMenu, bindInput, abortAll,
      get text() { return el.text.textContent; }, get ready() { return !!advanceResolve; } };
  `), context);
  const game = context.window.test;
  game.S.phase = 'busy';
  game.bindInput();
  return {
    game, document,
    key(key) { events.get('keydown')({ key, preventDefault() {} }); },
    hide() { document.hidden = true; events.get('document:visibilitychange')(); },
    async tick(ms) {
      const end = now + ms;
      while (true) {
        const entry = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        const [id, timer] = entry;
        now = timer.at;
        if (timer.interval) timer.at += timer.interval; else timers.delete(id);
        timer.fn();
        await Promise.resolve();
      }
      now = end;
      await Promise.resolve();
    },
  };
}

test('scenario delay preserves remaining time across menu pause', async () => {
  const r = loadRuntime();
  let done = false;
  r.game.wait(1000).then(() => { done = true; });
  await r.tick(400);
  r.game.openMenu();
  await r.tick(10000);
  assert.equal(done, false);
  r.game.closeMenu();
  await r.tick(599);
  assert.equal(done, false);
  await r.tick(1);
  assert.equal(done, true);
});

test('typing freezes and resumes without counting time spent in menu', async () => {
  const r = loadRuntime();
  let done = false;
  r.game.typeText('x'.repeat(200), () => { done = true; });
  await r.tick(160);
  const before = r.game.text;
  assert.ok(before.length > 0);
  r.game.openMenu();
  await r.tick(10000);
  assert.equal(r.game.text, before);
  r.game.closeMenu();
  await r.tick(160);
  assert.ok(r.game.text.length > before.length);
  assert.ok(r.game.text.length < 25);
  assert.equal(done, false);
});

test('AUTO preserves its remaining delay and Ctrl cannot advance from menu', async () => {
  const r = loadRuntime();
  r.game.S.auto = true;
  let done = false;
  const line = 'Hello';
  r.game.say('narrator', line).then(() => { done = true; });
  await r.tick(112); // typing ends at 112 ms; AUTO delay is 1500 + 5 * 18.
  assert.equal(r.game.ready, true);
  await r.tick(500);
  r.game.openMenu();
  r.key('Control');
  assert.equal(r.game.S.ctrlSkip, false);
  await r.tick(10000);
  assert.equal(done, false);
  r.game.closeMenu();
  await r.tick(1089);
  assert.equal(done, false);
  await r.tick(1);
  assert.equal(done, true);
});

test('leaving a paused session cancels its scenario timers', async () => {
  const r = loadRuntime();
  const pending = r.game.wait(1000);
  // Attach a rejection handler before abortAll rejects the pending promise.
  const aborted = pending.catch(e => e.abort);
  r.game.openMenu();
  r.game.abortAll();
  assert.equal(await aborted, true);
  r.game.closeMenu();
  let next = false;
  r.game.wait(100).then(() => { next = true; });
  await r.tick(100);
  assert.equal(next, true);
});

test('hidden tab pauses a running scenario and retains the pause on return', async () => {
  const r = loadRuntime();
  r.hide();
  assert.equal(r.game.S.paused, true);
  r.document.hidden = false;
  await r.tick(1000);
  assert.equal(r.game.S.paused, true);
});

test('releasing Ctrl during pause does not resume its pending skip', async () => {
  const r = loadRuntime();
  let done = false;
  r.game.say('narrator', 'Hello').then(() => { done = true; });
  r.key('Control');
  r.game.openMenu();
  assert.equal(r.game.S.ctrlSkip, false);
  await r.tick(10000);
  r.game.closeMenu();
  await r.tick(1000);
  assert.equal(done, false);
  r.key(' ');
  assert.equal(await Promise.resolve().then(() => done), true);
});
