# Start with a genuine v0.9 export created in its own browser context.
import json
old=browser.new_context()
prototype=old.new_page()
prototype.goto(f'http://127.0.0.1:{server.server_port}/legacy/atlas-v09.html')
prototype.wait_for_function("document.querySelector('#main').children.length>0")
img='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+rRFkAAAAASUVORK5CYII='
prototype.evaluate("""(image)=>{loadDemo();S.company.members[0].name='Рудокоп';S.company.members[1].name='Кузнец';S.company.members[0].image=image;S.company.inventory.push({id:'old-item',name:'Старая кирка',quality:'common',category:'Снаряжение',qty:2,image,owner:'member:'+S.company.members[0].id});S.portal.codex.push({id:'secret',title:'СЕКРЕТ-ЛЕТА',hidden:true});commit()}""",img)
def exported(pg):
    operations=pg.locator('#atlasOperations')
    if operations.count() and not pg.locator('#exportBtn').is_visible():
        operations.locator('summary').click()
    with pg.expect_download() as d: pg.locator('#exportBtn').click()
    return json.loads(Path(d.value.path()).read_text())
campaign=exported(prototype)
# A synthetic RC1 save reproduces the reported empty catalog shape.
default_rules=json.loads((root/'data/rules.json').read_text())
old_professions=[{key:row[key] for key in ('id','name','tools','skill','source')} for row in default_rules['professions']]
old_professions[0]['desc']='Описание мастера о медных жилах.'
old_professions[1]['description']=''
campaign['engine']={'schemaVersion':1,'receipts':[],'professions':old_professions,
                    'gathering':default_rules['gathering'],'items':[],'recipes':[],
                    'ingredients':[],'loot':[],'regions':[]}
campaign['settings']['navIcons']={'stay':img,'craft':img,'workshop':img}
old.close()
page.on('dialog',lambda dialog:dialog.accept())
def import_campaign(data):
    page.locator('#importFile').set_input_files({'name':'campaign.json','mimeType':'application/json','buffer':json.dumps(data,ensure_ascii=False).encode()})
def tab(t):
    page.evaluate('(t)=>switchTab(t)',t)
def btn(name):
    page.evaluate("name=>{for(const b of document.querySelectorAll('details button'))if(b.textContent===name)b.closest('details').open=true}",name)
    page.get_by_role('button',name=name,exact=True).first.click()
def submit():
    page.locator('#engineForm button[type=submit]').click()
    page.wait_for_function("!document.querySelector('#engineForm')||!document.querySelector('#modalwrap').classList.contains('open')")
def signout():
    page.locator('#modeBtn').click()
    btn('Выйти')
def signin(nick):
    page.locator('#nick').fill(nick)
    page.locator('#pass').fill('atlas-test-pw')
    page.locator('#authForm button').click()
    page.locator('body:not(.locked)').wait_for()
def add_account(nick,i):
    page.locator('#modeBtn').click()
    btn('Создать пользователя')
    page.locator('#nn').fill(nick)
    page.locator('#pw').fill('atlas-test-pw')
    page.locator('#hero'+str(i)).check()
    submit()
def profile_for(i):
    hero=campaign['company']['members'][i]['id']
    card=page.locator(f'[data-hero="{hero}"]')
    card.get_by_role('button',name='Настроить героя').click()
    page.locator('#heroProfessions summary').click()
    page.get_by_label('Горное дело',exact=True).check()
    page.get_by_label('Кузнечное дело',exact=True).check()
    assert page.get_by_label('Рыбалка',exact=True).is_disabled()
    page.locator('#heroTraining summary').click()
    page.get_by_label('Инструменты каменщика',exact=True).check()
    page.get_by_label('Медный слиток',exact=True).check()
    page.locator('#heroMaster summary').click()
    page.locator('#bonus').fill('10')
    submit()
    return hero
