// Domain functions take a candidate campaign, never DOM elements.
const commands = new Map();
function requireThat(ok, message){if(!ok) throw Error(message)}
function integer(v,min=0,max=1000000000){
  requireThat(Number.isSafeInteger(v)&&v>=min&&v<=max,'Число вне диапазона');
  return v;
}
function migrate(s){
  s.engine ??= {schemaVersion:1,receipts:[]};
  requireThat(s.engine.schemaVersion===1&&Array.isArray(s.engine.receipts),'Неизвестная схема движка');
  return s;
}
function register(name,access,run){commands.set(name,{access,run})}
function owned(actor,h){return actor.role==='master'||(['captain','player'].includes(actor.role)&&actor.heroes.includes(h))}
function applyCommand(source, actor, name, payload, key){
  const cmd=commands.get(name);
  requireThat(actor&&cmd,'Неизвестная команда');
  requireThat(actor.role==='master'||(cmd.access==='hero'&&owned(actor,payload.hero)),'Недостаточно прав');
  requireThat(key&&!source.engine.receipts.some(r=>r.key===key),'Операция уже применена');
  const next=structuredClone(source);
  cmd.run(next,payload,actor);
  next.engine.receipts.push({key,name,actor:actor.nick,hero:payload.hero,day:next.company.day});
  return next;
}
