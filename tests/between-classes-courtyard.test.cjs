const {test}=require('node:test');
const assert=require('node:assert/strict');
const Events=require('../games/between-classes/campus-events.js');
const D=require('../games/between-classes/campus-data.js');
const Day=require('../games/between-classes/day.js');
const Story=require('../games/between-classes/story.js');

test('courtyard activities can be reached and interacted with without crossing buildings',()=>{
  for(const spot of Events.spots){
    assert.ok(D.canStand(spot.x,spot.y),spot.id);
    assert.equal(Events.near(spot)?.id,spot.id);
    assert.ok(D.findPath({x:810,y:865},spot).length,spot.id);
    for(const c of spot.choices)assert.ok(c.minutes>=0&&c.minutes<=30);
  }
});
test('activities cost their advertised game minutes, survive saving, and cannot be repeated for duplicate entries',()=>{
  const s=Day.create('vlad');Day.setSpeed(s,10);const before=s.clock;
  const result=Events.consume(s,Day,'friends','debate');
  assert.equal(result.minutes,15);assert.equal(s.clock,before+15*60);assert.equal(s.campusEvents.length,1);
  const restored=Day.restore(JSON.parse(JSON.stringify(s)),'vlad');assert.deepEqual(restored.campusEvents,s.campusEvents);
  assert.equal(Events.consume(restored,Day,'friends','chat'),null);assert.equal(restored.clock,s.clock);
  const leave=Events.consume(restored,Day,'bench','leave');assert.equal(leave.minutes,0);assert.equal(restored.campusEvents.length,1);
  restored.scene={type:'lesson',recordId:Day.definitions[0].id};assert.equal(Events.consume(restored,Day,'bench','rest'),null);
});
test('a courtyard delay can cause a no-show and appears in the saved day without inventing an attendance reprimand',()=>{
  const s=Day.create('vlad'),d=Day.definitions[0];s.clock=d.end-60;
  Events.consume(s,Day,'snack','queue');assert.equal(s.clock,d.end+11*60);
  assert.equal(Day.record(s,d.id).status,'missed');assert.equal(Day.admission(s,d.id),'closed');
  assert.equal(Day.summary(s)[0].warning,false);
  assert.equal(s.campusEvents[0].choiceId,'queue');
});
test('conversation history retains visited lines and selected responses after saving',()=>{
  const s=Day.create('vlad'),d=Day.definitions[0],r=Day.record(s,d.id),lesson=D.lessons.popov;
  s.clock=d.start;Day.admit(s,d.id);r.node='question';Story.view(r,lesson);
  Story.choose(r,lesson,'question',1);Story.view(r,lesson);
  const restored=Day.restore(JSON.parse(JSON.stringify(s)),'vlad'),rr=Day.record(restored,d.id),log=Story.log(rr,lesson);
  assert.equal(log.length,3);assert.equal(log[1].speaker,'Ты');assert.ok(log[1].text.includes('неизменяемым'));
  assert.ok(log[2].text.includes('Уверенно. Но неверно.'));assert.equal(rr.node,'wrong');
});
