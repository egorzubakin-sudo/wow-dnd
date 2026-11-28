"""Exercise the real browser SDK with intercepted Supabase HTTP responses."""
import base64
from copy import deepcopy
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from threading import Thread
import time
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
origin = 'https://grllbjrsygszfqnllnsa.supabase.co'
campaign_id = '10000000-0000-0000-0000-000000000001'
import_id = '20000000-0000-0000-0000-000000000001'
master_id = '00000000-0000-0000-0000-000000000001'
player_id = '00000000-0000-0000-0000-000000000002'
asset = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+rRFkAAAAASUVORK5CYII='
backup = {'version': 1, 'company': {'gold': 50, 'members': [{'id': 'h1', 'name': 'Арья', 'image': asset}]},
          'nodes': [], 'routes': [], 'factions': [], 'settings': {'heroIcon': asset}, 'journal': [{'text': 'Заметка мастера'}]}
calls = []
uploaded = []
uploaded_doc = None
server_revision = 0
subscriptions = {}
world_place = "Порт"
game_enabled = False
game_state = {'version':1, 'factions':[], 'routes':[], 'settings':{'achievementBookInstalled':True},
              'nodes':[{'id':'town','x':.5,'y':.5,'name':'Порт','visibility':'known'}],
              'company':{'name':'Онлайн-проверка','day':1,'year':27,'location':'town','gold':50,
                         'members':[{'id':'h1','name':'Арья','active':True}],'inventory':[],
                         'staff':[],'talents':{}}, 'contracts':[], 'journal':[], 'portal':{},
              'engine':{'schemaVersion':1,'receipts':[],'rolls':[],'phase':'stay','stays':[{
                  'id':'stay','name':'Общая стоянка','location':'town','days':1,'hours':8,'start':1,
                  'history':[],'spent':{},'services':[]}], 'items':[],
                  'professions':[],'projects':[],'loot':[],'solutions':[],'completions':[],'recipes':[]}}


def user_from_token(token):
    try:
        segment=token.split('.')[1]
        return json.loads(base64.urlsafe_b64decode(segment+'='*(-len(segment)%4)))['sub']
    except (IndexError,KeyError,ValueError):
        return None

def send_revision(user, revision):
    socket, join, topic = subscriptions[user]
    socket.send(json.dumps([join, None, topic, 'postgres_changes', {'ids': [1], 'data': {
        'schema':'public', 'table':'atlas_campaigns', 'type':'UPDATE', 'record': {
            'id':campaign_id, 'name':'Онлайн-проверка', 'revision':revision},
        'columns': [{'name':'id','type':'uuid'}, {'name':'name','type':'text'}, {'name':'revision','type':'int8'}],
    }}]))

def realtime_socket(socket):
    def frame(message):
        join, ref, topic, event, payload = json.loads(message)
        reply = {}
        if event == 'phx_join':
            reply['postgres_changes'] = [dict(payload['config']['postgres_changes'][0], id=1)]
            subscriptions[user_from_token(payload.get("access_token",""))] = (socket, join, topic)
        if event in ('phx_join', 'phx_leave', 'heartbeat'):
            socket.send(json.dumps([join, ref, topic, 'phx_reply', {'status':'ok', 'response':reply}]))
    socket.on_message(frame)

