# Exercise visual navigation against a filled, isolated browser campaign.
import os
page.set_viewport_size({'width':1280,'height':960})
page.evaluate("""()=>{
  const art=S.engine.regions.find(x=>safeImage(x.image)).image;
  const at=S.nodes[0].id, meta={day:1,year:S.company.year,location:at,faction:'f0'};
  S.portal.people.push({...meta,id:'visual-friend',title:'Лира Рассветная',source:'Разведчица',category:'Союзник',body:'Знает тропы к заставе.',attitude:'Доверяет компании',image:art},
    {...meta,id:'visual-contact',title:'Старый картограф',category:'Знакомый',body:'Ведёт путевой журнал.'},
    {...meta,id:'visual-secret',title:'Тайный посланник',hidden:true,body:'Секрет'});
  S.portal.news.push({...meta,id:'visual-news',title:'Открыта переправа',category:'Торговля',body:'Первый караван прибыл к заставе.',image:art});
  S.portal.rumors.push({...meta,id:'visual-rumor',title:'Огни у реки',body:'Рыбаки видели свет.',truth:'partial'});
  S.portal.chronicle.push({...meta,id:'visual-history',title:'Запись о переправе',body:'Здесь начался путь.'});
  S.portal.codex.push({...meta,id:'visual-article',title:'Пути у реки',category:'География',body:'# Брод\\nПуть открыт.\\n# Перевоз\\nРаботает на рассвете.'});
  S.portal.achievements.push({...meta,id:'visual-ach-secret',title:'Секретная коллекция',secret:true,grants:[]});
  S.contracts.push({id:'visual-contract',title:'Доставить письмо',status:'available',desc:'Лира просит передать конверт.',objectives:'Добраться до заставы.',giver:'visual-friend',faction:'f0',location:at,reward:'Монета',rewardSecret:'Ключ от тайника',rewardRevealed:false,rewards:[]});
  S.company.staff.push({id:'visual-staff',name:'Тихий кузнец',role:'Кузнец',image:art,desc:'Работает в лагере.'});
  commit();
}""")
tab('people')
assert page.locator('.person-card').count()==3
page.locator('#peopleStatus').select_option('Союзник')
assert page.locator('.person-card').count()==1
btn('Список')
assert page.locator('.people-gallery.is-list').is_visible()
btn('Галерея')
page.locator('#peopleStatus').select_option('')
page.locator('#portalSearch').fill('лира')
page.locator('.person-card .person-open').click()
assert page.get_by_text('Знает тропы к заставе.',exact=True).is_visible()
assert page.locator('#modalBody').get_by_role('button',name='Доставить письмо',exact=False).is_visible()
page.locator('#modalBody summary[aria-label="Действия с досье"]').click()
btn('Связи и знакомство')
page.locator('#personHistory').fill('Сошлись у переправы.')
page.get_by_text('Связанные персонажи',exact=True).click()
page.get_by_role('checkbox',name='Старый картограф').check()
page.locator('#engineForm button[type=submit]').click()
assert page.locator('#modalBody').get_by_text('Сошлись у переправы.').is_visible()
assert page.locator('#modalBody').get_by_role('button',name='Старый картограф',exact=False).is_visible()
page.evaluate('closeModal()')
tab('factions')
page.locator('.faction-overview .visual-open').first.click()
for name in ('Представители','Территории','Дипломатия','Задания','Репутация и привилегии'):
    page.locator('#modalBody').get_by_role('button',name=name,exact=True).click()
    assert page.locator('#factionPanel').inner_text().strip()
page.locator('#modalBody summary[aria-label="Действия с фракцией"]').click()
page.locator('#modalBody').get_by_role('button',name='Обложка и эмблема').click()
page.locator('#factionEmblem').set_input_files({'name':'crest.png','mimeType':'image/png','buffer':__import__('base64').b64decode(img.split(',')[1])})
submit()
tab('codex')
page.locator('.codex-category').filter(has_text='География').locator('button').click()
page.locator('.codex-articles').get_by_text('Пути у реки',exact=True).click()
assert page.locator('.reader-toc').get_by_role('button',name='Перевоз').is_visible()
page.evaluate('closeModal()')
tab('news')
assert page.locator('.featured-story').get_by_text('Открыта переправа',exact=True).is_visible()
btn('Слухи')
assert page.locator('.featured-story').get_by_text('Огни у реки',exact=True).is_visible()
tab('bank')
assert page.locator('.inventory-slot').count()>0
btn('Таблица')
assert page.locator('table').is_visible()
btn('Ячейки')
tab('contracts')
assert page.locator('.quest-chapter h3').all_text_contents()==['Контракты','Местные поручения']
page.locator('.quest-entry').filter(has_text='Доставить письмо').locator('.visual-open').click()
assert page.locator('.quest-paper').get_by_text('Добраться до заставы.').is_visible()
page.evaluate('closeModal()')
# Upload a section cover and verify it survives a campaign export.
page.locator('.section-cover summary[aria-label="Оформление раздела"]').click()
btn('Изменить обложку')
page.locator('#cover').set_input_files({'name':'page.png','mimeType':'image/png','buffer':__import__('base64').b64decode(img.split(',')[1])})
submit()
assert page.locator('.section-cover .has-art img').is_visible()
assert exported(page)['settings']['visual']['covers']['contracts'].startswith('data:image/png')
screens=os.environ.get('ATLAS_REVIEW_DIR')
page.evaluate("$('toast').classList.add('hidden')")
for width in (1280,360,390,430):
    page.set_viewport_size({'width':width,'height':920})
    for scene in ('home','people','factions','stay','craft','bank','codex','contracts','camp','news','chronicle','achievements','worldbook','map'):
        tab(scene)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width,scene)
        if screens and width in (1280,390) and scene in ('people','factions','home','news','bank'):
            page.screenshot(path=f'{screens}/{scene}-{width}.png',animations='disabled')
signout()
signin('miner')
tab('people')
assert not page.locator('.person-card').filter(has_text='Тайный посланник').count()
assert not page.locator('.visual-card-menu summary').count()
tab('contracts')
page.locator('.quest-entry').filter(has_text='Доставить письмо').locator('.visual-open').click()
assert not page.locator('#modalBody').get_by_text('Ключ от тайника').count()
page.evaluate('closeModal()')
tab('achievements')
assert not page.get_by_text('Секретная коллекция').count()
signout()
signin('gm')
wait_for_db(page,"async()=>!!(await dbGet())?.settings.visual?.covers?.contracts")
