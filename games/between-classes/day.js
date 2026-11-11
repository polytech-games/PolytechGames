(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./data/schedule.json'), require('./lesson-formats.js'), require('./story.js'));
  else root.CampusDay = factory(root.CampusSchedule, root.CampusLessonFormats, root.CampusStory);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (schedule, Formats, Story) {
  'use strict';
  const playableDays=schedule.days.filter(day=>schedule.playableDayIds.includes(day.id));
  const defaultDay=playableDays.find(day=>day.id==='friday');
  function createModel(requestedDayId){
  const day=playableDays.find(day=>day.id===requestedDayId)??defaultDay;
  const dayId=day.id,RATE=60/1.33;
  const seconds = text => { const [h,m]=text.split(':').map(Number);return h*3600+m*60; };
  const definitions = day.lessons.filter(entry=>schedule.courses[entry.courseId].lessonId).map(entry=>{
    const slot=schedule.timeSlots.find(s=>s.number===entry.slot),course=schedule.courses[entry.courseId];
    return {id:`${dayId}-${entry.slot}`,slot:entry.slot,courseId:entry.courseId,lessonId:course.lessonId,teacherId:entry.teacherId,teacher:schedule.teachers[entry.teacherId].name,room:entry.roomId,building:schedule.rooms[entry.roomId].building,title:course.gameplayTopic||course.title,start:seconds(slot.start),end:seconds(slot.end)};
  });
  const START=definitions[0].start-20*60,END=definitions.at(-1).end;
  const freshRecord = (d,formatId) => ({id:d.id,formatId,status:'pending',admittedAt:null,attemptedAt:null,lateSeconds:0,warning:false,permitRequested:false,permitGranted:false,permitAt:null,permitReason:null,leftEarly:false,node:'start',story:{flags:[],events:[],choices:[],visited:[],outcome:null}});
  function freshDay(character,formatFor){return {version:2,dayId,character,speed:1,clock:START,position:{x:810,y:865,row:0},records:definitions.map(d=>freshRecord(d,formatFor(d))),campusEvents:[],scene:null,finished:false};}
  function create(character='vlad',random=Math.random){return freshDay(character,d=>Formats.draw(d.teacherId,random));}
  function definition(id){return definitions.find(d=>d.id===id);}
  function record(state,id){return state.records.find(r=>r.id===id);}
  function sync(state){
    for(const d of definitions){const r=record(state,d.id);if(state.clock>=d.end&&r.status!=='completed'){r.status=r.formatId==='cancelled'?'cancelled':r.admittedAt===null?'missed':'left-early';}}
    state.finished=state.clock>=END;return state;
  }
  function advance(state,realSeconds,active=true){if(active&&!state.scene&&!state.finished&&Number.isFinite(realSeconds)&&realSeconds>0){state.clock=Math.min(END,state.clock+realSeconds*RATE*([1,4,10].includes(state.speed)?state.speed:1));sync(state);}return state;}
  function jump(state,time){state.clock=Math.max(state.clock,Math.min(END,time));sync(state);}
  function setSpeed(state,speed){if(![1,4,10].includes(speed)||state.scene||state.finished)return false;state.speed=speed;return true;}
  function waitUntil(state,time){if(state.scene||state.finished||!Number.isFinite(time)||time<=state.clock)return false;jump(state,time);return true;}
  function next(state){return definitions.find(d=>state.clock<d.end)||null;}
  function forLesson(id){return definitions.find(d=>d.lessonId===id);}
  function admission(state,id){
    const d=definition(id),r=record(state,id);if(!d||!r)return 'closed';
    if(state.clock>=d.end||r.status==='completed')return 'closed';
    if(state.clock<d.start)return 'early';
    if(r.formatId==='cancelled')return 'cancelled';
    if(r.admittedAt!==null)return 'resume';
    const delay=state.clock-d.start;
    if(delay>1800&&!r.permitGranted)return 'permit';
    return delay>1800?'with-permit':delay>600?'warning':delay>0?'late':'on-time';
  }
  function admit(state,id){
    const result=admission(state,id),d=definition(id),r=record(state,id);
    if(!d)return result;
    if(result==='permit'){r.permitRequested=true;r.attemptedAt??=state.clock;r.lateSeconds=r.attemptedAt-d.start;r.warning=true;return result;}
    if(['closed','early','cancelled'].includes(result))return result;
    if(r.admittedAt===null){r.admittedAt=state.clock;r.attemptedAt??=state.clock;r.lateSeconds=Math.max(0,state.clock-d.start);r.warning=r.lateSeconds>600;r.status='present';}
    return result;
  }
  function pendingPermits(state){return definitions.filter(d=>{const r=record(state,d.id);return r.permitRequested&&!r.permitGranted&&state.clock<d.end;});}
  function grant(state,id,reason){const d=definition(id),r=record(state,id);if(!d||!r||!r.permitRequested||state.clock>=d.end||r.permitGranted)return false;r.permitGranted=true;r.permitAt=state.clock;r.permitReason=reason;return true;}
  function leave(state,id){const r=record(state,id);if(r&&r.admittedAt!==null&&r.status!=='completed'){r.leftEarly=true;r.status='left-early';}}
  function complete(state,id){const d=definition(id),r=record(state,id);
    if(!d||!r||state.clock<d.start||state.clock>=d.end||['completed','cancelled'].includes(r.status))return false;
    if(r.formatId!=='cancelled'&&r.admittedAt===null)return false;
    r.status=r.formatId==='cancelled'?'cancelled':'completed';state.scene=null;jump(state,d.end);return true;
  }
  function skip(state,id){const d=next(state);if(!d||d.id!==id)return false;state.scene=null;const r=record(state,id);if(r.admittedAt!==null)leave(state,id);jump(state,d.end);return true;}
  function restore(raw,character){
    if(!raw||raw.version!==2||raw.character!==character||(raw.dayId||'friday')!==dayId)return create(character);
    const savedRecords=new Map((Array.isArray(raw.records)?raw.records:[]).filter(r=>r&&typeof r.id==='string').map(r=>[r.id,r]));
    const s=freshDay(character,d=>{
      const saved=savedRecords.get(d.id);
      if(saved?.formatId==='legacy'||Formats.get(d.teacherId,saved?.formatId))return saved.formatId;
      if(saved&&(saved.status!=='pending'||saved.attemptedAt!=null||(saved.node&&saved.node!=='start')||saved.story?.visited?.length))return 'legacy';
      return Formats.draw(d.teacherId);
    });
    if([1,4,10].includes(raw.speed))s.speed=raw.speed;
    if(Number.isFinite(raw.clock))s.clock=Math.max(START,Math.min(END,raw.clock));
    if(raw.character===character&&raw.position&&Number.isFinite(raw.position.x)&&Number.isFinite(raw.position.y))s.position={x:raw.position.x,y:raw.position.y,row:[0,1,2,3].includes(raw.position.row)?raw.position.row:0};
    for(const r of s.records){const saved=savedRecords.get(r.id);if(!saved)continue;
      const d=definition(r.id);
      if(['pending','present','completed','left-early','missed','cancelled'].includes(saved.status))r.status=saved.status;
      for(const key of ['admittedAt','attemptedAt','permitAt'])if(Number.isFinite(saved[key])&&saved[key]>=d.start&&saved[key]<d.end&&saved[key]<=s.clock)r[key]=saved[key];
      for(const key of ['warning','permitRequested','permitGranted','leftEarly'])r[key]=saved[key]===true;
      r.lateSeconds=Math.max(0,(r.admittedAt??r.attemptedAt??d.start)-d.start);
      if(typeof saved.node==='string')r.node=saved.node;
      if(saved.story&&typeof saved.story==='object'){
        for(const key of ['flags','events','choices','visited'])if(Array.isArray(saved.story[key]))r.story[key]=[...new Set(saved.story[key].filter(v=>typeof v==='string'&&v.length<=300))].slice(0,100);
        if(typeof saved.story.outcome==='string')r.story.outcome=saved.story.outcome.slice(0,500);
        if(saved.story.activities)r.story.activities=Story.restoreActivities(saved.story.activities,Formats.get(d.teacherId,r.formatId));
      }
      if(typeof saved.permitReason==='string')r.permitReason=saved.permitReason;
      if(r.status==='completed'&&r.admittedAt===null)r.status='pending';
      if(r.permitGranted&&r.permitAt===null)r.permitGranted=false;
    }
    if(Array.isArray(raw.campusEvents))s.campusEvents=raw.campusEvents.filter(e=>e&&typeof e.id==='string'&&typeof e.title==='string'&&typeof e.choiceId==='string'&&typeof e.text==='string'&&Number.isFinite(e.time)&&e.time>=START&&e.time<=s.clock&&Number.isFinite(e.minutes)&&e.minutes>0&&e.minutes<=30).slice(0,20).map(e=>({id:e.id.slice(0,40),title:e.title.slice(0,100),choiceId:e.choiceId.slice(0,40),text:e.text.slice(0,1000),time:e.time,minutes:e.minutes}));
    if(raw.scene&&typeof raw.scene==='object'&&['lesson','reaction','head','head-granted'].includes(raw.scene.type)&&definition(raw.scene.recordId)){
      const r=record(s,raw.scene.recordId),d=definition(raw.scene.recordId),type=raw.scene.type;
      const valid=s.clock<d.end&&r.status!=='completed'&&(type==='lesson'?(r.admittedAt!==null||r.formatId==='cancelled'):type==='head-granted'?r.permitGranted:type==='head'?r.permitRequested:true);
      if(valid)s.scene={type,recordId:raw.scene.recordId};
      if(s.scene&&type==='reaction')s.scene.reason=['permit','warning','late','with-permit','on-time'].includes(raw.scene.reason)?raw.scene.reason:(r.permitRequested&&!r.permitGranted?'permit':r.warning?'warning':r.lateSeconds>0?'late':'on-time');
    }
    sync(s);if(s.finished)s.scene=null;return s;
  }
  function format(time){const mins=Math.floor(time/60);return `${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;}
  function summary(state){return definitions.map(d=>{const r=record(state,d.id);return {...d,...r,lateMinutes:Math.ceil(r.lateSeconds/60),comment:r.status==='cancelled'?'Занятие отменили.':r.status==='missed'?`${d.teacher}: «До аудитории сегодня так и не дошёл?»`:r.status==='left-early'?`${d.teacher}: «Начало видел. А продолжение где?»`:r.permitGranted?`${d.teacher}: «Допуск есть. В следующий раз приходи вовремя».`:r.warning?`${d.teacher}: «Опоздание обсудили. Давай без повторений».`:r.lateSeconds>0?`${d.teacher}: «В следующий раз чуть раньше».`:`${d.teacher}: «На пару пришёл вовремя».`};});}
  return {dayId,dayName:day.name,START,END,RATE,definitions,create,restore,record,definition,forLesson,sync,advance,jump,setSpeed,waitUntil,next,admission,admit,pendingPermits,grant,leave,complete,skip,format,summary};
  }
  return {...createModel(),createModel,playableDays};
});
