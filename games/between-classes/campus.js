'use strict';

const D = window.CampusData;
const ui = id => document.getElementById(id);
const canvas = ui('campus-canvas'), context = canvas.getContext('2d');
const STORAGE_KEY = 'polytech-between-classes-campus-v1';
function readSave(key) { try { const value = JSON.parse(localStorage.getItem(key) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; } }
const menuSave = readSave('polytech-between-classes-v1'), worldSave = readSave(STORAGE_KEY);
const requested = new URLSearchParams(location.search).get('character') || menuSave.characterId;
const character = Object.hasOwn(D.characters, requested) ? requested : 'vlad';
const completed = new Set(Array.isArray(worldSave.completed) ? worldSave.completed.filter(id => Object.hasOwn(D.lessons, id)) : []);
const oldPosition = worldSave.position;
const player = oldPosition && D.canStand(oldPosition.x, oldPosition.y) ? { x: oldPosition.x, y: oldPosition.y, row: 0, phase: 0 } : { x: 810, y: 865, row: 0, phase: 0 };
const keys = new Map(), pad = new Set();
const keyMap = { ArrowUp:'up', w:'up', ц:'up', ArrowDown:'down', s:'down', ы:'down', ArrowLeft:'left', a:'left', ф:'left', ArrowRight:'right', d:'right', в:'right' };
let map = null, sprite = null, route = [], paused = false, activeLesson = null, nodeId = null, enteredAt = null, lastTime = 0, nearbyId = null;

document.body.classList.toggle('large-text', menuSave.largeText === true);
document.body.classList.toggle('no-animation', menuSave.animations === false);
ui('campus-player').textContent = D.characters[character];
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version:1, position:{x:player.x,y:player.y}, completed:[...completed] })); } catch { /* The current session remains playable without storage. */ } }
function clearMovement() { keys.clear(); pad.clear(); route = []; player.phase = 0; document.querySelectorAll('[data-move]').forEach(b => b.classList.remove('active')); }
function message(text) { ui('campus-message').textContent = text; }
function updateProgress() { ui('campus-progress').textContent = `Знакомства с парами: ${completed.size} / 2`; }
function isActive() { return !!map && !!sprite && !paused && !activeLesson && !document.hidden; }
function updatePrompt() {
  const entrance = isActive() ? D.nearEntrance(player) : null;
  ui('entry-prompt').hidden = !entrance;
  if (!entrance) { nearbyId = null; return; }
  if (nearbyId === entrance.id) return;
  nearbyId = entrance.id;
  ui('entry-description').textContent = `${entrance.name}\n${entrance.teacher || 'Пара пока не назначена'}${completed.has(entrance.lesson) ? ' · можно повторить' : ''}`;
  ui('enter-building').disabled = !entrance.lesson;
}
function startLesson() {
  if (!isActive()) return;
  // Always check proximity again at activation time, rather than trusting UI state.
  const entrance = D.nearEntrance(player);
  if (!entrance?.lesson) return;
  enteredAt = { x:player.x, y:player.y, row:player.row };
  activeLesson = { ...D.lessons[entrance.lesson], id:entrance.lesson };
  clearMovement(); updatePrompt();
  ui('novel-background').src = activeLesson.background;
  ui('lesson-title').textContent = activeLesson.title;
  ui('novel').hidden = false;
  document.querySelector('.campus-header').inert = true;
  document.querySelector('.campus-page>main').inert = true;
  showNode('start'); save();
}
function showNode(id) {
  nodeId = id;
  const node = activeLesson.nodes[id];
  ui('novel-speaker').textContent = node.speaker;
  ui('novel-text').textContent = node.text.replaceAll('{name}', D.characters[character]);
  ui('teacher-portrait').src = `assets/characters/${activeLesson.portrait}/${node.emotion || 'calm'}.${activeLesson.portrait === 'popov' ? 'webp' : 'png'}`;
  ui('teacher-portrait').alt = activeLesson.teacher;
  const choices = ui('novel-choices'); choices.replaceChildren();
  for (const [index, choice] of (node.choices || []).entries()) {
    const button = document.createElement('button'); button.textContent = `${index + 1}. ${choice.text}`;
    button.addEventListener('click', () => { if (!paused && activeLesson?.nodes[nodeId] === node) showNode(choice.next); });
    choices.append(button);
  }
  ui('novel-next').hidden = !!node.choices;
  ui('novel-next').textContent = node.end ? 'Выйти во двор →' : 'Дальше →';
  (node.choices ? choices.firstElementChild : ui('novel-next')).focus({preventScroll:true});
}
function leaveLesson(finished = false) {
  if (!activeLesson) return;
  const teacher = activeLesson.teacher;
  if (finished) completed.add(activeLesson.id);
  activeLesson = null; nodeId = null; clearMovement();
  if (enteredAt) Object.assign(player, enteredAt);
  enteredAt = null; ui('novel').hidden = true;
  document.querySelector('.campus-header').inert = false;
  document.querySelector('.campus-page>main').inert = false;
  updateProgress(); updatePrompt(); save(); canvas.focus({preventScroll:true});
  message(finished ? `Знакомство с парой завершено. ${teacher} остаётся в своём корпусе.` : 'Ты снова во дворе. В пару можно зайти ещё раз.');
}
function advance() { if (!activeLesson || paused) return; const node = activeLesson.nodes[nodeId]; if (node.choices) return; if (node.end) leaveLesson(true); else if (node.next) showNode(node.next); }
function pause() { if (paused) return; paused = true; clearMovement(); updatePrompt(); save(); ui('campus-pause-dialog').showModal(); }
function resume() { paused = false; updatePrompt(); if (activeLesson) (ui('novel-choices').firstElementChild || ui('novel-next')).focus({preventScroll:true}); else canvas.focus({preventScroll:true}); }

