# The published achievement book survives an old-save import and keeps master edits.
assert page.title() == 'Warcraft: Век Авантюристов'
assert page.evaluate("S.portal.achievements.filter(x=>/^age-/.test(x.id)).length") == 417
tab('achievements')
page.locator('#achievementCategory').select_option('Двадцать восемь чудес света')
assert page.locator('.ach-grid .achievement').count() == 35
assert page.locator('.ach-grid .achievement').filter(has_text='Нордрассил').is_visible()

btn('Категории достижений')
btn('Новая категория')
page.locator('#achievementCategoryName').fill('Испытания компании')
submit()
assert page.locator('#modalBody').get_by_text('Испытания компании',exact=True).is_visible()
page.evaluate('closeModal()')

def create_book_entry(title, unique=False, closed=False):
    btn('Новое достижение')
    page.locator('#pt').fill(title)
    page.locator('#pc').select_option('Испытания компании')
    page.locator('#pb').fill('Проверочное условие из закрытой части книги')
    if unique:
        page.locator('#paunique').check()
    if closed:
        page.locator('#paclosed').check()
    page.locator('#portalForm button[type=submit]').click()
    page.locator('#portalForm').wait_for(state='detached')

def open_book_entry(title):
    page.locator('#portalSearch').fill(title)
    page.locator('.achievement-open').filter(has_text=title).click()

create_book_entry('Знак первого героя', unique=True, closed=True)
create_book_entry('Знак команды')
page.locator('#achievementCategory').select_option('Испытания компании')
open_book_entry('Знак первого героя')
page.locator('#modalBody').get_by_role('button',name='Вручить достижение').click()
miner = page.evaluate("accounts.find(x=>x.nick==='miner').heroes[0]")
page.locator('#awardWho').select_option('hero:'+miner)
assert all(key.startswith('hero:') for key in page.locator('#awardWho option').evaluate_all('(xs)=>xs.map(x=>x.value)'))
assert not page.locator('#awardMode').count()
page.locator('#awardForm button[type=submit]').click()
open_book_entry('Знак первого героя')
page.locator('#modalBody').get_by_role('button',name='Вручить достижение').click()
assert not page.locator('#awardForm').count()
page.locator('#modalBody .modal-tools summary').click()
page.locator('#modalBody').get_by_role('button',name='Изменить',exact=True).click()
page.locator('#paunique').uncheck()
page.locator('#portalForm button[type=submit]').click()
page.locator('#portalForm').wait_for(state='detached')
open_book_entry('Знак первого героя')
page.locator('#modalBody').get_by_role('button',name='Вручить достижение').click()
page.locator('#awardMode').select_option('some')
page.locator('#awardChosen input').first.check()
page.locator('#awardForm button[type=submit]').click()
assert page.evaluate("S.portal.achievements.find(x=>x.title==='Знак первого героя').grants.length") == 2

open_book_entry('Знак команды')
page.locator('#modalBody').get_by_role('button',name='Вручить достижение').click()
page.locator('#awardMode').select_option('all')
page.locator('#awardForm button[type=submit]').click()
assert page.evaluate("S.portal.achievements.find(x=>x.title==='Знак команды').grants.length === S.company.members.length")

btn('Категории достижений')
page.locator('#modalBody .row').filter(has_text='Испытания компании').get_by_role('button',name='Переименовать').click()
page.locator('#achievementCategoryName').fill('Испытания героев')
submit()
page.evaluate('closeModal()')
assert page.evaluate("S.portal.achievements.find(x=>x.title==='Знак команды').category") == 'Испытания героев'
backup = exported(page)
import_campaign(backup)
page.wait_for_function("tab==='home' && S.portal.achievements.some(x=>x.title==='Знак команды' && x.category==='Испытания героев')")

signout()
signin('miner')
btn('Достижения')
page.locator('#achievementCategory').select_option('Испытания героев')
closed = page.locator('.achievement.earned .achievement-open').filter(has_text='Знак первого героя')
assert closed.inner_text() == 'Знак первого героя'
assert closed.evaluate("el=>getComputedStyle(el).filter") == 'none'
closed.click()
assert not page.locator('#modalBody').inner_text().strip()
page.evaluate('closeModal()')
page.locator('#portalSearch').fill('закрытой части')
assert page.locator('.achievement-open').filter(has_text='Знак первого героя').count() == 0
page.evaluate('uxSearch()')
page.locator('#uxQuery').fill('закрытой части')
assert not page.locator('#uxResults').get_by_text('Знак первого героя').count()
page.evaluate('closeModal()')
page.locator('#portalSearch').fill('')
page.locator('#achievementCategory').select_option('Двадцать восемь чудес света')
card = page.locator('.achievement.locked').filter(has_text='Нордрассил')
assert card.is_visible() and card.locator('.achievement-open').evaluate("el=>getComputedStyle(el).filter") == 'grayscale(1)'
assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
signout()
signin('gm')
wait_for_db(page,"async()=>(await dbGet())?.portal.achievements.some(x=>x.title==='Знак первого героя'&&x.closed&&x.grants.length===2)")
