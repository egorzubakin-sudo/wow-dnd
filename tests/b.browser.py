page.get_by_role('button',name='Бросок',exact=True).click()
page.locator('#custom').fill('2d6')
page.get_by_role('button',name='Бросить',exact=True).click()
page.wait_for_function('S.engine.rolls.length===1')
