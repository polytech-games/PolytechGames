const { test } = require('node:test');
const assert = require('node:assert/strict');
const schedule = require('../games/between-classes/data/schedule.json');
const { lessons } = require('../games/between-classes/campus-data.js');

test('weekly schedule preserves source slots, valid references and bell times and unspecified rooms', () => {
  assert.equal(schedule.group, 'П-24-67Б');
  assert.deepEqual(schedule.days.map(day=>day.lessons.map(lesson=>lesson.slot)), [[1,2,3,4],[2,3,4,5],[1,2,3],[4,5,6],[1,2,3,4]]);
  assert.equal(schedule.days.flatMap(day=>day.lessons).length, 18);
  assert.deepEqual(schedule.timeSlots.map(slot=>[slot.start,slot.end]), [['08:30','10:00'],['10:10','11:40'],['12:10','13:40'],['13:50','15:20'],['15:40','17:10'],['17:20','18:50']]);
  for(const day of schedule.days) {
    for(const entry of day.lessons) {
      assert.ok(schedule.courses[entry.courseId], entry.courseId);
      assert.ok(schedule.teachers[entry.teacherId], entry.teacherId);
      if(entry.roomId!==null)assert.ok(schedule.rooms[entry.roomId],entry.roomId);
    }
  }
  assert.equal(schedule.days.find(day=>day.id==='wednesday').lessons.find(lesson=>lesson.slot===3).roomId,null);
  assert.equal(schedule.rooms.gym.building,null);
});

test('playable lessons match schedule course ids, teachers and confirmed buildings', () => {
  for(const [id,lesson] of Object.entries(lessons)) {
    const course=schedule.courses[lesson.courseId];
    assert.ok(course,lesson.courseId);assert.equal(course.lessonId,id);
    const entries=schedule.days.flatMap(day=>day.lessons).filter(entry=>entry.courseId===lesson.courseId);
    assert.ok(entries.length);
    for(const entry of entries) {
      assert.equal(entry.teacherId,id);
      assert.equal(schedule.rooms[entry.roomId].building,id==='popov'?3:1);
      assert.equal(schedule.rooms[entry.roomId].buildingSource,'user-confirmed');
    }
  }
  assert.equal(schedule.courses['web-layout'].gameplayTopic,'HTML-вёрстка');
});
