"""Index the unpacked Atlas icon library. IDs use the folder and exact file stem."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / "assets" / "icons"
CATEGORIES = {
    "navigation": "Навигация",
    "skills": "Характеристики и навыки",
    "professions": "Профессии",
    "resources": "Ресурсы",
    "equipment": "Оружие и броня",
    "magic": "Магические предметы",
    "consumables": "Расходники",
    "mounts": "Ездовые животные",
    "factions": "Фракции",
    "quests": "Задания",
    "achievements": "Достижения",
    "upgrades": "Улучшения лагеря",
}
FOLDER_CATEGORY = dict(armour="equipment", weapons="equipment", creatures="skills",
                       places="navigation", trade="resources", misc="resources")
PATTERNS = {
    "navigation": r"^map|pocketwatch|bell_|book_|note_|^bag_",
    "skills": r"^spyglass|bandage|lockpick|firstaid",
    "professions": r"tool|shovel|^herb|^fish|^forge|^gear|^wrench|^disenchant|^elixir|leather|bolt|^scroll|^vial",
    "magic": r"enchant|^essence|^dust|^formula|^ring|^trinket|crystal|^gem|^rune",
    "consumables": r"potion|elixir|flask|^food|^bandage|^drink|^firepotion",
    "mounts": r"^zhevra$|panther|serpent|saddle|riding|(?:^|_)mount(?:_|[0-9]|$)",
    "factions": r"tabard|banner|horde|alliance",
    "quests": r"^note|^scroll|map|^book|certificate",
    "achievements": r"trophy|certificate|medal|award",
    "upgrades": r"gear|wrench|^shovel|^grindingstone|^coin|frame|tabard",
}
ORIGINAL = {
    "Food_93_SkethylBerries-.png": "Food_93_SkethylBerries .png",
    "Food_94_GaradarSharp-.png": "Food_94_GaradarSharp .png",
    "Fork-Knife.png": "Fork&Knife.png",
    "SpineLeaf-_01.png": "SpineLeaf _01.png",
}
DEFAULTS = {
    "nav": dict(home="places:goldshire", map="misc:Map_01", news="misc:Note_01",
                people="creatures:human", factions="armour:GuildTabard_01",
                diplomacy="misc:Tournaments_banner_Human", worldbook="misc:Book_01",
                codex="misc:Book_04", company="armour:Shield_Naxxramas_D_01",
                camp="places:Barrens_01", stay="places:Durotar", craft="misc:Gear_01",
                bank="misc:Bag_01", contracts="trade:Scroll", mail="misc:NOTE_02",
                chronicle="misc:Book_05", achievements="misc:Trophy_Argent",
                journal="misc:Book_07", help="misc:Book_09", workshop="misc:Wrench_01"),
    "professions": dict(mining="trade:GrindingStone_01", herbalism="misc:Herb_02",
                        fishing="misc:Fish_01", archaeology="misc:Shovel_01",
                        skinning="armour:Leather_01", hunt="weapons:Bow_01",
                        smithing="trade:Copper_01", alchemy="trade:Elixir_01",
                        cooking="misc:Fork-Knife", enchanting="trade:Disenchant",
                        engineering="misc:Gear_01", inscription="trade:Scroll",
                        jewelry="trade:Gem_01", leather="armour:Leather_01",
                        tailor="trade:Frostweave_Bolt"),
    "items": {
        "ore":"trade:Copper_01","silver":"trade:Cobalt","bloom":"misc:Herb_02",
        "leaf":"misc:Herb_03","hide":"armour:Leather_01","meat":"misc:Food_132_Meat",
        "fish":"misc:Fish_03","shard":"trade:DreamShard_01","bar":"trade:Bronze",
        "wire":"trade:DelicateCopperWire","hook":"misc:Gear_02","nail":"trade:FelIronBolts",
        "oil":"trade:LeadedVial","ink":"trade:CrystalVial","meal":"misc:Food_121_ButterMeat",
        "soup":"misc:27_BlueSoup","strap":"armour:Leather_04","ring":"trade:Gem_11",
        "stranglekelp":"misc:Herb_15","blackmouth":"misc:Fish_05",
        "water-breathing":"trade:Elixir_05","game-fat":"misc:Food_134_Meat","river-perch":"misc:Fish_07",
    },
    "components": dict(search="misc:Map02", bell="misc:Bell_01", hero="creatures:human",
                       time="misc:PocketWatch_01", rest="places:ElwynnForest",
                       coins="misc:Coin_01", gear="misc:Gear_02", check="trade:Certificate"),
}
EXTRA = {}
for key, category in (("nav","navigation"),("professions","professions")):
    for value in DEFAULTS[key].values():
        EXTRA.setdefault(value, set()).add(category)

entries = []
for image in sorted(LIBRARY.glob("*/*.png")):
    icon_id = f"{image.parent.name}:{image.stem}"
    original = ORIGINAL.get(image.name, image.name)
    categories = {FOLDER_CATEGORY[image.parent.name], *EXTRA.get(icon_id, set())}
    for category, expression in PATTERNS.items():
        if re.search(expression, Path(original).stem, re.IGNORECASE):
            categories.add(category)
    entries.append(dict(id=icon_id, file=original,
                        path=image.relative_to(ROOT).as_posix(),
                        categories=[key for key in CATEGORIES if key in categories]))

ids = {entry["id"] for entry in entries}
assert len(ids) == len(entries), "Duplicate icon ID"
assert all(id in ids for group in DEFAULTS.values() for id in group.values()), "Missing default asset"
assert all(any(key in entry["categories"] for entry in entries) for key in CATEGORIES)
payload = {"version": 1, "categories": CATEGORIES, "defaults": DEFAULTS, "icons": entries}
(ROOT / "icons.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"))+"\n", encoding="utf-8")
print(f"{len(entries)} icons in {len(CATEGORIES)} categories")
