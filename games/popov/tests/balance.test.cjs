const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadGame(search = '') {
  let seed = 42;
  const math = Object.create(Math);
  math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const element = () => ({
    style: {}, children: [], classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, querySelector: () => element(),
  });
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: { querySelector: () => element() },
    localStorage: { getItem() { return null; } },
    location: { search }, URLSearchParams, Math: math, console, performance, setTimeout, clearTimeout,
  });
  const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
  vm.runInContext(read('data.js'), context);
  // Keep the real game logic; omit bootstrapping images, menus and title slides.
  vm.runInContext(read('game.js').replace('  init();', `
    window.test = { S, C, D, rollAnswer, planEvents, activeEvent, skipEvent, choosePhase, resetDay,
      prepareChoice() {
        renderCards = renderHotspots = updateDayInfo = presentEventHint = present = () => {};
        S.cards = [];
      },
      async playQuestions(count) {
        resetDay = () => {};
        hideScreens = hideActor = setScene = updateFace = updateControls = showResult = () => {};
        S.skip = true;
        runSteps = async () => {};
        askQuestion = async () => {};
        choosePhase = async () => ({ type: 'question', diff: 'medium', q: {} });
        C.questionsPerDay = count;
        await playDay(0);
      },
    };
  `), context);
  return context.window.test;
}

test('answer counts track expected odds, including student skills and mixed difficulties', () => {
  const { S, D, rollAnswer } = loadGame();
  const expected = {}, correct = {};
  for (let i = 0; i < 30000; i++) {
    const diff = D.difficultyOrder[i % 3];
    const student = D.group[Math.floor(i / 3) % D.group.length];
    expected[diff] = (expected[diff] || 0) + D.difficulties[diff].chance + (D.characters[student].skill || 0);
    correct[diff] = (correct[diff] || 0) + Number(rollAnswer(diff, student));
    assert.ok(Math.abs(expected[diff] - correct[diff]) < 1.000001);
    assert.ok(Math.abs(S.answerBalance[diff]) < 1.000001);
  }
});

test('each day schedules 3–4 unique early events, with first event before question one', () => {
  const { S, D, planEvents } = loadGame();
  for (let day = 0; day < D.days.length; day++) {
    S.day = day;
    for (let run = 0; run < 500; run++) {
      S.absent = new Set();
      planEvents();
      assert.ok(S.plan.length >= 3 && S.plan.length <= 4);
      assert.equal(new Set(S.plan.map(p => p.ev.id)).size, S.plan.length);
      assert.equal(S.plan[0].at, 1);
      assert.ok(S.plan.at(-1).at <= 10);
      for (let i = 1; i < S.plan.length; i++) {
        assert.ok([2, 3].includes(S.plan[i].at - S.plan[i - 1].at));
      }
    }
  }
});

test('visible event survives a question; overdue events appear one at a time', async () => {
  const game = loadGame();
  const { S, D } = game;
  game.prepareChoice();
  const first = { ev: D.events[0], at: 1, state: 'pending' };
  const second = { ev: D.events[1], at: 3, state: 'pending' };
  S.plan = [first, second];
  let choice = game.choosePhase();
  assert.equal(first.state, 'shown');
  S.pickResolve({ type: 'question' });
  await choice;
  await game.playQuestions(1);
  assert.equal(first.state, 'shown', 'asking a question must not skip the event');
  game.prepareChoice();
  // Restore the real choosePhase reference, while retaining its UI stubs.
  S.asked = 5;
  choice = game.choosePhase();
  assert.equal(second.state, 'pending');
  S.pickResolve({ type: 'question' });
  await choice;
  game.skipEvent(first);
  choice = game.choosePhase();
  assert.equal(second.state, 'shown', 'overdue event must not be lost');
  assert.equal(game.activeEvent(), second);
  S.pickResolve({ type: 'question' });
  await choice;
});

test('forced-event URL still schedules exactly that event at the start', () => {
  const { S, planEvents } = loadGame('?event=damir_late');
  planEvents();
  assert.equal(S.plan.length, 1);
  assert.equal(S.plan[0].ev.id, 'damir_late');
  assert.equal(S.plan[0].at, 1);
  assert.ok(S.absent.has('damir'));
});
