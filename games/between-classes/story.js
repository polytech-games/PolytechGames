(function(root,factory){
  if(typeof module!=='undefined'&&module.exports)module.exports=factory();
  else root.CampusStory=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function history(record){const story=record.story??={flags:[],events:[],choices:[],outcome:null};story.visited??=[];return story;}
  function view(record,lesson){
    const node=lesson.nodes[record.node];if(!node)return null;
    const story=history(record);if(story.visited.at(-1)!==record.node)story.visited.push(record.node);
    const flags=story.flags,variant=node.variants?.find(v=>flags.includes(v.flag));
    return variant?{...node,...variant}:node;
  }
  function choose(record,lesson,nodeId,index){
    if(record.node!==nodeId)return false;
    const choice=lesson.nodes[nodeId]?.choices?.[index];if(!choice||!lesson.nodes[choice.next])return false;
    const story=history(record),id=`${nodeId}:${index}`;
    if(story.choices.includes(id))return false;
    story.choices.push(id);
    if(choice.flag&&!story.flags.includes(choice.flag))story.flags.push(choice.flag);
    if(choice.event&&!story.events.includes(choice.event))story.events.push(choice.event);
    record.node=choice.next;return true;
  }
  function advance(record,lesson){
    const node=view(record,lesson);if(!node||node.end||node.choices||node.activity||!lesson.nodes[node.next])return false;
    record.node=node.next;return true;
  }
  function finish(record,lesson){
    const node=view(record,lesson);if(!node?.end)return false;
    history(record).outcome=node.outcome||node.text;return true;
  }
  function activitySize(activity) {
    return activity.type === 'order' ? activity.solution.length : activity.rounds.length;
  }
  function availableOptions(activity, picks) {
    return activity.type === 'order' ? activity.items : activity.rounds[picks.length]?.options ?? [];
  }
  function validPick(activity, picks, index) {
    return picks.length < activitySize(activity) && Number.isInteger(index) && index >= 0 &&
      index < availableOptions(activity, picks).length && (activity.type !== 'order' || !picks.includes(index));
  }
  function restoreActivities(raw, lesson) {
    const activities = {};
    for (const [nodeId, { activity }] of Object.entries(lesson?.nodes ?? {})) {
      const saved = raw?.[nodeId];
      if (!activity || !Array.isArray(saved?.picks)) continue;
      const picks = [];
      for (const index of saved.picks) {
        if (!validPick(activity, picks, index)) break;
        picks.push(index);
      }
      activities[nodeId] = { picks, checked: saved.checked === true && picks.length === activitySize(activity) };
    }
    return activities;
  }
  function activityView(record, lesson, nodeId = record.node) {
    const activity = lesson.nodes[nodeId]?.activity;
    if (!activity) return null;
    const { picks, checked } = record.story?.activities?.[nodeId] ?? { picks: [], checked: false };
    const total = activitySize(activity);
    const ready = picks.length === total;
    const solution = activity.type === 'order' ? activity.solution : activity.rounds.map(round => round.answer);
    const score = picks.filter((answer, index) => answer === solution[index]).length;
    const flags = record.story?.flags ?? [];
    const capped = !!activity.cap && flags.includes(activity.cap.flag);
    const grade = activity.grade ? Math.min(Math.round(score * 100 / total), capped ? activity.cap.max : 100) : null;
    const result = grade === null ? `${score}/${total}` : `${grade}/100 баллов`;
    return { activity, picks, checked, total, ready, score, result, capped,
      passed: score >= (activity.minCorrect ?? total), options: availableOptions(activity, picks),
      notes: Object.entries(activity.notebook ?? {}).filter(([flag]) => flags.includes(flag)).map(([, text]) => text),
    };
  }
  function activityAction(record, lesson, nodeId, action, index) {
    if (record.node !== nodeId) return false;
    const view = activityView(record, lesson, nodeId);
    if (!view) return false;
    const { activity, picks, checked, ready, passed, result } = view;
    if (action === 'continue') {
      const next = passed ? activity.onPass : activity.onFail;
      if (!checked || !lesson.nodes[next]) return false;
      record.node = next;
      return true;
    }
    if (checked) return false;
    let updated;
    if (action === 'pick' && validPick(activity, picks, index)) updated = { picks: [...picks, index], checked: false };
    if (action === 'undo' && picks.length) updated = { picks: picks.slice(0, -1), checked: false };
    if (action === 'check' && ready) updated = { picks, checked: true };
    if (!updated) return false;
    const story = history(record);
    story.activities ??= {};
    story.activities[nodeId] = updated;
    if (action === 'check') story.events.push(`${activity.title} — ${result}.`);
    return true;
  }
  function log(record,lesson){
    const story=history(record),entries=[];
    for(const id of story.visited){const base=lesson.nodes[id];if(!base)continue;const variant=base.variants?.find(v=>story.flags.includes(v.flag));
      const node=variant?{...base,...variant}:base;entries.push({speaker:node.speaker,text:node.text});
      const selected=story.choices.find(c=>c.startsWith(id+':'));
      if(selected){const choice=base.choices?.[Number(selected.slice(id.length+1))];if(choice)entries.push({speaker:'Ты',text:choice.text});}
      const activity=activityView(record,lesson,id);
      if(activity?.checked)entries.push({speaker:'Результат',text:`${activity.activity.title} — ${activity.result}.`});
    }
    return entries;
  }
  return {history,view,choose,advance,finish,log,activityView,activityAction,restoreActivities};
});
