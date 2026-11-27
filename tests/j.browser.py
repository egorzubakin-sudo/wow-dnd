# The picker paginates local PNGs and preserves a campaign's custom icon priority.
registry=json.loads((root/'icons.json').read_text())
assert len(registry['categories'])==12 and len(registry['icons'])==3225
assert len({x['id'] for x in registry['icons']})==len(registry['icons'])
assert all((root/x['path']).is_file() and not x['path'].startswith('/') for x in registry['icons'])
tab('craft')
btn('Книга рецептов')
page.locator('#recipeQuery').fill('медный слиток')
page.locator('#recipeDetail summary[aria-label="Действия с рецептом"]').click()
btn('Иконка предмета')
picker=page.get_by_role('dialog',name='Библиотека иконок')
picker.locator('#iconCategory').select_option('resources')
picker.locator('#iconSearch').fill('copper')
candidate=picker.locator('[data-icon-id="trade:Copper_01"]')
candidate.click()
preview=picker.locator('#iconPreview img')
assert preview.get_attribute('src')=='assets/icons/trade/Copper_01.png'
assert preview.evaluate('(img)=>img.decode().then(()=>img.naturalWidth>0)')
picker.locator('#iconUpload').set_input_files({
    'name':'custom.png','mimeType':'image/png','buffer':__import__('base64').b64decode(img.split(',')[1]),
})
picker.get_by_text('Показана своя иконка.',exact=False).wait_for()
assert preview.get_attribute('src')==img
picker.get_by_role('button',name='Применить').click()
assert page.locator('#recipeDetail .kit-iconbox img').first.get_attribute('src')==img
tab('home')
save=exported(page)
item=next(row for row in save['engine']['items'] if row['id']=='bar')
assert item['iconId']=='trade:Copper_01' and item['image']==img
wait_for_db(page,"async()=>(await dbGet())?.engine.items.find(x=>x.id==='bar')?.iconId==='trade:Copper_01'")

tab('stay')
btn('Иконки меню')
page.locator('.icon-edit-row').filter(has_text='Стоянка').get_by_role('button',name='Из библиотеки').click()
picker.locator('#iconCategory').select_option('navigation')
picker.locator('#iconSearch').fill('Barrens_01')
picker.locator('[data-icon-id="places:Barrens_01"]').click()
assert preview.get_attribute('src')==img
picker.get_by_role('button',name='Убрать свою').click()
assert preview.get_attribute('src')=='assets/icons/places/Barrens_01.png'
picker.get_by_role('button',name='Применить').click()
btn('Готово')
assert page.locator('#nav .nav-tab[aria-label="Стоянка"] img').get_attribute('src')=='assets/icons/places/Barrens_01.png'
tab('home')
with_icons=exported(page)
import_campaign(with_icons)
page.wait_for_function("tab==='home' && S.settings.navIconIds?.stay==='places:Barrens_01'")
assert exported(page)['engine']['items']==with_icons['engine']['items']
wait_for_db(page,"async()=>(await dbGet())?.settings.navIconIds?.stay==='places:Barrens_01'")

tab('contracts')
page.locator('.kit-quest-line').filter(has_text='Доставить письмо').click()
page.locator('#boardQuestDetail summary[aria-label="Действия с заданием"]').click()
page.locator('#boardQuestDetail').get_by_role('button',name='Выбрать иконку').click()
picker.locator('#iconCategory').select_option('quests')
picker.locator('#iconSearch').fill('Book_01')
picker.locator('[data-icon-id="misc:Book_01"]').click()
picker.get_by_role('button',name='Применить').click()
assert page.locator('#boardQuestDetail .kit-iconbox img').first.get_attribute('src')=='assets/icons/misc/Book_01.png'
tab('home')
with_badge=exported(page)
assert next(row for row in with_badge['contracts'] if row['id']=='visual-contract')['iconId']=='misc:Book_01'
import_campaign(with_badge)
page.wait_for_function("tab==='home' && S.contracts.find(x=>x.id==='visual-contract').iconId==='misc:Book_01'")
wait_for_db(page,"async()=>(await dbGet())?.contracts.find(x=>x.id==='visual-contract')?.iconId==='misc:Book_01'")
