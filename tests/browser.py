from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
class Local(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Local)
Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page()
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
        exec(case.read_text(),globals())
    page.reload()
    page.locator('#nick').fill('gm')
    page.locator('#pass').fill('atlas-test-pw')
    page.locator('#authForm button').click()
    page.locator('body:not(.locked)').wait_for()
    assert not errors,errors
    browser.close()
    print('Chromium offline checks passed')
