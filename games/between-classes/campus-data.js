(function (root) {
  'use strict';
  const characters = { vlad: 'Влад', adil: 'Адиль', kirill: 'Кирилл', jan: 'Жан', damir: 'Дамир', bakhytzhan: 'Бакытжан', kamil: 'Камиль', elaman: 'Еламан' };
  const entrances = [
    { id: 'building-1', building: 1, name: 'Первый корпус', teacher: 'Стасиншина', x: 530, y: 836, radius: 54, lesson: 'stasinshina' },
    { id: 'building-2-side', building: 2, name: 'Второй корпус', teacher: null, x: 911, y: 759, radius: 30, lesson: null },
    { id: 'building-2-front', building: 2, name: 'Второй корпус', teacher: null, x: 1415, y: 837, radius: 48, lesson: null },
    { id: 'building-3', building: 3, name: 'Третий корпус', teacher: 'Попов', x: 844, y: 343, radius: 52, lesson: 'popov' },
  ];
  // Conservative screen-space footprints: prevent walking through painted roofs
  // and facades until the map gains foreground occlusion layers.
  const obstacles = [
    { x: 100, y: 458, w: 779, h: 345 },
    { x: 945, y: 507, w: 529, h: 297 },
    { x: 880, y: 60, w: 151, h: 294 },
    { x: 927, y: 345, w: 184, h: 140 },
    { x: 870, y: 257, w: 58, h: 96 },
  ];
  function canStand(x, y) {
    const margin = 8;
    return Number.isFinite(x) && Number.isFinite(y) && x >= 28 && x <= 1508 && y >= 40 && y <= 998 &&
      !obstacles.some(r => x > r.x - margin && x < r.x + r.w + margin && y > r.y - margin && y < r.y + r.h + margin);
  }
  function nearEntrance(player) {
    return entrances.filter(e => Math.hypot(player.x - e.x, player.y - e.y) <= e.radius)
      .sort((a, b) => Math.hypot(player.x - a.x, player.y - a.y) - Math.hypot(player.x - b.x, player.y - b.y))[0] || null;
  }
  function findPath(start, goal) {
    if (!canStand(start.x, start.y) || !canStand(goal.x, goal.y)) return [];
    const step = 16, cols = 97, rows = 65;
    function nodeFor(point) {
      let best = null, distance = Infinity;
      const cx = Math.round(point.x / step), cy = Math.round(point.y / step);
      for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
        if (x < 0 || y < 0 || x >= cols || y >= rows || !canStand(x * step, y * step)) continue;
        const d = Math.hypot(x * step - point.x, y * step - point.y);
        if (d < distance) { best = { x, y, id: y * cols + x }; distance = d; }
      }
      return best;
    }
    const first = nodeFor(start), last = nodeFor(goal);
    if (!first || !last) return [];
    const open = new Map([[first.id, first]]), parents = new Map(), cost = new Map([[first.id, 0]]), closed = new Set();
    const heuristic = n => Math.hypot(n.x - last.x, n.y - last.y);
    while (open.size) {
      let current = null, lowest = Infinity;
      for (const n of open.values()) { const f = cost.get(n.id) + heuristic(n); if (f < lowest) { lowest = f; current = n; } }
      if (current.id === last.id) {
        const result = [];
        while (current.id !== first.id) { result.push({ x: current.x * step, y: current.y * step }); current = parents.get(current.id); }
        return result.reverse().concat({ x: goal.x, y: goal.y });
      }
      open.delete(current.id); closed.add(current.id);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = current.x + dx, y = current.y + dy, id = y * cols + x;
        if (x < 0 || y < 0 || x >= cols || y >= rows || closed.has(id) || !canStand(x * step, y * step)) continue;
        if (dx && dy && (!canStand(current.x * step, y * step) || !canStand(x * step, current.y * step))) continue;
        const nextCost = cost.get(current.id) + Math.hypot(dx, dy);
        if (nextCost >= (cost.get(id) ?? Infinity)) continue;
        cost.set(id, nextCost); parents.set(id, current); open.set(id, { x, y, id });
      }
    }
    return [];
  }
  const lessons = {
    stasinshina: {
      teacher: 'Стасиншина', courseId: 'web-layout', title: 'Первый корпус · HTML-вёрстка', portrait: 'stasinshina', background: 'assets/classrooms/popov/bg-windows.webp',
      nodes: {
        start: { speaker: 'Рассказчик', text: '{name} заходит в аудиторию 1406. На доске — HTML-вёрстка: сегодня нужно собрать первую веб-страницу.', emotion: 'calm', next: 'greeting' },
        greeting: { speaker: 'Стасиншина', text: 'Проходи, {name}. Открывай редактор — начинаем вёрстку. Готов?', emotion: 'calm', choices: [{ text: 'Да, я готов. С чего начнём?', next: 'ready' }, { text: 'Я сначала уточню: мы точно в нужном корпусе?', next: 'campus' }] },
        ready: { speaker: 'Стасиншина', text: 'Создай index.html. Добавим заголовок страницы, абзац и ссылку — сначала без оформления.', emotion: 'calm', next: 'task' },
        campus: { speaker: 'Стасиншина', text: 'В первом корпусе, в 1406. И на HTML-вёрстке. Адрес страницы будем выяснять уже в браузере.', emotion: 'surprised', next: 'task' },
        task: { speaker: 'Стасиншина', text: 'Что задаёт структуру веб-страницы?', emotion: 'calm', choices: [{ text: 'HTML: элементы и их вложенность.', next: 'answer' }, { text: 'CSS: цвета и размеры шрифта.', next: 'styles' }] },
        answer: { speaker: 'Стасиншина', text: 'Верно. HTML задаёт структуру, а CSS отвечает за оформление. Начни с <h1>, <p> и <a href="...">.', emotion: 'calm', next: 'end' },
        styles: { speaker: 'Стасиншина', text: 'Это оформление. Для структуры нужен HTML: например, <h1> для заголовка и <p> для абзаца. Сначала каркас, потом красота.', emotion: 'surprised', next: 'end' },
        end: { speaker: 'Рассказчик', text: 'Каркас первой страницы готов. В браузере видны заголовок, текст и ссылка. Можно вернуться во двор.', emotion: 'calm', end: true },
      },
    },
    popov: {
      teacher: 'Попов', courseId: 'web-platforms', title: 'Третий корпус · Пара Попова', portrait: 'popov', background: 'assets/classrooms/popov/bg-board.webp',
      nodes: {
        start: { speaker: 'Рассказчик', text: '{name} открывает дверь компьютерного класса. Попов отрывается от монитора.', emotion: 'calm', next: 'greeting' },
        greeting: { speaker: 'Попов', text: '{name}, проходи. Раз уж пришёл — проверим, что помнишь про JavaScript.', emotion: 'calm', next: 'question' },
        question: { speaker: 'Попов', text: 'Чем let отличается от const?', emotion: 'calm', choices: [{ text: 'Переменной с let можно присвоить новое значение, с const — нельзя.', next: 'correct' }, { text: 'Const — это когда очень уверен в своём ответе.', next: 'joke' }] },
        correct: { speaker: 'Попов', text: 'Верно. И отдельно запомни: const не делает содержимое объекта неизменяемым.', emotion: 'calm', next: 'followup' },
        joke: { speaker: 'Попов', text: 'Уверенность — хорошо. Но присваивание нового значения const всё равно не пропустит.', emotion: 'surprised', next: 'followup' },
        followup: { speaker: 'Попов', text: 'Открой редактор. На практике сразу станет понятно.', emotion: 'calm', choices: [{ text: 'Открыть редактор и начать задание.', next: 'work' }, { text: 'Спросить, можно ли сегодня без ошибок.', next: 'errors' }] },
        work: { speaker: 'Попов', text: 'Отлично. Сначала пробуешь сам, потом разбираем вместе.', emotion: 'calm', next: 'end' },
        errors: { speaker: 'Попов', text: 'Можно. Но тогда отлаживать будет нечего. Начинай уже.', emotion: 'surprised', next: 'end' },
        end: { speaker: 'Рассказчик', text: 'Работа закончена. Звенит звонок — пора во двор. Следующая пара — HTML-вёрстка у Стасиншиной в первом корпусе.', emotion: 'calm', end: true },
      },
    },
  };
  const api = { characters, entrances, obstacles, canStand, nearEntrance, findPath, lessons };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
