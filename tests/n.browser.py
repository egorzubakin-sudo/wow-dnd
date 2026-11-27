# Interaction Lab review with live campaign state.
import os
page.set_viewport_size({'width':1440,'height':1000})
tab('map')
svg=page.locator('#mapsvg')
page.evaluate('resetView();drawMap()')
def map_pos(x,y):
    return page.evaluate("""([x,y])=>{
      const s=$('mapsvg'),p=s.createSVGPoint();
      p.x=x*dims().w;p.y=y*dims().h;
      const v=p.matrixTransform(s.getScreenCTM());return {x:v.x,y:v.y};
    }""",[x,y])
def tap_map(x,y,button='left'):
    pt=map_pos(x,y)
    page.mouse.click(pt['x'],pt['y'],button=button)
def make_place(name):
    page.locator('#nodeForm #nn').fill(name)
    page.locator('#nodeForm button[type=submit]').click()
    page.locator('#nodeForm').wait_for(state='detached')
    return page.evaluate("(name)=>S.nodes.find(x=>x.name===name).id",name)
tap_map(.12,.56,'right')
page.locator('#mapContext').get_by_role('button',name='Создать место здесь').click()
a=make_place('Картографическая застава')
btn('Добавить место')
tap_map(.37,.68)
b=make_place('Старая обсерватория')

connector=page.locator(f'[data-connect="{b}"]')
point=connector.bounding_box()
dest=map_pos(.12,.56)
page.mouse.move(point['x']+point['width']/2,point['y']+point['height']/2)
page.mouse.down()
page.mouse.move(dest['x'],dest['y'],steps=6)
assert page.locator('.map-route-preview').count()==1
page.mouse.up()
assert page.locator('#routeForm').is_visible()
page.locator('#rn').fill('Путь картографа')
page.locator('#re0').fill('Встреча с проводником')
page.locator('#routeForm button[type=submit]').click()
page.locator('#routeForm').wait_for(state='detached')
route_id=page.evaluate("S.routes.find(x=>x.name==='Путь картографа').id")
path=page.locator(f'[data-route="{route_id}"] .visibleline')
original_path=path.get_attribute('d')
original_xy=page.evaluate('(id)=>[node(id).x,node(id).y]',a)
undo_count=page.evaluate('uxUndo.length')
receipts=page.evaluate("S.engine.receipts.filter(x=>x.name==='mapMove').length")
pt=map_pos(*original_xy)
page.mouse.move(pt['x'],pt['y'])
page.mouse.down()
page.mouse.move(pt['x']+28,pt['y']-36,steps=5)
assert page.evaluate('(id)=>[node(id).x,node(id).y]',a)==original_xy
assert path.get_attribute('d')!=original_path
page.evaluate("s=>$('mapsvg').dispatchEvent(new PointerEvent('pointercancel',{pointerId:s}))",page.evaluate('mapGesture.pointer'))
page.mouse.up()
assert path.get_attribute('d')==original_path
assert page.evaluate('uxUndo.length')==undo_count
assert page.evaluate("S.engine.receipts.filter(x=>x.name==='mapMove').length")==receipts
page.mouse.move(pt['x'],pt['y'])
page.mouse.down()
page.mouse.move(pt['x']+28,pt['y']-36,steps=5)
page.mouse.up()
page.wait_for_function("(id)=>node(id).x>.13",arg=a)
assert page.evaluate('uxUndo.length')==min(15,undo_count+1)
assert page.evaluate("S.engine.receipts.filter(x=>x.name==='mapMove').length")==receipts+1
btn('Отменить')
assert page.evaluate('(id)=>[node(id).x,node(id).y]',a)==original_xy

mid=path.evaluate("""el=>{const p=el.getPointAtLength(el.getTotalLength()/2).matrixTransform(el.getScreenCTM());return [p.x,p.y]}""")
page.mouse.click(*mid)
assert page.locator('#sidebar h2').get_by_text('Путь картографа').is_visible()
page.locator('#sidebar summary[aria-label="Действия с маршрутом"]').click()
page.locator('#sidebar').get_by_role('button',name='Изменить маршрут').click()
assert page.locator('#re0').input_value()=='Встреча с проводником'
page.locator('#rmax').fill('4')
page.locator('#routeForm button[type=submit]').click()

tap_map(*original_xy,'right')
page.locator('#mapContext').get_by_role('button',name='Иконка места').click()
picker=page.get_by_role('dialog',name='Библиотека иконок')
picker.locator('#iconSearch').fill('Barrens_01')
picker.locator('[data-icon-id="places:Barrens_01"]').click()
picker.locator('#saveIconChoice').click()
page.wait_for_function("(id)=>node(id).iconId==='places:Barrens_01'",arg=a)
selected_marker=page.locator(f'[data-node="{a}"] > rect')
width_before=selected_marker.bounding_box()['width']
btn('Приблизить')
assert abs(selected_marker.bounding_box()['width']-width_before)<2
btn('Запереть редактирование')
assert not page.locator('#mapAdd').count()
assert page.evaluate("async (id)=>{try{await execute('mapMove',{id,x:.12,y:.2});return false}catch(e){return e.message.includes('заперто')}}",a)
btn('Разрешить редактирование')
if os.environ.get('ATLAS_INTERACTION_REVIEW'):
    page.screenshot(path=os.environ['ATLAS_INTERACTION_REVIEW']+'/map-1440.png',animations='disabled')
