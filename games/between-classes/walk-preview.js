'use strict';
// Sheet rows: south, west, east, north. Columns: idle, left step, right step.
// This is an art review scene, intentionally without campus collision geometry.
const canvas = document.getElementById('walk-canvas');
const ctx = canvas.getContext('2d');
const picker = document.getElementById('walk-character');
const status = document.getElementById('walk-status');
const sizeControl = document.getElementById('walk-size');
const pauseButton = document.getElementById('walk-pause');
const directionLabel = document.getElementById('walk-direction');
const names = {vlad:'Влад',adil:'Адиль',kirill:'Кирилл',jan:'Жан',damir:'Дамир',bakhytzhan:'Бакытжан',kamil:'Камиль',elaman:'Еламан'};
const directionNames = ['вниз','влево','вправо','вверх'];
const keyDirection = {ArrowDown:'down',s:'down',ы:'down',ArrowUp:'up',w:'up',ц:'up',ArrowLeft:'left',a:'left',ф:'left',ArrowRight:'right',d:'right',в:'right'};
const keys = new Map();
const padKeys = new Set();
const player = {x:810,y:865,row:0,phase:0};
const cache = new Map();
let sheet = null, map = null, target = null, paused = false, lastTime = 0, loadRevision = 0;
function loadImage(path){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(path));image.src=path;});}
function clearMovement(){keys.clear();padKeys.clear();target=null;document.querySelectorAll('.direction-pad button').forEach(b=>b.classList.remove('active'));}
async function chooseCharacter(){
  const revision=++loadRevision;sheet=null;clearMovement();player.phase=0;status.hidden=false;status.textContent='Загрузка персонажа…';
  const id=picker.value;
  try{if(!cache.has(id))cache.set(id,loadImage(`assets/walk/${id}.png`));const image=await cache.get(id);if(revision!==loadRevision)return;sheet=image;status.hidden=!!map;updateDirection();}
  catch{cache.delete(id);if(revision!==loadRevision)return;status.hidden=false;status.textContent='Не удалось загрузить персонажа. Выбери его ещё раз.';}
}
function updateDirection(){directionLabel.textContent=`${names[picker.value]} · ${directionNames[player.row]}`;}
function tick(time){
  const dt=lastTime?Math.min((time-lastTime)/1000,.05):0;lastTime=time;
  let dx=0,dy=0;
  if(!paused&&sheet&&map&&!document.hidden){
    const active=new Set([...keys.values(),...padKeys]);
    dx=Number(active.has('right'))-Number(active.has('left'));dy=Number(active.has('down'))-Number(active.has('up'));
    if(!dx&&!dy&&target){dx=target.x-player.x;dy=target.y-player.y;if(Math.hypot(dx,dy)<3){target=null;dx=dy=0;}}
    const length=Math.hypot(dx,dy);
    if(length){
      const distance=Math.min(155*dt,target?length:Infinity);dx/=length;dy/=length;
      player.x=Math.max(24,Math.min(1512,player.x+dx*distance));player.y=Math.max(55,Math.min(1000,player.y+dy*distance));
      const row=Math.abs(dx)>Math.abs(dy)?(dx>0?2:1):(dy>0?0:3);
      if(row!==player.row){player.row=row;updateDirection();}player.phase+=dt*6;
    }else player.phase=0;
  }
  ctx.clearRect(0,0,1536,1024);if(map)ctx.drawImage(map,0,0,1536,1024);
  if(sheet){
    const sw=sheet.naturalWidth/3,sh=sheet.naturalHeight/4;
    const height=Number(sizeControl.value),width=height*sw/sh;
    ctx.fillStyle='#081a2340';ctx.beginPath();ctx.ellipse(player.x,player.y,11,4,0,0,Math.PI*2);ctx.fill();
    const column=[0,1,0,2][Math.floor(player.phase)%4];
    ctx.drawImage(sheet,column*sw,player.row*sh,sw,sh,player.x-width/2,player.y-height*.9,width,height);
  }
  requestAnimationFrame(tick);
}
picker.addEventListener('change',()=>{chooseCharacter();canvas.focus({preventScroll:true});});
pauseButton.addEventListener('click',()=>{paused=!paused;clearMovement();pauseButton.textContent=paused?'Продолжить':'Пауза';pauseButton.setAttribute('aria-pressed',String(paused));});
document.addEventListener('keydown',event=>{if(['SELECT','INPUT','BUTTON'].includes(event.target.tagName))return;const direction=keyDirection[event.key];if(direction){event.preventDefault();keys.set(event.code,direction);target=null;}});
document.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',clearMovement);document.addEventListener('visibilitychange',clearMovement);
canvas.addEventListener('pointerdown',event=>{canvas.focus({preventScroll:true});if(paused)return;const r=canvas.getBoundingClientRect();target={x:Math.max(24,Math.min(1512,(event.clientX-r.left)*1536/r.width)),y:Math.max(55,Math.min(1000,(event.clientY-r.top)*1024/r.height))};});
for(const button of document.querySelectorAll('[data-direction]')){
  const stop=()=>{padKeys.delete(button.dataset.direction);button.classList.remove('active');};
  button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);padKeys.add(button.dataset.direction);button.classList.add('active');target=null;});
  button.addEventListener('pointerup',stop);button.addEventListener('pointercancel',stop);button.addEventListener('lostpointercapture',stop);
  button.addEventListener('keydown',event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();padKeys.add(button.dataset.direction);target=null;}});
  button.addEventListener('keyup',stop);button.addEventListener('blur',stop);
}
loadImage('assets/campus/campus-map-v4.png').then(image=>{map=image;if(sheet)status.hidden=true;}).catch(()=>{status.hidden=false;status.textContent='Не удалось загрузить карту кампуса.';});
chooseCharacter();requestAnimationFrame(tick);
