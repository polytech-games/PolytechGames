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
    const node=view(record,lesson);if(!node||node.end||node.choices||!lesson.nodes[node.next])return false;
    record.node=node.next;return true;
  }
  function finish(record,lesson){
    const node=view(record,lesson);if(!node?.end)return false;
    history(record).outcome=node.outcome||node.text;return true;
  }
  function log(record,lesson){
    const story=history(record),entries=[];
    for(const id of story.visited){const base=lesson.nodes[id];if(!base)continue;const variant=base.variants?.find(v=>story.flags.includes(v.flag));
      const node=variant?{...base,...variant}:base;entries.push({speaker:node.speaker,text:node.text});
      const selected=story.choices.find(c=>c.startsWith(id+':'));
      if(selected){const choice=base.choices?.[Number(selected.slice(id.length+1))];if(choice)entries.push({speaker:'Ты',text:choice.text});}
    }
    return entries;
  }
  return {history,view,choose,advance,finish,log};
});
