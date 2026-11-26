from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from time import monotonic,sleep
def wait_for_db(page,predicate):
    deadline=monotonic()+5
    while monotonic()<deadline:
        if page.evaluate(predicate):
            return
        sleep(.05)
    raise AssertionError('Состояние IndexedDB не достигло контрольной точки')
class Local(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Local)
Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context=browser.new_context()
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{server.server_port}/index.html')
    page.locator('#nick').fill('gm')
    page.locator('#pass').fill('atlas-test-pw')
    page.locator('#authForm button').click()
    page.locator('body:not(.locked)').wait_for()
    for tab in ('map','camp','company','contracts','bank','home'):
        page.evaluate('(t)=>switchTab(t)',tab)
    for case in sorted((root/'tests').glob('*.browser.py')):
        print(case.name,flush=True)
        try:
            page.set_default_timeout(5000)
            exec(compile(case.read_text(),str(case),'exec'),globals())
        except Exception:
            print(page.evaluate("[...document.querySelectorAll('#engineForm input')].map(i=>[i.id,i.type==='password'?'***':i.value,i.validationMessage])"))
            print(errors,page.locator('#modalBody').inner_text()[-1200:],page.locator('#toast').inner_text())
            raise
    checkpoint=page.evaluate("JSON.stringify([S.company,S.engine,S.journey])")
    page.reload()
    page.locator('#nick').fill('gm')
    page.locator('#pass').fill('atlas-test-pw')
    page.locator('#authForm button').click()
    page.locator('body:not(.locked)').wait_for()
    assert page.evaluate("JSON.stringify([S.company,S.engine,S.journey])")==checkpoint
    assert not errors,errors
    browser.close()
    print('Chromium offline checks passed')