def fake_token(sub):
    def segment(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
    return '.'.join([segment({'typ': 'JWT', 'alg': 'HS256'}),
                     segment({'sub': sub, 'exp': int(time.time())+3600, 'role': 'authenticated'}), 'unused'])

def intercept(route):
    global server_revision, uploaded_doc
    request = route.request
    active_user=user_from_token(request.headers.get("authorization","").removeprefix("Bearer "))
    path = urlsplit(request.url).path
    method = request.method
    if not request.url.startswith(origin + '/'):
        if request.url.startswith(f'http://127.0.0.1:{server.server_port}/'):
            return route.continue_()
        return route.abort()
    calls.append((method, path))
    headers = {'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS',
               'access-control-allow-headers': '*'}
    def respond(data, status=200):
        return route.fulfill(status=status, headers=headers, json=data)
    if method == 'OPTIONS':
        return route.fulfill(status=204, headers=headers)
    if path == '/functions/v1/atlas-play':
        if not game_enabled:
            return respond({'error':'Функция ещё не развёрнута'},404)
        args=request.post_data_json
        assert args['campaign']==campaign_id
        if args['action']=='command':
            if active_user==player_id:
                assert args['name']=='rest' and args['payload']['hero']=='h1'
                assert args['revision']==server_revision
                spent=game_state['engine']['stays'][0]['spent']
                spent['h1']=spent.get('h1',0)+args['payload']['hours']
            else:
                assert args['name']=='masterSave'
                game_state.update(deepcopy(args['payload']['document']))
            server_revision+=1
        return respond({'document':game_state,'revision':server_revision,'prefix':None,'shareMap':True,
                        'actor':{'nick':active_user,'name':'Игрок' if active_user==player_id else 'Мастер',
                                 'heroes':['h1'] if active_user==player_id else [],
                                 'role':'player' if active_user==player_id else 'master'}})
    if path == '/auth/v1/token' and method == 'POST':
        email = request.post_data_json['email']
        active_user = master_id if email == 'gm@example.test' else player_id
        return respond({'access_token': fake_token(active_user), 'refresh_token': 'local-fake-refresh',
                        'expires_in': 3600, 'token_type': 'bearer',
                        'user': {'id': active_user, 'aud': 'authenticated', 'email': email}})
    if path == '/auth/v1/logout':
        return route.fulfill(status=204, headers=headers)
    if path == '/rest/v1/atlas_members':
        return respond([{'campaign_id': campaign_id, 'user_id': active_user,
                         'nickname': 'Мастер' if active_user == master_id else 'Игрок',
                         'role': 'master' if active_user == master_id else 'player'}])
    if path == '/rest/v1/atlas_campaigns':
        return respond([{'id': campaign_id, 'name': 'Онлайн-проверка', 'revision': server_revision}])
    if path == '/rest/v1/atlas_heroes':
        return respond([{'hero_id': 'h1', 'name': 'Арья', 'portrait_path': None}])
    if path == '/rest/v1/atlas_hero_links':
        return respond([])
    if path.endswith('/atlas_manage_member') and active_user == master_id:
        assert request.post_data_json == {'p_campaign': campaign_id, 'p_user': player_id,
                                          'p_nickname': 'Следопыт', 'p_role': 'player', 'p_heroes': ['h1']}
        return respond(None)
    if path == '/rest/v1/atlas_world':
        return respond([{'nodes': [{'id': 'town','name': world_place, 'x': 0.4, 'y': 0.5}], 'routes': [], 'map_path': None,
                         'map_width': None, 'map_height': None}])
    if path.endswith('/atlas_manage_uploads') and active_user == master_id:
        return respond([])
    if path.endswith('/atlas_begin_import') and active_user == master_id:
        assert request.post_data_json == {'p_campaign': campaign_id, 'p_revision': 0}
        return respond(import_id)
    if path.endswith('/atlas_finish_import') and active_user == master_id:
        args = request.post_data_json
        assert args['p_import'] == import_id and args['p_share_world'] and not args['p_share_images']
        uploaded_doc = args['p_document']
        assert uploaded_doc['settings']['heroIcon'] == uploaded_doc['company']['members'][0]['image']
        assert uploaded_doc['settings']['heroIcon'].startswith('atlas-storage:v1:')
        assert len(uploaded) == 1
        server_revision += 1
        return respond(server_revision)
    if path.endswith('/atlas_export_campaign') and active_user == master_id:
        return respond({'document': uploaded_doc, 'prefix': f'{campaign_id}/{import_id}/'})
    if path.startswith('/storage/v1/object/') and path.endswith('.png'):
        if method == 'POST' and active_user == master_id:
            uploaded.append(path)
            return respond({'Key': 'atlas-campaign-media/' + path.split('/atlas-campaign-media/',1)[1]})
        if method == 'GET':
            return route.fulfill(status=200, headers=headers, content_type='image/png',
                                 body=base64.b64decode(asset.split(',')[1]))
    return respond({'message': 'Unexpected request ' + method + ' ' + path}, 400)

class Local(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1',0), partial(Local, directory=root))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        context = browser.new_context()
        context.route('**/*', intercept)
        context.route_web_socket('**/*', realtime_socket)
        page = context.new_page()
        page.set_default_timeout(7000)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.accept())
        base = f'http://127.0.0.1:{server.server_port}/index.html'
        page.goto(base)
        page.locator('#authForm').wait_for()
        assert not calls
        page.goto(base + '?online=1')
        def login(email):
            page.locator('#onlineEmail').fill(email)
            page.locator('#onlinePass').fill('local-password')
            page.locator('#onlineLogin button').click()
            page.get_by_role('heading', name='Онлайн-проверка').wait_for()
        login('gm@example.test')
        page.locator('#onlineAccounts').click()
        page.locator('#onlineMemberForm').get_by_text('Арья').wait_for()
        page.locator('#onlineMemberId').fill(player_id)
        page.locator('#onlineNickname').fill('Следопыт')
        page.locator('#onlineAssign0').check()
        page.locator('#onlineMemberForm button.primary').click()
        page.locator('#onlineStatus').get_by_text('Профиль сохранён').wait_for()
        page.locator('#onlineData').click()
        page.locator('#onlineBackupFile').set_input_files({'name': 'fixture.json', 'mimeType': 'application/json',
                                                         'buffer': json.dumps(backup,ensure_ascii=False).encode()})
        page.locator('#onlineShareWorld').check()
        page.locator('#onlineImport button[type=submit]').click()
        page.locator('#onlineStatus').get_by_text('Кампания импортирована').wait_for()
        with page.expect_download() as download:
            page.locator('#onlineExport').click()
        assert json.loads(Path(download.value.path()).read_text()) == backup
        page.reload()
        page.get_by_role('heading', name='Онлайн-проверка').wait_for()
        page.locator('#onlineSignOut').click()
        login('player@example.test')
        assert not page.locator('#onlineData').count()
        assert not page.locator('#onlineAccounts').count()
        page.locator('#onlineWorld').click()
        page.locator('#onlineScene').get_by_text('Порт').wait_for()
        world_place = 'Новый порт'
        send_revision(player_id,2)
        page.locator('#onlineRevision').get_by_text('Версия 2').wait_for()
        page.locator('#onlineScene').get_by_text('Новый порт').wait_for()
        page.locator('#onlineHeroes').click()
        page.locator('#onlineScene').get_by_role('button', name='Арья').wait_for()
        assert not errors, errors
        game_enabled=True
        server_revision=2
        page.locator('#onlinePlay').click()
        page.get_by_role('heading', name='Арья',exact=True).wait_for()
        master_context=browser.new_context()
        master_context.route('**/*',intercept)
        master_context.route_web_socket('**/*',realtime_socket)
        master_page=master_context.new_page()
        master_page.set_default_timeout(7000)
        master_page.on('pageerror',lambda error: errors.append(str(error)))
        subscriptions.pop(master_id,None)
        master_page.goto(base + '?online=1')
        master_page.locator('#onlineEmail').fill('gm@example.test')
        master_page.locator('#onlinePass').fill('local-password')
        master_page.locator('#onlineLogin button').click()
        master_page.wait_for_function("sharedGame && actor?.role==='master' && remaining(S,'h1')===8")
        page.evaluate("switchTab('stay')")
        page.get_by_role('button',name='Отдохнуть',exact=False).click()
        page.locator('#engineForm button[type=submit]').click()
        page.wait_for_function("remaining(S, 'h1') === 7")
        assert game_state['engine']['stays'][0]['spent']['h1']==1
        send_revision(master_id,3)
        master_page.wait_for_function("remaining(S,'h1')===7")
        page.evaluate("switchTab('bags')")
        page.get_by_role('heading',name='Личные сумки').wait_for()
        page.evaluate("switchTab('craft')")
        page.get_by_role('heading',name='Ремесло',exact=True).wait_for()
        page.evaluate("switchTab('contracts')")
        page.get_by_role('heading',name='Журнал заданий',exact=True).wait_for()
        master_page.evaluate("S.company.notes='Правка мастера';commit()")
        master_page.wait_for_function("!sharedGame.pendingSave()")
        assert game_state['company']['notes']=='Правка мастера'
        assert game_state['engine']['stays'][0]['spent']['h1']==1
        send_revision(player_id,4)
        page.wait_for_function("S.company.notes==='Правка мастера'")
        master_page.evaluate("sharedGame.settings('')")
        master_page.locator('#onlinePlay').click()
        master_page.wait_for_function("sharedGame && actor?.role==='master' && remaining(S,'h1')===7")
        master_page.evaluate("S.company.notes='После возврата';commit()")
        master_page.wait_for_function("!sharedGame.pendingSave()")
        assert game_state['company']['notes']=='После возврата'
        assert not errors, errors
        browser.close()
finally:
    server.shutdown()
print('Supabase online browser checks passed')