import_campaign(campaign)
page.wait_for_function("S.company.inventory.some(x=>x.id==='old-item'&&x.item_id)")
assert page.evaluate("S.company.inventory.find(x=>x.id==='old-item').image")==img
assert page.evaluate("S.engine.professions[0].description")=='Описание мастера о медных жилах.'
assert page.evaluate("S.engine.professions[1].description")==''
assert page.evaluate("S.engine.professions[2].description.length>0")
assert page.evaluate("S.worldBook.chapters.every(x=>!x.text)")
tab('stay')
assert 'станут доступны' in page.locator('#main').inner_text()
tab('craft')
btn('Книга рецептов')
assert 'Книга рецептов пока пуста' in page.locator('#craftBody').inner_text()
add_account('miner',0)
add_account('smith',1)
tab('workshop')
btn('Добавить демонстрационный набор')
submit()
tab('company')
miner=profile_for(0)
smith=profile_for(1)
btn('Создать героя')
page.get_by_label('Имя',exact=True).fill('Мира')
page.get_by_label('Мудрость',exact=True).fill('14')
page.locator('#heroSkills summary').click()
page.get_by_label('Выживание',exact=True).select_option('1')
submit()
card=page.locator('[data-hero]').filter(has=page.get_by_role('heading',name='Мира',exact=False))
assert card.get_by_text('Выживание: +4').is_visible()
assert card.get_by_text('Активный герой').is_visible()
tab('craft')
btn('Профессии')
btn('Добывающие')
assert page.get_by_role('heading',name='Горное дело',exact=False).is_visible()
assert page.get_by_role('heading',name='Кузнечное дело',exact=False).count()==0
btn('Производственные')
assert page.get_by_role('heading',name='Кузнечное дело',exact=False).is_visible()
assert page.get_by_role('heading',name='Горное дело',exact=False).count()==0
tab('workshop')
btn('Мастерская данных')
page.locator('#tableKey').select_option('loot')
page.locator('#tableFmt').select_option('csv')
page.locator('#tableMode').select_option('update')
page.locator('#tableRaw').fill('id;region_id;profession_id;item_id;weight;min_quantity;max_quantity;min_margin;hours;dc\ndurotar-mining-ore;durotar;mining;ore;1;4;4;0;1;10\ndurotar-mining-silver;durotar;mining;silver;1;1;1;100;1;10')
btn('Проверить и просмотреть')
assert 'ошибки: 0' in page.locator('#importReport').inner_text()
btn('Подтвердить импорт')
page.wait_for_function("S.engine.loot[0].min_quantity===4")
tab('stay')
btn('Разбить стоянку')
page.locator('#reg').select_option('durotar')
page.locator('#services').fill('Оружейная')
page.locator('#showDC').uncheck()
submit()
day=page.evaluate('S.company.day')
signout()
signin('miner')
page.locator('#modeBtn').click()
btn('Мои герои')
assert page.locator('[data-hero]').first.get_by_role('heading',name='Рудокоп',exact=True).is_visible()
assert page.get_by_role('button',name='Настроить героя',exact=True).count()==1
btn('Настроить героя')
page.get_by_label('Раса',exact=True).fill('Дворф')
submit()
assert page.evaluate("profile(S,chosen()).race")=='Дворф'
assert not page.locator('#exportBtn').is_visible()
page.evaluate('uxSearch()')
page.locator('#uxQuery').fill('СЕКРЕТ-ЛЕТА')
assert 'СЕКРЕТ-ЛЕТА' not in page.locator('#modalBody').inner_text()
page.evaluate('closeModal()')
tab('stay')
import os
if os.environ.get('ATLAS_REVIEW_DIR'):
    page.evaluate("window.scrollTo(0,0);$('toast').classList.add('hidden')")
    review_size=page.viewport_size
    for width in (1280,390):
        page.set_viewport_size({'width':width,'height':920})
        page.screenshot(path=f"{os.environ['ATLAS_REVIEW_DIR']}/active-stay-{width}.png",animations='disabled')
    page.set_viewport_size(review_size)
assert page.locator('#gameHero').count()==0
page.locator('#activitiesGrid button').filter(has_text='Горное дело').click()
assert 'Сл ' not in page.locator('#activityCheck').inner_text()
submit()
assert 'Медная руда × 4' in page.locator('#modalBody').inner_text()
assert 'Сл ' not in page.locator('#modalBody').inner_text()
assert page.evaluate("currentStay(S).spent[actor.heroes[0]]")==1
btn('Открыть сумки')
btn('Медная руда × 4')
btn('Передать или разделить')
page.locator('#to').select_option(smith)
page.locator('#qty').fill('2')
submit()
signout()
signin('smith')
tab('craft')
btn('Книга рецептов')
page.locator('#recipeQuery').fill('медный слиток')
assert page.locator('.material-line').get_by_text('2 / 1').is_visible()
page.locator('#craftQty').fill('2')
assert page.locator('.material-line').get_by_text('2 / 2').is_visible()
btn('Создать')
page.wait_for_function("S.engine.projects.at(-1)?.status==='done'")
assert page.evaluate("currentStay(S).spent[actor.heroes[0]]")==4
assert page.evaluate("S.company.inventory.filter(x=>x.item_id==='ore'&&x.owner==='member:'+chosen()).length")==0
assert page.evaluate("S.company.inventory.find(x=>x.item_id==='bar').qty")==2
btn('Проекты')
assert page.locator('#craftBody').get_by_text('Медный слиток',exact=True).is_visible()
tab('stay')
btn('Местные поручения')
btn('Помочь')
submit()
assert page.evaluate("profile(S,actor.heroes[0]).wallet")==2
signout()
signin('gm')
page.evaluate("(id)=>{S.company.members.find(h=>h.id===id).name='Мастер кузни';commit()}",smith)
tab('stay')
page.locator('#stayAdminLink summary').click()
btn('Управление стоянкой')
btn('Завершить стоянку')
submit()
page.wait_for_function("!currentStay(S)")
assert page.evaluate('S.company.day')==day+3
tab('map')
page.evaluate('beginJourney(S.routes[0].id)')
page.locator('#startForm button[type=submit]').click()
page.wait_for_function('!!S.journey')
before=exported(page)
assert 'accounts' not in before and 'atlas-test-pw' not in json.dumps(before)
assert any(x['item_id']=='bar' and x['owner']=='member:'+smith for x in before['company']['inventory'])
import_campaign(before)
page.wait_for_function("tab==='home'")
after=exported(page)
assert all(after['settings']['navIcons'][k]==img for k in ('stay','craft','workshop'))
assert before['engine']==after['engine'] and before['company']==after['company'] and before['journey']==after['journey']
for name in page.evaluate("NAV_BANDS.flatMap(b=>b[1].map(x=>x[0]))"):
    tab(name)
page.set_viewport_size({'width':390,'height':844})
tab('craft')
btn('Книга рецептов')
assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
page.locator('#recipeList .recipe-option').first.click()
assert page.locator('#recipeDetail').is_visible()
btn('К списку рецептов')
assert page.locator('#recipeList').is_visible() and not page.locator('#recipeDetail').is_visible()
assert page.locator('#nav .nav-scroll').count()==2
# Verify that the authoritative store is written before reloading.
wait_for_db(page,"async()=>!!(await dbGet())?.journey")
assert page.evaluate("async()=>!!(await dbGet())?.journey")
