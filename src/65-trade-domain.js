// Campaign house rules. No combat engine or external dependencies.
const TRADE_NAMES={mining:"Ящик руды",herbalism:"Тюк трав",skinning:"Тюк шкур",fishing:"Бочка рыбы",hunt:"Охотничьи товары",archaeology:"Коллекция древностей",smithing:"Кузнечные товары",alchemy:"Алхимические товары",cooking:"Продовольственные товары",engineering:"Инженерные товары",inscription:"Писчие товары",jewelry:"Ювелирные товары",leather:"Кожевенные товары",tailor:"Текстильные товары",enchanting:"Чародейские товары"};
const TRADE_SERVICES={smithing:"Оружейная",alchemy:"Лаборатория",cooking:"Полевая кухня",engineering:"Мастерская",jewelry:"Мастерская",leather:"Мастерская",tailor:"Мастерская",enchanting:"Зачаровательная",inscription:"Писарь"};
const TRADE_QUALITY=["common","uncommon","rare"], TRADE_GRADE=["Обычные","Высокого качества","Превосходные"], TRADE_CATEGORY="Торговые товары";
const TRADE_MARKET_FIELDS=["node_id","item_id","faction_id","stock","demand","budget","buy_factor","sell_factor"];
const TRADE_PRODUCT_FIELDS=["profession_id","rank","ingredients","hours","value_gp","gold"];
function tradeId(profession,rank){return "trade-"+profession+"-"+rank;}
function tradeState(s){const e=economy(s);e.markets??=[];e.facilityTiers??={};return e;}
function tradeMoney(v){requireThat(typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=1e9,"Некорректная денежная сумма");return Math.round(v*100)/100;}
function tradeNumber(v){requireThat(typeof v==="number"||typeof v==="string"&&v.trim(),"Ожидалось число");const n=Number(v);requireThat(Number.isFinite(n),"Некорректное число");return n;}
function tradeRows(s,rows){
 const e=tradeState(s),result=[],seen=new Set();
 requireThat(Array.isArray(rows)&&rows.length>0&&rows.length<=1000,"Нужен список от 1 до 1000 позиций");
 for(const x of rows){
  requireThat(x&&typeof x==="object"&&!Array.isArray(x),"Неверная строка рынка");
  byId(s.nodes,x.node_id);const item=byId(e.items,x.item_id);
  requireThat(!item.hidden&&item.value_gp>0&&item.stackable!==false,"Нужен открытый товар с положительной ценой, допускающий стопки");
  if(x.faction_id)byId(s.factions,x.faction_id);
  const id=JSON.stringify([x.node_id,x.item_id]);requireThat(!seen.has(id),"Повтор товара на одном рынке");seen.add(id);
  const buy=tradeNumber(x.buy_factor),sell=tradeNumber(x.sell_factor);
  requireThat(buy>0&&sell>=0&&buy>=sell&&buy<=10,"Коэффициенты: 0 ≤ скупка ≤ продажа ≤ 10");
  result.push({node_id:x.node_id,item_id:x.item_id,faction_id:x.faction_id||"",stock:integer(tradeNumber(x.stock),0),demand:integer(tradeNumber(x.demand),0),budget:tradeMoney(tradeNumber(x.budget)),buy_factor:buy,sell_factor:sell});
 }
 return result;
}
register("tradeMarkets","master",(s,p)=>{
 const e=tradeState(s),rows=tradeRows(s,p.rows);
 for(const r of rows){const old=e.markets.find(x=>x.node_id===r.node_id&&x.item_id===r.item_id);if(old)Object.assign(old,r);else e.markets.push(r);}
});
function tradePrices(s,row){
 const item=byId(economy(s).items,row.item_id), f=row.faction_id?s.factions.find(x=>x.id===row.faction_id):null;
 requireThat(!item.hidden&&item.stackable!==false&&item.value_gp>0,"Товар недоступен");
 requireThat(!row.faction_id||f&&!f.hidden&&(f.repPoints??0)>=0,"Торговля с фракцией недоступна");
 const rep=f?.repPoints||0, bonus=rep>=42000?.2:rep>=21000?.15:rep>=9000?.1:rep>=3000?.05:0;
 const buy=tradeMoney(Math.max(.01,Math.ceil(item.value_gp*row.buy_factor*(1-bonus)*100-1e-8)/100));
 const sell=tradeMoney(Math.min(Math.max(0,buy-.01),Math.floor(item.value_gp*row.sell_factor*(1+bonus)*100+1e-8)/100));
 return {buy,sell};
}
function localMarket(s){const t=currentStay(s);return t&&s.engine.phase==="stay"?(s.engine.markets||[]).filter(r=>r.node_id===t.location):[];}
register("tradeDeal","hero",(s,p)=>{
 const h=profile(s,p.hero);tradeState(s);const row=localMarket(s).find(x=>x.item_id===p.item);
 requireThat(row,"Торговля возможна только на текущей стоянке");
 requireThat(["buy","sell"].includes(p.side),"Неизвестный тип сделки");
 const q=integer(p.qty,1,1000),prices=tradePrices(s,row),total=tradeMoney(q*prices[p.side]),owner="member:"+p.hero;
 if(p.side==="buy"){
  requireThat(row.stock>=q&&h.wallet>=total,"Недостаточно товара или золота");
  h.wallet=tradeMoney(h.wallet-total);row.stock-=q;row.budget=tradeMoney(row.budget+total);deposit(s,p.item,owner,q);
 }else{
  requireThat(total>0&&row.demand>=q&&row.budget>=total,"Спрос или бюджет скупщика исчерпан");
  const stacks=s.company.inventory.filter(x=>x.item_id===p.item&&x.owner===owner&&!x.hidden&&!x.properties);
  requireThat(stacks.reduce((a,x)=>a+x.qty,0)>=q,"Недостаточно доступных товаров в личных сумках");
  let left=q;for(const x of stacks){const used=Math.min(left,x.qty);x.qty-=used;left-=used;if(!left)break;}
  s.company.inventory=s.company.inventory.filter(x=>x.qty>0);
  row.demand-=q;row.stock=integer(row.stock+q);row.budget=tradeMoney(row.budget-total);h.wallet=tradeMoney(h.wallet+total);
 }
});
register("tradeDonation","hero",(s,p)=>{
 const h=profile(s,p.hero),amount=tradeMoney(p.amount);
 requireThat(amount>0&&h.wallet>=amount,"Недостаточно личного золота");
 h.wallet=tradeMoney(h.wallet-amount);s.company.gold=tradeMoney(s.company.gold+amount);
});
function tradeProductRows(s,rows){
 const e=tradeState(s),seen=new Set(),out=[];
 requireThat(Array.isArray(rows)&&rows.length>0&&rows.length<=200,"Нужен список от 1 до 200 рецептов");
 for(const x of rows){
  requireThat(x&&typeof x==="object"&&!Array.isArray(x),"Неверная строка товара");
  const prof=byId(e.professions,x.profession_id),rank=integer(tradeNumber(x.rank),2,4);
  requireThat(Object.hasOwn(TRADE_NAMES,prof.id),"Нет товарной категории для профессии");
  const id=tradeId(prof.id,rank),recipe_id="make-"+id;
  requireThat(!seen.has(id),"Повтор категории и качества");seen.add(id);
  const value=tradeMoney(tradeNumber(x.value_gp)),gold=tradeMoney(tradeNumber(x.gold==null||x.gold===""?0:x.gold)),hours=integer(tradeNumber(x.hours),1,10000);
  requireThat(value>0,"Цена товара должна быть положительной");
  const ingredients=typeof x.ingredients==="string"?JSON.parse(x.ingredients):x.ingredients;
  requireThat(Array.isArray(ingredients)&&ingredients.length>0&&ingredients.length<=30,"Укажите материалы");
  const materialIds=new Set(),parts=[];let inputValue=0;
  for(const line of ingredients){
   const item=byId(e.items,line.item_id),qty=integer(tradeNumber(line.quantity),1,100000);
   requireThat(["Материалы","Припасы"].includes(item.category),"Нужны сырьё или припасы, а не экипировка/товары");
   requireThat(!item.hidden&&!materialIds.has(item.id)&&item.stackable!==false,"Повтор или недоступный материал");
   materialIds.add(item.id);parts.push({id:recipe_id+":"+item.id,recipe_id,item_id:item.id,quantity:qty});inputValue+=tradeMoney(Number(item.value_gp||0))*qty;
  }
  const raw=prof.kind==="gathering";requireThat(!raw||value<=inputValue+1e-8,"Упаковка не увеличивает стоимость сырья");
  const service=raw?"":TRADE_SERVICES[prof.id]||"",name=TRADE_NAMES[prof.id];
  const old=e.items.find(i=>i.id===id),oldRecipe=e.recipes.find(r=>r.id===recipe_id);
  requireThat(!old||old.trade_product===true,"Конфликт ID товара");requireThat(!oldRecipe||oldRecipe.trade_product===true,"Конфликт ID рецепта");
  out.push({item:{id,name,category:TRADE_CATEGORY,quality:TRADE_QUALITY[rank-2],value_gp:value,desc:"Торговая партия. "+TRADE_GRADE[rank-2]+". Не является боевым предметом.",profession_id:prof.id,stackable:true,trade_product:true,source:{origin:"house"}},recipe:{id:recipe_id,name:name+" · "+TRADE_GRADE[rank-2],profession_id:prof.id,item_id:id,rank,hours,gold,quantity:1,basic:true,service,facility_rank:raw?1:rank-1,trade_product:true,source:{origin:"house"}},parts});
 }
 return out;
}
register("tradeProducts","master",(s,p)=>{
 const rows=tradeProductRows(s,p.rows),e=tradeState(s);e.categories??=[];if(!e.categories.includes(TRADE_CATEGORY))e.categories.push(TRADE_CATEGORY);
 for(const {item,recipe,parts} of rows){
  const old=e.items.find(x=>x.id===item.id),oldRecipe=e.recipes.find(x=>x.id===recipe.id);
  if(old)Object.assign(old,item,{desc:old.desc||item.desc});else e.items.push(item);
  if(oldRecipe)Object.assign(oldRecipe,recipe);else e.recipes.push(recipe);
  e.ingredients=e.ingredients.filter(x=>x.recipe_id!==recipe.id).concat(parts);
 }
});
function campTier(s,service){return s.company.talents?.[service]?(s.engine.facilityTiers?.[service]||1):0;}
register("facilityTier","master",(s,p)=>{
 const e=tradeState(s),old=campTier(s,p.service),tier=integer(p.tier,2,3),cost=tradeMoney(p.cost);
 requireThat(Object.values(TRADE_SERVICES).includes(p.service)&&old===tier-1,"Сначала откройте предыдущую ступень");
 requireThat(s.company.gold>=cost,"Недостаточно золота в казне");s.company.gold=tradeMoney(s.company.gold-cost);e.facilityTiers[p.service]=tier;
});
register("facilityRental","master",(s,p)=>{
 const t=currentStay(s),tier=integer(p.tier,1,3),cost=tradeMoney(p.cost);
 requireThat(t&&s.engine.phase==="stay"&&Object.values(TRADE_SERVICES).includes(p.service),"Нужна стоянка и подходящая мастерская");
 requireThat(!t.services?.includes(p.service)||(t.serviceTiers?.[p.service]??3)<tier,"Услуга уже доступна");
 requireThat(s.company.gold>=cost,"Недостаточно золота в казне");s.company.gold=tradeMoney(s.company.gold-cost);
 t.services??=[];t.serviceTiers??={};if(!t.services.includes(p.service))t.services.push(p.service);t.serviceTiers[p.service]=tier;
});
const baseTradeFacilities=facilities;
facilities=function(s,r){
 if(!baseTradeFacilities(s,r))return false;
 if(!r.service||!r.facility_rank)return true;
 const t=currentStay(s),local=t.services?.includes(r.service)?(t.serviceTiers?.[r.service]??3):0;
 return Math.max(campTier(s,r.service),local)>=r.facility_rank;
};
// Opt-in tempo preset; previously started projects keep their recipe snapshot.
function craftTempoHours(s,r){
 const i=byId(economy(s).items,r.item_id);
 if(i.quality==="legendary")return r.hours;
 const magic=i.category==="Магические предметы"||i.quality!=="common";
 if(!magic)return Math.min(r.hours,["Оружие","Броня"].includes(i.category)?24:4);
 const targets={common:8,uncommon:24,rare:56,epic:112};return Math.min(r.hours,targets[i.quality]||8);
}
register("craftTempo","master",(s,p)=>{
 const e=tradeState(s);requireThat(Array.isArray(p.ids)&&new Set(p.ids).size===p.ids.length,"Неверный список рецептов");
 for(const id of p.ids){const r=byId(e.recipes,id);requireThat(!r.trade_product,"Торговые товары имеют собственные сроки");
 const old=r.hours,target=craftTempoHours(s,r);if(old!==target){r.reference_hours??=old;r.hours=target;r.time_policy="atlas-weekly";}}
});
