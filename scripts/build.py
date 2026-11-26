from pathlib import Path
root = Path(__file__).resolve().parents[1]
html = (root/'legacy/atlas-v09.html').read_text()
def replace(old, new):
    global html
    assert html.count(old) == 1, old
    html = html.replace(old, new)
replace('shattered-atlas-v1\',1','shattered-atlas-engine\',1')
replace("req.onupgradeneeded=()=>req.result.createObjectStore('atlas')", "req.onupgradeneeded=()=>{req.result.createObjectStore('atlas');req.result.createObjectStore('accounts',{keyPath:'nick'})}")
replace('init();\n</script>', '\n'.join(p.read_text() for p in sorted((root/'src').glob('*.js'))) + '\nboot();\n</script>')
replace('</head>', '<style>'+ (root/'src/atlas.css').read_text() +'</style></head>')
replace('<body>', '<body class="locked"><section id="gate" class="card" aria-live="polite"></section>')
(root/'index.html').write_text(html)
