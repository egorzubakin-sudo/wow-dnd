# Cartographic layers are independent of the campaign's places and routes.
page.set_viewport_size({'width':1360,'height':1000})
tab('map')
crossroads = page.evaluate("S.nodes.find(n=>n.name==='Картографическая застава').id")
observatory = page.evaluate("S.nodes.find(n=>n.name==='Старая обсерватория').id")
road = page.evaluate("S.routes.find(n=>n.name==='Путь картографа').id")
original_route = page.evaluate('id=>JSON.stringify(route(id))',road)
original_place = page.evaluate('id=>JSON.stringify(node(id))',crossroads)

def make_sheet(title, kind, parent, region=None):
    btn('Карты Атласа')
    btn('Создать карту')
    page.locator('#sheetName').fill(title)
    page.locator('#sheetKind').select_option(kind)
    page.locator('#sheetParent').select_option(parent)
    if region:
        page.locator('#sheetRegion').select_option(region)
    submit()
    return page.evaluate('name=>S.engine.maps.find(m=>m.name===name).id',title)

kalimdor = make_sheet('Калимдор · испытание','continent','overview')
page.locator('#atlasSheetPicker').select_option(kalimdor)
regional = page.evaluate("S.engine.regions[0].id")
barrens = make_sheet('Великие Степи · испытание','region',kalimdor,regional)
page.locator('#atlasSheetPicker').select_option(barrens)
import base64
png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+rRFkAAAAASUVORK5CYII=')
page.locator('#mapFile').set_input_files({'name':'barrens.png','mimeType':'image/png','buffer':png})
page.wait_for_function("""currentMapImage()?.name==='barrens.png' && $('mapsvg').querySelector('image[href^="blob:"]')""")
page.locator('#mapsvg').scroll_into_view_if_needed()

def place_node(identity,x,y):
    btn('Разместить место')
    tap_map(x,y)
    page.locator('#mapPlaceId').select_option(identity)
    submit()
    page.evaluate("setTool('select')")

place_node(crossroads,.22,.37)
place_node(observatory,.78,.43)
btn('Показать маршрут')
page.locator('#mapRouteId').select_option(road)
submit()
page.evaluate("id=>selectItem('route',id)",road)
btn('Изменить форму дороги')
tap_map(.42,.6)
tap_map(.66,.36)
page.locator('#mapRouteStyle').select_option('smooth')
page.locator('[data-bend="0"]').focus()
page.keyboard.press('Delete')
tap_map(.34,.58)
page.locator('[data-bend="0"]').hover()
point = page.locator('[data-bend="0"]').bounding_box()
page.mouse.move(point['x']+point['width']/2,point['y']+point['height']/2)
page.mouse.down()
page.mouse.move(point['x']+point['width']/2+18,point['y']+point['height']/2+12,steps=4)
page.mouse.up()
assert page.evaluate("[mapDraft.style,mapDraft.points.length]") == ['smooth',2]
btn('Сохранить форму')
page.wait_for_function("id=>!document.body.inert && drawnRoute(id)?.style==='smooth'",arg=road)
geometry = page.evaluate('id=>drawnRoute(id)',road)
assert geometry['style']=='smooth' and len(geometry['points'])==2
assert page.evaluate('id=>JSON.stringify(route(id))',road)==original_route
assert page.evaluate('id=>JSON.stringify(node(id))',crossroads)==original_place

btn('Нарисовать границу')
page.locator('#regionToDraw').select_option(regional)
btn('Нарисовать или изменить')
for x,y in ((.12,.25),(.43,.25),(.43,.51),(.12,.51)):
    tap_map(x,y)
btn('Сохранить форму')
page.wait_for_function("id=>!document.body.inert && S.engine.regionBoundaries.some(r=>r.map_id===id)",arg=barrens)
page.evaluate("id=>selectItem('node',id)",crossroads)
assert page.locator('#sidebar').get_by_text('по границе',exact=False).is_visible()
page.get_by_role('button',name='Приблизить').click()
zoom = page.evaluate('view.w')
page.locator('#atlasSheetPicker').select_option(kalimdor)
assert not page.locator(f'[data-route="{road}"]').count()
btn('Предыдущая карта')
assert page.evaluate('view.w')==zoom
assert page.locator(f'[data-route="{road}"]').count()==1
page.set_viewport_size({'width':390,'height':850})
touch.send('Emulation.setTouchEmulationEnabled',{'enabled':True,'maxTouchPoints':1})
page.evaluate("id=>startRoadShape(id)",road)
page.locator('#mapsvg').scroll_into_view_if_needed()
point = page.locator('[data-bend="0"]').bounding_box()
before_touch = page.evaluate('JSON.stringify(mapDraft.points[0])')
xy = {'x':point['x']+point['width']/2,'y':point['y']+point['height']/2}
touch.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[xy]})
touch.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':xy['x']+14,'y':xy['y']+14}]})
touch.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
touch.send('Emulation.setTouchEmulationEnabled',{'enabled':False})
assert page.evaluate('JSON.stringify(mapDraft.points[0])') != before_touch
btn('Отмена формы')
assert page.evaluate('id=>drawnRoute(id).points',road) == geometry['points']
page.locator('#atlasSheetPicker').select_option('overview')
btn('Найти место')
page.locator('#mapPlaceQuery').fill('Картографическая застава')
assert page.locator('#mapPlaceResults').get_by_text('Великие Степи',exact=False).is_visible()
page.evaluate('closeModal()')
assert page.evaluate('id=>S.nodes.filter(n=>n.id===id).length',crossroads) == 1
wait_for_db(page,"async()=> (await dbGet()).engine.maps.some(m=>m.name==='Великие Степи · испытание')")