page.evaluate('resetView();drawMap()')
btn('Соединить места')
tap_map(*original_xy)
tap_map(.37,.68)
assert page.locator('#routeForm').is_visible()
page.evaluate('closeModal()')

# Return to the last-used page in each group.
tab('bags')
page.locator('.kit-nav-switch').get_by_role('button',name='Мир').click()
assert page.evaluate('tab')=='map'
page.locator('.kit-nav-switch').get_by_role('button',name='Мой герой').click()
assert page.evaluate('tab')=='bags'
tab('company')
btn('Выдать грамоту')
page.locator('#charterFaction').select_option('f0')
page.locator('#charterText').fill('Картографы получают право прохода.')
submit()
page.locator('.company-charters button').filter(has_text=page.evaluate("faction('f0').name")).click()
assert 'Картографы получают право прохода.' in page.locator('#modalBody').inner_text()
page.evaluate('closeModal()')
tab('factions')
page.evaluate("focusFaction('f0')")
page.locator('#modalBody').get_by_role('button',name='Выдать грамоту').click()
assert page.locator('#charterFaction').input_value()=='f0'
page.locator('#charterText').fill('Картографы получают право ночлега.')
submit()
assert page.evaluate("faction('f0').charter.includes('право ночлега')")
tab('company')
btn('Пригласить спутника')
page.locator('#assignNpc').select_option('visual-friend')
btn('Продолжить')
assert page.locator('#npcState').input_value()=='traveling'
submit()
page.evaluate('closeModal()')
assert page.locator('#companyCompanions .company-member-open').get_by_text('Лира Рассветная').is_visible()

# A mobile long press can create a place and the scale stays within the screen.
page.set_viewport_size({'width':390,'height':860})
tab('map')
svg.scroll_into_view_if_needed()
page.evaluate('resetView();drawMap()')
touch=page.context.new_cdp_session(page)
touch.send('Emulation.setTouchEmulationEnabled',{'enabled':True,'maxTouchPoints':1})
# Chromium can assign a touch to a nearby interactive marker, so pick clear space around the tap.
pt=next((point for point in (map_pos(x,y) for x,y in [(.55,.91),(.48,.89),(.86,.89),(.56,.15),(.18,.91),(.8,.74)])
         if page.evaluate("""p=>[-24,0,24].every(dx=>[-24,0,24].every(dy=>{
           const hit=document.elementFromPoint(p.x+dx,p.y+dy);
           return !!hit?.closest('#mapsvg')&&!hit.closest('[data-node],[data-route]');
         }))""",point)),None)
assert pt is not None, 'На экране должна быть свободная точка карты для долгого касания'
touch.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[pt]})
page.locator('#mapContext').get_by_role('button',name='Создать место здесь').wait_for()
touch.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
page.locator('#mapContext').get_by_role('button',name='Создать место здесь').click()
mobile_place=make_place('Место с мобильного')
touch.send('Emulation.setTouchEmulationEnabled',{'enabled':False})
if os.environ.get('ATLAS_INTERACTION_REVIEW'):
    page.evaluate('window.scrollTo(0,0)')
    page.screenshot(path=os.environ['ATLAS_INTERACTION_REVIEW']+'/map-390.png',animations='disabled')
btn('Масштаб интерфейса')
page.locator('#uiScale').select_option('130')
submit()
assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--atlas-ui-scale').trim()")=='1.3'
assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
btn('Масштаб интерфейса')
page.locator('#uiScale').select_option('100')
submit()
page.locator('#kitAccount').click()
btn('Аккаунты и герои')
assert page.locator('#accountList').get_by_text('Рудокоп',exact=False).count()>0
page.evaluate('closeModal()')
signout()
page.locator('#rememberAccount').check()
signin('miner')
btn('Сумки')
page.reload()
page.locator('#kitAccount').wait_for()
assert page.evaluate("actor.nick==='miner' && tab==='hero'")
assert not page.locator('#mapAdd').count()
page.locator('.kit-nav-switch').get_by_role('button',name='Мой герой').click()
assert page.locator('#bagRows').is_visible()
page.locator('.kit-nav-switch').get_by_role('button',name='Моя компания').click()
page.locator('#nav').get_by_role('button',name='Стоянка',exact=True).click()
assert page.locator('#activitiesGrid').is_visible()
tab('map')
assert not page.locator('#mapAdd').count()
assert page.locator(f'[data-node="{mobile_place}"]').is_visible()
signout()
page.reload()
page.locator('#authForm').wait_for()
signin('gm')
wait_for_db(page,"async()=>(await dbGet())?.nodes.some(x=>x.name==='Место с мобильного')")
