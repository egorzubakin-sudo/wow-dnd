{
  const start = migrate({ company: { day: 1, year: 27 }, settings: {},
    nodes: [{ id: "a", x: .2, y: .4 }], factions: [{ id: "guild", name: "Гильдия", charter: "Старая грамота" }],
  });
  const master = { role: "master", nick: "gm" };
  const observer = { role: "observer", nick: "guest" };
  const move = { id: "a", x: .7, y: .8 };
  assert.throws(() => applyCommand(start, observer, "mapMove", move, "move"), /прав/);
  assert.throws(() => applyCommand(start, master, "mapMove", { ...move, x: 3 }, "move"), /координаты/);
  assert.throws(() => applyCommand({ ...start, settings: { mapLocked: true } }, master, "mapMove", move, "move"), /заперто/);
  const next = applyCommand(start, master, "mapMove", move, "move");
  assert.equal(start.nodes[0].x, .2);
  assert.equal(next.nodes[0].x, .7);
  assert.throws(() => applyCommand(next, master, "mapMove", move, "move"), /уже применена/);
  const charter = { faction: "guild", text: "Право прохода\nЛьготная цена" };
  const awarded = applyCommand(next, master, "issueCharter", charter, "award");
  assert.equal(awarded.factions[0].charter, "Старая грамота\nПраво прохода\nЛьготная цена");
  assert.throws(() => applyCommand(awarded, master, "issueCharter", charter, "other"), /уже выдана/);
  assert.equal(awarded.journal[0].kind, "faction");
  const contract = { id: "survey", title: "Разведка", status: "active" };
  const finished = applyCommand({ ...awarded, contracts: [contract] }, master, "finishContract", {
    id: contract.id, rows: [{ type: "charter", faction: "guild", text: "Пропуск в порт" }],
  }, "contract");
  assert.equal(finished.factions[0].charter, awarded.factions[0].charter + "\nПропуск в порт");
  assert.equal(finished.contracts[0].rewardReceipt.rewards[0].type, "charter");
}

{
  const start = migrate({settings:{},company:{day:1,year:27,location:"a",members:[],inventory:[]},
    nodes:[{id:"a",name:"Перекрёсток",x:.2,y:.4},{id:"b",name:"Форт",x:.8,y:.4}],
    routes:[{id:"road",a:"a",b:"b",min:3,max:5,events:["Событие"]}],
    factions:[],contracts:[],portal:{},
  });
  foundation(start).regions.push({id:"steps",name:"Степи"});
  mapData(start);
  const master={role:"master",nick:"gm"};
  let n=0;
  const edit=(s,name,p)=>applyCommand(s,master,name,p,"geometry-"+(++n));
  const continent=edit(start,"atlasSheet",{id:"kalimdor",name:"Калимдор",kind:"continent"});
  let regional=edit(continent,"atlasSheet",{id:"barrens",name:"Великие Степи",kind:"region",parent_id:"kalimdor"});
  assert.throws(()=>edit(regional,"atlasSheet",{id:"kalimdor",name:"Калимдор",kind:"continent",parent_id:"barrens"}),/Цикл/);
  assert.throws(()=>edit(regional,"atlasRemoveSheet",{id:"kalimdor"}),/дочерние/);
  assert.throws(()=>edit(regional,"atlasGeometry",{map_id:"barrens",route_id:"road",points:[]}),/оба конца/);
  for (const [node_id,x] of [["a",.25],["b",.9]])
    regional=edit(regional,"atlasPlacement",{node_id,map_id:"barrens",x,y:.5});
  const points=[[.35,.84],[.6,.3]];
  const geometry=edit(regional,"atlasGeometry",{map_id:"barrens",route_id:"road",points,style:"smooth"});
  assert.equal(geometry.nodes.length,2);
  assert.equal(JSON.stringify(geometry.routes),JSON.stringify(start.routes));
  assert.equal(geometry.company.location,"a");
  assert.equal(mapEntry(geometry.engine.mapPlacements,"node_id","a",overviewMap).x,.2);
  assert.equal(mapEntry(geometry.engine.mapPlacements,"node_id","a","barrens").x,.25);
  const boundary=edit(geometry,"atlasBoundary",{map_id:"barrens",region_id:"steps",points:[[.25,.2],[.65,.2],[.65,.7],[.25,.7]]});
  assert.equal(regionAt(boundary,byId(boundary.nodes,"a")).id,"steps");
  assert.equal(regionAt(boundary,byId(boundary.nodes,"b")),undefined);
  assert.throws(()=>edit(boundary,"atlasBoundary",{map_id:"barrens",region_id:"steps",points:[[.1,.2],[.2,.2],[.4,.2]]}),/охватывать/);
  const missing=edit(boundary,"atlasPlacement",{map_id:"barrens",node_id:"a",remove:true});
  assert.equal(missing.nodes.length,2);
  assert.equal(missing.routes.length,1);
  assert.equal(mapEntry(missing.engine.routeGeometries,"route_id","road","barrens"),undefined);
  const denied={role:"player",heroes:[]};
  assert.throws(()=>applyCommand(boundary,denied,"atlasRemoveSheet",{id:"barrens"},"bad"),/прав/);
  assert.throws(()=>edit({...boundary,settings:{mapLocked:true}},"atlasRemoveSheet",{id:"barrens"}),/заперто/);
  const pack={maps:[{id:"city",name:"Город",kind:"local",parent_id:"barrens"}],
    mapPlacements:[{id:"city-keep",map_id:"city",node_id:"b",x:.4,y:.7}]};
  assert.equal(planImport(boundary,pack,"update").count.errors,0);
  assert(planImport(boundary,{...pack,mapPlacements:[...pack.mapPlacements,{...pack.mapPlacements[0],id:"repeat"}]},"update").count.errors);
}
