(function(root,factory){
  if(typeof module!=='undefined'&&module.exports)module.exports=factory();
  else root.CampusEvents=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const spots=[
    {id:'friends',x:790,y:860,radius:42,mark:'ЧАТ',title:'Ребята во дворе',prompt:'Поговорить',text:'У дорожки спорят, что хуже: опоздать с честным объяснением или прийти вовремя без задания. Тебя зовут вынести вердикт.',choices:[
      {id:'chat',label:'Перекинуться парой слов · 5 мин',minutes:5,text:'Пять минут спорили, кто закрыл общий файл, не сохранив. Виноватого не нашли. Зато теперь есть новая версия легенды.'},
      {id:'debate',label:'Ввязаться в спор про прогулы · 15 мин',minutes:15,text:'Спор о том, можно ли опоздать «по уважительной причине: спорил об опозданиях», занял пятнадцать минут. Проверить теорию теперь проще простого.'},
      {id:'leave',label:'«Потом расскажете». Идти на пару',minutes:0,text:'Ты уходишь раньше, чем обсуждение превращается в ещё одну уважительную причину.'},
    ]},
    {id:'bench',x:470,y:410,radius:42,mark:'ПАУЗА',title:'Скамейка во дворе',prompt:'Присесть',text:'Здесь тихо. Из корпуса слышно, как хлопает дверь. Можно посидеть немного — главное не забыть, зачем вообще пришёл.',choices:[
      {id:'rest',label:'Передохнуть · 5 мин',minutes:5,text:'Пять минут без кода, чужих экранов и вопросов. Встал чуть бодрее — расписание, правда, отдохнуть не успело.'},
      {id:'scroll',label:'Залипнуть в телефоне · 20 мин',minutes:20,text:'Всего один ролик. Потом ещё один. Когда поднимаешь голову, прошло двадцать минут, а сюжет ролика ты уже не помнишь.'},
      {id:'leave',label:'Не садиться — потом не встану',minutes:0,text:'Предчувствие победило удобную скамейку. Ты остаёшься на ногах.'},
    ]},
    {id:'snack',x:1155,y:865,radius:42,mark:'КОФЕ',title:'Перекус у корпуса',prompt:'Перекусить',text:'У корпуса продают кофе и перекус. Очереди почти нет, но человек впереди никак не может выбрать между двумя одинаковыми батончиками.',choices:[
      {id:'coffee',label:'Взять кофе навынос · 3 мин',minutes:3,text:'Кофе слишком горячий, зато достался быстро. Теперь главное — не пытаться одновременно идти, пить и объяснять, почему опоздал.'},
      {id:'queue',label:'Дождаться горячего перекуса · 12 мин',minutes:12,text:'«Ещё минутку» повторили несколько раз. Перекус наконец у тебя. Двенадцать минут он стоил наверняка; стоило ли оно того — покажет дверь аудитории.'},
      {id:'leave',label:'До перемены потерплю',minutes:0,text:'Решаешь не проверять, можно ли объяснить опоздание словом «батончик».'},
    ]},
  ];
  function near(player){return spots.filter(s=>Math.hypot(s.x-player.x,s.y-player.y)<=s.radius).sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0]||null;}
  function consume(state,Day,id,choiceId){
    const spot=spots.find(s=>s.id===id),choice=spot?.choices.find(c=>c.id===choiceId);
    if(!choice||state.scene||state.finished||(state.campusEvents||[]).some(e=>e.id===id))return null;
    const time=state.clock;
    if(choice.minutes&&!Day.waitUntil(state,state.clock+choice.minutes*60))return null;
    const result={id,choiceId,title:spot.title,time,minutes:choice.minutes,text:choice.text};
    if(choice.minutes)(state.campusEvents??=[]).push(result);
    return result;
  }
  return {spots,near,consume};
});