function draw() {
  context.clearRect(0,0,1536,1024);
  if (map) context.drawImage(map,0,0,1536,1024);
  if (map) for (const entrance of D.entrances.filter(e => e.lesson)) {
    const close = nearbyId === entrance.id;
    context.fillStyle = close ? '#5fd4ff' : '#12263de8'; context.strokeStyle = '#8fe3ff'; context.lineWidth = 2;
    context.beginPath(); context.arc(entrance.x,entrance.y-12,17,0,Math.PI*2); context.fill(); context.stroke();
    context.fillStyle = close ? '#0b1c30' : '#f4f1ea'; context.font = 'bold 17px Nunito, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(String(entrance.building), entrance.x,entrance.y-12);
  }
  if (sprite) {
    const sw=sprite.naturalWidth/3, sh=sprite.naturalHeight/4, height=72, width=height*sw/sh;
    const column=[0,1,0,2][Math.floor(player.phase)%4];
    context.fillStyle='#07162455';context.beginPath();context.ellipse(player.x,player.y,11,4,0,0,Math.PI*2);context.fill();
    context.drawImage(sprite,column*sw,player.row*sh,sw,sh,player.x-width/2,player.y-height*.9,width,height);
  }
}
function tick(time) {
  const dt=lastTime ? Math.min((time-lastTime)/1000,.05) : 0; lastTime=time;
  if (isActive()) {
    const active = new Set([...keys.values(),...pad]);
    let dx=Number(active.has('right'))-Number(active.has('left')), dy=Number(active.has('down'))-Number(active.has('up'));
    let distance=185*dt;
    if (!dx && !dy && route.length) {
      const target=route[0];dx=target.x-player.x;dy=target.y-player.y;
      if (Math.hypot(dx,dy)<2) { route.shift(); if (!route.length) save(); dx=dy=0; }
      else distance=Math.min(distance,Math.hypot(dx,dy));
    }
    const length=Math.hypot(dx,dy), before={x:player.x,y:player.y};
    if (length) {
      dx/=length;dy/=length;
      const x=player.x+dx*distance,y=player.y+dy*distance;
      if (D.canStand(x,player.y)) player.x=x;
      if (D.canStand(player.x,y)) player.y=y;
      player.row=Math.abs(dx)>Math.abs(dy)?(dx>0?2:1):(dy>0?0:3);
    }
    if (Math.hypot(player.x-before.x,player.y-before.y)>.01) player.phase+=dt*7;
    else player.phase=0;
  }
  updatePrompt();draw();requestAnimationFrame(tick);
}
function goTo(x,y) {
  if (!isActive()) return;
  const entrance = D.entrances.find(e=>Math.hypot(x-e.x,y-e.y)<60);
  const goal = entrance ? {x:entrance.x,y:entrance.y} : {x,y};
  const path = D.findPath(player,goal);
  clearMovement(); route=path;
  message(path.length ? (entrance ? `Идём: ${entrance.name.toLowerCase()}. У двери нажми E или «Войти».` : '') : 'Здесь не пройти. Выбери место на дорожке.');
}
canvas.addEventListener('pointerdown',event=>{canvas.focus({preventScroll:true});const r=canvas.getBoundingClientRect();goTo((event.clientX-r.left)*1536/r.width,(event.clientY-r.top)*1024/r.height);});
document.addEventListener('keydown',event=>{
  if (event.key==='Escape') { if (!ui('campus-pause-dialog').open) { event.preventDefault();pause(); } return; }
  if (paused) return;
  if (activeLesson) {
    if (event.repeat) return;
    const choice=Number(event.key)-1;
    if (/^[1-9]$/.test(event.key)) { const button=ui('novel-choices').children[choice];if(button){event.preventDefault();button.click();} }
    else if ((event.key===' '||event.key==='Enter') && !event.target.closest('button,a,input,select')) {event.preventDefault();advance();}
    return;
  }
  if ((event.key.toLowerCase()==='e'||event.key.toLowerCase()==='у') && !event.repeat && !event.target.closest('a,input,select')) { event.preventDefault();startLesson();return; }
  if (event.target.closest('button,a,input,select')) return;
  const direction=keyMap[event.key] || keyMap[event.key.toLowerCase()];if(direction){event.preventDefault();keys.set(event.code,direction);route=[];}
});
document.addEventListener('keyup',event=>{keys.delete(event.code);if(!keys.size)save();});
window.addEventListener('blur',()=>{clearMovement();save();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearMovement();save();if(!paused)pause();}});
window.addEventListener('pagehide',save);
for (const button of document.querySelectorAll('[data-move]')) {
  const start=()=>{if(!isActive())return;pad.add(button.dataset.move);route=[];button.classList.add('active');};
  const stop=()=>{pad.delete(button.dataset.move);button.classList.remove('active');save();};
  button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);start();});
  for(const event of ['pointerup','pointercancel','lostpointercapture','blur'])button.addEventListener(event,stop);
  button.addEventListener('keydown',event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();start();}});button.addEventListener('keyup',stop);
}
ui('enter-building').addEventListener('click',startLesson);
ui('novel-next').addEventListener('click',advance);
ui('leave-lesson').addEventListener('click',()=>leaveLesson(false));
ui('campus-pause').addEventListener('click',pause);
ui('campus-resume').addEventListener('click',()=>ui('campus-pause-dialog').close());
ui('campus-pause-dialog').addEventListener('close',resume);
function loadImage(path){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(path));image.src=path;});}
Promise.all([loadImage('assets/campus/campus-map-v4.png'),loadImage(`assets/walk/${character}.png`)]).then(([background,actor])=>{
  map=background;sprite=actor;ui('campus-loading').hidden=true;updatePrompt();canvas.focus({preventScroll:true});
}).catch(()=>{ui('campus-loading').textContent='Не удалось загрузить кампус. Обнови страницу, чтобы попробовать ещё раз.';});
updateProgress();requestAnimationFrame(tick);
