# Install a linked package through the data workshop and use its economy with a real player account.
tab('workshop')
with page.expect_download() as dl:
    btn('Скачать спецификацию для генерации контента')
spec=json.loads(Path(dl.value.path()).read_text())
assert spec['csvBOM'] and 'rep_bonuses' in {field['name'] for field in spec['tables']['markets']['fields']}
assert spec['contentPackage']['example']['id']=='demo.trade-loop'
btn('Пакеты контента')
btn('Книжная экипировка')
btn('Проверить пакет')
assert 'ошибки: 0' in page.locator('#packageReport').inner_text()
btn('Установить пакет')
page.wait_for_function("S.engine.contentPackages?.some(x=>x.id==='core.book-equipment')")
page.locator('#installedContent').get_by_text('Книжная экипировка',exact=True).wait_for()
btn('Учебный пакет торговли')
btn('Проверить пакет')
assert 'ошибки: 0' in page.locator('#packageReport').inner_text()
btn('Установить пакет')
page.locator('#installedContent').get_by_text('Добыча, производство и рынок',exact=True).wait_for()
assert page.evaluate("async()=>!(await dbGet('pre-content-import')).engine.contentPackages.some(x=>x.id==='demo.trade-loop')")
page.evaluate('closeModal()')
sample=spec['contentPackage']['example']['tables']
site=sample['nodes'][0]['id']
bar_recipe,sword_recipe=sample['recipes']
product=sample['tradeGoods'][0]['id']
delivery=sample['deliveries'][0]['id']
# Starting conditions for this shop chain. All producing and spending now go through the UI.
page.evaluate("""()=>{
  S.journey=null;S.engine.phase='adventure'; S.company.day=20; S.company.year=27; S.company.gold=0;
  S.company.talents={Арсенал:true,Оружейная:true}; delete S.engine.facilityTiers;
  const miner=accounts.find(a=>a.nick==='miner').heroes[0], p=profile(S,miner);
  p.wallet=0;p.tools=['Инструменты каменщика','Инструменты кузнеца'];
  p.professionsLimited=true;p.professions=['mining','smithing'];
  commit();
}""")
tab('stay')
btn('Разбить стоянку')
page.locator('#loc').select_option(site)
page.locator('#reg').select_option(sample['regions'][0]['id'])
page.locator('#days').fill('7')
submit()
signout()
signin('miner')
tab('stay')
page.locator('#activitiesGrid button').filter(has_text='Горное дело').click()
submit()
assert 'Медная руда (торговое занятие) × 7' in page.locator('#modalBody').inner_text()
page.evaluate('(id)=>openTradeRecipe(id)',bar_recipe['id'])
page.locator('#craftQty').fill('7')
btn('Создать')
page.wait_for_function("(id)=>S.company.inventory.some(x=>x.item_id===id&&x.owner==='member:'+chosen()&&x.qty===7)",arg=bar_recipe['item_id'])
btn('Торговля')
page.locator('#craftBody button').filter(has_text='Партия ремонтных инструментов').click()
page.locator('#craftQty').fill('3')
btn('Создать')
page.wait_for_function("(id)=>S.company.inventory.some(x=>x.item_id===id&&x.owner==='member:'+chosen()&&x.qty===3)",arg=product)
page.evaluate('(id)=>openTradeRecipe(id)',sword_recipe['id'])
assert not page.get_by_role('button',name='Создать',exact=True).is_enabled()
btn('Торговля')
assert 'поправка за репутацию 5%' in page.locator('.trade-offer').inner_text()
if os.environ.get('ATLAS_TRADE_REVIEW_DIR'):
    for width in (390,1440):
        page.set_viewport_size({'width':width,'height':850})
        page.evaluate("window.scrollTo(0,0);$('toast').classList.add('hidden')")
        page.screenshot(path=f"{os.environ['ATLAS_TRADE_REVIEW_DIR']}/trade-{width}.png",animations='disabled')
btn('Продать')
page.locator('#tradeQty').fill('2')
assert '50,4' in page.locator('#tradeTotal').inner_text()
submit()
assert page.evaluate('profile(S,chosen()).wallet')==50.4
btn('Внести золото в казну')
submit()
assert page.evaluate('S.company.gold')==50.4 and page.evaluate('profile(S,chosen()).wallet')==0
signout()
signin('gm')
tab('camp')
armory=page.locator('.camp-grid .talent').filter(has_text='Оружейная').first
armory.locator(':scope > summary').click()
btn('Купить оборудование · 2 ступень')
assert page.locator('#upgradeCost').input_value()=='30'
submit()
assert page.evaluate("campTier(S,'Оружейная')")==2 and page.evaluate('S.company.gold')==20.4
signout()
signin('miner')
page.evaluate('(id)=>openTradeRecipe(id)',sword_recipe['id'])
btn('Создать')
page.wait_for_function("(id)=>S.company.inventory.some(x=>x.item_id===id&&x.owner==='member:'+chosen())",arg=sword_recipe['item_id'])
remaining_hours=page.evaluate('remaining(S,chosen())')
assert remaining_hours==56-2-7-9-4
tab('contracts')
page.locator('.kit-quest-line').filter(has_text='Инструменты для каравана').click()
btn('Доставить товары')
submit()
assert page.evaluate('profile(S,chosen()).wallet')==7
assert page.locator('#boardQuestDetail').get_by_text('Поставка завершена.',exact=True).is_visible()
assert page.get_by_role('button',name='Доставить товары',exact=True).count()==0
tab('craft')
btn('Торговля')
for width in (390,1440):
    page.set_viewport_size({'width':width,'height':850})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
signout()
signin('gm')
tab('home')
before=exported(page)
import_campaign(before)
page.wait_for_function("(id)=>tab==='home'&&S.contracts.some(x=>x.id===id&&x.status==='done')",arg=delivery)
after=exported(page)
assert after['company']['inventory']==before['company']['inventory']
assert after['engine']['markets']==before['engine']['markets']
assert after['engine']['contentPackages']==before['engine']['contentPackages']
wait_for_db(page,"async()=>!!(await dbGet())?.engine.facilityTiers?.Оружейная")

# A master can also author a new trade recipe and its material lines directly.
tab('workshop')
btn('Мастерская данных')
page.locator('#tableKey').select_option('tradeRecipes')
btn('Редактор записей')
btn('Новая запись')
fields=[x['name'] for x in spec['tables']['tradeRecipes']['fields'] if x['name'] not in ('extra','trade_product')]
def editor_field(name):
    return page.locator('#catalogEdit'+str(fields.index(name)))
for name,value in {'id':'recipe.demo.trade.editor','name':'Рецепт из редактора','quantity':'1','hours':'2','rank':'2','facility_rank':'1'}.items():
    editor_field(name).fill(value)
for name,value in {'profession_id':'smithing','item_id':product,'basic':'true','service':'Оружейная'}.items():
    editor_field(name).select_option(value)
btn('Добавить ингредиент')
page.locator('#tradeIngredient0').select_option(bar_recipe['item_id'])
submit()
assert page.evaluate("S.engine.recipes.some(x=>x.id==='recipe.demo.trade.editor'&&x.trade_product)")
assert page.evaluate("S.engine.ingredients.some(x=>x.recipe_id==='recipe.demo.trade.editor')")
wait_for_db(page,"async()=>(await dbGet())?.engine.recipes.some(x=>x.id==='recipe.demo.trade.editor')")
