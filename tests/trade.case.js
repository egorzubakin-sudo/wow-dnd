{
 const s=migrate({company:{day:1,gold:500,location:"market",members:[{id:"h"},{id:"other"}],inventory:[],talents:{"Арсенал":true,"Оружейная":true}},nodes:[{id:"market",name:"Рынок"}],factions:[],contracts:[],portal:{achievements:[]}});
 adventure(s); const gm={role:"master",nick:"gm"},p={role:"player",nick:"player",heroes:["h"]};
 profile(s,"h").tools=["Инструменты кузнеца","Инструменты каменщика"];profile(s,"h").wallet=50;
 s.engine.items.push({id:"metal",name:"Слиток",category:"Материалы",quality:"common",value_gp:2});
 deposit(s,"metal","member:h",10);
 let k=0,run=(state,who,name,payload)=>applyCommand(state,who,name,payload,"trade-test-"+(++k));
 let a=run(s,gm,"stay",{location:"market",days:7,hours:8,services:[]});
 assert.throws(()=>run(a,gm,"tradeProducts",{rows:[{profession_id:"mining",rank:2,ingredients:[{item_id:"metal",quantity:1}],hours:1,value_gp:5}]}));
 a=run(a,gm,"tradeProducts",{rows:[{profession_id:"smithing",rank:2,ingredients:[{item_id:"metal",quantity:2}],hours:4,value_gp:8}]});
 const item=tradeId("smithing",2),recipe="make-"+item;
 a=run(a,p,"craft",{hero:"h",recipe,qty:2});assert.equal(a.engine.projects.at(-1).status,"done");assert.equal(remaining(a,"h"),48);
 a=run(a,gm,"tradeMarkets",{rows:[{node_id:"market",item_id:item,stock:1,demand:2,budget:100,buy_factor:1.4,sell_factor:.8}]});
 assert.throws(()=>run(a,p,"tradeDeal",{hero:"other",item,qty:1,side:"sell"}));
 const previous=a;a=run(a,p,"tradeDeal",{hero:"h",item,qty:2,side:"sell"});
 assert.equal(profile(a,"h").wallet,62.8);assert.equal(profile(previous,"h").wallet,50);
 assert.equal(a.engine.markets[0].demand,0);assert.equal(a.engine.markets[0].stock,3);
 assert.throws(()=>run(a,p,"tradeDeal",{hero:"h",item,qty:1,side:"sell"}));
 a=run(a,p,"tradeDeal",{hero:"h",item,qty:1,side:"buy"});assert.equal(profile(a,"h").wallet,51.6);
 a=run(a,p,"tradeDonation",{hero:"h",amount:25});assert.equal(a.company.gold,525);
 assert.throws(()=>run(a,p,"facilityTier",{service:"Оружейная",tier:2,cost:300}));
 a=run(a,gm,"facilityTier",{service:"Оружейная",tier:2,cost:300});assert.equal(campTier(a,"Оружейная"),2);assert.equal(a.company.gold,225);
 a=run(a,gm,"facilityRental",{service:"Лаборатория",tier:3,cost:15});
 assert.equal(facilities(a,{service:"Лаборатория",facility_rank:3}),true);assert.equal(a.company.gold,210);
 assert.throws(()=>run(a,gm,"facilityRental",{service:"Лаборатория",tier:3,cost:15}));
 a.engine.items.push({id:"test-magic",name:"Магический предмет",category:"Магические предметы",quality:"rare"});
 a.engine.recipes.push({id:"test-tempo",item_id:"test-magic",hours:400});
 a=run(a,gm,"craftTempo",{ids:["test-tempo"]});assert.equal(byId(a.engine.recipes,"test-tempo").hours,56);assert.equal(byId(a.engine.recipes,"test-tempo").reference_hours,400);
}
