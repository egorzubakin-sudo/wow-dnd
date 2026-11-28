import assert from "node:assert/strict";
import { initializeGame, gameView, mutateGame } from "../supabase/functions/atlas-play/engine.mjs";
import { gameHandler } from "../supabase/functions/atlas-play/handler.mjs";

const player="00000000-0000-0000-0000-000000000002";
const master="00000000-0000-0000-0000-000000000001";
const campaign="10000000-0000-0000-0000-000000000001";
const actors={
  [player]:{role:"player",name:"Игрок",nick:player,heroes:["hero"],travel:false},
  [master]:{role:"master",name:"Мастер",nick:master,heroes:[],travel:true},
};
const fixture={
  version:1, factions:[], routes:[], map:null, settings:{notes:"PRIVATE_SETTINGS"},
  nodes:[{id:"mine",x:.5,y:.5,name:"Шахта",visibility:"known",notes:"PRIVATE_NODE"},
    {id:"trap",name:"PRIVATE_TRAP",x:.3,y:.5,visibility:"hidden"}],
  company:{name:"Компания", day:1,year:27,location:"mine", gold:5,
    members:[{id:"hero",name:"Рудокоп",active:true},{id:"other",name:"Чужой",active:true}],
    inventory:[{id:"other-purse",item_id:"ore",owner:"member:other",name:"PRIVATE_PURSE",qty:2}],
  },
  portal:{news:[{id:"future",title:"PRIVATE_FUTURE",day:2,year:27}],
    achievements:[{id:"closed",title:"Готово",closed:true,body:"PRIVATE_CONDITION",grants:[]}]},
  contracts:[{id:"secret",title:"PRIVATE_CONTRACT",hidden:true}],
  journal:[{id:"secret",kind:"contract",title:"Публичное название",text:"PRIVATE_REWARD"}],
  engine:{schemaVersion:1,receipts:[],phase:"stay",
    profiles:{hero:{level:3,stats:{str:10,dex:10,con:10,int:10,wis:10,cha:10},
      skills:{"Выживание":1},tools:["Инструменты каменщика","Инструменты кузнеца"],
      professions:["mining","smithing"],recipes:[],bonus:0,wallet:10}},
    stays:[{id:"stay",name:"Стоянка",location:"mine",region:"region",start:1,days:1,hours:8,
      spent:{},history:[],showDC:false}],
    regions:[{id:"region",name:"Регион",tier:1,dc:0,notes:"PRIVATE_REGION"}],
    items:[{id:"ore",name:"Руда",category:"Материалы",quality:"common"},{id:"bar",name:"Слиток",category:"Материалы",quality:"common"}],
    recipes:[{id:"smith",name:"Слиток",item_id:"bar",profession_id:"smithing",hours:1,quantity:1,rank:1,basic:true}],
    ingredients:[{id:"material",recipe_id:"smith",item_id:"ore",quantity:1}],
    loot:[{id:"pit",region_id:"region",profession_id:"mining",item_id:"ore",weight:1,min_quantity:2,max_quantity:2,min_margin:0,hours:2,dc:0}],
  },
};
const access=(user,document=fixture,revision=1)=>({ actor:actors[user],document,revision,prefix:null,share_map:true,portraits:{} });
const projection=gameView(initializeGame(fixture),access(player));
assert(!JSON.stringify(projection).includes("PRIVATE_"));
assert.equal(projection.nodes.length,1);
assert.equal(projection.engine.loot[0].dc,undefined);
assert.throws(()=>mutateGame(access(player),"tradeDonation",{hero:"other",amount:1},"bad"));
assert.throws(()=>mutateGame(access(player),"masterSave",{document:fixture},"bad"));
assert.throws(()=>mutateGame(access(player),"transfer",{hero:"hero",stack:"other-purse",qty:1},"bad"));

let document=structuredClone(fixture), revision=1;
const keys=new Set();
const transport=async (url,opts) => {
  const path=new URL(url).pathname;
  if(path==="/auth/v1/user"){
    const user=opts.headers.Authorization.slice(7);
    return actors[user]?Response.json({id:user}):new Response(null,{status:401});
  }
  assert.equal(opts.headers.Authorization,"Bearer fixture-service-role");
  const p=JSON.parse(opts.body);
  if(path.endsWith("atlas_game_read"))
    return p.p_campaign===campaign?Response.json(access(p.p_user,document,revision)):Response.json({}, {status:403});
  assert(path.endsWith("atlas_game_write"));
  if (keys.has(p.p_command)) return Response.json({status:"duplicate",revision});
  if (p.p_expected!==revision) return Response.json({status:"conflict",revision});
  keys.add(p.p_command);
  document=p.p_document;
  return Response.json({status:"saved",revision:++revision});
};
const handler=gameHandler({url:"https://fixture.example.test",serviceKey:"fixture-service-role"},transport);
const call=async (user,body) => {
  const response=await handler(new Request("https://fixture.example.test/functions/v1/atlas-play",{
    method:"POST",headers:{Authorization:"Bearer "+user},
    body:JSON.stringify({campaign,...body}),
  }));
  return {status:response.status,data:await response.json()};
};
const command=(name,payload,expected,key=crypto.randomUUID())=>({
  action:"command",request:crypto.randomUUID(),revision:expected,key,name,payload,
});
const gathered=await call(player,command("gather",{hero:"hero",profession:"mining"},1,"gather-once"));
assert.equal(gathered.status,200);
assert.equal(gathered.data.revision,2);
assert.equal(gathered.data.document.company.inventory.find(x=>x.item_id==="ore").qty,2);
assert(!JSON.stringify(gathered.data).includes("PRIVATE_"));
const stale=await call(player,command("craft",{hero:"hero",recipe:"smith",qty:1},1));
assert.equal(stale.data.conflict,true);
assert.equal(revision,2);
const duplicate=await call(player,command("gather",{hero:"hero",profession:"mining"},2,"gather-once"));
assert.equal(duplicate.data.revision,2);
const crafted=await call(player,command("craft",{hero:"hero",recipe:"smith",qty:1},2));
assert.equal(crafted.status,200);
assert.equal(crafted.data.document.company.inventory.find(x=>x.item_id==="bar").qty,1);
assert.equal(crafted.data.document.engine.stays[0].spent.hero,3);
assert.equal((await call(master,{action:"state"})).data.document.company.inventory.find(x=>x.item_id==="bar").qty,1);
const bad=await call(player,command("masterSave",{document:fixture},3));
assert.equal(bad.status,422);
assert.equal((await call("invalid",{action:"state"})).status,401);
assert.equal((await call(player,{action:"state",campaign:"10000000-0000-0000-0000-000000000002"})).status,403);

const concurrent=await Promise.all([
  call(player,command("rest",{hero:"hero",hours:1},3)),
  call(player,command("rest",{hero:"hero",hours:1},3)),
]);
assert.equal(concurrent.filter((entry)=>entry.data.conflict).length,1);
assert.equal(document.engine.stays[0].spent.hero,4);
const masterSnapshot=structuredClone(document);
masterSnapshot.company.notes="Правка мастера";
const updated=await call(master,command("masterSave",{document:masterSnapshot},revision));
assert.equal(updated.status,200);
assert.equal(updated.data.document.company.notes,"Правка мастера");
assert.equal(updated.data.document.engine.stays[0].spent.hero,4);
console.log("Shared game permissions, gathering, crafting, visibility, and concurrency passed");
