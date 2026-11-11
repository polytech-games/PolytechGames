'use strict';
const D=window.CampusData,Story=window.CampusStory,Events=window.CampusEvents;
const ui=id=>document.getElementById(id), canvas=ui('campus-canvas'), context=canvas.getContext('2d');
function readSave(key){try{const v=JSON.parse(localStorage.getItem(key)||'{}');return v&&typeof v==='object'?v:{};}catch{return {};}}
const menuSave=readSave('polytech-between-classes-v1');
const query=new URLSearchParams(location.search),Day=window.CampusDay.createModel(query.get('day')||menuSave.dayId);
const campusEntrances=D.entrances.filter(e=>e.building===1||Day.definitions.some(d=>d.building===e.building));
const STORAGE_KEY='polytech-between-classes-campus-v2'+(Day.dayId==='friday'?'':':'+Day.dayId);
const requested=query.get('character')||menuSave.characterId;
const character=Object.hasOwn(D.characters,requested)?requested:'vlad';
let state=Day.restore(readSave(STORAGE_KEY),character);
if(!D.canStand(state.position.x,state.position.y))state.position={x:810,y:865,row:0};
const player={...state.position,phase:0},keys=new Map();
const keyMap={ArrowUp:'up',w:'up',ц:'up',ArrowDown:'down',s:'down',ы:'down',ArrowLeft:'left',a:'left',ф:'left',ArrowRight:'right',d:'right',в:'right'};
let map=null,sprite=null,route=[],paused=false,lastTime=0,lastSave=0,nearbyId=null,actionRevision=0;
const actionDialog=ui('day-action-dialog'),pauseDialog=ui('campus-pause-dialog');
const HEAD_PORTRAIT='assets/characters/head/calm.png',HEAD_OFFICE='assets/classrooms/head/office.png';
document.body.classList.toggle('large-text',menuSave.largeText===true);
document.body.classList.toggle('no-animation',menuSave.animations===false);
ui('campus-player').textContent=D.characters[character];
ui('day-name').textContent=Day.dayName.toUpperCase();
ui('results-day').textContent=`${Day.dayName.toUpperCase()} · ${Day.definitions.length} ${Day.definitions.length===1?'ПАРА':'ПАРЫ'}`;
function save(){state.position={x:player.x,y:player.y,row:player.row};try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{}}
function clearMovement(){keys.clear();route=[];player.phase=0;}
function message(text){ui('campus-message').textContent=text;}
function worldActive(){return !!map&&!!sprite&&!paused&&!state.scene&&!state.finished&&!document.hidden&&!actionDialog.open&&!pauseDialog.open;}
function inertWorld(value){document.querySelector('.campus-header').inert=value;document.querySelector('.campus-page>main').inert=value;}
function action(title,text,options){
  clearMovement();ui('action-title').textContent=title;ui('action-text').textContent=text;
  const revision=++actionRevision,buttons=ui('action-buttons');buttons.replaceChildren();
  for(const option of options){const button=document.createElement('button');button.textContent=option.label;button.disabled=option.disabled===true;if(option.primary)button.className='primary';button.addEventListener('click',()=>{if(revision!==actionRevision)return;actionRevision++;actionDialog.close();option.run?.();save();});buttons.append(button);}
  if(!actionDialog.open)actionDialog.showModal();
}
function closeOption(){return {label:'Вернуться во двор',run:()=>canvas.focus({preventScroll:true})};}
actionDialog.addEventListener('close',()=>{lastTime=performance.now();save();if(!state.scene&&!state.finished)canvas.focus({preventScroll:true});});
function updateHUD(){
  ui('day-clock').textContent=Day.format(state.clock);
  const d=Day.next(state),pending=Day.pendingPermits(state)[0];
  ui('day-lesson').textContent=d?`${state.clock<d.start?'Следующая':'Сейчас'}: ${d.title} · ${Day.format(d.start)}–${Day.format(d.end)} · ${d.room}`:'Занятия позади';
  let goal='Демо-день завершён';
  if(d){const r=Day.record(state,d.id);goal=pending?'Допуск: заведующая в первом корпусе':r.permitGranted&&r.admittedAt===null?`Допуск получен — вернись в корпус ${d.building}`:r.admittedAt!==null?`Вернись на пару: корпус ${d.building}, ${d.room}`:`${state.clock<d.start?'До звонка':'На пару'}: корпус ${d.building}, аудитория ${d.room}`;}
  ui('day-goal').textContent=goal;ui('skip-lesson').disabled=!d||!worldActive();
  ui('time-speed').textContent=`×${state.speed}`;
  ui('time-speed').setAttribute('aria-label',`Скорость времени ×${state.speed}. Нажми, чтобы изменить`);
  for(const id of ['time-speed','wait-time','day-clock','day-goal'])ui(id).disabled=!worldActive();
  ui('campus-progress').textContent=`Пройдено: ${state.records.filter(r=>r.status==='completed').length} / ${Day.definitions.length}`;
}
function updatePrompt(){
  const entrance=worldActive()?D.nearEntrance(player):null,spot=!entrance&&worldActive()?Events.near(player):null;
  ui('entry-prompt').hidden=!entrance&&!spot;nearbyId=entrance?.id||spot?.id||null;if(!nearbyId)return;
  const d=entrance&&Day.definitions.find(d=>d.building===entrance.building);
  ui('entry-description').textContent=spot?`${spot.title}\nЕсть минутка?`:entrance.building===1?'Первый корпус\nПары / заведующая':d?`${entrance.name}\n${d.teacher}`:`${entrance.name}\nПара пока не назначена`;
  const enter=ui('enter-building');enter.disabled=!!entrance&&entrance.building!==1&&!d;
  if(enter.dataset.target!==nearbyId){enter.dataset.target=nearbyId;const key=document.createElement('kbd');key.textContent='E';enter.replaceChildren(key,document.createTextNode(spot?spot.prompt:'Войти'));}
}
function openCampusEvent(spot){
  const previous=state.campusEvents.find(e=>e.id===spot.id);
  if(previous){action(spot.title,`Сегодня ты уже здесь задерживался. ${previous.text}`,[closeOption()]);return;}
  action(spot.title,spot.text,[...spot.choices.map(c=>({label:c.label,run:()=>{
    const result=Events.consume(state,Day,spot.id,c.id);if(!result)return;
    action(spot.title,`${result.text}${result.minutes?'\n\nПрошло '+result.minutes+' мин. Сейчас '+Day.format(state.clock)+'.':''}`,[{label:state.finished?'Посмотреть итог дня':'Вернуться во двор',primary:true,run:()=>{if(state.finished)showResults();}}]);
  }})),]);
}
function openSchedule(){
  if(!worldActive())return;
  const status={pending:'Ещё не был',present:'На паре',completed:'Завершена','left-early':'Вышел раньше',missed:'Прогул'};
  action(`Расписание · ${Day.dayName}`,`Сейчас ${Day.format(state.clock)}. Выбери оставшуюся пару — персонаж пойдёт к нужному корпусу.`,[
    ...Day.definitions.map(d=>({label:`${Day.format(d.start)}–${Day.format(d.end)} · ${d.title}\n${d.teacher} · корпус ${d.building}, ${d.room} · ${status[Day.record(state,d.id).status]}`,disabled:state.clock>=d.end||Day.record(state,d.id).status==='completed',run:()=>walkToBuilding(d.building)})),closeOption(),
  ]);
}
function walkToBuilding(building){const entrance=campusEntrances.find(e=>e.building===building);if(entrance)goTo(entrance.x,entrance.y);}
function interact(){if(!worldActive())return;const e=D.nearEntrance(player);if(!e){const spot=Events.near(player);if(spot)openCampusEvent(spot);return;}if(!campusEntrances.includes(e))return;clearMovement();
  if(e.building===1){
    const available=Day.definitions.filter(d=>d.building===1&&state.clock<d.end&&Day.record(state,d.id).status!=='completed');
    action('Первый корпус',available.length?'Выбери пару или зайди к заведующей.':'На сегодня все пары в этом корпусе закончились.',[
      ...available.map((d,index)=>({label:`${d.teacher} · ${d.title} · ${d.room} · ${Day.format(d.start)}`,primary:index===0,run:()=>requestLesson(d.id)})),
      {label:'К заведующей · получить допуск',run:openHead},closeOption()]);
  }else{const d=Day.definitions.find(d=>d.building===e.building);if(d)requestLesson(d.id);}
}
function requestLesson(recordId){const d=Day.definition(recordId);if(!d)return;const result=Day.admit(state,d.id);save();
  if(result==='closed'){action('Пара закончилась','На это занятие уже не зайти. Посмотри следующую пару в расписании.',[closeOption()]);return;}
  if(result==='early'){action('До звонка ещё есть время',`${d.title} начинается в ${Day.format(d.start)}. Подождать у аудитории?`,[{label:'Дождаться начала пары',primary:true,run:()=>{Day.jump(state,d.start);requestLesson(recordId);}},closeOption()]);return;}
  if(result==='permit'){openScene({type:'reaction',recordId:d.id,reason:'permit'});return;}
  if(result==='resume'){openScene({type:'lesson',recordId:d.id});return;}
  openScene({type:'reaction',recordId:d.id,reason:result});
}
function openHead(){const pending=Day.pendingPermits(state)[0];
  if(!pending){action('Кабинет заведующей','Сейчас действующий допуск не требуется. Если пара уже закончилась, разрешение не отменит прогул.',[closeOption()]);return;}
  openScene({type:'head',recordId:pending.id});
}
function openScene(scene){clearMovement();state.scene=scene;ui('novel').hidden=false;inertWorld(true);renderScene();updatePrompt();save();}
function finishScene(){state.scene=null;ui('novel').hidden=true;inertWorld(false);clearMovement();lastTime=performance.now();save();canvas.focus({preventScroll:true});updateHUD();updatePrompt();if(state.finished)showResults();}
function exitScene(){const scene=state.scene;if(!scene)return;if(scene.type==='lesson'||(scene.type==='reaction'&&Day.record(state,scene.recordId).admittedAt!==null))Day.leave(state,scene.recordId);finishScene();message('Ты снова во дворе. Часы идут.');}
function renderScene(){const scene=state.scene;if(!scene)return;const d=Day.definition(scene.recordId),r=Day.record(state,d.id),lesson=D.lessons[d.lessonId];
  const isHead=scene.type.startsWith('head');
  ui('novel-background').src=isHead?HEAD_OFFICE:lesson.background;
  ui('novel-background').alt=isHead?'Кабинет заведующей':'Аудитория';
  ui('lesson-title').textContent=isHead?'Первый корпус · Кабинет заведующей':lesson.title;
  const portrait=ui('teacher-portrait');portrait.src=isHead?HEAD_PORTRAIT:`assets/characters/${lesson.portrait}/${scene.type==='reaction'&&scene.reason!=='on-time'?(lesson.reactionEmotion||'surprised'):scene.type==='lesson'?(lesson.nodes[r.node]?.emotion||'calm'):'calm'}.${lesson.portrait==='popov'?'webp':'png'}`;portrait.alt=isHead?'Заведующая':lesson.teacher;portrait.classList.toggle('head-portrait',isHead);
  const choices=ui('novel-choices');choices.replaceChildren();ui('novel-next').hidden=false;
  let text='',speaker=isHead?'Заведующая':lesson.teacher,nextLabel='Дальше →',nextAction=null;
  function choice(label,run){const button=document.createElement('button');button.textContent=`${choices.children.length+1}. ${label}`;button.addEventListener('click',()=>{if(paused||state.scene!==scene)return;run();save();});choices.append(button);}
  if(scene.type==='reaction'){
    if(scene.reason==='permit'){text=`Больше получаса опоздания, ${D.characters[character]}. Сначала получи допуск у заведующей в первом корпусе, потом возвращайся — до ${Day.format(d.end)}.`;nextLabel='Идти за допуском →';nextAction=()=>{finishScene();message('Заведующая — первый корпус. Допуск нужен именно на эту пару.');};}
    else {text=scene.reason==='on-time'?`Вовремя, ${D.characters[character]}. Проходи, начинаем.`:scene.reason==='warning'?`Уже ${Math.ceil(r.lateSeconds/60)} минут опоздания. Это выговор, ${D.characters[character]}. Проходи, но больше так не делай.`:scene.reason==='with-permit'?'Допуск вижу. Проходи. В следующий раз приходи вовремя.':`Немного опоздал, ${D.characters[character]}. Заходи тихо, уже начали.`;nextAction=()=>{state.scene={type:'lesson',recordId:d.id};renderScene();save();};}
  } else if(scene.type==='head') {
    text=`${D.characters[character]}, снова опоздание? Нужен допуск на «${d.title}». Что случилось?`;
    for(const reason of ['Проспал. Постараюсь больше не опаздывать.','Перепутал корпус. Теперь дорогу запомнил.'])choice(reason,()=>{if(!Day.grant(state,d.id,reason)){finishScene();return;}state.scene={type:'head-granted',recordId:d.id};renderScene();});
  } else if(scene.type==='head-granted') {
    text=r.permitReason?.startsWith('Проспал')?'Будильник завтра поставь заранее. Допуск подписан. Возвращайся к преподавателю.':'Сначала смотри расписание, потом гуляй между корпусами. Допуск подписан, иди на пару.';
    nextLabel='Вернуться во двор →';nextAction=finishScene;
  } else {
    if(!Object.hasOwn(lesson.nodes,r.node))r.node='start';const node=Story.view(r,lesson);
    speaker=node.speaker;text=node.text.replaceAll('{name}',D.characters[character]);
    if(node.choices)for(const [index,c] of node.choices.entries()){const nodeId=r.node;choice(c.text,()=>{if(Story.choose(r,lesson,nodeId,index))renderScene();});}
    nextLabel=node.end?'Закончить пару →':'Дальше →';nextAction=()=>{if(node.end){Story.finish(r,lesson);Day.complete(state,d.id);finishScene();message(`Звонок. ${Day.format(d.end)} — пара закончилась.`);}else{Story.advance(r,lesson);renderScene();save();}};
  }
  ui('novel-speaker').textContent=speaker;ui('novel-text').textContent=text;ui('novel-next').textContent=nextLabel;ui('novel-next').hidden=choices.children.length>0;
  ui('novel-next').onclick=()=>{if(!paused&&state.scene===scene)nextAction?.();save();};
  (choices.firstElementChild||ui('novel-next')).focus({preventScroll:true});
}
function showResults(){clearMovement();ui('day-results').hidden=false;ui('novel').hidden=true;inertWorld(true);const list=ui('results-list');list.replaceChildren();
  for(const r of Day.summary(state)){const article=document.createElement('article');article.className='result-card';const title=document.createElement('h3');title.textContent=`${r.slot}. ${r.title}`;article.append(title);
    const lines=[r.status==='completed'?'Пара завершена':r.status==='missed'?'Прогул':'Ушёл раньше окончания',`Опоздание: ${r.lateMinutes} мин. · Выговор: ${r.warning?'да':'нет'} · Допуск: ${r.permitGranted?'получен'+(r.status==='missed'?' (пара всё равно пропущена)':''):r.permitRequested?'не получен':'не требовался'}`,`Ранний уход: ${r.leftEarly?'да':'нет'}`,r.comment];
    if(r.story?.outcome)lines.push(`Чем запомнилась: ${r.story.outcome}`);
    if(r.story?.events?.length)lines.push('На паре: '+r.story.events.join(' '));
    for(const text of lines){const p=document.createElement('p');p.textContent=text;article.append(p);}list.append(article);
  }
  if(state.campusEvents.length){const article=document.createElement('article');article.className='result-card';const h=document.createElement('h3');h.textContent='Между парами';article.append(h);
    for(const event of state.campusEvents){const p=document.createElement('p');p.textContent=`${Day.format(event.time)} · ${event.title} · ${event.minutes} мин. ${event.text}`;article.append(p);}list.append(article);}
  ui('replay-day').focus({preventScroll:true});save();
}
function pause(){if(paused||state.finished)return;paused=true;clearMovement();save();if(!pauseDialog.open)pauseDialog.showModal();updatePrompt();}
function resume(){paused=false;lastTime=performance.now();if(state.scene)renderScene();else canvas.focus({preventScroll:true});}
function draw(){context.clearRect(0,0,1536,1024);if(map)context.drawImage(map,0,0,1536,1024);
  if(map&&route.length){context.save();context.strokeStyle='#5fd4ff';context.lineWidth=5;context.setLineDash([10,9]);context.beginPath();context.moveTo(player.x,player.y);for(const point of route)context.lineTo(point.x,point.y);context.stroke();context.restore();}
  if(map)for(const spot of Events.spots){context.fillStyle=state.campusEvents.some(e=>e.id===spot.id)?'#526071e8':'#704622ed';context.strokeStyle=nearbyId===spot.id?'#fff':'#f5c76b';context.lineWidth=2;context.beginPath();context.arc(spot.x,spot.y-14,23,0,Math.PI*2);context.fill();context.stroke();context.fillStyle='#fff';context.font='bold 10px Nunito,sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(spot.mark,spot.x,spot.y-14);}
  if(map)for(const e of campusEntrances){context.fillStyle=nearbyId===e.id?'#5fd4ff':'#12263de8';context.strokeStyle='#8fe3ff';context.lineWidth=2;context.beginPath();context.arc(e.x,e.y-12,17,0,Math.PI*2);context.fill();context.stroke();context.fillStyle='#f4f1ea';context.font='bold 17px Nunito,sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(String(e.building),e.x,e.y-12);}
  if(sprite){const sw=sprite.naturalWidth/3,sh=sprite.naturalHeight/4,height=72,width=height*sw/sh,column=[0,1,0,2][Math.floor(player.phase)%4];context.fillStyle='#07162499';context.strokeStyle='#5fd4ff';context.lineWidth=2;context.beginPath();context.ellipse(player.x,player.y,16,6,0,0,Math.PI*2);context.fill();context.stroke();context.drawImage(sprite,column*sw,player.row*sh,sw,sh,player.x-width/2,player.y-height*.9,width,height);}
}
function tick(time){const elapsed=lastTime?Math.max(0,(time-lastTime)/1000):0,dt=Math.min(elapsed,.05);lastTime=time;
  if(worldActive()){
    Day.advance(state,elapsed);if(state.finished)showResults();
    const active=new Set(keys.values());let dx=Number(active.has('right'))-Number(active.has('left')),dy=Number(active.has('down'))-Number(active.has('up')),distance=185*dt;
    if(!dx&&!dy&&route.length){const goal=route[0];dx=goal.x-player.x;dy=goal.y-player.y;if(Math.hypot(dx,dy)<2){route.shift();dx=dy=0;}else distance=Math.min(distance,Math.hypot(dx,dy));}
    const length=Math.hypot(dx,dy),before={x:player.x,y:player.y};if(length){dx/=length;dy/=length;const x=player.x+dx*distance,y=player.y+dy*distance;if(D.canStand(x,player.y))player.x=x;if(D.canStand(player.x,y))player.y=y;player.row=Math.abs(dx)>Math.abs(dy)?(dx>0?2:1):(dy>0?0:3);}
    player.phase=Math.hypot(player.x-before.x,player.y-before.y)>.01?player.phase+dt*7:0;
    if(time-lastSave>1000){save();lastSave=time;}
  }
  updateHUD();updatePrompt();draw();requestAnimationFrame(tick);
}
function goTo(x,y){if(!worldActive())return;const e=D.entrances.find(e=>Math.hypot(x-e.x,y-e.y)<60),spot=!e&&Events.spots.find(s=>Math.hypot(x-s.x,y-s.y)<50),goal=e?{x:e.x,y:e.y}:spot?{x:spot.x,y:spot.y}:{x,y};clearMovement();route=D.findPath(player,goal);message(route.length?(e?`Идём: ${e.name.toLowerCase()}. У двери нажми E.`:spot?`Идём: ${spot.title.toLowerCase()}. Нажми E рядом.`:''):'Здесь не пройти. Выбери дорожку.');}
canvas.addEventListener('pointerdown',event=>{canvas.focus({preventScroll:true});const r=canvas.getBoundingClientRect();goTo((event.clientX-r.left)*1536/r.width,(event.clientY-r.top)*1024/r.height);});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){if(!pauseDialog.open&&!actionDialog.open&&!state.finished){event.preventDefault();pause();}return;}
  if(paused||actionDialog.open||state.finished)return;
  if(state.scene){if(event.repeat)return;if(/^[1-9]$/.test(event.key)){event.preventDefault();ui('novel-choices').children[Number(event.key)-1]?.click();}else if((event.key===' '||event.key==='Enter')&&!event.target.closest('button,a,input,select')){event.preventDefault();ui('novel-next').click();}return;}
  if(['e','у'].includes(event.key.toLowerCase())&&!event.repeat&&!event.target.closest('a,input,select')){event.preventDefault();interact();return;}
  if(event.target.closest('button,a,input,select'))return;const direction=keyMap[event.key]||keyMap[event.key.toLowerCase()];if(direction){event.preventDefault();keys.set(event.code,direction);route=[];}
});
document.addEventListener('keyup',event=>{keys.delete(event.code);save();});
window.addEventListener('blur',()=>{clearMovement();save();});document.addEventListener('visibilitychange',()=>{lastTime=performance.now();if(document.hidden){clearMovement();save();if(!paused&&!state.finished)pause();}});window.addEventListener('pagehide',save);
ui('enter-building').addEventListener('click',interact);ui('leave-lesson').addEventListener('click',exitScene);ui('campus-pause').addEventListener('click',pause);ui('campus-resume').addEventListener('click',()=>pauseDialog.close());pauseDialog.addEventListener('close',resume);
ui('day-clock').addEventListener('click',openSchedule);
ui('day-goal').addEventListener('click',()=>{if(!worldActive())return;const d=Day.next(state);if(d)walkToBuilding(Day.pendingPermits(state).length?1:d.building);});
ui('conversation-log').addEventListener('click',()=>{
  if(!state.scene||paused)return;const d=Day.definition(state.scene.recordId),r=Day.record(state,d.id),lesson=D.lessons[d.lessonId];
  const entries=Story.log(r,lesson);const text=entries.length?entries.map(e=>`${e.speaker}: ${e.text.replaceAll('{name}',D.characters[character])}`).join('\n\n'):'Разговор с преподавателем ещё не начался.';
  action('История разговора',text,[{label:'Назад к разговору',primary:true}]);
});
ui('time-speed').addEventListener('click',()=>{
  if(!worldActive())return;const speeds=[1,4,10];Day.setSpeed(state,speeds[(speeds.indexOf(state.speed)+1)%speeds.length]);
  lastTime=performance.now();save();updateHUD();message(`Часы ×${state.speed}. Ходьба остаётся с обычной скоростью.`);
});
ui('wait-time').addEventListener('click',()=>{
  if(!worldActive())return;const d=Day.next(state);if(!d)return;
  const options=[5,15,30].map(minutes=>({label:`+${minutes} минут · ${Day.format(Math.min(Day.END,state.clock+minutes*60))}`,time:Math.min(Day.END,state.clock+minutes*60)}));
  if(state.clock<d.start)options.push({label:`К началу пары · ${Day.format(d.start)}`,time:d.start});
  for(const minutes of [5,15,31]){const time=d.start+minutes*60;if(time>state.clock&&time<d.end)options.push({label:`Опоздать на ${minutes} мин · ${Day.format(time)}`,time});}
  action('Пусть время пройдёт',`${d.title} · ${d.teacher}\nОжидание проходит во дворе: если пропустить конец пары, останется прогул или ранний уход. Назад время не перематывается.`,[
    ...options.map(o=>({label:o.label,run:()=>{Day.waitUntil(state,o.time);lastTime=performance.now();updateHUD();updatePrompt();if(state.finished)showResults();}})),
    closeOption(),
  ]);
});
ui('skip-lesson').addEventListener('click',()=>{if(!worldActive())return;const d=Day.next(state);if(!d)return;action('Прогулять пару?',`${d.title} · ${d.teacher} · ${Day.format(d.start)}–${Day.format(d.end)}. Время перейдёт к концу занятия.`,[{label:`Прогулять и дождаться ${Day.format(d.end)}`,primary:true,run:()=>{Day.skip(state,d.id);updateHUD();if(state.finished)showResults();}},closeOption()]);});
ui('replay-day').addEventListener('click',()=>{state=Day.create(character);Object.assign(player,state.position,{phase:0});ui('day-results').hidden=true;inertWorld(false);lastTime=performance.now();save();canvas.focus({preventScroll:true});});
function loadImage(path){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(path));image.src=path;});}
Promise.all([loadImage('assets/campus/campus-map-v4.png'),loadImage(`assets/walk/${character}.png`)]).then(([background,actor])=>{map=background;sprite=actor;ui('campus-loading').hidden=true;if(state.finished)showResults();else if(state.scene){const r=Day.record(state,state.scene.recordId),d=Day.definition(state.scene.recordId);if(!Object.hasOwn(D.lessons[d.lessonId].nodes,r.node))r.node='start';openScene(state.scene);}else canvas.focus({preventScroll:true});lastTime=performance.now();}).catch(()=>{ui('campus-loading').textContent='Не удалось загрузить кампус. Обнови страницу.';});
updateHUD();requestAnimationFrame(tick);
