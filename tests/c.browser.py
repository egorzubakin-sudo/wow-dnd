page.evaluate("switchTab('workshop')")
page.get_by_role('button',name='Добавить демонстрационный набор').click()
page.locator('#engineForm button[type=submit]').click()
page.wait_for_function('S.engine.demo')
page.evaluate("switchTab('bank')")
page.get_by_role('button',name='Личные сумки',exact=True).click()
assert page.locator('#bagRows').inner_text()=='Сумки пусты'
page.evaluate('closeModal()')
