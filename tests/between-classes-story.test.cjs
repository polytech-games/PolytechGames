const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../games/between-classes/story.js');
const Day=require('../games/between-classes/day.js');
const {lessons}=require('../games/between-classes/campus-data.js');
const clone=v=>JSON.parse(JSON.stringify(v));

test('every story branch terminates and good, disruptive and repaired paths have different outcomes',()=>{
  for(const [id,lesson] of Object.entries(lessons)){
    const endings=new Set(),outcomes=new Set();let branches=0;
    function walk(record,seen=new Set()){
      assert.ok(!seen.has(record.node),`${id}: cycle at ${record.node}`);
      const node=Story.view(record,lesson);assert.ok(node,`${id}: missing node`);
      if(node.end){assert.equal(Story.finish(record,lesson),true);assert.ok(record.story.outcome);endings.add(record.node);outcomes.add(record.story.outcome);branches++;return;}
      const nextSeen=new Set([...seen,record.node]);
      if(node.choices){for(let i=0;i<node.choices.length;i++){const fork=clone(record);assert.equal(Story.choose(fork,lesson,record.node,i),true);walk(fork,nextSeen);}}
      else{const fork=clone(record);assert.equal(Story.advance(fork,lesson),true);walk(fork,nextSeen);}
    }
    walk({node:'start'});
    assert.ok(endings.has('bad_end'),id);assert.ok(endings.has('end'),id);
    assert.ok(outcomes.size>=3,`${id}: need distinct endings`);assert.ok(branches>=10,`${id}: too few meaningful routes`);
  }
});
test('bad answers and pranks survive saving; an old choice cannot replay after moving on',()=>{
  const state=Day.create('vlad'),d=Day.definitions[0];state.clock=d.start;Day.admit(state,d.id);
  const r=Day.record(state,d.id),lesson=lessons.popov;r.node='question';
  assert.equal(Story.choose(r,lesson,'question',1),true);assert.equal(r.node,'wrong');
  assert.equal(Story.choose(r,lesson,'question',1),false);assert.equal(r.story.events.length,1);
  Story.choose(r,lesson,'wrong',1);Story.advance(r,lesson); // argue -> followup
  Story.choose(r,lesson,'followup',3);Story.advance(r,lesson); // sound -> sound_reply
  state.scene={type:'lesson',recordId:d.id};
  const restored=Day.restore(clone(state),'vlad'),rr=Day.record(restored,d.id);
  assert.equal(rr.node,'sound_reply');assert.deepEqual(rr.story,r.story);
  Story.choose(rr,lesson,'sound_reply',0);Story.advance(rr,lesson);
  assert.equal(rr.node,'recovered_end');Story.finish(rr,lesson);Day.complete(restored,d.id);
  const result=Day.summary(restored)[0];assert.equal(result.status,'completed');
  assert.ok(result.story.outcome.includes('исправился'));assert.equal(result.story.events.length,4);
});
test('continuing a prank gives an unfinished-work ending without failing attendance',()=>{
  const state=Day.create('vlad'),d=Day.definitions[1];state.clock=d.start;Day.admit(state,d.id);
  const r=Day.record(state,d.id),lesson=lessons.stasinshina;r.node='greeting';
  Story.choose(r,lesson,'greeting',3);Story.advance(r,lesson);Story.choose(r,lesson,'prank_reply',1);
  Story.advance(r,lesson);Story.choose(r,lesson,'cleanup',1);Story.finish(r,lesson);
  assert.equal(r.node,'bad_end');assert.ok(r.story.outcome.includes('не доделал'));
  assert.equal(Day.complete(state,d.id),true);assert.equal(r.status,'completed');
});
test('speed multiplies only active courtyard time and saved speed is validated',()=>{
  for(const speed of [1,4,10]){
    const s=Day.create('vlad');assert.equal(Day.setSpeed(s,speed),true);
    Day.advance(s,1.33);assert.equal(s.clock,Day.START+60*speed);
    const frozen=s.clock;Day.advance(s,100,false);assert.equal(s.clock,frozen);
    s.scene={type:'lesson',recordId:Day.definitions[0].id};Day.advance(s,100);assert.equal(s.clock,frozen);
    assert.equal(Day.setSpeed(s,1),false);assert.equal(Day.waitUntil(s,Day.END),false);
    s.scene=null;assert.equal(Day.restore(clone(s),'vlad').speed,speed);
  }
  const s=Day.create();assert.equal(Day.setSpeed(s,-1),false);s.speed=Infinity;
  assert.equal(Day.restore(s,'vlad').speed,1);
});
test('deliberate waiting reaches late, warning and permit states and cannot rewind or bypass expiry',()=>{
  const d=Day.definitions[0];
  for(const [minutes,reason] of [[5,'late'],[15,'warning'],[31,'permit']]){
    const s=Day.create();assert.equal(Day.waitUntil(s,d.start+minutes*60),true);assert.equal(Day.admission(s,d.id),reason);
    assert.equal(Day.waitUntil(s,d.start),false);assert.equal(Day.waitUntil(s,NaN),false);
  }
  const s=Day.create();Day.waitUntil(s,d.start+31*60);Day.admit(s,d.id);Day.grant(s,d.id,'Проспал');
  Day.waitUntil(s,d.end);assert.equal(Day.record(s,d.id).status,'missed');assert.equal(Day.admission(s,d.id),'closed');
  Day.waitUntil(s,Day.END+3600);assert.equal(s.clock,Day.END);assert.equal(s.finished,true);assert.equal(Day.setSpeed(s,4),false);
});
