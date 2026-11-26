{
 const s=migrate({company:{day:1,members:[{id:'h'},{id:'i'}]},nodes:[{id:'n',x:.5,y:.5}]});
 foundation(s);const t=applyCommand(s,gm,'stay',{days:3,hours:8,location:'n'},'s');
 spend(t,'h',8,'x');assert.equal(remaining(t,'i'),24);assert.throws(()=>spend(t,'h',17,'x'));
 t.company.day=2;const closed=applyCommand(t,gm,'closeStay',{},'c');assert.equal(closed.company.day,4);
 const p=profile(s,'h');p.skills['Атлетика']=2;p.tools=['кирка'];
 const r=ability(p,{skill:'Атлетика',tool:'кирка',mode:'dis',dc:25},()=>20);
 assert.deepEqual(r.raw,[20]);assert.equal(r.total,24);assert.equal(r.success,false);
 assert(inside(.5,.5,[[0,0],[1,0],[1,1],[0,1]]));
}
