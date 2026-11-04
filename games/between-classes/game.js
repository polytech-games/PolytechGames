'use strict';

// Menu styling follows games/zhan-na-grani/src/style.css. Character identities
// come from both novels; student2 and kirill are the same person.
const CHARACTERS = [
  { id: 'vlad', name: 'Влад', image: 'vlad/idle.png', happy: 'vlad/happy.png', portraitHeight: '350%' },
  { id: 'adil', name: 'Адиль', image: 'adil/idle.webp', happy: 'adil/happy.webp', portraitHeight: '350%' },
  { id: 'kirill', name: 'Кирилл', image: 'kirill/idle.webp', happy: 'kirill/happy.webp', portraitHeight: '350%' },
  { id: 'jan', name: 'Жан', image: 'jan/idle.webp', happy: 'jan/smug.webp', portraitHeight: '350%' },
  { id: 'damir', name: 'Дамир', image: 'damir/neutral.webp', happy: 'damir/confident.webp', portraitHeight: '170%' },
  { id: 'bakhytzhan', name: 'Бакытжан', image: 'bakhytzhan/neutral.webp', happy: 'bakhytzhan/smug.webp', portraitHeight: '170%' },
  { id: 'kamil', name: 'Камиль', image: 'kamil/neutral.webp', happy: 'kamil/confident.webp', portraitHeight: '170%' },
  { id: 'elaman', name: 'Еламан', image: 'elaman/neutral.webp', happy: 'elaman/confident.webp', portraitHeight: '170%' },
];
const KEY = 'polytech-between-classes-v1';
const $ = (id) => document.getElementById(id);
const asset = (path) => `assets/characters/${path}`;
let saved = {};
let storageAvailable = true;
try { const raw = JSON.parse(localStorage.getItem(KEY) || '{}'); if (raw && typeof raw === 'object' && !Array.isArray(raw)) saved = raw; } catch { storageAvailable = false; }
let selectedId = CHARACTERS.some(c => c.id === saved.characterId) ? saved.characterId : 'vlad';
let confirmedId = CHARACTERS.some(c => c.id === saved.characterId) ? saved.characterId : null;
let currentScreen = 'menu';
const preferences = { animations: typeof saved.animations === 'boolean' ? saved.animations : !matchMedia('(prefers-reduced-motion: reduce)').matches, largeText: saved.largeText === true };

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ version: 1, characterId: confirmedId, ...preferences })); storageAvailable = true; }
  catch { storageAvailable = false; }
}
function updateMenu() {
  const character = CHARACTERS.find(c => c.id === confirmedId);
  $('new-game-label').textContent = character ? 'Сменить персонажа' : 'Выбрать персонажа';
  $('save-note').textContent = character ? `Твой персонаж — ${character.name}.${storageAvailable ? ' Выбор сохранён.' : ' Выбран для этой сессии.'}` : 'Твоя история начинается с выбора.';
  $('menu-actor').src = asset(character?.image || CHARACTERS[0].image);
}
function applyPreferences() {
  document.body.classList.toggle('no-animation', !preferences.animations);
  document.body.classList.toggle('large-text', preferences.largeText);
  $('animations').checked = preferences.animations;
  $('large-text').checked = preferences.largeText;
}
function showScreen(screen) {
  currentScreen = screen;
  for (const name of ['menu', 'select', 'ready']) $(`${name}-screen`).hidden = name !== screen;
  updateMenu();
  if (screen === 'select') document.querySelector('[role=radio][aria-checked=true]').focus({ preventScroll: true });
  else if (screen === 'menu') $('new-game').focus({ preventScroll: true });
  else $('ready-menu').focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
function selectCharacter(id, focus = false) {
  const index = CHARACTERS.findIndex(c => c.id === id);
  if (index < 0) return;
  const character = CHARACTERS[index];
  selectedId = id;
  document.querySelectorAll('.character-card').forEach(button => {
    const active = button.dataset.character === id;
    button.setAttribute('aria-checked', String(active));
    button.tabIndex = active ? 0 : -1;
    if (active && focus) button.focus({ preventScroll: true });
  });
  $('preview-image').src = asset(character.image);
  $('preview-image').alt = character.name;
  $('preview-name').textContent = character.name;
  $('preview-number').textContent = String(index + 1).padStart(2, '0');
  $('confirm-character').replaceChildren(document.createTextNode(`Играть за ${character.name === 'Жан' ? 'Жана' : ({Влад:'Влада',Адиль:'Адиля',Кирилл:'Кирилла',Дамир:'Дамира',Бакытжан:'Бакытжана',Камиль:'Камиля',Еламан:'Еламана'})[character.name]} `), Object.assign(document.createElement('span'), { textContent: '→' }));
  $('announcement').textContent = `Выбран персонаж: ${character.name}`;
}
for (const [index, character] of CHARACTERS.entries()) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'character-card'; button.dataset.character = character.id;
  button.setAttribute('role', 'radio'); button.setAttribute('aria-label', character.name);
  button.style.setProperty('--portrait-height', character.portraitHeight);
  button.innerHTML = `<span class="card-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><span class="card-check" aria-hidden="true">✓</span><div class="card-art"><img src="${asset(character.image)}" alt="" draggable="false"></div><span class="card-name">${character.name}</span>`;
  button.addEventListener('click', () => selectCharacter(character.id));
  $('roster').append(button);
}
$('roster').addEventListener('keydown', event => {
  const index = CHARACTERS.findIndex(c => c.id === selectedId);
  const offsets = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 };
  if (event.key in offsets) { event.preventDefault(); selectCharacter(CHARACTERS[(index + offsets[event.key] + CHARACTERS.length) % CHARACTERS.length].id, true); }
  else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); selectCharacter(CHARACTERS[event.key === 'Home' ? 0 : CHARACTERS.length - 1].id, true); }
  else if (event.key === 'Enter') { event.preventDefault(); $('confirm-character').click(); }
});
function openSelection() { selectCharacter(confirmedId || selectedId); showScreen('select'); }
$('new-game').addEventListener('click', openSelection);
$('back-menu').addEventListener('click', () => showScreen('menu'));
$('confirm-character').addEventListener('click', () => {
  confirmedId = selectedId; persist();
  const character = CHARACTERS.find(c => c.id === confirmedId);
  $('ready-title').replaceChildren(document.createTextNode(`${character.name},`), document.createElement('br'), document.createTextNode('увидимся на паре.'));
  $('ready-image').src = asset(character.happy); $('ready-image').alt = character.name;
  $('ready-screen').querySelector('.ready-copy>p').innerHTML = storageAvailable ? 'Выбор сохранён на этом устройстве.<br>Твоя история в Политехе начинается здесь.' : 'Персонаж выбран для этой сессии.<br>Браузер не разрешил сохранить выбор.';
  showScreen('ready');
});
$('ready-menu').addEventListener('click', () => showScreen('menu'));
$('change-character').addEventListener('click', openSelection);
$('how-to').addEventListener('click', () => $('help-dialog').showModal());
for (const id of ['settings-button', 'menu-settings']) $(id).addEventListener('click', () => $('settings-dialog').showModal());
$('help-select').addEventListener('click', () => { $('help-dialog').close(); openSelection(); });
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); });
}
for (const [id, key] of [['animations', 'animations'], ['large-text', 'largeText']]) $(id).addEventListener('change', event => { preferences[key] = event.target.checked; applyPreferences(); persist(); updateMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !document.querySelector('dialog[open]') && currentScreen !== 'menu') showScreen('menu'); });
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); showScreen('menu'); });
selectCharacter(selectedId); applyPreferences(); updateMenu();
