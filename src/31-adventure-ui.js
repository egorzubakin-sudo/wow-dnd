function errandEditor(){
 form('Местное поручение',input('Название','qt','text','','required')+area('Вступление','qd')+pick('Регион','qr',[['','Любой'],...pairs(S.engine.regions)],'')+input('Часов','qh','number',1)+pick('Повторять','repeat',[['once','Однократно'],['day','Раз в игровой день'],['stay','Раз за стоянку']],'once')+'<div id="optionsBox"></div><button type="button" id="addOption">Добавить решение</button>',async()=>{
 const options=[...$('optionsBox').children].map((_,i)=>({name:val('op'+i),skill:val('skill'+i),dc:num('dc'+i),success:val('win'+i),failure:val('loss'+i),gold:num('gold'+i)}));
 await execute('errand',{title:val('qt'),desc:val('qd'),region_id:val('qr'),hours:num('qh'),repeat:val('repeat'),options});
 });
 const add=()=>{const i=$('optionsBox').children.length,el=document.createElement('details');el.open=true;el.innerHTML='<summary>Решение '+(i+1)+'</summary>'+input('Действие','op'+i,'text','','required')+pick('Навык','skill'+i,Object.keys(skills).map(k=>[k,k]),'Атлетика')+input('Сл','dc'+i,'number',10)+input('Успех','win'+i)+input('Неудача','loss'+i)+input('Награда при успехе, зм','gold'+i,'number',0);$('optionsBox').append(el)};
 $('addOption').onclick=add;add();
}
function localBoard(){
 const hero=chosen(),e=adventure(S);openModal('Местные поручения','<section class="stack" id="localBoard"></section>');const box=$('localBoard');
 for(const q of S.contracts.filter(q=>q.type==='local'&&questAvailable(S,q,hero))){
 const el=document.createElement('article');el.className='quest-card';el.innerHTML='<h3>'+esc(q.title)+'</h3><p>'+esc(q.desc)+'</p><small>'+esc(q.hours)+' ч.</small>';
 for(const o of e.solutions.filter(x=>x.quest_id===q.id))el.append(button(o.name,()=>commandForm(q.title,'<p>'+esc(o.name)+' · '+esc(o.skill)+' · Сл '+esc(o.dc)+'</p>','quest',()=>({hero,quest:q.id,option:o.id}),'Выполнить')));
 box.append(el);
 }if(!box.children.length)box.textContent='Доступных поручений пока нет.';
}
function sessionEditor(){
 form('Последствия приключения',input('Идентификатор сессии','sid','text',crypto.randomUUID(),'required')+input('Краткое содержание','sum','text','','required')+area('Текстовый лог','logTxt')+input('Загрузить лог (.txt)','logFile','file')+area('Последствия JSON','effects','[]')+input('Загрузить последствия (.json)','effectFile','file')+check('Скрыть запись летописи','privateSession',false),()=>{
 const p={id:val('sid'),summary:val('sum'),log:val('logTxt'),hidden:$('privateSession').checked,effects:JSON.parse(val('effects'))};
 applyCommand(S,actor,'session',p,'preview:'+p.id);
 commandForm('Подтверждение последствий','<p>'+esc(p.summary)+'</p><pre>'+esc(JSON.stringify(p.effects,null,2))+'</pre>','session',()=>p,'Применить');
 },'Проверить');
 $('logFile').onchange=async e=>{if(e.target.files[0])$('logTxt').value=await e.target.files[0].text()};
 $('effectFile').onchange=async e=>{if(e.target.files[0])$('effects').value=await e.target.files[0].text()};
}
actions.push((a,{gm,t,hero})=>{
 adventure(S);
 if(gm&&tab==='contracts')a.append(button('Новое местное поручение',errandEditor));
 if(gm&&tab==='home')a.append(button('Последствия сессии',sessionEditor));
 if(hero&&t)a.append(button('Местные поручения',localBoard));
});
