const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Day=require('../games/between-classes/day.js');
const [first,second]=Day.definitions;
function at(time){const state=Day.create('vlad');state.clock=time;return state;}
test('Tuesday, Wednesday and Friday cover all available lesson scenes',()=>{
  assert.deepEqual(Day.playableDays.map(day=>day.id),['tuesday','wednesday','friday']);
  const scenes=Day.playableDays.flatMap(day=>Day.createModel(day.id).definitions.map(d=>d.lessonId));
  const {lessons}=require('../games/between-classes/campus-data.js');
  assert.deepEqual(new Set(scenes),new Set(Object.keys(lessons)));
  assert.deepEqual(Day.definitions.map(d=>d.lessonId),['popov','stasinshina','abdrakhmanova','abdraimova']);
  assert.equal(Day.format(Day.END),'15:20');
  assert.deepEqual(Day.definitions.slice(-1).map(d=>[d.slot,d.building,d.room]),[[4,2,'2213']]);
  const wednesday=Day.createModel('wednesday');
  assert.equal(wednesday.format(wednesday.START),'09:50');
  assert.equal(wednesday.format(wednesday.END),'13:40');
  assert.deepEqual(wednesday.definitions.map(d=>[d.slot,d.lessonId,d.building,d.room]),[[2,'popov',3,'3213'],[3,'muratov',2,'2209']]);
  const tuesday=Day.createModel('tuesday');
  assert.equal(tuesday.format(tuesday.START),'09:50');
  assert.equal(tuesday.format(tuesday.END),'17:10');
  assert.deepEqual(tuesday.definitions.map(d=>[d.slot,d.lessonId,d.room]),[[2,'abdrakhmanova','1415'],[3,'atantaeva','1311'],[4,'stasinshina','1406'],[5,'abdrakhmanova-lifecycle','1415']]);
  assert.equal(Day.createModel('unknown').dayId,'friday');
  assert.equal(Day.createModel('thursday').dayId,'friday');
});
test('Tuesday attendance, permits and the two Abdrakhmanova scenes stay independent',()=>{
  const model=Day.createModel('tuesday'),s=model.create('vlad');
  const [structure,methods,,lifecycle]=model.definitions;
  model.jump(s,structure.start);model.admit(s,structure.id);model.record(s,structure.id).node='task';
  model.complete(s,structure.id);
  assert.equal(model.record(s,lifecycle.id).status,'pending');
  assert.equal(model.record(s,lifecycle.id).node,'start');
  model.jump(s,methods.start+1801);assert.equal(model.admit(s,methods.id),'permit');
  model.grant(s,methods.id,'Проспал');s.scene={type:'head-granted',recordId:methods.id};
  const restored=model.restore(JSON.parse(JSON.stringify(s)),'vlad');
  assert.equal(restored.scene.recordId,methods.id);assert.equal(restored.records[1].permitGranted,true);
  assert.equal(restored.records[3].permitGranted,false);
  assert.equal(Day.restore(s,'vlad').clock,Day.START);
});
test('old Friday saves continue after their former last lesson',()=>{
  for(const count of [2,3]){
    const s=Day.create('vlad');
    for(const d of Day.definitions.slice(0,count)){Day.jump(s,d.start);Day.admit(s,d.id);Day.complete(s,d.id);}
    delete s.dayId;s.records=s.records.slice(0,count);s.finished=true;
    const restored=Day.restore(s,'vlad');
    assert.equal(restored.finished,false);
    assert.equal(restored.clock,Day.definitions[count-1].end);
    assert.ok(restored.records.slice(0,count).every(record=>record.status==='completed'));
    assert.equal(restored.records[count].status,'pending');
    assert.equal(Day.next(restored).lessonId,Day.definitions[count].lessonId);
  }
});
test('browser schedule is generated from the canonical JSON without fetching',()=>{
  execFileSync(process.execPath,['games/between-classes/tools/build-schedule.cjs','--check'],{cwd:path.resolve(__dirname,'..')});
  const box={window:{}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../games/between-classes/data/schedule.browser.js'),'utf8'),box);
  assert.equal(JSON.stringify(box.window.CampusSchedule),JSON.stringify(require('../games/between-classes/data/schedule.json')));
});
test('clock scale is 1.33 seconds per minute and inactive/dialog time does not advance',()=>{
  const s=Day.create('vlad');Day.advance(s,1.33);assert.equal(s.clock,Day.START+60);
  Day.advance(s,100,false);assert.equal(s.clock,Day.START+60);
  s.scene={type:'lesson',recordId:first.id};Day.advance(s,100);assert.equal(s.clock,Day.START+60);
  s.scene=null;Day.advance(s,25.27);assert.equal(s.clock,first.start);
});
test('admission respects exact 10 minute, 30 minute and end boundaries',()=>{
  for(const [delay,result] of [[-1,'early'],[0,'on-time'],[1,'late'],[600,'late'],[600.001,'warning'],[1800,'warning'],[1800.001,'permit']])assert.equal(Day.admission(at(first.start+delay),first.id),result,`${delay} seconds`);
  assert.equal(Day.admission(at(first.end),first.id),'closed');
});
test('permits require referral, are lesson-specific, expire and are idempotent',()=>{
  const s=at(first.start+1801);assert.equal(Day.grant(s,first.id,'reason'),false);
  assert.equal(Day.admit(s,first.id),'permit');assert.equal(Day.admit(s,first.id),'permit');
  assert.equal(Day.pendingPermits(s).length,1);assert.equal(Day.record(s,first.id).admittedAt,null);
  assert.equal(Day.grant(s,first.id,'Проспал'),true);assert.equal(Day.grant(s,first.id,'again'),false);
  assert.equal(Day.admit(s,first.id),'with-permit');assert.equal(Day.admit(s,first.id),'resume');
  Day.jump(s,second.start+1801);assert.equal(Day.admission(s,second.id),'permit');
  assert.equal(Day.grant(s,first.id,'expired'),false);
  const missed=at(first.start+1801);Day.admit(missed,first.id);Day.grant(missed,first.id,'reason');Day.jump(missed,first.end);
  assert.equal(Day.record(missed,first.id).status,'missed');assert.equal(Day.admission(missed,first.id),'closed');
});
test('completion jumps to the bell; early exit resumes and remains visible in results',()=>{
  const s=at(first.start+601);assert.equal(Day.admit(s,first.id),'warning');
  const r=Day.record(s,first.id);r.node='followup';Day.leave(s,first.id);
  assert.equal(s.clock,first.start+601);assert.equal(r.leftEarly,true);assert.equal(Day.admit(s,first.id),'resume');assert.equal(r.node,'followup');
  assert.equal(Day.complete(s,first.id),true);assert.equal(s.clock,first.end);assert.equal(r.status,'completed');assert.equal(Day.complete(s,first.id),false);
});
test('natural no-show and deliberate skipping produce the same absence; repeat skip is rejected',()=>{
  const natural=Day.create();Day.advance(natural,(first.end-Day.START)/Day.RATE);
  const deliberate=Day.create();assert.equal(Day.skip(deliberate,first.id),true);
  assert.equal(Day.record(natural,first.id).status,'missed');assert.deepEqual(natural.records,deliberate.records);
  assert.equal(Day.skip(deliberate,first.id),false);assert.equal(Day.skip(deliberate,second.id),true);
  for(const d of Day.definitions.slice(2)){assert.equal(deliberate.finished,false);assert.equal(Day.skip(deliberate,d.id),true);}
  assert.equal(deliberate.finished,true);assert.ok(Day.summary(deliberate).every(r=>r.status==='missed'));
});
test('unfinished attendance is early departure, not a no-show, at the end bell',()=>{
  const s=at(first.start);Day.admit(s,first.id);Day.leave(s,first.id);Day.jump(s,first.end);
  assert.equal(Day.record(s,first.id).status,'left-early');assert.equal(Day.admission(s,first.id),'closed');
});
test('save restores dialogue, permit reaction, time and attendance without offline progression',()=>{
  const s=at(first.start+1801);Day.admit(s,first.id);s.scene={type:'reaction',recordId:first.id,reason:'permit'};
  let restored=Day.restore(JSON.parse(JSON.stringify(s)),'vlad');assert.equal(restored.scene.reason,'permit');assert.equal(restored.clock,s.clock);
  Day.grant(s,first.id,'reason');Day.admit(s,first.id);Day.record(s,first.id).node='followup';s.scene={type:'lesson',recordId:first.id};
  restored=Day.restore(JSON.parse(JSON.stringify(s)),'vlad');assert.equal(restored.scene.type,'lesson');assert.equal(restored.records[0].node,'followup');assert.equal(restored.records[0].permitGranted,true);
  assert.equal(Day.restore(s,'adil').clock,Day.START);
  assert.deepEqual(Day.restore({version:1,completed:['popov','stasinshina']},'vlad'),Day.create('vlad'));
});
