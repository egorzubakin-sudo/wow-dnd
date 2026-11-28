# A CSV entry remains one catalog record when a master grants it to two owners.
tab('workshop')
btn('Каталог предметов')
btn('CSV и JSON')
page.locator('#tableFile').set_input_files({
    'name': 'items.csv', 'mimeType': 'text/csv',
    'buffer': ('id;name;category;quality;value_gp;desc\n'
               'catalog-test-lantern;Фонарь дозорного;Снаряжение;common;5;Латунный фонарь.\n').encode(),
})
btn('Проверить и просмотреть')
btn('Подтвердить импорт')
page.wait_for_function("S.engine.items.some(x => x.id === 'catalog-test-lantern')")
page.evaluate('closeModal()')
hero_id = page.evaluate('chosen()')

def select_catalog_lantern():
    page.locator('#catalogQuery').fill('дозорного')
    page.locator('#catalogCategory').select_option('Снаряжение')
    btn('Фонарь дозорного · Снаряжение')

tab('bank')
btn('Каталог предметов')
select_catalog_lantern()
btn('Выдать предмет')
assert page.locator('#catalogRecipient').input_value() == ''
page.locator('#catalogQty').fill('2')
submit()

tab('bags')
btn('Добавить из каталога')
select_catalog_lantern()
btn('Редактировать в каталоге')
description_field = page.evaluate("columns('items').findIndex(field => field.name === 'desc')")
page.locator(f'#catalogEdit{description_field}').fill('Латунный фонарь с ручкой.')
submit()
btn('Добавить из каталога')
select_catalog_lantern()
assert page.locator('#modalBody').get_by_text('Латунный фонарь с ручкой.').is_visible()
btn('Выдать предмет')
assert page.locator('#catalogRecipient').input_value() == hero_id
submit()
assert page.locator('#bagRows').get_by_role('button', name='Фонарь дозорного × 1').is_visible()
assert page.evaluate("""hero => {
    const rows = S.company.inventory.filter(x => x.item_id === 'catalog-test-lantern');
    return rows.length === 2 && rows.some(x => x.owner === '' && x.qty === 2 && x.desc === 'Латунный фонарь.') &&
        rows.some(x => x.owner === 'member:' + hero && x.qty === 1 && x.desc === 'Латунный фонарь с ручкой.');
}""", hero_id)
assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
wait_for_db(page, "async () => (await dbGet()).company.inventory.filter(x => x.item_id === 'catalog-test-lantern').length === 2")
