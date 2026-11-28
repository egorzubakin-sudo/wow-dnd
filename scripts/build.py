"""Assemble the offline edition from the v0.9 shell, rules, and local modules."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'src'

def read(path):
    return path.read_text(encoding='utf-8')

def insert(template, marker, value):
    if template.count(marker) != 1:
        raise ValueError(f'Expected exactly one {marker}')
    return template.replace(marker, value)

modules = '\n'.join(read(path) for path in sorted(SRC.glob('*.js')))
for name in ('rules', 'demo', 'achievements'):
    data = read(ROOT / 'data' / f'{name}.json').replace('<', r'\u003c')
    modules = insert(modules, f'/*BUNDLED_{name.upper()}*/ null', data)

content = {
    'bookEquipment': json.loads(read(ROOT / 'content/core/book-equipment.json')),
    'tradeLoop': json.loads(read(ROOT / 'content/examples/trade-loop.json')),
}
modules = insert(modules, '/*BUNDLED_CONTENT*/ null',
                 json.dumps(content, ensure_ascii=False).replace('<', r'\u003c'))

icons = json.loads(read(ROOT / 'icons.json'))
modules = insert(modules, '/*ATLAS_ICON_DEFAULTS*/ null', json.dumps(icons['defaults'], ensure_ascii=False))
shell = insert(read(SRC/'atlas-shell.html'), '/* ATLAS_MODULES */', modules)
shell = insert(shell, '<!-- ATLAS_STYLES -->', '<style>' + read(SRC/'atlas.css') + '\n' + read(SRC/'atlas-kit.css') + '</style>')
(ROOT / 'index.html').write_text(shell, encoding='utf-8')

# Package the same domain commands for the Supabase Edge Function.
domain = [
    read(path) for path in sorted(SRC.glob("*.js"))
    if path.name == "01-core.js" or path.name.endswith("-domain.js")
]
validator = read(SRC / "45-validation.js").split("const normalizeEngine =")[0]
server = (
    "\n".join(domain) + "\n" + validator + read(SRC / "81-online-backup.js") + "\n"
    + read(ROOT / "supabase/game/online-domain.js") + "\n"
    + read(ROOT / "supabase/game/travel-domain.js")
)
for name in ("rules", "demo"):
    server = insert(server, f"/*BUNDLED_{name.upper()}*/ null", read(ROOT / "data" / f"{name}.json"))
server += (
    "\nexport { initializeGame, gameView, mutateGame, splitOnlineBackup, mapBackupValues, "
    "atlasStorageReference, atlasMediaName, validateBackup };\n"
)
(ROOT / "supabase/functions/atlas-play/engine.mjs").write_text(server, encoding="utf-8")
