function bagPage(){
 const hero=chosen(),p=profile(S,hero),bag=S.company.inventory.filter(x=>x.owner==='member:'+hero&&(!player||!x.hidden));
 openModal('Сумки · '+memberName(heroOf(S,hero)),'<p>'+esc(p.wallet)+' зм</p><div class="actions" id="bagTools"></div><section id="bagRows" class="bag-grid"></section>');
 $('bagTools').append(button('Сетка / список',()=>$('bagRows').classList.toggle('bag-grid')));
 if(!player)$('bagTools').append(button('Перевести из казны',()=>commandForm('Перевод между казной и кошельком',input('Зм (отрицательное — в казну)','amt','number',1),'gold',()=>({hero,amount:num('amt')}))));
 for(const x of bag){
   const b=button((x.icon||'◆')+' '+x.name+' × '+x.qty,()=>commandForm('Передача или разделение',pick('Получатель','to',[['','Компания'],...S.company.members.filter(m=>!player||!m.hidden).map(m=>[m.id,m.id===hero?'Разделить стопку':memberName(m)])],'')+input('Количество','qty','number',1,'min="1" max="'+x.qty+'"'),'transfer',()=>({hero,stack:x.id,to:val('to'),qty:num('qty')})));
   b.title=x.desc||x.name;$('bagRows').append(b);
 }
 if(!bag.length)$('bagRows').textContent='Сумки пусты';
}
function activities(){
 const hero=chosen(),h=profile(S,hero),e=economy(S),t=currentStay(S);
 openModal('Занятия · '+remaining(S,hero)+' ч.','<div id="activityList" class="stack"></div>');
 const list=$('activityList');
 const ids=new Set(e.loot.filter(l=>l.region_id===t.region).map(l=>l.profession_id));
 for(const id of ids){const prof=byId(e.professions,id),b=button(prof.name,()=>{
   const rule=e.loot.find(l=>l.region_id===t.region&&l.profession_id===id);
   commandForm(prof.name,'<p>'+esc(rule.hours||1)+' ч. · Сл '+esc(rule.dc??byId(e.regions,t.region).dc)+'</p>','gather',()=>({hero,profession:id}),'Приступить');
 });b.disabled=!eligibleProfession(S,h,id);b.title=(prof.tools||[]).join(' / ')||prof.skill||'Доступно без владения';list.append(b)}
 if(!ids.size)list.textContent='Для этого региона таблицы добычи пока пусты.';
}
function recipeBook(){
 const hero=chosen(),e=economy(S),h=profile(S,hero);
 openModal('Книга рецептов и проекты','<section id="recipeRows" class="stack"></section>');const box=$('recipeRows');
 for(const r of e.recipes){
  const ingredients=e.ingredients.filter(i=>i.recipe_id===r.id).map(i=>byId(e.items,i.item_id).name+' × '+i.quantity);
  const b=button(r.name+' · '+r.hours+' ч.',()=>commandForm(r.name,'<p>'+esc(ingredients.join(', ')||'Абстрактные ресурсы')+' · '+esc(r.gold||0)+' зм / шт.</p>'+input('Количество','qty','number',1,'min="1" max="1000"'),'project',()=>({hero,recipe:r.id,qty:num('qty')}),'Зарезервировать'));
  b.disabled=!canCraft(S,h,r);b.title=[byId(e.professions,r.profession_id).name,'БВ +'+r.rank,...ingredients,r.service].filter(Boolean).join(' · ');box.append(b);
 }
 for(const j of e.projects.filter(j=>j.status==='active')){
  box.append(button(j.name+' · осталось '+j.left+' ч.',()=>commandForm('Внести работу',input('Часов','wh','number',Math.min(j.left,remaining(S,hero))),'work',()=>({hero,project:j.id,hours:num('wh')}))));
  if(j.hero===hero)box.append(button('Отменить '+j.name,()=>commandForm('Отмена проекта','<p>Доля возврата: '+esc((e.refund??1)*100)+'%</p>','cancelProject',()=>({hero,project:j.id}))));
 }
 if(!box.children.length)box.textContent='Рецептов и открытых проектов пока нет.';
}
actions.push((a,{gm,hero,t,e})=>{
 economy(S);
 if(gm&&!e.demo&&['bank','camp'].includes(tab))a.append(button('Добавить демонстрационный набор',()=>commandForm('Демонстрация','<p>Добавить тестовые регионы, предметы, рецепты и занятия в текущую кампанию?</p>','demo',()=>({}),'Добавить')));
 if(hero&&owned(actor,hero)){
  a.append(button('Сумки',bagPage));
  if(t)a.append(button('Добыча',activities));
  a.append(button('Книга рецептов',recipeBook));
 }
});
