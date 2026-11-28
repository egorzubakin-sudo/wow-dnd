function onlineTravelAllowed(a) {
  return a.role === "master" || a.role === "captain" && a.travel;
}
function travelLog(s,title,text) {
  s.journal.unshift({ id:crypto.randomUUID(), kind:"travel", title, text, day:s.company.day, year:s.company.year });
}
register("travelStart","party",(s,p,a)=>{
  requireThat(onlineTravelAllowed(a) && !s.journey && !currentStay(s), "Переход недоступен");
  const r=byId(s.routes,p.route), from=s.company.location;
  const to=r.a===from?r.b:r.a, nodes=[byId(s.nodes,from),byId(s.nodes,to)];
  requireThat([r.a,r.b].includes(from) && r.status!=="closed", "Переход недоступен");
  requireThat(a.role==="master" || r.visibility==="known" && r.status!=="conditional" &&
    nodes.every((row)=>row.visibility==="known"&&!row.hidden), "Маршрут должен подтвердить мастер");
  const roster=s.company.members.filter((m)=>m.active && (a.role==="master"||!m.hidden));
  let guideDie=null, guide=p.guide||"";
  if (guide==="random"||guide==="physical") {
    if (guide==="physical") requireThat(a.role==="master" && roster.length,"Физический результат вводит мастер");
    guideDie=roster.length ? guide==="physical"?integer(p.guideDie,1,roster.length):dice(roster.length):null;
    guide=roster[guideDie-1]?.id||"";
  }
  requireThat(!guide||containsId(roster,guide),"Проводник недоступен");
  const cost=tradeMoney(a.role==="master" ? p.cost : r.cost||0);
  requireThat(s.company.gold>=cost,"Недостаточно золота");
  const days=r.min===r.max?r.min:r.min+dice(r.max-r.min+1)-1;
  const routeName=r.name||nodes.map((row)=>row.name).join(" — ");
  s.company.gold=tradeMoney(s.company.gold-cost);
  s.engine.phase="travel";
  s.journey={routeId:r.id,from,to,routeName,start:s.company.day,days,risk:r.risk,
    events:[...r.events],guide,guideDie,guideSides:roster.length,cost,rolls:[],outcome:null,guideCheck:null};
  travelLog(s,"Выход в путь",routeName+" · "+days+" дн.");
});
register("travelGuide","party",(s,p,a)=>{
  const j=s.journey;
  requireThat(onlineTravelAllowed(a)&&j?.guide&&j.guideCheck==null,"Проверка недоступна");
  const g=heroOf(s,j.guide), h=profile(s,j.guide);
  const mod=Math.floor((h.stats.wis-10)/2)+(h.skills["Выживание"]||0)*bv(h)+h.bonus;
  const roll=dice(20);
  j.guideCheck={roll,mod,total:roll+mod};
});
register("travelRoll","party",(s,p,a)=>{
  const j=s.journey;
  requireThat(onlineTravelAllowed(a)&&j&&j.outcome===null,"Бросок недоступен");
  const count=j.risk===1?1:2;
  if (p.values) requireThat(a.role==="master" && Array.isArray(p.values) && p.values.length===count,"Физический результат вводит мастер");
  j.rolls=p.values ? p.values.map((x)=>integer(x,1,6)) : Array.from({length:count},()=>dice(6));
  j.outcome=j.risk===0?Math.min(...j.rolls):j.risk===2?Math.max(...j.rolls):j.rolls[0];
});
