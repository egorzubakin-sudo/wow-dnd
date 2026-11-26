{
 const s=migrate({company:{members:[{id:'h'},{id:'i'}],inventory:[],day:1,talents:{}},nodes:[{id:'n'}],contracts:[]});economy(s);commands.get('demo').run(s,{});
 commands.get('stay').run(s,{location:'n',region:'durotar',days:3,hours:8,early:true});
 const h=profile(s,'h');h.tools=['Инструменты каменщика'];h.recipes=['make-bar'];
 gather(s,{hero:'h',profession:'mining'},sides=>Math.min(10,sides));
 assert(s.company.inventory.some(x=>x.item_id==='ore'));assert.equal(remaining(s,'h'),23);
 commands.get('project').run(s,{hero:'h',recipe:'make-bar',qty:1});
 const project=s.engine.projects[0].id;
 commands.get('work').run(s,{hero:'h',project,hours:2});
 assert.throws(()=>commands.get('work').run(s,{hero:'h',project,hours:2}));
 const bar=s.company.inventory.find(x=>x.item_id==='bar');commands.get('transfer').run(s,{hero:'h',stack:bar.id,to:'i',qty:1});
 assert.equal(s.company.inventory.find(x=>x.item_id==='bar').owner,'member:i');
}
