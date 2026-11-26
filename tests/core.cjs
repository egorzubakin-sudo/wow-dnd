const {readFileSync,readdirSync}=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({structuredClone,crypto:require('node:crypto').webcrypto,assert});
for(const f of readdirSync('src').filter(f=>f.includes('-domain')||f==='01-core.js').sort())vm.runInContext(readFileSync('src/'+f,'utf8'),ctx);
vm.runInContext(`const testState=migrate({company:{day:1,members:[],inventory:[]}});register('inc','master',s=>s.company.day++);const gm={nick:'g',role:'master'};const result=applyCommand(testState,gm,'inc',{},'once');assert.equal(result.company.day,2);assert.equal(testState.company.day,1);assert.throws(()=>applyCommand(result,gm,'inc',{},'once'));assert.throws(()=>applyCommand(testState,{role:'observer'},'inc',{},'x'));`,ctx);
for(const f of readdirSync('tests').filter(f=>f.endsWith('.case.js')).sort())vm.runInContext(readFileSync('tests/'+f,'utf8'),ctx);
console.log('Domain checks passed');
