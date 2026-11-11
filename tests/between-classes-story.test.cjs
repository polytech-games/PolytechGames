const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../games/between-classes/story.js');
const Day=require('../games/between-classes/day.js');
const Formats=require('../games/between-classes/lesson-formats.js');
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
  delete r.formatId;
  const restored=Day.restore(clone(state),'vlad'),rr=Day.record(restored,d.id);
  assert.equal(rr.formatId,'legacy');
  assert.equal(rr.node,'sound_reply');assert.deepEqual(rr.story,r.story);
  Story.choose(rr,lesson,'sound_reply',0);Story.advance(rr,lesson);
  assert.equal(rr.node,'recovered_end');Story.finish(rr,lesson);Day.complete(restored,d.id);
  const result=Day.summary(restored)[0];assert.equal(result.status,'completed');
  assert.ok(result.story.outcome.includes('исправился'));assert.equal(result.story.events.length,4);
});

test('formats divide the roll evenly and are kept in a saved day',()=>{
  for(const [teacher,expected] of Object.entries({
    popov:['lab','lecture'],stasinshina:['lecture','exam','lab'],muratov:['cancelled','lecture','recap'],
    abdrakhmanova:['lab','lecture'],atantaeva:['coursework'],abdraimova:['lecture'],
  })){
    const rolls=Array.from({length:60},(_,index)=>Formats.draw(teacher,()=>(index+.5)/60));
    assert.deepEqual([...new Set(rolls)],expected);
    for(const id of expected)assert.equal(rolls.filter(roll=>roll===id).length,60/expected.length);
  }
  const state=Day.create('vlad',()=>.99);
  assert.deepEqual(Day.restore(clone(state),'vlad').records,state.records);
  assert.notEqual(Day.create('vlad',()=>0).records[0].formatId,state.records[0].formatId);
});

test('all format branches and both results of each activity reach a valid ending',()=>{
  for(const [teacher,formats] of Object.entries(Formats.formats))for(const id of Object.keys(formats)){
    const lesson=Formats.get(teacher,id),visited=new Set(),endings=new Set();
    function walk(nodeId,ancestors=new Set()){
      assert.ok(!ancestors.has(nodeId),`${teacher}/${id}: cycle at ${nodeId}`);
      const node=lesson.nodes[nodeId];
      assert.ok(node,`${teacher}/${id}: missing ${nodeId}`);
      if(visited.has(nodeId))return;
      visited.add(nodeId);
      const path=new Set([...ancestors,nodeId]);
      if(node.end){assert.ok(node.outcome);endings.add(nodeId);return;}
      const task=node.activity;
      if(task){
        const answers=task.type==='order'?task.solution:task.rounds.map(round=>round.answer);
        const good={node:nodeId};
        for(const index of answers)assert.equal(Story.activityAction(good,lesson,nodeId,'pick',index),true);
        assert.equal(Story.activityAction(good,lesson,nodeId,'check'),true);
        assert.equal(Story.activityView(good,lesson).passed,true);
        assert.equal(Story.activityAction(good,lesson,nodeId,'continue'),true);
        assert.equal(good.node,task.onPass);
        const bad={node:nodeId};
        const wrong=task.type==='order'?[...answers.slice(1),answers[0]]:task.rounds.map(round=>(round.answer+1)%round.options.length);
        for(const index of wrong)assert.equal(Story.activityAction(bad,lesson,nodeId,'pick',index),true);
        assert.equal(Story.activityAction(bad,lesson,nodeId,'check'),true);
        assert.equal(Story.activityView(bad,lesson).passed,false);
        assert.equal(Story.activityAction(bad,lesson,nodeId,'continue'),true);
        assert.equal(bad.node,task.onFail);
        walk(good.node,path);walk(bad.node,path);
      }else for(const next of node.choices?.map(choice=>choice.next)??[node.next])walk(next,path);
    }
    walk('start');
    assert.equal(visited.size,Object.keys(lesson.nodes).length);
    assert.ok(endings.size>=(id==='cancelled'?1:2));
  }
});

test('HTML defense keeps a partial answer, enforces the 60-point cap and logs one score',()=>{
  const state=Day.create('vlad',()=>.99),d=Day.definitions[1];
  Day.jump(state,d.start);Day.admit(state,d.id);
  const r=Day.record(state,d.id),lesson=Formats.get('stasinshina','lab');
  r.node='rules';Story.choose(r,lesson,'rules',2);Story.advance(r,lesson);
  for(const index of lesson.nodes.build.activity.solution)Story.activityAction(r,lesson,'build','pick',index);
  Story.activityAction(r,lesson,'build','check');Story.activityAction(r,lesson,'build','continue');
  Story.view(r,lesson);Story.activityAction(r,lesson,'defend','pick',1);
  state.scene={type:'lesson',recordId:d.id};
  const restored=Day.restore(clone(state),'vlad'),saved=Day.record(restored,d.id);
  assert.deepEqual(Story.activityView(saved,lesson).picks,[1]);
  assert.equal(Story.activityAction(saved,lesson,'defend','check'),false);
  assert.equal(Story.activityAction(saved,lesson,'defend','pick',1),true);
  assert.equal(Story.activityAction(saved,lesson,'defend','undo'),true);
  assert.equal(Story.activityAction(saved,lesson,'defend','pick',0),true);
  assert.equal(Story.activityAction(saved,lesson,'defend','check'),true);
  assert.equal(Story.activityAction(saved,lesson,'defend','check'),false);
  assert.equal(Story.activityView(saved,lesson).result,'60/100 баллов');
  assert.equal(Story.activityView({...saved,story:{...saved.story,flags:[]}},lesson).result,'100/100 баллов');
  assert.ok(Story.log(saved,lesson).some(entry=>entry.text.includes('60/100 баллов')));
  assert.equal(saved.story.events.filter(event=>event.includes('60/100 баллов')).length,1);
  assert.equal(Story.activityAction(saved,lesson,'defend','continue'),true);
  assert.equal(saved.node,'pass');
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
