const rulebook=/*BUNDLED_RULES*/null;
const demoPack=/*BUNDLED_DEMO*/null;
function economy(s){
  const e=foundation(s);
  for(const k of ['items','recipes','ingredients','loot','projects'])e[k]??=[];
  e.professions??=structuredClone(rulebook.professions);e.gathering??=structuredClone(rulebook.gathering);
  for(const stack of s.company.inventory||[]){
    if(stack.item_id)continue;
    stack.item_id='legacy-'+stack.id;e.items.push({id:stack.item_id,name:stack.name,category:stack.category,quality:stack.quality,icon:stack.icon,image:stack.image,desc:stack.desc,hidden:stack.hidden,value_gp:0});
  }return e;
}
function byId(rows,id){const x=rows.find(r=>r.id===id);requireThat(x,'Не найдена запись '+id);return x}
function eligibleProfession(s,h,id){
  const p=byId(economy(s).professions,id);
  return (!p.skill||!!h.skills[p.skill])&&(!p.tools?.length||p.tools.some(t=>h.tools.includes(t)));
}
function deposit(s,item_id,owner,qty,extra={}){
  integer(qty,1);const item=byId(economy(s).items,item_id),bag=s.company.inventory;
  const existing=bag.find(x=>x.item_id===item_id&&x.owner===owner&&!x.properties&&!extra.properties&&!!x.hidden===!!(extra.hidden??item.hidden));
  if(existing&&item.stackable!==false){existing.qty=integer(existing.qty+qty);return}
  bag.push({...item,...extra,id:crypto.randomUUID(),owner,item_id,qty});
}
function take(s,item,owner,amount){
  integer(amount,1);const rows=s.company.inventory.filter(x=>x.item_id===item&&x.owner===owner&&!x.properties);
  requireThat(rows.reduce((n,x)=>n+x.qty,0)>=amount,'Недостаточно материалов');
  for(const row of rows){const use=Math.min(row.qty,amount);row.qty-=use;amount-=use}
  s.company.inventory=s.company.inventory.filter(x=>x.qty>0);
}
register('transfer','hero',(s,p)=>{
  const row=byId(s.company.inventory,p.stack),from='member:'+p.hero;
  requireThat(row.owner===from,'Чужая сумка');integer(p.qty,1,row.qty);
  if(p.to)heroOf(s,p.to);
  const owner=p.to?'member:'+p.to:'';
  if(owner===from){requireThat(p.qty<row.qty,'Для разделения укажите часть стопки');s.company.inventory.push({...row,id:crypto.randomUUID(),qty:p.qty})}
  else deposit(s,row.item_id,owner,p.qty,{properties:row.properties,hidden:row.hidden});
  row.qty-=p.qty;s.company.inventory=s.company.inventory.filter(x=>x.qty);
});
register('gold','master',(s,p)=>{const h=profile(s,p.hero);integer(p.amount,-1000000000);requireThat(h.wallet+p.amount>=0&&s.company.gold>=p.amount,'Недостаточно золота');h.wallet+=p.amount;s.company.gold-=p.amount});
function gather(s,p,die=dice){
  const h=profile(s,p.hero),t=currentStay(s),e=economy(s),id=p.profession;
  requireThat(t&&eligibleProfession(s,h,id),'Нужна стоянка и подходящие владения');
  const rows=e.loot.filter(r=>r.region_id===t.region&&r.profession_id===id&&(r.stock==null||r.stock>0));
  requireThat(rows.length,'В регионе нет доступного ресурса');
  const rule=rows[0],prof=byId(e.professions,id),region=byId(e.regions,t.region);
  if(rule.required_tool_id)requireThat(s.company.inventory.some(x=>x.item_id===rule.required_tool_id&&x.owner==='member:'+p.hero&&x.qty>0),'Нужно оборудование');
  const count=t.history.filter(x=>x.hero===p.hero&&x.activity===id).length;
  if(rule.attempts!=null)requireThat(count<rule.attempts,'Попытки исчерпаны');
  spend(s,p.hero,rule.hours||1,id);
  const check=ability(h,{skill:rule.skill||(id==='archaeology'?'История':'Выживание'),tool:prof.tools?.find(x=>h.tools.includes(x)),dc:rule.dc??region.dc,mode:'normal'},die);
  e.rolls.unshift({...check,hero:p.hero,label:prof.name});
  const matches=rows.filter(r=>check.total-check.dc>=r.min_margin);
  if(matches.length){
    const margin=Math.max(...matches.map(r=>r.min_margin)),pool=matches.filter(r=>r.min_margin===margin);
    let weight=die(pool.reduce((n,r)=>n+r.weight,0));const row=pool.find(r=>(weight-=r.weight)<=0);
    const qty=Math.min(row.stock??Infinity,row.min_quantity+die(row.max_quantity-row.min_quantity+1)-1);
    deposit(s,row.item_id,'member:'+p.hero,qty);if(row.stock!=null)row.stock-=qty;
    Object.assign(t.history.at(-1),{item_id:row.item_id,qty});
  }
}
register('gather','hero',(s,p)=>gather(s,p));
function facilities(s,r){
 const t=currentStay(s);return !!t&&(!r.service||s.company.talents[r.service]||t.services?.includes(r.service))&&(!r.locations?.length||r.locations.includes(t.location));
}
function canCraft(s,h,r){
 return bv(h)>=(r.rank||2)&&eligibleProfession(s,h,r.profession_id)&&(r.basic||h.recipes.includes(r.id))&&(r.tools||[]).every(t=>h.tools.includes(t))&&facilities(s,r);
}
register('project','hero',(s,p)=>{
 const e=economy(s),h=profile(s,p.hero),r=byId(e.recipes,p.recipe),owner='member:'+p.hero;
 integer(p.qty,1,1000);requireThat(canCraft(s,h,r),'Проверьте рецепт, ранг, владения и инфраструктуру');
 const cost=(r.gold||0)*p.qty,work=integer(r.hours*p.qty,1);
 requireThat(h.wallet>=cost&&remaining(s,p.hero)>0,'Недостаточно золота или времени');
 const reserve=e.ingredients.filter(i=>i.recipe_id===r.id).map(i=>({item:i.item_id,qty:i.quantity*p.qty}));
 for(const line of reserve)take(s,line.item,owner,line.qty);
 h.wallet-=cost;
 e.projects.push({id:crypto.randomUUID(),hero:p.hero,name:r.name,recipe:structuredClone(r),cost,reserve,left:work,work,qty:p.qty,status:'active',contributors:[]});
});
register('work','hero',(s,p)=>{
 const j=byId(economy(s).projects,p.project);
 requireThat(j.status==='active'&&facilities(s,j.recipe)&&eligibleProfession(s,profile(s,p.hero),j.recipe.profession_id),'Работа недоступна');
 integer(p.hours,1,j.left);spend(s,p.hero,p.hours,j.name);j.left-=p.hours;j.contributors.push({hero:p.hero,hours:p.hours});
 if(!j.left){deposit(s,j.recipe.item_id,'member:'+j.hero,j.qty*j.recipe.quantity,j.recipe.properties?{properties:j.recipe.properties}:{});j.status='done'}
});
register('cancelProject','hero',(s,p)=>{
 const j=byId(economy(s).projects,p.project);requireThat(j.hero===p.hero&&j.status==='active','Проект недоступен');
 const rate=s.engine.refund??1;for(const l of j.reserve){const qty=Math.floor(l.qty*rate);if(qty)deposit(s,l.item,'member:'+j.hero,qty)}
 profile(s,j.hero).wallet+=Math.floor(j.cost*rate);j.status='cancelled';
});
register('demo','master',s=>{
 const e=economy(s);requireThat(!e.demo,'Пример уже установлен');
 for(const [k,rows] of Object.entries(demoPack)){const target=k==='errands'?s.contracts:e[k];for(const row of rows){requireThat(!target.some(x=>x.id===row.id),'Конфликт ID '+row.id);target.push(structuredClone(row))}}
 e.demo=true;
});
