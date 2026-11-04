const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../games/between-classes/campus-data.js');
const root = path.resolve(__dirname, '../games/between-classes');

test('entrances map to the correct teachers and require nearby feet position', () => {
  const first = D.entrances.find(e => e.building === 1), third = D.entrances.find(e => e.building === 3);
  assert.equal(D.lessons[first.lesson].teacher, 'Стасиншина');
  assert.equal(D.lessons[third.lesson].teacher, 'Попов');
  assert.equal(D.nearEntrance({x:810,y:865}), null);
  for (const e of D.entrances) {
    assert.ok(D.canStand(e.x,e.y), e.id);
    assert.equal(D.nearEntrance(e)?.id, e.id);
    assert.notEqual(D.nearEntrance({x:e.x,y:e.y+e.radius+1})?.id, e.id);
  }
  assert.ok(D.entrances.filter(e=>e.building===2).every(e=>e.lesson===null));
});

test('all entrances can be reached without crossing a painted building', () => {
  const starts = [{x:810,y:865}, ...D.entrances];
  for (const start of starts) for (const destination of D.entrances) {
    const route = D.findPath(start,destination);
    assert.ok(route.length, `No route to ${destination.id}`);
    let previous = start;
    for (const point of route) {
      // Check the connecting segment too, including diagonal grid moves.
      for (let t=0;t<=1;t+=.1) assert.ok(D.canStand(previous.x+(point.x-previous.x)*t,previous.y+(point.y-previous.y)*t), `Route crossed a building: ${destination.id}`);
      previous=point;
    }
    assert.equal(route.at(-1).x,destination.x); assert.equal(route.at(-1).y,destination.y);
  }
  assert.equal(D.canStand(500,600),false);
  assert.deepEqual(D.findPath({x:810,y:865},{x:500,y:600}),[]);
});

test('lesson choices lead to a finish and all classroom/portrait resources exist', () => {
  for (const lesson of Object.values(D.lessons)) {
    assert.ok(fs.existsSync(path.join(root,lesson.background)));
    function walk(id, seen=new Set()) {
      assert.ok(!seen.has(id), `Unexpected cycle: ${id}`);
      const node = lesson.nodes[id]; assert.ok(node,`Missing node: ${id}`);
      const extension=lesson.portrait==='popov'?'webp':'png';
      assert.ok(fs.existsSync(path.join(root,`assets/characters/${lesson.portrait}/${node.emotion}.${extension}`)));
      if(node.end)return;
      const targets=node.choices?node.choices.map(c=>c.next):[node.next];
      assert.ok(targets.length);for(const next of targets)walk(next,new Set([...seen,id]));
    }
    walk('start');
  }
});
