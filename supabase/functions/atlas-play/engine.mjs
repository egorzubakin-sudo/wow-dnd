// Domain functions take a candidate campaign, never DOM elements.
const commands = new Map();
function requireThat(ok, message) {
  if (!ok) throw Error(message);
}
function integer(v, min = 0, max = 1000000000) {
  requireThat(
    Number.isSafeInteger(v) && v >= min && v <= max,
    "Число вне диапазона",
  );
  return v;
}
function migrate(s) {
  s.engine ??= { schemaVersion: 1, receipts: [] };
  requireThat(
    s.engine.schemaVersion === 1 && Array.isArray(s.engine.receipts),
    "Неизвестная схема движка",
  );
  return s;
}
function register(name, access, run) {
  commands.set(name, { access, run });
}
function owned(actor, h) {
  return (
    actor.role === "master" ||
    (["captain", "player"].includes(actor.role) && actor.heroes.includes(h))
  );
}
function applyCommand(source, actor, name, payload, key) {
  const cmd = commands.get(name);
  requireThat(actor && cmd, "Неизвестная команда");
  requireThat(
    actor.role === "master" ||
      (cmd.access === "hero" && owned(actor, payload.hero)) ||
      (cmd.access === "party" && actor.role === "captain" && actor.travel),
    "Недостаточно прав",
  );
  requireThat(
    key && !source.engine.receipts.some((r) => r.key === key),
    "Операция уже применена",
  );
  const next = structuredClone(source);
  if (payload.companion) applyCompanionContext(next, actor, name, payload);
  cmd.run(next, payload, actor);
  let event = name,
    recipient = payload.hero;
  if (name === "gather" && !currentStay(next).history.at(-1)?.item_id)
    event = "";
  if (name === "work" || name === "staffWork") {
    const project = byId(next.engine.projects, payload.project);
    if (project.status === "done") {
      event = "craft";
      recipient = project.hero;
    }
  }
  if (name === "craft" && next.engine.projects.at(-1)?.status !== "done")
    event = "";
  for (const a of next.portal?.achievements || []) {
    if (a.engineEvent === event && !a.archived)
      grant(
        next,
        { type: "achievement", achievement: a.id },
        a.scope === "company" ? "" : recipient,
      );
  }
  const receipt = {
    key,
    name,
    actor: actor.nick,
    hero: name === "resolveCompanionRequest" ?
      next.engine.companionRequests.find((row) => row.id === payload.id)?.hero : payload.hero,
    day: next.company.day,
    ...(payload.companion ? { companion: payload.companion } : {}),
  };
  if (
    payload.companion || [
      "resolveCompanionRequest",
      "gather",
      "quest",
      "project",
      "craft",
      "work",
      "staffWork",
      "enchant",
      "disenchant",
      "assemble",
      "closeStay",
      "transfer",
      "grantCatalogItem",
      "merge",
      "withdraw",
      "gold",
      "cancelProject",
      "finishContract",
      "tradeDeal",
      "tradeDonation",
      "facilityTier",
      "facilityRental",
      "deliverGoods",
      "session",
    ].includes(name)
  ) {
    const previous = new Map(
      (source.company.inventory || []).map((x) => [x.id, x]),
    );
    const current = new Map(
      (next.company.inventory || []).map((x) => [x.id, x]),
    );
    receipt.items = [];
    for (const id of new Set([...previous.keys(), ...current.keys()])) {
      const a = previous.get(id),
        b = current.get(id),
        change = (b?.qty || 0) - (a?.qty || 0);
      if (change)
        receipt.items.push({
          id,
          item_id: (b || a).item_id,
          owner: (b || a).owner,
          change,
        });
    }
    receipt.gold = Math.round(((next.company.gold || 0) - (source.company.gold || 0)) * 100) / 100;
    receipt.wallets = Object.entries(next.engine.profiles || {})
      .map(([hero, h]) => ({
        hero,
        change: Math.round((h.wallet - (source.engine.profiles?.[hero]?.wallet || 0)) * 100) / 100,
      }))
      .filter((w) => w.change);
    const t = currentStay(source);
    if (t) {
      const after = next.engine.stays.find((x) => x.id === t.id);
      receipt.time = Object.entries(after.spent)
        .map(([hero, value]) => ({
          hero,
          hours: roundedHours(value - (t.spent[hero] || 0)),
        }))
        .filter((x) => x.hours);
    }
  }
  if (name === "tradeDeal") {
    const row = localMarket(source, actor).find((market) => market.item_id === payload.item);
    receipt.market = { node: row.node_id, item: row.item_id, side: payload.side,
      quantity: payload.qty, unit: tradePrices(source, row)[payload.side] };
  }
  if (name === "facilityTier" || name === "facilityRental")
    receipt.facility = { service: payload.service, tier: payload.tier };
  if (name === "deliverGoods") receipt.contract = payload.id;
  if (name === "contentImport") receipt.package = { id: payload.pack.id, version: payload.pack.version };
  next.engine.receipts.push(receipt);
  return next;
}

const stats = {
  str: "Сила",
  dex: "Ловкость",
  con: "Телосложение",
  int: "Интеллект",
  wis: "Мудрость",
  cha: "Харизма",
};
const skills = {
  Атлетика: "str",
  Акробатика: "dex",
  "Ловкость рук": "dex",
  Скрытность: "dex",
  Расследование: "int",
  История: "int",
  "Тайная магия": "int",
  Природа: "int",
  Религия: "int",
  Восприятие: "wis",
  Выживание: "wis",
  Медицина: "wis",
  Проницательность: "wis",
  "Уход за животными": "wis",
  Выступление: "cha",
  Запугивание: "cha",
  Обман: "cha",
  Убеждение: "cha",
};
const phases = {
  travel: "Путешествие",
  adventure: "Приключение",
  stay: "Стоянка",
};
function foundation(s) {
  const e = s.engine;
  e.regions ??= [];
  e.stays ??= [];
  e.profiles ??= {};
  e.rolls ??= [];
  e.phase ??= s.journey ? "travel" : "adventure";
  return e;
}
function heroOf(s, id) {
  const h = s.company.members.find((m) => m.id === id);
  requireThat(h, "Герой не найден");
  return h;
}
function profile(s, id) {
  heroOf(s, id);
  return (foundation(s).profiles[id] ??= {
    level: 1,
    stats: Object.fromEntries(Object.keys(stats).map((k) => [k, 10])),
    skills: {},
    tools: [],
    professions: [],
    recipes: [],
    bonus: 0,
    wallet: 0,
  });
}
function bv(p) {
  return p.proficiency ?? 2 + Math.floor((p.level - 1) / 4);
}
function dice(sides) {
  return 1 + Math.floor(Math.random() * sides);
}
function ability(p, { stat, skill, tool, mode, dc }, die = dice) {
  stat = stat || skills[skill];
  requireThat(Object.hasOwn(stats, stat), "Характеристика не найдена");
  const trained = p.skills[skill] || 0,
    toolPro = tool && p.tools.includes(tool);
  const advantage = mode === "adv" || (trained > 0 && toolPro),
    disadvantage = mode === "dis";
  const raw = [die(20)];
  let natural = raw[0];
  if (!!advantage !== disadvantage) {
    raw.push(die(20));
    natural = (advantage ? Math.max : Math.min)(...raw);
  }
  const mod =
    Math.floor((p.stats[stat] - 10) / 2) +
    bv(p) * Math.max(trained, toolPro ? 1 : 0) +
    p.bonus;
  return {
    source: { book: "phb2024", printed_page: 14 },
    natural,
    raw,
    mod,
    total: natural + mod,
    dc,
    success: natural + mod >= dc,
  };
}
register("profile", "hero", (s, p, actor) => {
  const master = actor?.role === "master";
  let member = s.company.members.find((m) => m.id === p.hero);
  if (p.create) {
    requireThat(
      master && !member && validId(p.hero),
      "Создавать героев может мастер",
    );
    member = { id: p.hero, active: true, mod: 0 };
    s.company.members.push(member);
  }
  const h = profile(s, p.hero),
    v = p.value;
  const catalog = economy(s);
  for (const values of [v.tools, v.professions, v.recipes])
    requireThat(
      Array.isArray(values) &&
        values.every((value) => typeof value === "string" && value.trim()),
      "Неверное значение справочника",
    );
  const professions = [...new Set(v.professions)];
  const existingProfessions = new Set(h.professions);
  requireThat(
    professions.length <= 2 ||
      (!h.professionsLimited &&
        professions.every((id) => existingProfessions.has(id))),
    "Выберите не больше двух профессий",
  );
  requireThat(
    professions.every(
      (id) =>
        existingProfessions.has(id) ||
        catalog.professions.some((row) => row.id === id),
    ),
    "Профессия отсутствует в справочнике",
  );
  requireThat(
    v.recipes.every(
      (id) =>
        h.recipes.includes(id) || catalog.recipes.some((row) => row.id === id),
    ),
    "Рецепт отсутствует в справочнике",
  );
  integer(v.level, 1, 20);
  for (const k of Object.keys(stats)) integer(v.stats[k], 1, 30);
  for (const [k, n] of Object.entries(v.skills)) {
    requireThat(Object.hasOwn(skills, k), "Неизвестный навык");
    integer(n, 0, 2);
  }
  integer(v.bonus, -100, 100);
  if (v.proficiency != null) integer(v.proficiency, 0, 20);
  Object.assign(h, {
    race: v.race || "",
    class: v.class || "",
    level: v.level,
    stats: v.stats,
    skills: v.skills,
    tools: v.tools,
    professions,
    recipes: v.recipes,
    professionsLimited: professions.length <= 2,
    bonus: master ? v.bonus : h.bonus,
    proficiency: master ? v.proficiency : h.proficiency,
  });
  if (p.member) {
    const { name, role, bio, image } = p.member;
    requireThat(
      [name, role, bio, image].every((field) => typeof field === "string"),
      "Проверьте поля героя",
    );
    requireThat(name.trim() || role.trim(), "Укажите имя или роль героя");
    Object.assign(member, { name: name.trim(), role: role.trim(), bio, image });
    if (master) {
      const { active, mod, faction, factionRank } = p.member;
      if (mod != null) integer(mod, -10, 30);
      if (faction) byId(s.factions, faction);
      Object.assign(member, { active: !!active, mod, faction, factionRank });
    }
  }
});
register("roll", "hero", (s, p) => {
  const h = profile(s, p.hero);
  integer(p.dc, 0, 100);
  const r = p.sides
    ? {
        raw: Array.from({ length: integer(p.count, 1, 50) }, () =>
          dice(integer(p.sides, 2, 1000)),
        ),
        mod: 0,
        dc: p.dc,
      }
    : ability(h, p);
  r.total ??= r.raw.reduce((a, b) => a + b, 0);
  s.engine.rolls.unshift({
    ...r,
    hero: p.hero,
    label: p.skill || p.tool || stats[p.stat] || "Кубики",
  });
});
function inside(x, y, points) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [a, b] = points[i],
      [c, d] = points[j];
    const onEdge = Math.abs((x-a)*(d-b)-(y-b)*(c-a)) < 1e-10 &&
      x >= Math.min(a,c) && x <= Math.max(a,c) && y >= Math.min(b,d) && y <= Math.max(b,d);
    if (onEdge) return true;
    if (b > y !== d > y && x < ((c - a) * (y - b)) / (d - b) + a) hit = !hit;
  }
  return hit;
}
function regionAt(s, n) {
  const rs = foundation(s).regions;
  if (!n) return;
  const manual = rs.find((row) => row.id === n.regionId);
  if (manual || !s.engine.regionBoundaries) return manual || rs
    .filter((row) => inside(n.x, n.y, row.points || [])).sort((a,b) => (b.priority || 0) - (a.priority || 0))[0];
  const {maps, mapPlacements, regionBoundaries} = mapData(s);
  const active = new Set(openSheets(maps).map((row) => row.id));
  const positions = new Map(mapPlacements.filter((row) => row.node_id === n.id && active.has(row.map_id))
    .map((row) => [row.map_id, row]));
  return regionBoundaries.flatMap((boundary) => {
    const p = positions.get(boundary.map_id), region = rs.find((row) => row.id === boundary.region_id);
    return p && region && inside(p.x, p.y, boundary.points)
      ? [{region, depth:mapAncestry(maps, boundary.map_id).length}] : [];
  }).sort((a,b) => (b.region.priority || 0) - (a.region.priority || 0) || b.depth - a.depth ||
    a.region.id.localeCompare(b.region.id))[0]?.region;
}
function currentStay(s) {
  return foundation(s).stays.find((x) => !x.closed);
}
function remaining(s, id) {
  const t = currentStay(s);
  return t ? roundedHours(t.days * t.hours - (t.spent[id] || 0)) : 0;
}
function spend(s, id, hours, activity) {
  heroOf(s, id);
  const t = currentStay(s);
  validateHours(hours);
  requireThat(
    t && s.engine.phase === "stay" && remaining(s, id) >= hours,
    "Недостаточно времени стоянки",
  );
  t.spent[id] = roundedHours((t.spent[id] || 0) + hours);
  t.history.push({ hero: id, hours, activity, day: s.company.day });
}
register("phase", "master", (s, p) => {
  requireThat(
    Object.hasOwn(phases, p.phase) &&
      !s.journey &&
      !currentStay(s) &&
      p.phase !== "stay",
    "Завершите текущий этап или создайте стоянку",
  );
  s.engine.phase = p.phase;
});
register("stay", "master", (s, p) => {
  requireThat(
    !currentStay(s) && !s.journey,
    "Сначала завершите текущую стоянку или переход",
  );
  const n = s.nodes.find((n) => n.id === p.location);
  requireThat(n, "Узел не найден");
  integer(p.days, 1, 3650);
  integer(p.hours, 1, 24);
  const region = p.region || regionAt(s, n)?.id || "";
  requireThat(
    !region || s.engine.regions.some((r) => r.id === region),
    "Регион не найден",
  );
  if (p.startDay != null) s.company.day = integer(p.startDay, s.company.day);
  s.company.location = n.id;
  s.engine.phase = "stay";
  s.engine.stays.push({
    ...p,
    region,
    id: crypto.randomUUID(),
    start: s.company.day,
    spent: {},
    history: [],
  });
});
register("editStay", "master", (s, p) => {
  const stay = currentStay(s);
  requireThat(stay, "Стоянка закрыта");
  integer(p.days, 1, 3650);
  integer(p.hours, 1, 24);
  requireThat(
    Object.values(stay.spent).every((hours) => hours <= p.days * p.hours),
    "Новый бюджет меньше уже потраченного времени",
  );
  const location = byId(s.nodes, p.location);
  const region = p.region || regionAt(s, location)?.id || "";
  if (region) byId(s.engine.regions, region);
  if (stay.location !== location.id) delete stay.rentals;
  const { startDay, ...settings } = p;
  Object.assign(stay, settings, { region });
  s.company.location = location.id;
});
register("rest", "hero", (s, p) => spend(s, p.hero, p.hours, "Отдых"));
register("closeStay", "master", (s) => {
  const t = currentStay(s);
  requireThat(t, "Стоянка закрыта");
  if (!t.early)
    requireThat(
      !(t.plans || []).some((p) => !p.done) &&
        !(s.engine.projects || []).some((p) => p.status === "active"),
      "Остались незавершённые проекты",
    );
  for (const m of s.company.members) {
    const h = remaining(s, m.id);
    if (h) spend(s, m.id, h, "Отдых");
  }
  s.company.day = Math.max(s.company.day, t.start + t.days);
  t.closed = true;
  s.engine.phase = "adventure";
});
register("region", "master", (s, p) => {
  requireThat(
    (p.factions || []).every((id) => s.factions.some((f) => f.id === id)),
    "Неизвестная фракция",
  );
  const rs = foundation(s).regions;
  const old = rs.find((r) => r.id === p.id);
  requireThat(p.name.trim(), "Введите название региона");
  if (old) Object.assign(old, p);
  else rs.push(p);
  if (p.node) {
    const n = s.nodes.find((n) => n.id === p.node);
    requireThat(n, "Узел не найден");
    n.regionId = p.id;
  }
});

function requireMapUnlocked(s) {
  requireThat(!s.settings?.mapLocked, "Редактирование карты заперто");
}
register("mapMove", "master", (s, p) => {
  requireMapUnlocked(s);
  const place = byId(s.nodes, p.id);
  requireThat([p.x, p.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1), "Некорректные координаты");
  if (s.engine.mapPlacements) placeOnMap(s, { node_id: place.id, map_id: overviewMap, x: p.x, y: p.y });
  else Object.assign(place, { x: p.x, y: p.y });
});
register("mapIcon", "master", (s, p) => {
  requireMapUnlocked(s);
  const place = byId(s.nodes, p.id);
  requireThat(!p.iconId || /^[\w-]+:[\w.-]+$/.test(p.iconId), "Некорректная иконка");
  requireThat(!p.image || /^data:image\/(png|jpeg|webp|gif|bmp|avif);base64,[A-Za-z0-9+/=]+$/i.test(p.image), "Некорректное изображение");
  place.iconId = p.iconId || "";
  place.markerImage = p.image || "";
});

function issueCharter(s, factionId, text) {
  const faction = byId(s.factions, factionId);
  requireThat(typeof text === "string" && text.trim() && text.length <= 20000, "Укажите текст грамоты");
  const document = text.trim().replace(/\r\n/g, "\n");
  const previous = faction.charter || "";
  if (("\n" + previous + "\n").includes("\n" + document + "\n")) return false;
  faction.charter = [previous, document].filter(Boolean).join("\n");
  return true;
}

register("issueCharter", "master", (s, p) => {
  requireThat(issueCharter(s, p.faction, p.text), "Такая грамота уже выдана");
  const faction = byId(s.factions, p.faction);
  (s.journal ??= []).unshift({
    id: crypto.randomUUID(), day: s.company.day, year: s.company.year, kind: "faction",
    title: "Грамота: " + faction.name, text: p.text.trim(), hidden: !!faction.hidden,
  });
});

const overviewMap = "overview";
const mapKinds = { world: "Мир", continent: "Континент", region: "Регион", local: "Поселение или территория" };
const mapTables = ["maps", "mapPlacements", "routeGeometries", "regionBoundaries"];
const mapCommands = new Set(["atlasSheet", "atlasImage", "atlasRemoveSheet", "atlasPlacement", "atlasGeometry", "atlasBoundary", "atlasPlaceRegion"]);

function mapData(s) {
  const e = s.engine ??= { schemaVersion: 1, receipts: [] };
  e.maps ??= [{ id: overviewMap, name: "Карта Азерота", kind: "world" }];
  e.mapPlacements ??= (s.nodes || []).map(({id, x, y}) => ({id, map_id: overviewMap, node_id: id, x, y}));
  e.routeGeometries ??= (s.routes || []).map(({id}) => ({id, map_id: overviewMap, route_id: id, points: []}));
  e.regionBoundaries ??= (e.regions || []).filter((r) => r.points?.length >= 3).map((r) =>
    ({id: r.id, map_id: overviewMap, region_id: r.id, points: r.points, hidden: true}));
  return e;
}
function sheetParent(sheet) {
  return sheet.id === overviewMap ? "" : sheet.parent_id || overviewMap;
}
function mapAncestry(sheets, id) {
  const chain = [], seen = new Set();
  while (id && !seen.has(id)) {
    const row = sheets.find((m) => m.id === id);
    if (!row) break;
    chain.unshift(row);
    seen.add(id);
    id = sheetParent(row);
  }
  return chain;
}
function openSheets(sheets) {
  return sheets.filter((sheet) => mapAncestry(sheets, sheet.id).every((row) => !row.archived));
}
function publicSheets(sheets) {
  return openSheets(sheets).filter((sheet) => mapAncestry(sheets, sheet.id).every((row) =>
    row.id === overviewMap || row.shared === true));
}
function normalizedPoint(x, y) {
  return [x, y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1);
}
function validateMapPoints(points, min) {
  requireThat(Array.isArray(points) && points.length >= min && points.length <= 256 &&
    points.every((p) => Array.isArray(p) && p.length === 2 && normalizedPoint(...p)), "Некорректные координаты точек карты");
  if (min === 3) {
    const area = points.reduce((sum, [x, y], i) => {
      const [u, v] = points[(i + 1) % points.length];
      return sum + x * v - y * u;
    }, 0);
    requireThat(Math.abs(area) > 1e-10, "Граница должна охватывать область");
  }
}
function mapEntry(rows, key, id, map) {
  return rows.find((row) => row.map_id === map && row[key] === id);
}
function validateCartography(s) {
  if (!mapTables.some((key) => s.engine?.[key] != null)) return;
  const {maps, mapPlacements, routeGeometries, regionBoundaries} = s.engine;
  const {nodes = [], routes = []} = s;
  const regions = s.engine.regions || [];
  const has = (rows, id) => rows.some((row) => row.id === id);
  requireThat(maps?.some((m) => m.id === overviewMap), "Нет обзорной карты");
  const ids = new Set();
  for (const sheet of maps) {
    requireThat(validId(sheet.id) && !ids.has(sheet.id), "Дублирующийся или некорректный ID карты");
    ids.add(sheet.id);
    requireThat(typeof sheet.name === "string" && sheet.name.trim() && Object.hasOwn(mapKinds, sheet.kind),
      "Укажите название и тип карты");
    requireThat(sheet.id !== overviewMap || !sheet.parent_id && !sheet.archived && !sheet.image, "Некорректная обзорная карта");
    requireThat(mapAncestry(maps, sheet.id)[0]?.id === overviewMap, "Цикл или неизвестная родительская карта");
    requireThat(!sheet.node_id || has(nodes, sheet.node_id), "Не найдена локация карты");
    requireThat(!sheet.region_id || has(regions, sheet.region_id), "Не найден регион карты");
    requireThat((sheet.x == null && sheet.y == null) || normalizedPoint(sheet.x, sheet.y), "Некорректный центр карты");
    requireThat(sheet.zoom == null || Number.isFinite(sheet.zoom) && sheet.zoom >= 1 && sheet.zoom <= 20,
      "Масштаб карты должен быть от 1 до 20");
    if (sheet.image) requireThat(typeof sheet.image === "string" &&
      (/^data:image\/(png|jpeg|webp|gif|bmp|avif);base64,[A-Za-z0-9+/=\s]+$/i.test(sheet.image) ||
       /^atlas-storage:v1:[a-f0-9]{64}\.(png|jpeg|webp|gif|bmp|avif)$/.test(sheet.image)) &&
      sheet.width > 0 && sheet.height > 0 && Number.isFinite(sheet.width) && Number.isFinite(sheet.height),
      "Некорректная подложка карты");
  }
  function links(rows, key, targets, check) {
    const pairs = new Set();
    for (const row of rows || []) {
      const pair = JSON.stringify([row.map_id, row[key]]);
      requireThat(!pairs.has(pair) && has(maps, row.map_id) && has(targets, row[key]),
        "Дублирующаяся или отсутствующая связь карты");
      pairs.add(pair);
      requireThat(row.hidden == null || typeof row.hidden === "boolean", "Некорректная видимость на карте");
      check(row);
    }
  }
  links(mapPlacements, "node_id", nodes, (row) => {
    requireThat(normalizedPoint(row.x, row.y), "Некорректные координаты");
    requireThat(row.scale == null || Number.isFinite(row.scale) && row.scale >= 50 && row.scale <= 200, "Масштаб отметки от 50% до 200%");
    requireThat(!row.labels || ["always", "hover", "never"].includes(row.labels), "Неизвестный режим подписи");
    requireThat(!row.child_id || maps.some((m) => m.id === row.child_id && sheetParent(m) === row.map_id),
      "Выберите дочернюю карту этого уровня");
  });
  links(routeGeometries, "route_id", routes, (row) => {
    validateMapPoints(row.points, 0);
    requireThat(!row.style || ["line", "smooth"].includes(row.style), "Неизвестная форма маршрута");
    const path = byId(routes, row.route_id);
    requireThat([path.a, path.b].every((id) => mapEntry(mapPlacements || [], "node_id", id, row.map_id)),
      "Сначала разместите оба конца маршрута");
  });
  links(regionBoundaries, "region_id", regions, (row) => validateMapPoints(row.points, 3));
}
function putMapEntry(rows, key, id, map, changes) {
  const previous = mapEntry(rows, key, id, map);
  if (changes === null) {
    if (previous) rows.splice(rows.indexOf(previous), 1);
  } else if (previous) Object.assign(previous, changes);
  else rows.push({ ...changes, id: crypto.randomUUID(), [key]: id, map_id: map });
}
function placeOnMap(s, p) {
  const e = mapData(s), place = byId(s.nodes, p.node_id);
  byId(e.maps, p.map_id);
  if (p.remove) {
    putMapEntry(e.mapPlacements, "node_id", place.id, p.map_id, null);
    const adjoining = new Set(s.routes.filter((r) => r.a === place.id || r.b === place.id).map((r) => r.id));
    e.routeGeometries = e.routeGeometries.filter((r) => r.map_id !== p.map_id || !adjoining.has(r.route_id));
    return;
  }
  requireThat(normalizedPoint(p.x, p.y), "Некорректные координаты");
  const display = p.display ? Object.fromEntries(["scale", "labels", "hidden", "child_id"].map((key) => [key, p.display[key]])) : {};
  putMapEntry(e.mapPlacements, "node_id", place.id, p.map_id, {x: p.x, y: p.y, ...display});
  if (p.map_id === overviewMap) Object.assign(place, {x:p.x, y:p.y});
}
registerAtlas("atlasSheet", (s, p) => {
  const {maps} = mapData(s), old = maps.find((row) => row.id === p.id);
  const fields = { name: p.name.trim(), desc: p.desc, kind: p.kind, shared: !!p.shared, x:p.x, y:p.y, zoom:p.zoom };
  if (p.id !== overviewMap) Object.assign(fields, {parent_id:p.parent_id, node_id:p.node_id, region_id:p.region_id, archived:!!p.archived});
  if (old) Object.assign(old, fields);
  else maps.push({ id:p.id, ...fields });
});
registerAtlas("atlasImage", (s, p) => {
  const sheet = byId(mapData(s).maps, p.id);
  if (p.id === overviewMap) s.map = p.image;
  else Object.assign(sheet, {image:p.image.src, width:p.image.w, height:p.image.h, filename:p.image.name});
});
registerAtlas("atlasRemoveSheet", (s, p) => {
  const e = mapData(s);
  byId(e.maps, p.id);
  requireThat(p.id !== overviewMap, "Обзорную карту нельзя удалить");
  requireThat(!e.maps.some((row) => sheetParent(row) === p.id) && !e.mapPlacements.some((row) => row.child_id === p.id),
    "Сначала перенесите дочерние карты и уберите ссылки с отметок");
  e.maps = e.maps.filter((row) => row.id !== p.id);
  for (const key of mapTables.slice(1)) e[key] = e[key].filter((row) => row.map_id !== p.id);
});
registerAtlas("atlasPlacement", placeOnMap);
registerAtlas("atlasGeometry", (s, p) => {
  putMapEntry(mapData(s).routeGeometries, "route_id", p.route_id, p.map_id, p.remove ? null :
    {points:p.points, style:p.style, hidden:!!p.hidden});
});
registerAtlas("atlasBoundary", (s, p) => {
  const e = mapData(s), region = byId(e.regions, p.region_id);
  putMapEntry(e.regionBoundaries, "region_id", p.region_id, p.map_id, p.remove ? null :
    {points:p.points, hidden:!!p.hidden});
  if (p.map_id === overviewMap) region.points = p.remove ? [] : p.points;
});
registerAtlas("atlasPlaceRegion", (s, p) => {
  if (p.region) byId(s.engine.regions, p.region);
  byId(s.nodes, p.id).regionId = p.region;
});
function registerAtlas(name, run) {
  register(name, "master", (s, payload) => {
    requireMapUnlocked(s);
    run(s, payload);
    validateCartography(s);
  });
}

function pruneMapReferences(s) {
  const e = mapData(s), ids = new Set(s.nodes.map((n) => n.id)), routes = new Set(s.routes.map((r) => r.id));
  e.mapPlacements = e.mapPlacements.filter((row) => ids.has(row.node_id));
  e.routeGeometries = e.routeGeometries.filter((row) => routes.has(row.route_id));
  for (const map of e.maps)
    if (map.node_id && !ids.has(map.node_id)) delete map.node_id;
}
function reconcileMapImport(previous, next, pack) {
  const e = next.engine;
  const oldNodes = new Map(previous.nodes.map((n) => [n.id,n]));
  const oldRoutes = new Set(previous.routes.map((r) => r.id));
  const oldRegions = new Map((previous.engine.regions || []).map((r) => [r.id,r]));
  if (pack.nodes && !pack.mapPlacements) for (const row of next.nodes) {
    const old = oldNodes.get(row.id), placement = mapEntry(e.mapPlacements,"node_id",row.id,overviewMap);
    if (!old || placement && (old.x !== row.x || old.y !== row.y)) {
      if (placement) Object.assign(placement,{x:row.x,y:row.y});
      else e.mapPlacements.push({id:row.id,node_id:row.id,map_id:overviewMap,x:row.x,y:row.y});
    }
  }
  if (pack.routes && !pack.routeGeometries) for (const row of next.routes) {
    if (!oldRoutes.has(row.id) && [row.a,row.b].every((id) => mapEntry(e.mapPlacements,"node_id",id,overviewMap)))
      e.routeGeometries.push({id:row.id,route_id:row.id,map_id:overviewMap,points:[]});
  }
  if (pack.regions && !pack.regionBoundaries) for (const region of next.engine.regions) {
    const old = oldRegions.get(region.id);
    if (region.points?.length >= 3 && JSON.stringify(old?.points) !== JSON.stringify(region.points)) {
      const boundary = mapEntry(e.regionBoundaries,"region_id",region.id,overviewMap);
      if (boundary) boundary.points = region.points;
      else e.regionBoundaries.push({id:region.id,region_id:region.id,map_id:overviewMap,points:region.points,hidden:true});
    }
  }
  for (const row of e.mapPlacements) {
    if (row.map_id !== overviewMap) continue;
    const node = next.nodes.find((n) => n.id === row.node_id);
    if (node) Object.assign(node,{x:row.x,y:row.y});
  }
}

const rulebook = {
  "professions": [
    {
      "id": "mining",
      "name": "Горное дело",
      "tools": [
        "Инструменты каменщика"
      ],
      "skill": "",
      "source": {
        "book": "wow",
        "printed_page": 98
      },
      "icon": "⚒",
      "summary": "Ищите жилы и добывайте руду, камень и самоцветы.",
      "description": "Руда снабжает кузнецов, инженеров и ювелиров.",
      "special": "Выплавка требует кузницы или плавильни. На каждые 10 зм стоимости металла уходит час.",
      "kind": "gathering"
    },
    {
      "id": "herbalism",
      "name": "Травничество",
      "tools": [
        "Набор травника"
      ],
      "skill": "",
      "source": {
        "book": "wow",
        "printed_page": 97
      },
      "icon": "❧",
      "summary": "Собирайте травы, цветы и грибы.",
      "description": "Сборы служат сырьём для алхимии и начертания.",
      "special": "Добычу у существ-растений мастер вправе разрешать по образцу снятия шкур.",
      "kind": "gathering"
    },
    {
      "id": "skinning",
      "name": "Снятие шкур",
      "tools": [
        "Инструменты кожевника"
      ],
      "skill": "",
      "source": {
        "book": "wow",
        "printed_page": 98
      },
      "icon": "♧",
      "summary": "Заготавливайте кожу и шкуры.",
      "description": "Сырьё берут с туши, а Сл зависит от показателя опасности существа.",
      "special": "Снятие занимает 10 минут. Для подходящего исчадия нужен БВ +3, для дракона +5.",
      "kind": "gathering"
    },
    {
      "id": "fishing",
      "name": "Рыбалка",
      "tools": [],
      "skill": "",
      "source": {
        "book": "wow",
        "printed_page": 97
      },
      "icon": "♒",
      "summary": "Ловите рыбу для продовольствия или рецептов.",
      "description": "Конкретную рыбу ловят проверкой Мудрости (Выживание) против сложности региона.",
      "special": "При натуральной 20 мастер может дать клад вместо обычного улова.",
      "kind": "gathering"
    },
    {
      "id": "archaeology",
      "name": "Археология",
      "tools": [],
      "skill": "История",
      "source": {
        "book": "wow",
        "printed_page": 96
      },
      "icon": "⌖",
      "summary": "Исследуйте места раскопок и собирайте фрагменты.",
      "description": "Час поисков и проверка Интеллекта (История) могут дать реликвию или фрагменты её происхождения.",
      "special": "Превышение Сл на 5 даёт целую реликвию, натуральная 20 даёт магический фрагмент.",
      "kind": "gathering"
    },
    {
      "id": "alchemy",
      "name": "Алхимия",
      "tools": [
        "Инструменты алхимика",
        "Набор травника"
      ],
      "skill": "",
      "source": {
        "book": "wow",
        "printed_page": 99
      },
      "icon": "⚗",
      "summary": "Готовьте зелья и реагенты.",
      "description": "Для рецептов используют травы и другие ингредиенты. Новые рецепты открываются по мере роста ранга.",
      "special": "Рецепты могут потребовать редкого сырья, добытого из конкретных источников.",
      "kind": "production"
    },
    {
      "id": "smithing",
      "name": "Кузнечное дело",
      "tools": [
        "Инструменты каменщика",
        "Инструменты кузнеца"
      ],
      "skill": "",
      "source": {
        "book": "wow",
        "printed_page": 100
      },
      "icon": "⚒",
      "summary": "Куйте вещи из металла и камня.",
      "description": "Планы кузнеца охватывают оружие, доспехи и другие изделия. Некоторые требуют кожи или ткани.",
      "special": "Известный план и подходящие материалы определяют доступные изделия.",
      "kind": "production"
    },
    {
      "id": "cooking",
      "name": "Кулинария",
      "tools": [
        "Инструменты пивовара",
        "Инструменты повара"
      ],
      "skill": "",
      "source": {
        "book": "wow",
        "printed_page": 100
      },
      "icon": "♨",
      "summary": "Готовьте провизию и блюда с особыми свойствами.",
      "description": "Кулинары используют рыбу, мясо и травы.",
      "special": "Книга отдельно описывает особое пиршество для искусника.",
      "kind": "production"
    },
    {
      "id": "enchanting",
      "name": "Наложение чар",
      "tools": [
        "Инструменты плотника",
        "Инструменты гончара",
        "Инструменты резчика по дереву"
      ],
      "skill": "",
      "source": {
        "book": "wow",
        "printed_page": 100
      },
      "icon": "✧",
      "summary": "Создавайте магические изделия и извлекайте магический остаток.",
      "description": "Для чар нужны формулы и реагенты, в том числе остаток от распыления.",
      "special": "Распыление открывается с БВ +3. Требуемый ранг зависит от редкости предмета.",
      "kind": "production"
    },
    {
      "id": "engineering",
      "name": "Инженерное дело",
      "tools": [
        "Инструменты ремонтника"
      ],
      "skill": "",
      "source": {
        "book": "wow",
        "printed_page": 101
      },
      "icon": "⚙",
      "summary": "Собирайте устройства из деталей.",
      "description": "Схемы инженера используют металл, кожу, ткань и другие материалы.",
      "special": "Подготовка деталей входит в затраты устройства по книжной схеме.",
      "kind": "production"
    },
    {
      "id": "inscription",
      "name": "Начертание",
      "tools": [
        "Инструменты каллиграфа",
        "Инструменты картографа",
        "Инструменты художника"
      ],
      "skill": "",
      "source": {
        "book": "wow",
        "printed_page": 101
      },
      "icon": "✎",
      "summary": "Готовьте чернила, карты и записи.",
      "description": "Начертатели перерабатывают травы в красители и чернила для своих техник.",
      "special": "Время приготовления чернил для изделия включено в книжную технику.",
      "kind": "production"
    },
    {
      "id": "jewelry",
      "name": "Ювелирное дело",
      "tools": [
        "Инструменты стеклодува",
        "Инструменты ювелира"
      ],
      "skill": "",
      "source": {
        "book": "wow",
        "printed_page": 102
      },
      "icon": "◇",
      "summary": "Создавайте украшения, сосуды и магические кольца.",
      "description": "Ювелиры работают с металлами, самоцветами и стеклом по изученным дизайнам.",
      "special": "Доступные дизайны зависят от ранга.",
      "kind": "production"
    },
    {
      "id": "leather",
      "name": "Кожевничество",
      "tools": [
        "Инструменты сапожника",
        "Инструменты кожевника"
      ],
      "skill": "",
      "source": {
        "book": "wow",
        "printed_page": 102
      },
      "icon": "✂",
      "summary": "Обрабатывайте шкуру и шейте кожаное снаряжение.",
      "description": "Выкройки кожевника используют сырьё от снятия шкур.",
      "special": "Выкройки охватывают от сумок до магического кожаного снаряжения.",
      "kind": "production"
    },
    {
      "id": "tailor",
      "name": "Портняжное дело",
      "tools": [
        "Инструменты ткача"
      ],
      "skill": "",
      "source": {
        "book": "wow",
        "printed_page": 102
      },
      "icon": "▧",
      "summary": "Шейте одежду, доспехи и походное снаряжение.",
      "description": "Портные используют ткань из добычи или торговли и работают по выкройкам.",
      "special": "Доступные выкройки зависят от ранга.",
      "kind": "production"
    },
    {
      "id": "hunt",
      "name": "Охота",
      "tools": [],
      "skill": "",
      "source": {
        "origin": "house"
      },
      "icon": "➳",
      "summary": "Выслеживайте дичь в окрестностях стоянки.",
      "description": "Проверка и добыча задаются региональной таблицей мастера.",
      "special": "Домашняя механика Атласа.",
      "kind": "gathering"
    }
  ],
  "gathering": [
    {
      "tier": 1,
      "dc": 10,
      "common_gp": 10,
      "rare_gp": 25,
      "source": {
        "book": "wow",
        "printed_page": 96
      }
    },
    {
      "tier": 2,
      "dc": 12,
      "common_gp": 50,
      "rare_gp": 100,
      "source": {
        "book": "wow",
        "printed_page": 96
      }
    },
    {
      "tier": 3,
      "dc": 15,
      "common_gp": 250,
      "rare_gp": 500,
      "source": {
        "book": "wow",
        "printed_page": 96
      }
    },
    {
      "tier": 4,
      "dc": 17,
      "common_gp": 1000,
      "rare_gp": 2500,
      "source": {
        "book": "wow",
        "printed_page": 96
      }
    },
    {
      "tier": 5,
      "dc": 20,
      "common_gp": 5000,
      "rare_gp": 7500,
      "source": {
        "book": "wow",
        "printed_page": 96
      }
    }
  ],
  "checks": {
    "book": "phb2024",
    "printed_page": 10
  },
  "tools": {
    "book": "phb2024",
    "printed_page": 220
  },
  "bastions": {
    "book": "dmg2024",
    "printed_page": 333
  },
  "abilityNotes": {
    "str": "Физическая мощь.",
    "dex": "Проворность, рефлексы и равновесие.",
    "con": "Здоровье и выносливость.",
    "int": "Мышление и память.",
    "wis": "Восприимчивость и стойкость ума.",
    "cha": "Уверенность и самообладание."
  },
  "skillNotes": {
    "Акробатика": "Удерживать равновесие.",
    "Атлетика": "Прыгать, плыть или преодолевать препятствия силой.",
    "Восприятие": "Замечать малозаметные детали.",
    "Выживание": "Идти по следу, искать пищу и безопасную дорогу.",
    "Выступление": "Развлекать исполнением.",
    "Запугивание": "Воздействовать угрозой.",
    "История": "Вспоминать события и культуры.",
    "Ловкость рук": "Незаметно манипулировать предметами.",
    "Медицина": "Распознавать болезни и причины смерти.",
    "Обман": "Убедительно лгать или маскироваться.",
    "Природа": "Вспоминать сведения о местности и живом мире.",
    "Проницательность": "Распознавать намерения и настроение.",
    "Расследование": "Искать скрытую информацию и понимать устройство вещей.",
    "Религия": "Вспоминать сведения о богах и обрядах.",
    "Скрытность": "Перемещаться и прятаться незаметно.",
    "Тайная магия": "Вспоминать сведения о магии и планах.",
    "Убеждение": "Влиять тактом и доводами.",
    "Уход за животными": "Успокаивать и обучать животных."
  }
}
;
const demoPack = {
  "regions": [
    {
      "id": "durotar",
      "name": "Дуротар",
      "continent": "Калимдор",
      "biome": "Сухие холмы",
      "dc": 10,
      "priority": 0,
      "points": [],
      "source": {
        "origin": "demo"
      },
      "description": "За красными уступами ветер гонит пыль. В обнажившихся жилах поблёскивает медь.",
      "image": "data:image/webp;base64,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"
    },
    {
      "id": "barrens",
      "name": "Степи",
      "continent": "Калимдор",
      "biome": "Саванна",
      "dc": 12,
      "priority": 0,
      "points": [],
      "source": {
        "origin": "demo"
      },
      "description": "Высокие травы шумят над тропами караванов. У воды видны свежие следы."
    },
    {
      "id": "ash",
      "name": "Ясеневый лес",
      "continent": "Калимдор",
      "biome": "Лес",
      "dc": 15,
      "priority": 0,
      "points": [],
      "source": {
        "origin": "demo"
      },
      "description": "Под тенью древних деревьев пахнет сырой листвой. Ручьи тянутся к старым развалинам."
    }
  ],
  "items": [
    {
      "id": "ore",
      "name": "Медная руда",
      "category": "Материалы",
      "quality": "common",
      "value_gp": 1,
      "source": {
        "origin": "demo"
      },
      "desc": "Необработанная медная руда для выплавки."
    },
    {
      "id": "silver",
      "name": "Серебряная руда",
      "category": "Материалы",
      "quality": "rare",
      "value_gp": 1,
      "source": {
        "origin": "demo"
      },
      "desc": "Материал или изделие из демонстрационного набора ремесла."
    },
    {
      "id": "bloom",
      "name": "Мироцвет",
      "category": "Материалы",
      "quality": "common",
      "value_gp": 1,
      "source": {
        "origin": "demo"
      },
      "desc": "Материал или изделие из демонстрационного набора ремесла."
    },
    {
      "id": "leaf",
      "name": "Сребролист",
      "category": "Материалы",
      "quality": "common",
      "value_gp": 1,
      "source": {
        "origin": "demo"
      },
      "desc": "Материал или изделие из демонстрационного набора ремесла."
    },
    {
      "id": "hide",
      "name": "Лёгкая кожа",
      "category": "Материалы",
      "quality": "common",
      "value_gp": 1,
      "source": {
        "origin": "demo"
      },
      "desc": "Материал или изделие из демонстрационного набора ремесла."
    },
    {
      "id": "meat",
      "name": "Сырое мясо",
      "category": "Материалы",
      "quality": "common",
      "value_gp": 1,
      "source": {
        "origin": "demo"
      },
      "desc": "Материал или изделие из демонстрационного набора ремесла."
    },
    {
      "id": "fish",
      "name": "Речная рыба",
      "category": "Материалы",
      "quality": "common",
      "value_gp": 1,
      "source": {
        "origin": "demo"
      },
      "desc": "Материал или изделие из демонстрационного набора ремесла."
    },
    {
      "id": "shard",
      "name": "Осколок реликвии",
      "category": "Материалы",
      "quality": "common",
      "value_gp": 1,
      "source": {
        "origin": "demo"
      },
      "desc": "Материал или изделие из демонстрационного набора ремесла."
    },
    {
      "id": "bar",
      "name": "Медный слиток",
      "category": "Материалы",
      "quality": "common",
      "value_gp": 1,
      "source": {
        "origin": "demo"
      },
      "desc": "Переплавленная медь для проволоки, гвоздей и других заготовок."
    },
    {
      "id": "wire",
      "name": "Медная проволока",
      "category": "Материалы",
      "quality": "common",
      "value_gp": 1,
      "source": {
        "origin": "demo"
      },
      "desc": "Тонкая медная проволока для мелких деталей."
    },
    {
      "id": "hook",
      "name": "Крючок",
      "category": "Материалы",
      "quality": "common",
      "value_gp": 1,
      "source": {
        "origin": "demo"
      },
      "desc": "Материал или изделие из демонстрационного набора ремесла."
    },
    {
      "id": "nail",
      "name": "Гвозди",
      "category": "Материалы",
      "quality": "common",
      "value_gp": 1,
      "source": {
        "origin": "demo"
      },
      "desc": "Материал или изделие из демонстрационного набора ремесла."
    },
    {
      "id": "oil",
      "name": "Травяное масло",
      "category": "Материалы",
      "quality": "common",
      "value_gp": 1,
      "source": {
        "origin": "demo"
      },
      "desc": "Материал или изделие из демонстрационного набора ремесла."
    },
    {
      "id": "ink",
      "name": "Чернила",
      "category": "Материалы",
      "quality": "common",
      "value_gp": 1,
      "source": {
        "origin": "demo"
      },
      "desc": "Материал или изделие из демонстрационного набора ремесла."
    },
    {
      "id": "meal",
      "name": "Походный рацион",
      "category": "Материалы",
      "quality": "common",
      "value_gp": 1,
      "source": {
        "origin": "demo"
      },
      "desc": "Материал или изделие из демонстрационного набора ремесла."
    },
    {
      "id": "soup",
      "name": "Рыбная похлёбка",
      "category": "Материалы",
      "quality": "common",
      "value_gp": 1,
      "source": {
        "origin": "demo"
      },
      "desc": "Материал или изделие из демонстрационного набора ремесла."
    },
    {
      "id": "strap",
      "name": "Кожаный ремешок",
      "category": "Материалы",
      "quality": "common",
      "value_gp": 1,
      "source": {
        "origin": "demo"
      },
      "desc": "Материал или изделие из демонстрационного набора ремесла."
    },
    {
      "id": "ring",
      "name": "Серебряное кольцо",
      "category": "Материалы",
      "quality": "common",
      "value_gp": 1,
      "source": {
        "origin": "demo"
      },
      "desc": "Материал или изделие из демонстрационного набора ремесла."
    },
    {
      "id": "stranglekelp",
      "name": "Удавник",
      "category": "Материалы",
      "quality": "common",
      "value_gp": 50,
      "source": {
        "book": "wow",
        "printed_page": 99
      },
      "desc": "Материал или изделие из демонстрационного набора ремесла."
    },
    {
      "id": "blackmouth",
      "name": "Масляный черноротик",
      "category": "Материалы",
      "quality": "rare",
      "value_gp": 25,
      "source": {
        "book": "wow",
        "printed_page": 99
      },
      "desc": "Редкая рыба, из которой добывают масло для зелья подводного дыхания."
    },
    {
      "id": "water-breathing",
      "name": "Зелье подводного дыхания",
      "category": "Магические предметы",
      "quality": "uncommon",
      "value_gp": 200,
      "source": {
        "book": "wow",
        "printed_page": 99
      },
      "desc": "Материал или изделие из демонстрационного набора ремесла."
    },
    {
      "id": "game-fat",
      "name": "Дичь: топлёный жир",
      "category": "Материалы",
      "quality": "uncommon",
      "value_gp": 2,
      "desc": "Жир дичи для походных припасов.",
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "river-perch",
      "name": "Речной окунь",
      "category": "Припасы",
      "quality": "common",
      "value_gp": 1,
      "desc": "Свежий улов для походной кухни.",
      "source": {
        "origin": "demo"
      }
    }
  ],
  "recipes": [
    {
      "id": "make-bar",
      "name": "Медный слиток",
      "profession_id": "smithing",
      "rank": 2,
      "hours": 2,
      "gold": 0,
      "item_id": "bar",
      "quantity": 1,
      "source": {
        "origin": "demo"
      },
      "service": "Оружейная"
    },
    {
      "id": "make-wire",
      "name": "Медная проволока",
      "profession_id": "smithing",
      "rank": 2,
      "hours": 2,
      "gold": 0,
      "item_id": "wire",
      "quantity": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "make-hook",
      "name": "Крючок",
      "profession_id": "engineering",
      "rank": 2,
      "hours": 2,
      "gold": 0,
      "item_id": "hook",
      "quantity": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "make-nail",
      "name": "Гвозди",
      "profession_id": "smithing",
      "rank": 2,
      "hours": 2,
      "gold": 0,
      "item_id": "nail",
      "quantity": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "make-oil",
      "name": "Травяное масло",
      "profession_id": "alchemy",
      "rank": 2,
      "hours": 2,
      "gold": 0,
      "item_id": "oil",
      "quantity": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "make-ink",
      "name": "Чернила",
      "profession_id": "inscription",
      "rank": 2,
      "hours": 2,
      "gold": 0,
      "item_id": "ink",
      "quantity": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "make-meal",
      "name": "Походный рацион",
      "profession_id": "cooking",
      "rank": 2,
      "hours": 2,
      "gold": 0,
      "item_id": "meal",
      "quantity": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "make-soup",
      "name": "Рыбная похлёбка",
      "profession_id": "cooking",
      "rank": 2,
      "hours": 2,
      "gold": 0,
      "item_id": "soup",
      "quantity": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "make-strap",
      "name": "Кожаный ремешок",
      "profession_id": "leather",
      "rank": 2,
      "hours": 2,
      "gold": 0,
      "item_id": "strap",
      "quantity": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "make-ring",
      "name": "Серебряное кольцо",
      "profession_id": "jewelry",
      "rank": 2,
      "hours": 2,
      "gold": 0,
      "item_id": "ring",
      "quantity": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "wow-water-breathing",
      "name": "Зелье подводного дыхания",
      "item_id": "water-breathing",
      "profession_id": "alchemy",
      "rank": 3,
      "hours": 40,
      "gold": 0,
      "quantity": 1,
      "source": {
        "book": "wow",
        "printed_page": 99,
        "time_source": {
          "book": "dmg2024",
          "printed_page": 222
        }
      }
    }
  ],
  "ingredients": [
    {
      "id": "need-bar",
      "recipe_id": "make-bar",
      "item_id": "ore",
      "quantity": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "need-wire",
      "recipe_id": "make-wire",
      "item_id": "bar",
      "quantity": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "need-hook",
      "recipe_id": "make-hook",
      "item_id": "wire",
      "quantity": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "need-nail",
      "recipe_id": "make-nail",
      "item_id": "bar",
      "quantity": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "need-oil",
      "recipe_id": "make-oil",
      "item_id": "bloom",
      "quantity": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "need-ink",
      "recipe_id": "make-ink",
      "item_id": "leaf",
      "quantity": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "need-meal",
      "recipe_id": "make-meal",
      "item_id": "meat",
      "quantity": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "need-soup",
      "recipe_id": "make-soup",
      "item_id": "fish",
      "quantity": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "need-strap",
      "recipe_id": "make-strap",
      "item_id": "hide",
      "quantity": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "need-ring",
      "recipe_id": "make-ring",
      "item_id": "silver",
      "quantity": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "potion-stranglekelp",
      "recipe_id": "wow-water-breathing",
      "item_id": "stranglekelp",
      "quantity": 1,
      "source": {
        "book": "wow",
        "printed_page": 99
      }
    },
    {
      "id": "potion-blackmouth",
      "recipe_id": "wow-water-breathing",
      "item_id": "blackmouth",
      "quantity": 2,
      "source": {
        "book": "wow",
        "printed_page": 99
      }
    }
  ],
  "loot": [
    {
      "id": "durotar-mining-ore",
      "region_id": "durotar",
      "profession_id": "mining",
      "item_id": "ore",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 0,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "durotar-mining-silver",
      "region_id": "durotar",
      "profession_id": "mining",
      "item_id": "silver",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 5,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "durotar-herbalism-bloom",
      "region_id": "durotar",
      "profession_id": "herbalism",
      "item_id": "bloom",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 0,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "durotar-herbalism-leaf",
      "region_id": "durotar",
      "profession_id": "herbalism",
      "item_id": "leaf",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 5,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "durotar-hunt-meat",
      "region_id": "durotar",
      "profession_id": "hunt",
      "item_id": "meat",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 0,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "durotar-fishing-fish",
      "region_id": "durotar",
      "profession_id": "fishing",
      "item_id": "fish",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 0,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "durotar-skinning-hide",
      "region_id": "durotar",
      "profession_id": "skinning",
      "item_id": "hide",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 0,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "durotar-archaeology-shard",
      "region_id": "durotar",
      "profession_id": "archaeology",
      "item_id": "shard",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 0,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "barrens-mining-ore",
      "region_id": "barrens",
      "profession_id": "mining",
      "item_id": "ore",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 0,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "barrens-mining-silver",
      "region_id": "barrens",
      "profession_id": "mining",
      "item_id": "silver",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 5,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "barrens-herbalism-bloom",
      "region_id": "barrens",
      "profession_id": "herbalism",
      "item_id": "bloom",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 0,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "barrens-herbalism-leaf",
      "region_id": "barrens",
      "profession_id": "herbalism",
      "item_id": "leaf",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 5,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "barrens-hunt-meat",
      "region_id": "barrens",
      "profession_id": "hunt",
      "item_id": "meat",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 0,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "barrens-fishing-fish",
      "region_id": "barrens",
      "profession_id": "fishing",
      "item_id": "fish",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 0,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "barrens-skinning-hide",
      "region_id": "barrens",
      "profession_id": "skinning",
      "item_id": "hide",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 0,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "barrens-archaeology-shard",
      "region_id": "barrens",
      "profession_id": "archaeology",
      "item_id": "shard",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 0,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "ash-mining-ore",
      "region_id": "ash",
      "profession_id": "mining",
      "item_id": "ore",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 0,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "ash-mining-silver",
      "region_id": "ash",
      "profession_id": "mining",
      "item_id": "silver",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 5,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "ash-herbalism-bloom",
      "region_id": "ash",
      "profession_id": "herbalism",
      "item_id": "bloom",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 0,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "ash-herbalism-leaf",
      "region_id": "ash",
      "profession_id": "herbalism",
      "item_id": "leaf",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 5,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "ash-hunt-meat",
      "region_id": "ash",
      "profession_id": "hunt",
      "item_id": "meat",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 0,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "ash-fishing-fish",
      "region_id": "ash",
      "profession_id": "fishing",
      "item_id": "fish",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 0,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "ash-skinning-hide",
      "region_id": "ash",
      "profession_id": "skinning",
      "item_id": "hide",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 0,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "ash-archaeology-shard",
      "region_id": "ash",
      "profession_id": "archaeology",
      "item_id": "shard",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 3,
      "min_margin": 0,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "herb-strangle",
      "region_id": "barrens",
      "profession_id": "herbalism",
      "item_id": "stranglekelp",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 1,
      "min_margin": 0,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "fish-blackmouth",
      "region_id": "durotar",
      "profession_id": "fishing",
      "item_id": "blackmouth",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 1,
      "min_margin": 5,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "ash-game-fat",
      "region_id": "ash",
      "profession_id": "hunt",
      "item_id": "game-fat",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 2,
      "min_margin": 5,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "barrens-river-perch",
      "region_id": "barrens",
      "profession_id": "fishing",
      "item_id": "river-perch",
      "weight": 1,
      "min_quantity": 1,
      "max_quantity": 2,
      "min_margin": 5,
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    }
  ],
  "errands": [
    {
      "id": "task-0",
      "title": "Незадачливый торговец",
      "desc": "Колесо телеги гоблина застряло в канаве.",
      "type": "local",
      "status": "available",
      "repeat": "stay",
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "task-1",
      "title": "Потерянный разведчик",
      "desc": "На опушке остались следы дозора.",
      "type": "local",
      "status": "available",
      "repeat": "stay",
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "task-2",
      "title": "Вода для каравана",
      "desc": "У колодца стоит встревоженный караванщик.",
      "type": "local",
      "status": "available",
      "repeat": "stay",
      "hours": 1,
      "source": {
        "origin": "demo"
      }
    }
  ],
  "solutions": [
    {
      "id": "option-0",
      "quest_id": "task-0",
      "name": "Помочь",
      "skill": "Атлетика",
      "dc": 10,
      "success": "Поручение выполнено.",
      "failure": "Попытка не удалась."
    },
    {
      "id": "option-0-help",
      "quest_id": "task-0",
      "name": "Позвать подмогу",
      "skill": "Убеждение",
      "dc": 10,
      "success": "Поручение выполнено.",
      "failure": "Попытка не удалась."
    },
    {
      "id": "option-1",
      "quest_id": "task-1",
      "name": "Помочь",
      "skill": "Выживание",
      "dc": 10,
      "success": "Поручение выполнено.",
      "failure": "Попытка не удалась."
    },
    {
      "id": "option-1-help",
      "quest_id": "task-1",
      "name": "Позвать подмогу",
      "skill": "Убеждение",
      "dc": 10,
      "success": "Поручение выполнено.",
      "failure": "Попытка не удалась."
    },
    {
      "id": "option-2",
      "quest_id": "task-2",
      "name": "Помочь",
      "skill": "Убеждение",
      "dc": 10,
      "success": "Поручение выполнено.",
      "failure": "Попытка не удалась."
    },
    {
      "id": "option-2-help",
      "quest_id": "task-2",
      "name": "Позвать подмогу",
      "skill": "Убеждение",
      "dc": 10,
      "success": "Поручение выполнено.",
      "failure": "Попытка не удалась."
    }
  ],
  "rewards": [
    {
      "id": "gold-option-0",
      "solution_id": "option-0",
      "type": "gold",
      "amount": 2,
      "when": "success"
    },
    {
      "id": "gold-option-0-help",
      "solution_id": "option-0-help",
      "type": "gold",
      "amount": 2,
      "when": "success"
    },
    {
      "id": "gold-option-1",
      "solution_id": "option-1",
      "type": "gold",
      "amount": 2,
      "when": "success"
    },
    {
      "id": "gold-option-1-help",
      "solution_id": "option-1-help",
      "type": "gold",
      "amount": 2,
      "when": "success"
    },
    {
      "id": "gold-option-2",
      "solution_id": "option-2",
      "type": "gold",
      "amount": 2,
      "when": "success"
    },
    {
      "id": "gold-option-2-help",
      "solution_id": "option-2-help",
      "type": "gold",
      "amount": 2,
      "when": "success"
    }
  ],
  "achievements": [
    {
      "id": "atlas-first-find",
      "title": "Первый образец",
      "points": 5,
      "body": "Принести первую находку со стоянки.",
      "category": "Ремесло и исследования",
      "engineEvent": "gather",
      "scope": "hero",
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "atlas-first-craft",
      "title": "Работа мастера",
      "points": 5,
      "body": "Завершить первый производственный проект.",
      "category": "Ремесло и исследования",
      "engineEvent": "craft",
      "scope": "hero",
      "source": {
        "origin": "demo"
      }
    },
    {
      "id": "atlas-company-stay",
      "title": "Первый привал",
      "points": 5,
      "body": "Завершить стоянку компании.",
      "category": "Ремесло и исследования",
      "engineEvent": "closeStay",
      "scope": "company",
      "source": {
        "origin": "demo"
      }
    }
  ]
}
;
function economy(s) {
  const e = foundation(s);
  for (const k of ["items", "recipes", "ingredients", "loot", "projects"])
    e[k] ??= [];
  e.professions ??= structuredClone(rulebook.professions);
  const defaults = new Map(rulebook.professions.map((p) => [p.id, p]));
  for (const p of e.professions) {
    const standard = defaults.get(p.id);
    if (p.desc != null) p.description ??= p.desc;
    for (const field of [
      "description",
      "summary",
      "special",
      "kind",
      "icon",
      "tools",
      "skill",
      "source",
    ])
      if (p[field] == null && standard?.[field] != null)
        p[field] = structuredClone(standard[field]);
  }
  e.gathering ??= structuredClone(rulebook.gathering);
  for (const stack of s.company.inventory || []) {
    if (stack.item_id) continue;
    stack.item_id = "legacy-" + stack.id;
    e.items.push({
      id: stack.item_id,
      name: stack.name,
      category: stack.category,
      quality: stack.quality,
      icon: stack.icon,
      image: stack.image,
      desc: stack.desc,
      hidden: stack.hidden,
      value_gp: 0,
    });
  }
  return e;
}
function byId(rows, id) {
  const x = rows.find((r) => r.id === id);
  requireThat(x, "Не найдена запись " + id);
  return x;
}
function learnedProfession(profile, id) {
  return !profile.professionsLimited || profile.professions.includes(id);
}
function eligibleProfession(s, h, id) {
  const p = byId(economy(s).professions, id);
  return (
    learnedProfession(h, id) &&
    (!p.skill || !!h.skills[p.skill]) &&
    (!p.tools?.length || p.tools.some((t) => h.tools.includes(t)))
  );
}
function deposit(s, item_id, owner, qty, extra = {}) {
  integer(qty, 1);
  const item = byId(economy(s).items, item_id),
    bag = s.company.inventory;
  requireThat(!item.original || !extra.properties, "Книжный предмет сохраняет исходные свойства");
  const existing = bag.find(
    (x) =>
      x.item_id === item_id &&
      x.owner === owner &&
      !x.properties &&
      !extra.properties &&
      !!x.hidden === !!(extra.hidden ?? item.hidden),
  );
  if (existing && item.stackable !== false) {
    existing.qty = integer(existing.qty + qty);
    return;
  }
  const base = item.base_item_id && byId(s.engine.items, item.base_item_id);
  const snapshot = base ? {
    rules: structuredClone(base.rules),
    craftedTraits: (item.craft_properties || []).map((id) => structuredClone(byId(s.engine.craftProperties, id))),
  } : {};
  if (item.stackable === false || extra.properties) {
    requireThat(
      qty <= 1000,
      "Слишком много индивидуальных экземпляров за операцию",
    );
    for (let i = 0; i < qty; i++)
      bag.push({
        ...item,
        ...snapshot,
        ...extra,
        id: crypto.randomUUID(),
        owner,
        item_id,
        qty: 1,
      });
  } else
    bag.push({
      ...item,
      ...extra,
      id: crypto.randomUUID(),
      owner,
      item_id,
      qty,
    });
}
function take(s, item, owner, amount) {
  integer(amount, 1);
  const rows = s.company.inventory.filter(
    (x) => x.item_id === item && x.owner === owner && !x.properties,
  );
  requireThat(
    rows.reduce((n, x) => n + x.qty, 0) >= amount,
    "Недостаточно материалов",
  );
  for (const row of rows) {
    const use = Math.min(row.qty, amount);
    row.qty -= use;
    amount -= use;
  }
  s.company.inventory = s.company.inventory.filter((x) => x.qty > 0);
}
function grantCatalogItem(s, { item, hero, qty }) {
  requireThat(typeof hero === "string", "Выберите получателя");
  const entry = byId(economy(s).items, item);
  const recipient = hero ? heroOf(s, hero) : null;
  deposit(s, entry.id, recipient ? "member:" + recipient.id : "", qty);
  (s.journal ??= []).unshift({
    id: crypto.randomUUID(), kind: "item", title: "Выдача: " + entry.name,
    text: (recipient ? recipient.name || recipient.role || "Герой" : "Банк компании") + " · " + qty + " шт.",
    hidden: !!(recipient || entry.hidden), day: s.company.day, year: s.company.year,
  });
}
register("grantCatalogItem", "master", grantCatalogItem);
register("transfer", "hero", (s, p) => {
  const row = byId(s.company.inventory, p.stack),
    from = "member:" + p.hero;
  requireThat(row.owner === from, "Чужая сумка");
  integer(p.qty, 1, row.qty);
  if (p.to) heroOf(s, p.to);
  const owner = p.to ? "member:" + p.to : "";
  if (owner === from) {
    requireThat(p.qty < row.qty, "Для разделения укажите часть стопки");
    s.company.inventory.push({ ...row, id: crypto.randomUUID(), qty: p.qty });
  } else if (
    p.qty === row.qty &&
    (row.properties || byId(s.engine.items, row.item_id).stackable === false)
  ) {
    row.owner = owner;
    return;
  } else
    deposit(s, row.item_id, owner, p.qty, {
      properties: row.properties,
      hidden: row.hidden,
    });
  row.qty -= p.qty;
  s.company.inventory = s.company.inventory.filter((x) => x.qty);
});
register("gold", "master", (s, p) => {
  const h = profile(s, p.hero);
  integer(p.amount, -1000000000);
  requireThat(
    h.wallet + p.amount >= 0 && s.company.gold >= p.amount,
    "Недостаточно золота",
  );
  h.wallet += p.amount;
  s.company.gold -= p.amount;
});
function gatheringDetails(s, p) {
  const h = profile(s, p.hero),
    t = currentStay(s),
    e = economy(s),
    id = p.profession;
  requireThat(
    t && eligibleProfession(s, h, id),
    "Нужна стоянка и подходящие владения",
  );
  const rows = e.loot.filter(
    (r) =>
      r.region_id === t.region &&
      r.profession_id === id &&
      (r.stock == null || r.stock > 0),
  );
  requireThat(rows.length, "В регионе нет доступного ресурса");
  const rule = rows[0],
    prof = byId(e.professions, id),
    region = byId(e.regions, t.region);
  if (rule.required_tool_id)
    requireThat(
      s.company.inventory.some(
        (x) =>
          x.item_id === rule.required_tool_id &&
          x.owner === "member:" + p.hero &&
          x.qty > 0,
      ),
      "Нужно оборудование",
    );
  const count = t.history.filter(
    (x) => x.hero === p.hero && x.activity === id,
  ).length;
  if (rule.attempts != null)
    requireThat(count < rule.attempts, "Попытки исчерпаны");
  let hours = rule.hours || 1,
    dc = rule.dc ?? region.dc;
  let carcass;
  if (id === "skinning") {
    carcass = byId(t.carcasses || [], p.carcass);
    requireThat(
      !carcass.used &&
        bv(h) >=
          (carcass.kind === "dragon" ? 5 : carcass.kind === "fiend" ? 3 : 2),
      "Туша недоступна или недостаточный ранг",
    );
    dc =
      e.gathering[
        carcass.cr > 20
          ? 4
          : carcass.cr >= 17
            ? 3
            : carcass.cr >= 11
              ? 2
              : carcass.cr >= 5
                ? 1
                : 0
      ].dc;
    hours = 1 / 6;
  }
  requireThat(
    s.engine.phase === "stay" && remaining(s, p.hero) >= roundedHours(hours),
    "Недостаточно времени стоянки",
  );
  const effects = activeEffects(s).filter((e) => e.profession === id);
  const heroProfile = {
    ...h,
    bonus:
      h.bonus +
      effects.reduce((total, effect) => total + (effect.bonus || 0), 0),
  };
  const modifiers = {
    skill: rule.skill || (id === "archaeology" ? "История" : "Выживание"),
    tool: prof.tools?.find((tool) => h.tools.includes(tool)),
    dc,
    mode: effects.some((effect) => effect.advantage) ? "adv" : "normal",
  };
  return {
    t,
    e,
    rows,
    rule,
    prof,
    region,
    hours,
    dc,
    carcass,
    modifiers,
    heroProfile,
  };
}
function gather(s, p, die = dice) {
  const id = p.profession;
  const {
    t,
    e,
    rows,
    rule,
    prof,
    region,
    hours,
    dc,
    carcass,
    modifiers,
    heroProfile,
  } = gatheringDetails(s, p);
  if (carcass) carcass.used = true;
  spend(s, p.hero, hours, id);
  const check = ability(heroProfile, modifiers, die);
  e.rolls.unshift({
    ...check,
    hero: p.hero,
    label: prof.name,
    showDC: t.showDC !== false,
  });
  if (
    id === "archaeology" ||
    (id === "fishing" && check.natural === 20 && rule.treasure_id)
  ) {
    if (!check.success && check.natural !== 20) return;
    const origin = rule.origin || region.name,
      rare = check.total >= dc + 5;
    let item = rule.item_id,
      qty = 1;
    if (id === "fishing") item = rule.treasure_id;
    else if (check.natural === 20 || rare) {
      const magic = check.natural === 20;
      item = (magic ? "magic-fragment-" : "ancient-relic-") + region.id;
      if (!e.items.some((i) => i.id === item))
        e.items.push({
          id: item,
          name:
            (magic ? "Магический фрагмент · " : "Целая реликвия · ") + origin,
          quality: "rare",
          category: "Прочее",
          value_gp: magic ? 0 : e.gathering[(region.tier || 1) - 1].rare_gp,
          source: { book: "wow", printed_page: 96 },
        });
    } else {
      const base = byId(e.items, item);
      item = base.id + "-" + region.id;
      if (!e.items.some((i) => i.id === item))
        e.items.push({ ...base, id: item, fragmentOrigin: origin });
      qty = die(6);
    }
    qty = Math.min(qty, rule.stock ?? Infinity);
    deposit(s, item, "member:" + p.hero, qty);
    if (rule.stock != null) rule.stock -= qty;
    Object.assign(t.history.at(-1), { item_id: item, qty });
    return;
  }
  const specialHide =
    id === "skinning" &&
    ["dragon", "fiend"].includes(byId(t.carcasses, p.carcass).kind);
  const marginValue =
    specialHide && check.success
      ? Math.max(5, check.total - dc)
      : check.total - dc;
  const matches = rows.filter(
    (r) =>
      marginValue >= r.min_margin &&
      (r.min_margin <= 0 || r.rare_chance == null || die(100) <= r.rare_chance),
  );
  if (!matches.length && rule.fail_text)
    t.history.at(-1).result = rule.fail_text;
  if (matches.length) {
    const margin = Math.max(...matches.map((r) => r.min_margin)),
      pool = matches.filter((r) => r.min_margin === margin);
    let weight = die(pool.reduce((n, r) => n + r.weight, 0));
    const row = pool.find((r) => (weight -= r.weight) <= 0);
    const qty = Math.min(
      row.stock ?? Infinity,
      row.min_quantity + die(row.max_quantity - row.min_quantity + 1) - 1,
    );
    deposit(s, row.item_id, "member:" + p.hero, qty);
    if (row.stock != null) row.stock -= qty;
    Object.assign(t.history.at(-1), { item_id: row.item_id, qty });
  }
}
register("gather", "hero", (s, p) => gather(s, p));
function facilities(s, r) {
  const stay = currentStay(s);
  return !!stay && (!r.service || facilityLevel(s, r.service) >= (r.facility_rank || 1)) &&
    (!r.locations?.length || r.locations.includes(stay.location));
}
function canCraft(s, hero, r) {
  const h = profile(s, hero);
  if (!meetsConditions(s, hero, r.conditions)) return false;
  if (
    !(r.equipment || []).every((id) =>
      s.company.inventory.some(
        (x) => x.owner === "member:" + hero && x.item_id === id && x.qty > 0,
      ),
    )
  )
    return false;
  return (
    (s.engine.requireTrainer
      ? Math.min(bv(h), h.trained?.[r.profession_id] || 2)
      : bv(h)) >= (r.rank || 2) &&
    eligibleProfession(s, h, r.profession_id) &&
    (r.basic ||
      h.recipes.includes(r.id) ||
      activeEffects(s).some((e) => e.recipes?.includes(r.id))) &&
    (r.tools || []).every((t) => h.tools.includes(t)) &&
    facilities(s, r)
  );
}
function projectQuote(s, p) {
  const e = economy(s),
    h = profile(s, p.hero),
    r = byId(e.recipes, p.recipe),
    owner = "member:" + p.hero;
  integer(p.qty, 1, 1000);
  const effect = campEffect(s, r),
    cost = Math.ceil(
      ((r.gold || 0) * p.qty * (100 - (effect.discount || 0))) / 100,
    ),
    work = Math.max(
      1,
      Math.ceil(
        (integer(r.hours * p.qty, 1) * (100 - (effect.speed || 0))) / 100,
      ),
    );
  const credit = p.credit || 0;
  integer(credit, 0);
  requireThat(credit <= cost, "Избыток абстрактных ресурсов");
  const resource = credit ? byId(e.items, p.resource) : null;
  if (resource) {
    requireThat(
      resource.value_gp > 0 && resource.profession_id === r.profession_id,
      "Неподходящие абстрактные ресурсы",
    );
    requireThat(
      Number.isInteger(credit / resource.value_gp),
      "Нужны целые единицы ресурса",
    );
  }
  const reserve = e.ingredients
    .filter((i) => i.recipe_id === r.id)
    .map((i) => ({ item: i.item_id, qty: i.quantity * p.qty }));
  if (resource)
    reserve.push({ item: resource.id, qty: credit / resource.value_gp });
  const needed = new Map();
  for (const line of reserve)
    needed.set(line.item, (needed.get(line.item) || 0) + line.qty);
  const materials = [...needed].map(([item, qty]) => ({
    item,
    qty,
    have: s.company.inventory
      .filter((x) => x.owner === owner && x.item_id === item && !x.properties)
      .reduce((sum, x) => sum + x.qty, 0),
  }));
  return { r, cost: cost - credit, work, reserve, materials, wallet: h.wallet };
}
function startProject(s, p) {
  const { r, cost, work, reserve, materials, wallet } = projectQuote(s, p);
  requireThat(
    canCraft(s, p.hero, r),
    "Проверьте рецепт, ранг, владения и инфраструктуру",
  );
  requireThat(
    wallet >= cost && remaining(s, p.hero) > 0,
    "Недостаточно золота или времени",
  );
  requireThat(
    materials.every((line) => line.have >= line.qty),
    "Недостаточно материалов",
  );
  for (const line of reserve) take(s, line.item, "member:" + p.hero, line.qty);
  profile(s, p.hero).wallet -= cost;
  const project = {
    id: crypto.randomUUID(),
    hero: p.hero,
    name: r.name,
    recipe: structuredClone(r),
    cost,
    reserve,
    left: work,
    work,
    qty: p.qty,
    status: "active",
    contributors: [],
  };
  s.engine.projects.push(project);
  return project;
}
register("project", "hero", (s, p) => startProject(s, p));
register("craft", "hero", (s, p) => {
  const project = startProject(s, p);
  if (project.left <= remaining(s, p.hero))
    commands
      .get("work")
      .run(s, { hero: p.hero, project: project.id, hours: project.left });
});

register("work", "hero", (s, p) => {
  const j = byId(economy(s).projects, p.project);
  requireThat(
    j.status === "active" &&
      facilities(s, j.recipe) &&
      eligibleProfession(s, profile(s, p.hero), j.recipe.profession_id),
    "Работа недоступна",
  );
  integer(p.hours, 1, j.left);
  spend(s, p.hero, p.hours, j.name);
  j.left -= p.hours;
  j.contributors.push({ hero: p.hero, hours: p.hours });
  if (!j.left) finishOutput(s, j);
});
register("cancelProject", "hero", (s, p) => {
  const j = byId(economy(s).projects, p.project);
  requireThat(j.hero === p.hero && j.status === "active", "Проект недоступен");
  const rate = s.engine.refund ?? 1;
  for (const l of j.reserve) {
    const qty = Math.floor(l.qty * rate);
    if (qty) deposit(s, l.item, "member:" + j.hero, qty);
  }
  profile(s, j.hero).wallet += Math.floor(j.cost * rate);
  j.status = "cancelled";
});
register("demo", "master", (s) => {
  const e = adventure(s);
  requireThat(!e.demo, "Пример уже установлен");
  for (const [k, rows] of Object.entries(demoPack)) {
    const target =
      k === "errands"
        ? s.contracts
        : k === "achievements"
          ? ((s.portal ??= {}).achievements ??= [])
          : e[k];
    for (const row of rows) {
      requireThat(
        !target.some((x) => x.id === row.id),
        "Конфликт ID " + row.id,
      );
      target.push(structuredClone(row));
    }
  }
  e.demo = true;
});

function meetsConditions(s, hero, c = {}) {
  const h = profile(s, hero),
    m = heroOf(s, hero),
    e = s.engine;
  if (
    (c.race && c.race !== (h.race || m.race)) ||
    (c.class && c.class !== (h.class || m.class)) ||
    (c.level && c.level > h.level)
  )
    return false;
  if (
    (c.skill && !h.skills[c.skill]) ||
    (c.recipe && !h.recipes.includes(c.recipe)) ||
    (c.profession && !eligibleProfession(s, h, c.profession))
  )
    return false;
  if (
    c.item &&
    !s.company.inventory.some(
      (i) => i.owner === "member:" + hero && i.item_id === c.item && i.qty > 0,
    )
  )
    return false;
  if (
    c.faction &&
    (s.factions.find((f) => f.id === c.faction)?.repPoints ?? -Infinity) <
      (c.rep || 0)
  )
    return false;
  if (
    (c.npc && !h.contacts?.includes(c.npc)) ||
    (c.achievement &&
      !s.portal.achievements.some(
        (a) =>
          a.id === c.achievement &&
          a.grants?.some((g) => g.recipient === "hero:" + hero),
      ))
  )
    return false;
  if (
    c.quest &&
    !e.completions.some((r) => r.hero === hero && r.quest === c.quest) &&
    !s.contracts.some((r) => r.id === c.quest && r.status === "done")
  )
    return false;
  return true;
}
function adventure(s) {
  const e = economy(s);
  for (const k of ["solutions", "rewards", "completions", "sessions"])
    e[k] ??= [];
  return e;
}
function questAvailable(s, q, hero) {
  const e = adventure(s),
    t = currentStay(s),
    c = q.conditions || {};
  if (
    !t ||
    q.archived ||
    q.hidden ||
    (q.region_id && q.region_id !== t.region) ||
    (q.location && q.location !== t.location)
  )
    return false;
  if (!meetsConditions(s, hero, c)) return false;
  return !e.completions.some(
    (r) =>
      r.hero === hero &&
      r.quest === q.id &&
      (q.repeat === "stay"
        ? r.stay === t.id
        : q.repeat === "day"
          ? r.day === s.company.day
          : q.period
            ? s.company.day - r.day < q.period
            : true),
  );
}
function grant(s, r, hero) {
  const h = hero ? profile(s, hero) : null;
  if (r.type === "item") {
    deposit(
      s,
      r.item_id,
      hero ? "member:" + hero : "",
      integer(r.quantity, 1),
      { hidden: !!r.secret },
    );
    return;
  }
  if (r.type === "gold") {
    integer(r.amount, 0);
    if (h) h.wallet += r.amount;
    else s.company.gold += r.amount;
    return;
  }
  if (r.type === "rep") {
    const f = byId(s.factions, r.faction);
    integer(r.amount, -100000);
    f.repPoints = Math.max(-6000, Math.min(42999, f.repPoints + r.amount));
    return;
  }
  if (r.type === "contact") {
    byId(s.portal.people, r.npc);
    requireThat(h, "Нужен герой");
    h.contacts ??= [];
    if (!h.contacts.includes(r.npc)) h.contacts.push(r.npc);
    return;
  }
  if (r.type === "discover") {
    byId(s.nodes, r.node).visibility = "known";
    return;
  }
  if (r.type === "achievement") {
    const a = byId(s.portal.achievements, r.achievement);
    a.grants ??= [];
    const recipient = hero ? "hero:" + hero : "company";
    if (achievementGrantAllowed(a, recipient)) {
      const date = "День " + s.company.day;
      a.grants.push({
        recipient,
        date,
        name: hero ? heroOf(s, hero).name : s.company.name,
        recipientHidden: hero ? !!heroOf(s, hero).hidden : false,
      });
      if (!hero) {
        a.earned = true;
        a.earnedDate = date;
      }
    }
    return;
  }
  requireThat(false, "Неизвестная награда");
}
register("errand", "master", (s, p) => {
  adventure(s);
  requireThat(p.title && p.options.length, "Нужны название и варианты");
  const id = p.id || crypto.randomUUID();
  const q = {
    id,
    title: p.title,
    type: "local",
    desc: p.desc,
    region_id: p.region_id,
    hours: integer(p.hours, 1),
    repeat: p.repeat,
    period: p.period || 0,
    conditions: p.conditions || {},
    status: "available",
    rewards: [],
  };
  const prior = s.contracts.find((x) => x.id === id);
  requireThat(!prior || prior.type === "local", "ID занят контрактом");
  if (prior) Object.assign(prior, q);
  else s.contracts.push(q);
  for (const o of p.options) {
    integer(o.dc, 0, 100);
    requireThat(o.name && Object.hasOwn(skills, o.skill), "Проверьте вариант");
    const existing =
      o.id &&
      s.engine.solutions.find((x) => x.id === o.id && x.quest_id === id);
    const key = existing?.id || crypto.randomUUID();
    if (existing) Object.assign(existing, o);
    else s.engine.solutions.push({ ...o, id: key, quest_id: id });
    const reward = s.engine.rewards.find(
      (r) => r.solution_id === key && r.when === "success" && r.type === "gold",
    );
    if (reward) reward.amount = integer(o.gold);
    else if (o.gold)
      s.engine.rewards.push({
        id: crypto.randomUUID(),
        solution_id: key,
        type: "gold",
        amount: integer(o.gold),
        when: "success",
      });
  }
});
register("quest", "hero", (s, p) => {
  const e = adventure(s),
    q = byId(s.contracts, p.quest),
    o = byId(e.solutions, p.option);
  requireThat(
    q.type === "local" && q.id === o.quest_id && questAvailable(s, q, p.hero),
    "Поручение недоступно",
  );
  spend(s, p.hero, q.hours || 1, q.title);
  const r = ability(profile(s, p.hero), {
    skill: o.skill,
    tool: o.tool,
    stat: o.stat,
    dc: o.dc,
    mode: "normal",
  });
  e.rolls.unshift({ ...r, hero: p.hero, label: q.title });
  for (const rw of e.rewards.filter(
    (x) =>
      x.solution_id === o.id && x.when === (r.success ? "success" : "failure"),
  ))
    grant(s, rw, p.hero);
  const result = o.encounter
    ? "Требуется решение мастера"
    : r.success
      ? o.success
      : o.failure;
  e.completions.push({
    hero: p.hero,
    quest: q.id,
    option: o.id,
    stay: currentStay(s).id,
    day: s.company.day,
    result,
  });
  s.journal.unshift({
    id: crypto.randomUUID(),
    kind: "contract",
    title: q.title,
    text: result || "",
    day: s.company.day,
    year: s.company.year,
  });
});
register("session", "master", (s, p) => {
  const e = adventure(s);
  requireThat(
    typeof p.id === "string" &&
      p.id &&
      p.summary &&
      !e.sessions.some((x) => x.id === p.id),
    "Нужны уникальный ID и краткое содержание",
  );
  for (const r of p.effects) {
    if (r.type === "quest") {
      const q = byId(s.contracts, r.quest);
      settleContract(s, q, q.rewards || [], false);
    } else grant(s, r, r.hero || "");
  }
  e.sessions.push(structuredClone(p));
  s.journal.unshift({
    id: crypto.randomUUID(),
    kind: "note",
    title: p.summary,
    text: p.log,
    hidden: !!p.hidden,
    day: s.company.day,
    year: s.company.year,
  });
});

function invalidUniqueGrants(achievement) {
  const grants = achievement.grants || [];
  return !Array.isArray(grants) || grants.length > 1 || grants.some((g) => !g?.recipient?.startsWith?.("hero:"));
}

function achievementGrantAllowed(achievement, recipient) {
  const grants = achievement.grants || [];
  return !achievement.archived &&
    !grants.some((g) => g.recipient === recipient) &&
    (!achievement.unique || (recipient.startsWith("hero:") && !grants.length && !achievement.earned));
}

// Field tokens: suffix ? means optional, @table denotes a foreign key.
const tables = {
  maps: ["Карты", "engine.maps",
    "id name kind parent_id:@maps? node_id:@nodes? region_id:@regions? desc? shared:bool? archived:bool? image? width:pos? height:pos? filename? x:ratio? y:ratio? zoom:num?"],
  mapPlacements: ["Отметки на картах", "engine.mapPlacements",
    "id map_id:@maps node_id:@nodes x:ratio y:ratio scale:pos? labels? hidden:bool? child_id:@maps?"],
  routeGeometries: ["Линии маршрутов", "engine.routeGeometries",
    "id map_id:@maps route_id:@routes points:json style? hidden:bool?"],
  regionBoundaries: ["Границы регионов", "engine.regionBoundaries",
    "id map_id:@maps region_id:@regions points:json hidden:bool?"],
  regions: [
    "Регионы",
    "engine.regions",
    "id name continent? biome? dc:int priority:signed? points:json? description? tier:int? levels? danger? factions:json? image?",
  ],
  nodes: [
    "Узлы",
    "nodes",
    "id name x:ratio y:ratio type? regionId:@regions? visibility? desc? faction:@factions?",
  ],
  routes: [
    "Маршруты",
    "routes",
    "id name a:@nodes b:@nodes kind? min:int max:int risk:int status? visibility? cost:num? desc? events:json?",
  ],
  factions: [
    "Фракции",
    "factions",
    "id name leader? color? icon? repPoints:signed? hidden:bool? desc?",
  ],
  diplomacy: [
    "Дипломатические связи",
    "diplomacy",
    "id a:@factions b:@factions state desc? hidden:bool?",
  ],
  people: [
    "NPC",
    "portal.people",
    "id title body? source? faction:@factions? location:@nodes? hidden:bool?",
  ],
  items: [
    "Каталог предметов",
    "engine.items",
    "id name category quality value_gp:num desc? icon? iconId? image? unit? profession_id:@professions? stackable:bool? hidden:bool? properties:json? original:bool? rules:json? base_item_id:@originalEquipment? craft_properties:json? craft_slots:int? magic_slots:int? trade_product:bool?",
  ],
  professions: [
    "Профессии",
    "engine.professions",
    "id name kind? summary? description? special? icon? iconId? image? tools:json? skill?",
  ],
  recipes: [
    "Рецепты",
    "engine.recipes",
    "id name profession_id:@professions item_id:@items quantity:pos hours:pos rank:pos gold:num? basic:bool? service? facility_rank:pos? tempo_class? tempo_hours:pos? reference_hours:pos? time_policy? trade_product:bool? tools:json? locations:json? properties:json? experiment:json? image? description? acquisition? equipment:json? conditions:json?",
  ],
  tradeGoods: ["Торговые товары", "engine.items", ""],
  tradeRecipes: ["Торговые рецепты", "engine.recipes", ""],
  markets: [
    "Местные рынки", "engine.markets",
    "id node_id:@nodes item_id:@items faction_id:@factions? stock:int demand:int budget:num buy_factor:num sell_factor:num rep_bonuses:json?",
  ],
  facilities: [
    "Производственные сооружения", "engine.facilities",
    "id service tier2_gp:num tier3_gp:num rent1_gp:num rent2_gp:num rent3_gp:num",
  ],
  craftProperties: [
    "Ремесленные свойства экипировки", "engine.craftProperties",
    "id name kind trigger action effect limits uses:pos? recovery?",
  ],
  originalEquipment: ["Оригинальная экипировка", "engine.items", ""],
  materials: ["Материалы и реагенты", "engine.items", ""],
  magicItems: ["Магические предметы", "engine.items", ""],
  enchantments: ["Рецепты зачарования", "engine.recipes", ""],
  archaeology: ["Археологические находки", "engine.loot", ""],
  campUpgrades: [
    "Эффекты улучшений лагеря", "engine.campUpgrades",
    "id service profession:@professions? recipes:json? bonus:signed? advantage:bool? discount:int? speed:int? wage:int? productivity:pos?",
  ],
  services: [
    "Местные услуги и наставники", "engine.localServices",
    "id node_id:@nodes service profession_id:@professions? fee:num? hours:pos? tier:pos? hidden:bool?",
  ],
  quests: [
    "Контракты и задания", "contracts",
    "id title desc? objectives? giver:@people? faction:@factions? location:@nodes? reward? rewards:json? hidden:bool?",
  ],
  deliveries: [
    "Торговые контракты", "contracts",
    "id title desc? consignee location:@nodes giver:@people? due_year:pos due_day:pos stock_source reward_recipient goods:json rewards:json hidden:bool?",
  ],
  ingredients: [
    "Ингредиенты",
    "engine.ingredients",
    "id recipe_id:@recipes item_id:@items quantity:pos",
  ],
  loot: [
    "Региональная добыча",
    "engine.loot",
    "id region_id:@regions profession_id:@professions item_id:@items weight:pos min_quantity:pos max_quantity:pos min_margin:signed hours:pos? dc:int? stock:int? attempts:pos? skill? fail_text? rare_chance:int? required_tool_id:@items? origin? treasure_id:@items?",
  ],
  hunting: ["Охотничьи таблицы", "engine.loot", ""],
  fishing: ["Рыболовные таблицы", "engine.loot", ""],
  errands: [
    "Местные поручения",
    "contracts",
    "id title desc? hours:pos region_id:@regions? location:@nodes? giver:@people? faction:@factions? conditions:json? repeat? image? period:pos? hidden:bool?",
  ],
  solutions: [
    "Решения поручений",
    "engine.solutions",
    "id quest_id:@errands name skill dc:int stat? tool? success? failure? encounter:bool?",
  ],
  rewards: [
    "Структурированные награды",
    "engine.rewards",
    "id solution_id:@solutions type when amount:signed? item_id:@items? quantity:pos? secret:bool? faction:@factions? npc:@people? node:@nodes? achievement:@achievements?",
  ],
  achievements: [
    "Достижения",
    "portal.achievements",
    "id title category? body? group? rewardTitle? points:int? engineEvent? scope? unique:bool? closed:bool? secret:bool? hidden:bool?",
  ],
  news: [
    "Новости и слухи",
    "portal.news",
    "id title body? source? category? kind? year:int? day:pos? hidden:bool?",
  ],
  codex: [
    "Статьи Кодекса",
    "portal.codex",
    "id title body? source? category? location:@nodes? hidden:bool?",
  ],
};
tables.hunting[2] = tables.fishing[2] = tables.loot[2];
tables.tradeGoods[2] = tables.originalEquipment[2] = tables.items[2];
tables.tradeRecipes[2] = tables.enchantments[2] = tables.recipes[2];
tables.materials[2] = tables.magicItems[2] = tables.items[2];
tables.archaeology[2] = tables.loot[2];
function columns(k) {
  return (
    tables[k][2] +
    (tables[k][2].includes(" source?") ? " provenance:json?" : " source:json?") + " extra:json?"
  )
    .split(" ")
    .map((token) => {
      const optional = token.endsWith("?"),
        [name, type = "text"] = token.replace(/\?$/, "").split(":");
      return { name, type, optional };
    });
}
function arr(s, k) {
  return tables[k][1].split(".").reduce((o, key) => (o[key] ??= []), s);
}
function subset(k, r) {
  if (k === "tradeGoods" || k === "tradeRecipes") return r.trade_product === true;
  if (k === "originalEquipment") return r.original === true;
  if (k === "materials") return r.category === "Материалы";
  if (k === "magicItems") return r.category === "Магические предметы";
  if (k === "enchantments") return r.profession_id === "enchanting" && !!r.properties;
  if (k === "archaeology") return r.profession_id === "archaeology";
  if (k === "deliveries") return r.type === "delivery";
  if (k === "quests") return !["local", "delivery"].includes(r.type);
  if (k === "errands") return r.type === "local";
  if (k === "hunting" || k === "fishing")
    return r.profession_id === (k === "hunting" ? "hunt" : "fishing");
  return true;
}
function records(s, k) {
  if (k === "news")
    return [
      ...arr(s, k).map((x) => ({ ...x, kind: "news" })),
      ...(s.portal.rumors || []).map((x) => ({ ...x, kind: "rumors" })),
    ];
  if (mapTables.includes(k)) mapData(s);
  return arr(s, k).filter((x) => subset(k, x));
}
function csvWrite(rows, names) {
  const cell = (v) => {
    const str =
      typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "");
    return '"' + str.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    [names, ...rows.map((row) => names.map((name) => name === "extra"
      ? Object.fromEntries(Object.entries(row).filter(([key]) => !names.includes(key))) : row[name]))]
      .map((line) => line.map(cell).join(";"))
      .join("\r\n")
  );
}
function csvRead(raw) {
  const text = raw.replace(/^\uFEFF/, "");
  let cell = "",
    row = [],
    rows = [],
    quoted = false,
    ended = false;
  const delimiter = text.split(/\r?\n/, 1)[0].includes(";") ? ";" : ",";
  const push = () => {
    row.push(cell);
    cell = "";
    ended = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          ended = true;
        }
      } else cell += c;
      continue;
    }
    if (c === delimiter) {
      push();
      continue;
    }
    if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      push();
      rows.push(row);
      row = [];
      continue;
    }
    if (c === '"' && !cell && !ended) {
      quoted = true;
      continue;
    }
    requireThat(!ended && c !== '"', "Некорректные кавычки CSV");
    cell += c;
  }
  requireThat(!quoted, "Незакрытая кавычка CSV");
  if (row.length || cell || ended) {
    push();
    rows.push(row);
  }
  const names = rows.shift();
  requireThat(
    names && new Set(names).size === names.length,
    "Повтор или отсутствие заголовков",
  );
  return rows
    .filter((r) => r.some((v) => v !== ""))
    .map((r, i) => {
      requireThat(
        r.length === names.length,
        "Неверное число колонок в строке " + (i + 2),
      );
      return Object.fromEntries(names.map((k, j) => [k, r[j]]));
    });
}
function validId(v) {
  return (
    typeof v === "string" &&
    /^[\p{L}\p{N}_:.\-]{1,128}$/u.test(v) &&
    !["__proto__", "constructor", "prototype"].includes(v)
  );
}
function inspectJSON(v) {
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      requireThat(
        !["__proto__", "constructor", "prototype"].includes(k),
        "Недопустимое имя поля",
      );
      inspectJSON(x);
    }
  }
}
function rowFrom(k, row, categories = []) {
  requireThat(
    row && typeof row === "object" && !Array.isArray(row),
    "Ожидалась запись",
  );
  inspectJSON(row);
  const out = {};
  const itemTable = ["items", "tradeGoods", "originalEquipment", "materials", "magicItems"].includes(k);
  const fields = columns(k);
  for (const c of fields) {
    let v = row[c.name];
    if (c.name === "category") {
      if (k === "tradeGoods") v = TRADE_CATEGORY;
      if (k === "materials") v = "Материалы";
      if (k === "magicItems") v = "Магические предметы";
    }
    if (itemTable && c.name === "quality") v ??= row.rarity;
    if (itemTable && c.name === "desc") v ??= row.description;
    if (["professions", "recipes", "tradeRecipes"].includes(k) && c.name === "description")
      v ??= row.desc;
    if (
      k === "professions" &&
      v === "" &&
      ["skill", "description", "summary", "special", "icon"].includes(c.name)
    ) {
      out[c.name] = v;
      continue;
    }
    if (c.name === "id" && !v && k === "ingredients")
      v = row.recipe_id + ":" + row.item_id;
    if (c.name === "id" && !v && ["loot", "hunting", "fishing"].includes(k))
      v = [row.region_id, row.profession_id, row.item_id, row.min_margin].join(
        ":",
      );
    if (c.name === "id" && !v && k === "rewards")
      throw Error("Нужен постоянный ID награды");
    if (v == null || v === "") {
      requireThat(c.optional, "Отсутствует " + c.name);
      continue;
    }
    if (c.type === "bool") {
      requireThat(
        ["true", "false"].includes(String(v)),
        c.name + " ожидает true/false",
      );
      v = String(v) === "true";
    } else if (c.type === "json") {
      v =
        typeof v === "string" && c.name !== "source"
          ? JSON.parse(v)
          : typeof v === "string" && v.trim().startsWith("{")
            ? JSON.parse(v)
            : v;
      inspectJSON(v);
    } else if (["pos", "int", "signed", "num", "ratio"].includes(c.type)) {
      requireThat(
        typeof v === "number" || (typeof v === "string" && v.trim()),
        "Ожидалось число",
      );
      v = Number(v);
      requireThat(
        Number.isFinite(v) &&
          Math.abs(v) <= 1e9 &&
          (c.type === "signed" || v >= 0),
        c.name + " вне диапазона",
      );
      if (c.type === "ratio") requireThat(v <= 1, c.name + " вне карты");
      else if (c.type !== "num")
        integer(v, c.type === "signed" ? -1e9 : c.type === "pos" ? 1 : 0);
    } else {
      requireThat(typeof v === "string", c.name + " ожидает текст");
      if (c.name === "id" || c.type.startsWith("@"))
        requireThat(validId(v), "Некорректный ID");
    }
    out[c.name] = v;
  }
  const extra = out.extra;
  delete out.extra;
  requireThat(extra == null || (typeof extra === "object" && !Array.isArray(extra)), "extra должен быть объектом");
  const known = new Set(fields.map((field) => field.name));
  for (const [key, value] of Object.entries({ ...extra, ...row }))
    if (!known.has(key)) out[key] = value;
  if (k === "deliveries") {
    out.type = "delivery";
    out.status ??= "available";
  }
  if (k === "quests") {
    requireThat(subset(k, out), "Выберите поручения или поставки");
    out.status ??= "available";
  }
  if (k === "enchantments") requireThat(subset(k, out), "Нужен рецепт зачарования со свойствами");
  if (k === "archaeology") out.profession_id = "archaeology";
  if (k === "tradeGoods") out.trade_product = true;
  if (k === "tradeRecipes") out.trade_product = true;
  if (["tradeGoods", "tradeRecipes", "markets", "facilities", "craftProperties", "services",
    "campUpgrades", "deliveries"].includes(k)) out.source ??= { origin: "house" };
  if (k === "originalEquipment") out.original = true;
  if (itemTable)
    requireThat(
      [
        "Оружие",
        "Броня",
        "Материалы",
        "Магические предметы",
        "Припасы",
        "Снаряжение",
        "Ездовые питомцы",
        "Прочее",
        TRADE_CATEGORY,
        ...categories,
      ].includes(out.category) &&
        ["common", "uncommon", "rare", "epic", "legendary"].includes(
          out.quality,
        ),
      "Неизвестная категория или редкость",
    );
  if (out.locations || out.equipment || out.factions)
    for (const v of [out.locations, out.equipment, out.factions].filter(
      Boolean,
    ))
      requireThat(Array.isArray(v) && v.every(validId), "Ожидался массив ID");
  if (k === "routes") {
    requireThat(
      out.a !== out.b && out.min <= out.max && out.risk <= 2,
      "Некорректный маршрут",
    );
    out.events ??= Array(6).fill("Событие маршрута");
  }
  if (["loot", "fishing", "hunting"].includes(k))
    requireThat(
      out.min_quantity <= out.max_quantity && subset(k, out),
      "Проверьте количество и профессию",
    );
  if (k === "errands") {
    out.type = "local";
    out.status = "available";
  }
  if (k === "solutions")
    requireThat(Object.hasOwn(skills, out.skill), "Неизвестный навык");
  if (k === "rewards") {
    requireThat(
      ["gold", "rep", "item", "contact", "discover", "achievement"].includes(
        out.type,
      ) && ["success", "failure"].includes(out.when),
      "Тип или условие награды",
    );
    const req = {
      gold: ["amount"],
      rep: ["amount", "faction"],
      item: ["item_id", "quantity"],
      discover: ["node"],
      contact: ["npc"],
      achievement: ["achievement"],
    };
    requireThat(
      req[out.type].every((key) => out[key] != null) &&
        (out.type !== "gold" || out.amount >= 0),
      "Неполная награда",
    );
  }
  if (out.tier) integer(out.tier, 1, 5);
  if (k === "diplomacy")
    requireThat(
      out.a !== out.b &&
        [
          "alliance",
          "cooperation",
          "neutral",
          "truce",
          "tension",
          "hostility",
          "war",
        ].includes(out.state),
      "Некорректные отношения фракций",
    );
  if (out.image)
    requireThat(
      /^data:image\/(png|jpeg|webp|gif|bmp|avif);base64,[A-Za-z0-9+/=\s]+$/i.test(
        out.image,
      ),
      "Требуется растровое изображение data URL",
    );
  if (k === "news" && out.kind)
    requireThat(
      ["news", "rumors"].includes(out.kind),
      "Вид записи: news или rumors",
    );
  if (k === "routes" && out.events)
    requireThat(
      Array.isArray(out.events) &&
        out.events.length === 6 &&
        out.events.every((v) => typeof v === "string"),
      "Нужно шесть событий",
    );
  if (out.experiment)
    requireThat(
      Object.hasOwn(skills, out.experiment.skill) &&
        Number.isInteger(out.experiment.dc),
      "Нужны навык и Сл экспериментального рецепта",
    );
  if (k === "errands" && out.conditions)
    requireThat(
      typeof out.conditions === "object" && !Array.isArray(out.conditions),
      "Условия должны быть объектом",
    );
  if (out.tools)
    requireThat(
      Array.isArray(out.tools) && out.tools.every((x) => typeof x === "string"),
      "tools — массив названий",
    );
  if (out.points && k === "regions")
    requireThat(
      Array.isArray(out.points) &&
        out.points.every(
          (p) =>
            Array.isArray(p) &&
            p.length === 2 &&
            p.every((x) => Number.isFinite(x) && x >= 0 && x <= 1),
        ),
      "Некорректные координаты",
    );
  validateTradeRow(itemTable ? "items" : k === "enchantments" ? "recipes" : k, out);
  return out;
}
function planImport(s, pack, mode, options = {}) {
  requireThat(
    ["new", "update", "skip", "replace"].includes(mode),
    "Неизвестный режим",
  );
  const next = structuredClone(s),
    count = { created: 0, updated: 0, skipped: 0, errors: 0 },
    issues = [], changes = [];
  adventure(next);
  tradeState(next);
  const check = (fn, label) => {
    try {
      fn();
    } catch (e) {
      count.errors++;
      issues.push(label + " · " + e.message);
    }
  };
  requireThat(
    pack &&
      typeof pack === "object" &&
      !Array.isArray(pack) &&
      Object.keys(pack).length,
    "Пустой пакет",
  );
  const hadMap = mapTables.some((key) => next.engine[key] != null) || mapTables.some((key) => Object.hasOwn(pack,key));
  if (hadMap) mapData(next);
  const replaced = new Set();
  for (const [k, rows] of Object.entries(pack)) {
    requireThat(
      Object.hasOwn(tables, k) && Array.isArray(rows),
      "Неизвестный справочник " + k,
    );
    const target = arr(next, k),
      seen = new Set();
    if (mode === "replace") {
      requireThat(!replaced.has(tables[k][1]), "Для полной замены выберите один вид каждой коллекции");
      replaced.add(tables[k][1]);
      for (let i = target.length - 1; i >= 0; i--)
        if (subset(k, target[i])) target.splice(i, 1);
      if (k === "news") next.portal.rumors = [];
    }
    rows.forEach((row, i) =>
      check(
        () => {
          const v = rowFrom(k, row, next.engine.categories);
          requireThat(!seen.has(v.id), "Повтор ID");
          seen.add(v.id);
          const dest =
            k === "news" && v.kind === "rumors"
              ? (next.portal.rumors ??= [])
              : target;
          const old = dest.find((x) => x.id === v.id);
          if (old) {
            requireThat(subset(k, old), "Конфликт с другим типом записи");
            if (mode === "new") {
              changes.push({ table: k, id: v.id, change: "conflict" });
              throw Error("ID уже существует");
            }
            if (mode === "skip") {
              count.skipped++;
              changes.push({ table: k, id: v.id, change: "skip" });
              return;
            }
            preserveRuntimeFields(k, old, v, options.resetMarket === true);
            Object.assign(old, v);
            count.updated++;
            changes.push({ table: k, id: v.id, change: "update" });
          } else {
            dest.push(v);
            count.created++;
            changes.push({ table: k, id: v.id, change: "new" });
          }
        },
        k + " #" + (i + 1),
      ),
    );
  }
  if (hadMap) reconcileMapImport(s,next,pack);
  const keys = Object.keys(tables).filter(
    (k) => !["hunting", "fishing"].includes(k) && (hadMap || !mapTables.includes(k)),
  );
  const ids = Object.fromEntries(
    keys.map((k) => [k, new Set(records(next, k).map((x) => x.id))]),
  );
  for (const k of keys) {
    for (const r of records(next, k)) {
      if (k === "achievements" && r.unique)
        check(() => requireThat(!r.earned && !invalidUniqueGrants(r) &&
          !r.auto && !(r.engineEvent && r.scope === "company"),
          "Уникальное достижение может принадлежать только одному герою"), k + " " + r.id);
      for (const c of columns(k).filter((c) => c.type.startsWith("@"))) {
        if (r[c.name] && !ids[c.type.slice(1)].has(r[c.name]))
          check(
            () => {
              throw Error("Нет ссылки " + c.name + " → " + r[c.name]);
            },
            k + " " + r.id,
          );
      }
    }
  }
  for (const x of next.company.inventory)
    if (!ids.items.has(x.item_id))
      check(() => {
        throw Error("Предмет используется в инвентаре");
      }, x.item_id);
  for (const t of next.engine.stays) {
    if ((t.region && !ids.regions.has(t.region)) || !ids.nodes.has(t.location))
      check(() => {
        throw Error("Место используется стоянкой");
      }, t.name);
  }
  const reference = (value, set, label) => {
    if (value && !set.has(value))
      check(() => {
        throw Error("Используется отсутствующий ID " + value);
      }, label);
  };
  for (const [id, h] of Object.entries(next.engine.profiles)) {
    for (const r of h.recipes || [])
      reference(r, ids.recipes, "Рецепты героя " + id);
    for (const p of h.professions || [])
      reference(p, ids.professions, "Профессии героя " + id);
  }
  for (const q of next.contracts) {
    reference(q.location, ids.nodes, q.title);
    reference(q.faction, ids.factions, q.title);
    reference(q.giver, ids.people, q.title);
    const c = q.conditions || {};
    for (const [key, table] of [
      ["profession", "professions"],
      ["item", "items"],
      ["recipe", "recipes"],
      ["faction", "factions"],
      ["npc", "people"],
      ["achievement", "achievements"],
    ])
      reference(c[key], ids[table], q.title);
  }
  for (const r of next.engine.recipes)
    for (const id of r.locations || []) reference(id, ids.nodes, r.name);
  for (const r of next.engine.regions)
    for (const id of r.factions || []) reference(id, ids.factions, r.name);
  for (const j of next.engine.projects.filter((j) => j.status === "active")) {
    reference(j.recipe.item_id, ids.items, j.name);
    for (const line of j.reserve) reference(line.item, ids.items, j.name);
  }
  reference(next.company.location, ids.nodes, "Стоянка компании");
  if (next.journey)
    reference(next.journey.routeId, ids.routes, "Текущий переход");
  for (const pack of next.engine.contentPackages || []) {
    for (const row of pack.records)
      if (records(s, row.table).some((x) => x.id === row.id))
        reference(row.id, ids[row.table], "Запись пакета " + pack.id);
  }
  if (hadMap) check(() => validateCartography(next), "Карты");
  check(() => validateTradeCatalog(next), "Экономика");
  return { next, count, issues, changes };
}
register("import", "master", (s, p) => {
  const plan = planImport(s, p.pack, p.mode, { resetMarket: true });
  requireThat(!plan.count.errors, plan.issues.join("\n"));
  Object.assign(s, plan.next);
});

function roundedHours(v) {
  return Math.round(v * 60) / 60;
}
function validateHours(v) {
  requireThat(
    Number.isFinite(v) &&
      v > 0 &&
      v <= 87600 &&
      Math.abs(60 * v - Math.round(60 * v)) < 1e-7,
    "Время задаётся в целых минутах",
  );
  return v;
}
register("schedule", "hero", (s, p) => {
  const t = currentStay(s);
  requireThat(t && p.activity.trim(), "Нужно указать занятие");
  validateHours(p.hours);
  t.plans ??= [];
  const used = t.plans
    .filter((r) => r.hero === p.hero && !r.done)
    .reduce((a, b) => a + b.hours, 0);
  requireThat(
    used + p.hours <= remaining(s, p.hero),
    "План превышает остаток часов",
  );
  t.plans.push({
    id: crypto.randomUUID(),
    hero: p.hero,
    activity: p.activity,
    hours: p.hours,
  });
});
register("resolvePlan", "hero", (s, p) => {
  const t = currentStay(s);
  requireThat(t, "Стоянка закрыта");
  const line = byId(t.plans || [], p.id);
  requireThat(!line.done && line.hero === p.hero, "План недоступен");
  if (!p.cancel) spend(s, p.hero, line.hours, line.activity);
  line.done = p.cancel ? "cancelled" : "done";
});
register("campSettings", "master", (s, p) => {
  integer(p.refund, 0, 100);
  integer(p.discount, 0, 99);
  integer(p.speed, 0, 99);
  integer(p.wage, 0, 100000);
  integer(p.productivity, 1, 24);
  const e = economy(s);
  e.refund = p.refund / 100;
  e.campEffects ??= {};
  for (const id of p.recipes || []) byId(e.recipes, id);
  if (p.profession) byId(e.professions, p.profession);
  e.campEffects[p.facility] = {
    recipes: p.recipes || [],
    profession: p.profession || "",
    bonus: integer(p.bonus || 0, -20, 20),
    advantage: !!p.advantage,
    discount: p.discount,
    speed: p.speed,
    wage: p.wage,
    productivity: p.productivity,
  };
});
function campEffect(s, r) {
  return (
    (s.company.talents[r.service] && (s.engine.campEffects?.[r.service] || s.engine.campUpgrades?.find((row) => row.service === r.service))) || {}
  );
}
register("staffWork", "master", (s, p) => {
  const j = byId(s.engine.projects, p.project),
    staff = byId(companySpecialists(s), p.staff),
    t = currentStay(s);
  requireThat(
    t && specialistAvailable(s, staff) && j.status === "active" && facilities(s, j.recipe),
    "Нужна стоянка и место работы",
  );
  const effect = campEffect(s, j.recipe),
    hours = integer(p.hours, 1, j.left);
  t.staffSpent ??= {};
  requireThat(
    (t.staffSpent[staff.id] || 0) + hours <=
      t.days * (effect.productivity || 8),
    "Время специалиста исчерпано",
  );
  const cost = hours * (effect.wage || 0);
  requireThat(s.company.gold >= cost, "Недостаточно золота");
  s.company.gold -= cost;
  t.staffSpent[staff.id] = (t.staffSpent[staff.id] || 0) + hours;
  j.left -= hours;
  j.contributors.push({ staff: staff.id, hours, cost });
  if (!j.left) finishOutput(s, j);
});
register("merge", "hero", (s, p) => {
  const row = byId(s.company.inventory, p.stack),
    owner = "member:" + p.hero;
  requireThat(
    row.owner === owner &&
      !row.properties &&
      byId(s.engine.items, row.item_id).stackable !== false,
    "Нельзя объединить",
  );
  const others = s.company.inventory.filter(
    (x) =>
      x.id !== row.id &&
      x.item_id === row.item_id &&
      x.owner === owner &&
      !x.properties &&
      !!x.hidden === !!row.hidden,
  );
  requireThat(others.length, "Нет совместимой стопки");
  row.qty = integer(row.qty + others.reduce((n, x) => n + x.qty, 0));
  s.company.inventory = s.company.inventory.filter((x) => !others.includes(x));
});
register("train", "hero", (s, p) => {
  const h = profile(s, p.hero),
    t = currentStay(s),
    prof = byId(s.engine.professions, p.profession);
  requireThat(
    t && eligibleProfession(s, h, prof.id),
    "Нет необходимых владений",
  );
  const rank = Math.min(6, bv(h));
  h.trained ??= {};
  const offer = trainingOffer(s, prof.id, rank, !!p.companion);
  requireThat(rank > (h.trained[prof.id] || 2) && offer, "Нужен наставник и новый ранг");
  requireThat(h.wallet >= offer.fee, "Недостаточно золота");
  spend(s, p.hero, offer.hours, "Обучение: " + prof.name);
  h.wallet = tradeMoney(h.wallet - offer.fee);
  h.trained[prof.id] = rank;
});
register("disenchant", "hero", (s, p) => {
  const h = profile(s, p.hero),
    x = byId(s.company.inventory, p.stack),
    r = {
      common: [3, 25],
      uncommon: [4, 100],
      rare: [5, 1000],
      epic: [6, 10000],
    }[x.quality];
  requireThat(
    r &&
      r[0] <= bv(h) &&
      eligibleProfession(s, h, "enchanting") &&
      x.owner === "member:" + p.hero &&
      x.category === "Магические предметы" &&
      !x.properties?.otherAttuned,
    "Распыление недоступно",
  );
  spend(s, p.hero, 1, "Распыление");
  x.qty--;
  s.company.inventory = s.company.inventory.filter((x) => x.qty > 0);
  const id = "wow-residue-" + x.quality;
  if (!s.engine.items.some((i) => i.id === id))
    s.engine.items.push({
      id,
      name: "Магическая субстанция · " + x.quality,
      category: "Материалы",
      quality: x.quality,
      value_gp: r[1],
      source: { book: "wow", printed_page: 101 },
    });
  deposit(s, id, "member:" + p.hero, 1);
});
register("enchant", "hero", (s, p) => {
  const h = profile(s, p.hero),
    x = byId(s.company.inventory, p.stack),
    r = byId(s.engine.recipes, p.recipe);
  requireThat(
    x.owner === "member:" + p.hero &&
      r.profession_id === "enchanting" &&
      r.properties &&
      canCraft(s, p.hero, r),
    "Требуется известная формула зачарования",
  );
  const template = byId(economy(s).items, x.item_id);
  requireThat(!template.original && !x.original, "Книжный предмет сохраняет исходные свойства");
  requireThat(!template.base_item_id || template.magic_slots === 1, "У предмета нет магической ячейки");
  const old = structuredClone(x);
  for (const i of s.engine.ingredients.filter((i) => i.recipe_id === r.id))
    take(s, i.item_id, x.owner, i.quantity);
  requireThat(
    s.company.inventory.includes(x) && x.qty > 0 && h.wallet >= (r.gold || 0),
    "Недостаточно материалов",
  );
  spend(s, p.hero, r.hours, r.name);
  h.wallet -= r.gold || 0;
  x.qty--;
  s.company.inventory = s.company.inventory.filter((v) => v.qty > 0);
  s.company.inventory.push({
    ...old,
    id: crypto.randomUUID(),
    qty: 1,
    properties: { ...old.properties, enchantment: r.properties },
  });
});
register("carcass", "master", (s, p) => {
  const t = currentStay(s);
  requireThat(t && p.name, "Нужна стоянка и название");
  integer(p.cr, 0, 100);
  requireThat(["beast", "fiend", "dragon"].includes(p.kind), "Неизвестный тип");
  t.carcasses ??= [];
  t.carcasses.push({ ...p, id: crypto.randomUUID(), used: false });
});
register("assemble", "hero", (s, p) => {
  const h = profile(s, p.hero),
    e = economy(s),
    owner = "member:" + p.hero,
    source = byId(e.items, p.fragment);
  requireThat(
    source.fragmentOrigin && eligibleProfession(s, h, "archaeology"),
    "Нужны фрагменты одного происхождения",
  );
  const count = s.company.inventory
    .filter((x) => x.item_id === p.fragment && x.owner === owner)
    .reduce((a, x) => a + x.qty, 0);
  requireThat(
    count >= 6 &&
      (!h.failedRelics?.[p.fragment] || count > h.failedRelics[p.fragment]),
    "Нужно собрать дополнительные фрагменты",
  );
  spend(s, p.hero, 1, "Сборка реликвии");
  const check = ability(h, { skill: "История", dc: 15 });
  e.rolls.unshift({ ...check, hero: p.hero, label: "Сборка реликвии" });
  h.failedRelics ??= {};
  if (!check.success) {
    h.failedRelics[p.fragment] = count;
    return;
  }
  delete h.failedRelics[p.fragment];
  take(s, p.fragment, owner, 6);
  const id = "relic-" + source.id;
  if (!e.items.some((i) => i.id === id))
    e.items.push({
      id,
      name: "Реликвия · " + source.fragmentOrigin,
      category: "Прочее",
      quality: "common",
      value_gp:
        e.gathering[Math.min(3, Math.floor((h.level - 1) / 5))].common_gp,
      source: { book: "wow", printed_page: 96 },
    });
  deposit(s, id, owner, 1);
});
register("trainingMode", "master", (s, p) => {
  economy(s).requireTrainer = !!p.on;
});
// Contract and session settlement share the same reward reducer as local errands.
function settleContract(s, q, rows, reveal, delivery = null) {
  requireThat(
    q.type !== "local" && (q.type !== "delivery" || delivery) && q.status !== "done" && !q.rewardReceipt,
    "Задание уже завершено или индивидуальное",
  );
  const applied = [];
  for (const row of rows) {
    const r = structuredClone(row);
    if (r.type === "charter") {
      issueCharter(s, r.faction, r.text);
    } else if (r.type === "rep") {
      const f = byId(s.factions, r.faction),
        old = f.repPoints;
      grant(s, r);
      r.amount = f.repPoints - old;
    } else if (r.type === "gold") {
      requireThat(
        Number.isFinite(r.amount) && r.amount >= 0,
        "Неверное количество золота",
      );
      const purse = delivery?.rewardHero ? profile(s, delivery.rewardHero) : s.company;
      const balance = delivery?.rewardHero ? "wallet" : "gold";
      purse[balance] = Math.round((purse[balance] + r.amount) * 100) / 100;
    } else if (r.type === "item") {
      const id = r.item_id || "reward-" + q.id + "-" + applied.length,
        e = economy(s);
      if (!e.items.some((x) => x.id === id))
        e.items.push({
          id,
          name: r.name,
          quality: r.quality,
          category: r.category,
          icon: r.icon,
          image: r.image,
          desc: r.desc,
          value_gp: 0,
        });
      deposit(s, id, r.owner || "", r.qty || r.quantity, {
        hidden: !!q.hidden,
      });
    } else throw Error("Неизвестный тип награды");
    applied.push(r);
  }
  q.status = "done";
  q.rewards = applied;
  q.rewardReceipt = {
    day: s.company.day,
    year: s.company.year,
    rewards: applied,
    ...(delivery ? { delivery } : {}),
  };
  if (reveal) q.rewardRevealed = true;
  s.journal.unshift({
    id: crypto.randomUUID(),
    kind: "contract",
    title: "Контракт: " + q.title,
    text:
      "Завершён. " +
      applied.map((r) => r.name || r.text || String(r.amount)).join(", "),
    day: s.company.day,
    year: s.company.year,
    hidden: !!q.hidden,
  });
}
register("finishContract", "master", (s, p) =>
  settleContract(s, byId(s.contracts, p.id), p.rows, p.reveal),
);
register("economySettings", "master", (s, p) => {
  const e = economy(s);
  integer(p.tier, 1, 5);
  const tier = e.gathering[p.tier - 1];
  for (const k of ["common_gp", "rare_gp", "dc"]) tier[k] = integer(p[k], 0);
  e.sharedHeroes = p.sharedHeroes.filter((id) => heroOf(s, id));
  e.captainBank = !!p.captainBank;
});
function sharedAccess(s, actor, id) {
  return (
    actor.role === "master" ||
    (actor.role === "captain" && s.engine.captainBank) ||
    (s.engine.sharedHeroes || []).includes(id)
  );
}
register("withdraw", "hero", (s, p, actor) => {
  requireThat(sharedAccess(s, actor, p.hero), "Нет доступа к общим ресурсам");
  if (p.gold) {
    integer(p.gold, 1);
    requireThat(s.company.gold >= p.gold, "Недостаточно средств");
    s.company.gold -= p.gold;
    profile(s, p.hero).wallet += p.gold;
    return;
  }
  const row = byId(s.company.inventory, p.stack);
  requireThat(
    !row.owner && (!row.hidden || actor.role === "master"),
    "Недоступная стопка",
  );
  integer(p.qty, 1, row.qty);
  deposit(s, row.item_id, "member:" + p.hero, p.qty, {
    properties: row.properties,
    hidden: row.hidden,
  });
  row.qty -= p.qty;
  s.company.inventory = s.company.inventory.filter((x) => x.qty);
});
function finishOutput(s, j) {
  const r = j.recipe;
  if (r.experiment) {
    const check = ability(profile(s, j.hero), {
      skill: r.experiment.skill,
      tool: r.experiment.tool,
      dc: r.experiment.dc,
    });
    s.engine.rolls.unshift({ ...check, hero: j.hero, label: r.name });
    if (!check.success) {
      j.status = "failed";
      return;
    }
  }
  deposit(
    s,
    r.item_id,
    "member:" + j.hero,
    j.qty * r.quantity,
    r.properties ? { properties: r.properties } : {},
  );
  j.status = "done";
}
register("customCategory", "master", (s, p) => {
  requireThat(
    typeof p.name === "string" &&
      p.name.trim().length > 0 &&
      p.name.length <= 80,
    "Недопустимая категория",
  );
  const e = economy(s);
  e.categories ??= [];
  requireThat(
    !e.categories.includes(p.name.trim()),
    "Категория уже существует",
  );
  e.categories.push(p.name.trim());
});

function activeEffects(s) {
  const effects = Object.fromEntries((s.engine.campUpgrades || []).map((row) => [row.service, row]));
  return Object.entries({ ...effects, ...s.engine.campEffects })
    .filter(([name]) => s.company.talents[name])
    .map(([, value]) => value);
}

const TRADE_CATEGORY = "Торговые товары";
const TRADE_NAMES = {
  mining: "Ящик руды", herbalism: "Тюк трав", skinning: "Тюк шкур",
  fishing: "Бочка рыбы", hunt: "Охотничьи товары", archaeology: "Коллекция древностей",
  smithing: "Кузнечные товары", alchemy: "Алхимические товары", cooking: "Продовольственные товары",
  engineering: "Инженерные товары", inscription: "Писчие товары", jewelry: "Ювелирные товары",
  leather: "Кожевенные товары", tailor: "Текстильные товары", enchanting: "Чародейские товары",
};
const TRADE_SERVICES = {
  smithing: "Оружейная", alchemy: "Лаборатория", cooking: "Полевая кухня",
  engineering: "Мастерская", jewelry: "Мастерская", leather: "Мастерская",
  tailor: "Мастерская", enchanting: "Зачаровательная", inscription: "Писарь",
};
const productionServices = [...new Set(Object.values(TRADE_SERVICES))];
const propertyKinds = {
  extra_attack: "Дополнительная атака", counterattack: "Контратака",
  damage_dice: "Дополнительные кости урона", control: "Контроль",
  elemental: "Стихийный эффект", protection: "Защита", limited: "Ограниченная способность",
};
const sourceIds = ["phb2024", "dmg2024", "wow", "house", "demo"];
const bookIds = sourceIds.slice(0, 3);
const tempoDefaults = { consumable: 4, equipment: 24, common: 8, uncommon: 24, rare: 56, epic: 112 };
const repTradeDefaults = [[3000, 0.05], [9000, 0.1], [21000, 0.15], [42000, 0.2]];

function tradeMoney(value) {
  requireThat(typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1e9, "Некорректная денежная сумма");
  return Math.round(value * 100) / 100;
}
function tradeNumber(value) {
  requireThat(typeof value === "number" || (typeof value === "string" && value.trim()), "Ожидалось число");
  const number = Number(value);
  requireThat(Number.isFinite(number), "Некорректное число");
  return number;
}
function catalogSource(source, booksOnly = false) {
  const origin = source?.book || source?.origin;
  requireThat((booksOnly ? bookIds : sourceIds).includes(origin), "Укажите идентификатор источника");
  if (bookIds.includes(origin)) integer(source.printed_page, 1, 9999);
}
function validateTradeRow(k, row) {
  if (k === "markets") {
    for (const key of ["stock", "demand"]) integer(row[key]);
    for (const key of ["budget", "buy_factor", "sell_factor"]) tradeMoney(row[key]);
    requireThat(row.buy_factor > 0 && row.sell_factor <= row.buy_factor && row.buy_factor <= 10,
      "Коэффициенты: 0 ≤ скупка ≤ продажа ≤ 10");
    if (row.rep_bonuses != null) {
      requireThat(Array.isArray(row.rep_bonuses), "Ожидались пороги репутации");
      let threshold = -1;
      for (const line of row.rep_bonuses) {
        requireThat(Array.isArray(line) && line.length === 2, "Порог репутации: [очки, скидка]");
        threshold = integer(line[0], threshold + 1, 42999);
        requireThat(Number.isFinite(line[1]) && line[1] >= 0 && line[1] < 1, "Скидка от 0 до 1");
      }
    }
  }
  if (k === "facilities") {
    requireThat(productionServices.includes(row.service), "Неизвестное сооружение");
    for (const field of ["tier2_gp", "tier3_gp", "rent1_gp", "rent2_gp", "rent3_gp"]) tradeMoney(row[field]);
  }
  if (k === "services") {
    requireThat(row.service === "Наставник" || productionServices.includes(row.service), "Неизвестная местная услуга");
    if (row.tier != null) integer(row.tier, 1, 3);
    if (row.fee != null) tradeMoney(row.fee);
  }
  if (k === "campUpgrades") {
    if (row.bonus != null) integer(row.bonus, -20, 20);
    if (row.discount != null) integer(row.discount, 0, 100);
    if (row.speed != null) integer(row.speed, 0, 100);
    if (row.recipes != null) requireThat(Array.isArray(row.recipes) && row.recipes.every(validId), "Нужен список ID рецептов");
  }
  if (k === "craftProperties") {
    requireThat(Object.hasOwn(propertyKinds, row.kind), "Неизвестное ремесленное свойство");
    requireThat(["attack", "bonus", "reaction", "magic", "utilize", "passive", "other"].includes(row.action), "Неизвестный тип действия");
    requireThat(row.trigger?.trim() && row.effect?.trim() && row.limits?.trim(), "Укажите триггер, эффект и ограничения");
    requireThat(!!row.uses === !!row.recovery && (row.kind !== "limited" || row.uses), "Укажите применения и способ восстановления");
    requireThat(["house", "demo"].includes(row.source?.origin), "Ремесленные свойства Атласа маркируются как house/demo");
  }
  if (["items", "tradeGoods", "originalEquipment"].includes(k)) {
    if (row.original) {
      catalogSource(row.source, true);
      requireThat(row.rules && typeof row.rules === "object" && !Array.isArray(row.rules) && Object.keys(row.rules).length,
        "Нужны исходные книжные характеристики");
      requireThat(!row.trade_product && !row.base_item_id && !row.craft_properties?.length &&
        !row.craft_slots && !row.magic_slots && !row.properties?.enchantment, "Книжному предмету нельзя добавить авторскую модификацию");
    }
    if (row.trade_product)
      requireThat(row.category === TRADE_CATEGORY && row.value_gp > 0 && row.stackable !== false && !row.hidden &&
        !row.properties && !row.rules && !row.base_item_id && !row.craft_properties?.length &&
        !row.craft_slots && !row.magic_slots && ["common", "uncommon", "rare"].includes(row.quality),
        "Торговая партия должна быть открытой, пригодной к складыванию, с положительной ценой и без боевых свойств");
    if (row.craft_slots != null) integer(row.craft_slots, 0, 1);
    if (row.magic_slots != null) integer(row.magic_slots, 0, 1);
    if (row.base_item_id || row.craft_slots || row.magic_slots || row.craft_properties?.length)
      requireThat(row.base_item_id && row.stackable === false && ["house", "demo"].includes(row.source?.origin),
        "Авторской экипировке нужна книжная основа, источник house/demo и stackable=false");
    if (row.craft_properties != null)
      requireThat(Array.isArray(row.craft_properties) && row.craft_properties.every(validId) &&
        new Set(row.craft_properties).size === row.craft_properties.length &&
        row.craft_properties.length <= (row.craft_slots || 0), "Свойства должны помещаться в ремесленные ячейки");
  }
  if (["recipes", "tradeRecipes"].includes(k)) {
    if (row.facility_rank != null) {
      integer(row.facility_rank, 1, 3);
      requireThat(productionServices.includes(row.service), "Ступень требует конкретного сооружения");
    }
    if (row.tempo_class)
      requireThat(["consumable", "equipment", "magic", "manual"].includes(row.tempo_class), "Неизвестный класс темпа ремесла");
    if (row.trade_product) integer(row.rank, 2, 4);
  }
}

function tradeStock(s, item, owner) {
  return s.company.inventory.filter((stack) =>
    stack.item_id === item && (stack.owner || "") === owner && !stack.hidden && !stack.properties);
}
function useTradeStock(s, item, owner, amount) {
  const rows = tradeStock(s, item, owner);
  requireThat(rows.reduce((sum, stack) => sum + stack.qty, 0) >= amount, "Недостаточно доступных товаров");
  for (const row of rows) {
    const qty = Math.min(row.qty, amount);
    row.qty -= qty;
    amount -= qty;
    if (!amount) break;
  }
  s.company.inventory = s.company.inventory.filter((row) => row.qty > 0);
}
function marketItem(s, row) {
  const item = byId(s.engine.items || [], row.item_id);
  requireThat(!item.hidden && item.stackable !== false && !item.properties && !item.original &&
    !item.base_item_id && item.value_gp > 0, "Нужен открытый товар с положительной ценой, допускающий стопки");
  return item;
}
function validateTradeCatalog(s) {
  const e = s.engine, pairs = new Set(), services = new Set();
  for (const row of e.markets || []) {
    validateTradeRow("markets", row);
    byId(s.nodes, row.node_id);
    if (row.faction_id) byId(s.factions, row.faction_id);
    marketItem(s, row);
    const key = JSON.stringify([row.node_id, row.item_id]);
    requireThat(!pairs.has(key), "Повтор товара на одном рынке");
    pairs.add(key);
  }
  for (const row of e.facilities || []) {
    validateTradeRow("facilities", row);
    requireThat(!services.has(row.service), "Повтор сооружения: " + row.service);
    services.add(row.service);
  }
  for (const row of e.localServices || []) {
    validateTradeRow("services", row);
    byId(s.nodes, row.node_id);
    if (row.profession_id) byId(e.professions, row.profession_id);
  }
  const upgrades = new Set();
  for (const row of e.campUpgrades || []) {
    validateTradeRow("campUpgrades", row);
    requireThat(!upgrades.has(row.service), "Дублируется улучшение лагеря");
    upgrades.add(row.service);
    for (const id of row.recipes || []) byId(e.recipes || [], id);
  }
  for (const row of e.craftProperties || []) validateTradeRow("craftProperties", row);
  for (const row of e.items || []) {
    validateTradeRow("items", row);
    if (row.base_item_id)
      requireThat(byId(e.items, row.base_item_id).original === true, "Основа должна быть книжным предметом");
    for (const id of row.craft_properties || []) byId(e.craftProperties || [], id);
  }
  for (const r of e.recipes || []) {
    validateTradeRow("recipes", r);
    if (r.properties && e.items?.some((item) => item.id === r.item_id && item.original))
      throw Error("Рецепт книжного предмета не может добавлять авторские свойства");
    if (!r.trade_product) continue;
    const p = byId(e.professions, r.profession_id), item = byId(e.items, r.item_id);
    requireThat(item.trade_product && item.profession_id === p.id && !r.properties && !r.experiment,
      "Торговый рецепт производит торговую партию своей профессии");
    requireThat(item.quality === ["common", "uncommon", "rare"][r.rank - 2], "Качество товара должно совпадать с рангом рецепта");
    if (p.kind === "production")
      requireThat(r.service === TRADE_SERVICES[p.id] && r.facility_rank === r.rank - 1,
        "Нужна ступень мастерской, равная рангу рецепта минус один");
    const materials = (e.ingredients || []).filter((line) => line.recipe_id === r.id);
    requireThat(materials.length, "Нет ингредиентов торгового рецепта: " + r.id);
    let inputValue = 0;
    for (const line of materials) {
      const material = byId(e.items, line.item_id);
      requireThat(["Материалы", "Припасы"].includes(material.category) &&
        !material.original && !material.hidden && material.stackable !== false, "Нужно сырьё или припасы");
      inputValue += (material.value_gp || 0) * line.quantity;
    }
    if (p.kind === "gathering") {
      requireThat(!r.service && item.value_gp * r.quantity <= inputValue + 1e-8, "Упаковка не увеличивает стоимость сырья");
    }
  }
  for (const contract of s.contracts || []) if (contract.type === "delivery") validateDelivery(s, contract);
}

function tradeId(profession, rank) {
  return "trade-" + profession + "-" + rank;
}
function tradeState(s) {
  const e = economy(s);
  for (const key of ["markets", "facilities", "craftProperties"]) e[key] ??= [];
  return e;
}

register("tradeMarkets", "master", (s, p) => {
  requireThat(Array.isArray(p.rows) && p.rows.length > 0 && p.rows.length <= 1000, "Нужно от 1 до 1000 позиций");
  const e = tradeState(s), seen = new Set();
  for (const input of p.rows) {
    const key = JSON.stringify([input.node_id, input.item_id]);
    requireThat(!seen.has(key), "Повтор товара на одном рынке");
    seen.add(key);
    const old = e.markets.find((x) => x.node_id === input.node_id && x.item_id === input.item_id);
    const row = rowFrom("markets", { ...input, id: old?.id || input.id || crypto.randomUUID() });
    const sameId = e.markets.find((x) => x.id === row.id);
    requireThat(!sameId || sameId === old, "ID позиции рынка занят");
    if (old) Object.assign(old, row);
    else e.markets.push(row);
  }
  validateTradeCatalog(s);
});

function tradePrices(s, row) {
  const item = marketItem(s, row), faction = s.factions.find((f) => f.id === row.faction_id);
  requireThat(!row.faction_id || (faction && !faction.hidden && (faction.repPoints ?? 0) >= 0),
    "Торговля с фракцией недоступна");
  const bonus = (row.rep_bonuses ?? repTradeDefaults).filter(([points]) => (faction?.repPoints || 0) >= points).at(-1)?.[1] || 0;
  const buy = tradeMoney(Math.max(0.01, Math.ceil(item.value_gp * row.buy_factor * (1 - bonus) * 100 - 1e-8) / 100));
  const sell = tradeMoney(Math.min(Math.max(0, buy - 0.01), Math.floor(item.value_gp * row.sell_factor * (1 + bonus) * 100 + 1e-8) / 100));
  return { buy, sell, bonus };
}
function localMarket(s, actor) {
  const stay = currentStay(s), place = s.nodes.find((node) => node.id === stay?.location);
  if (!place || s.journey || s.engine.phase !== "stay" || (actor?.role !== "master" && place.visibility === "hidden")) return [];
  return (s.engine.markets || []).filter((row) => row.node_id === stay.location &&
    (actor?.role === "master" || !row.faction_id || s.factions.some((f) => f.id === row.faction_id && !f.hidden)));
}
register("tradeDeal", "hero", (s, p, actor) => {
  const h = profile(s, p.hero), row = localMarket(s, actor).find((x) => x.item_id === p.item);
  requireThat(row, "Торговля возможна только на текущей стоянке");
  requireThat(["buy", "sell"].includes(p.side), "Неизвестный тип сделки");
  const qty = integer(p.qty, 1, 1000), unit = tradePrices(s, row)[p.side];
  if (p.unit != null) requireThat(p.unit === unit, "Цена изменилась. Откройте сделку заново");
  const total = tradeMoney(qty * unit), owner = "member:" + p.hero;
  if (p.side === "buy") {
    requireThat(row.stock >= qty && h.wallet >= total, "Недостаточно товара или золота");
    h.wallet = tradeMoney(h.wallet - total);
    row.stock -= qty;
    row.budget = tradeMoney(row.budget + total);
    deposit(s, p.item, owner, qty);
  } else {
    requireThat(total > 0 && row.demand >= qty && row.budget >= total, "Спрос или бюджет скупщика исчерпан");
    useTradeStock(s, p.item, owner, qty);
    row.demand -= qty;
    row.stock = integer(row.stock + qty);
    row.budget = tradeMoney(row.budget - total);
    h.wallet = tradeMoney(h.wallet + total);
  }
});
register("tradeDonation", "hero", (s, { hero, amount }) => {
  const h = profile(s, hero);
  amount = tradeMoney(amount);
  requireThat(amount > 0 && h.wallet >= amount, "Недостаточно личного золота");
  h.wallet = tradeMoney(h.wallet - amount);
  s.company.gold = tradeMoney(s.company.gold + amount);
});

register("tradeProducts", "master", (s, p) => {
  const e = tradeState(s), pack = { tradeGoods: [], tradeRecipes: [], ingredients: [] }, seen = new Set();
  requireThat(Array.isArray(p.rows) && p.rows.length > 0 && p.rows.length <= 200, "Нужен список от 1 до 200 рецептов");
  for (const input of p.rows) {
    const prof = byId(e.professions, input.profession_id), rank = integer(tradeNumber(input.rank), 2, 4);
    requireThat(Object.hasOwn(TRADE_NAMES, prof.id), "Нет товарной категории для профессии");
    const id = tradeId(prof.id, rank), recipeId = "make-" + id, name = TRADE_NAMES[prof.id];
    requireThat(!seen.has(id), "Повтор категории и качества");
    seen.add(id);
    const goods = { id, name, category: TRADE_CATEGORY, profession_id: prof.id,
      quality: ["common", "uncommon", "rare"][rank - 2], value_gp: tradeMoney(tradeNumber(input.value_gp)),
      stackable: true, source: { origin: "house" }, desc: e.items.find((x) => x.id === id)?.desc || "Торговая партия." };
    const service = TRADE_SERVICES[prof.id];
    pack.tradeGoods.push(goods);
    pack.tradeRecipes.push({ id: recipeId, name: name + " · " + ["Обычные", "Высокого качества", "Превосходные"][rank - 2],
      profession_id: prof.id, item_id: id, rank, hours: integer(tradeNumber(input.hours), 1, 10000),
      quantity: 1, gold: tradeMoney(tradeNumber(input.gold || 0)), basic: true,
      ...(service ? { service, facility_rank: rank - 1 } : {}), source: { origin: "house" } });
    const parts = typeof input.ingredients === "string" ? JSON.parse(input.ingredients) : input.ingredients;
    requireThat(Array.isArray(parts) && parts.length > 0 && parts.length <= 30, "Укажите материалы");
    e.ingredients = e.ingredients.filter((line) => line.recipe_id !== recipeId);
    for (const line of parts) pack.ingredients.push({
      id: recipeId + ":" + line.item_id, recipe_id: recipeId, item_id: line.item_id,
      quantity: integer(tradeNumber(line.quantity), 1, 100000),
    });
  }
  const plan = planImport(s, pack, "update");
  requireThat(!plan.count.errors, plan.issues.join("\n"));
  Object.assign(s, plan.next);
});

register("tradeRecipeEdit", "master", (s, p) => {
  const e = tradeState(s), recipe = rowFrom("tradeRecipes", p.recipe);
  const old = e.recipes.find((r) => r.id === recipe.id);
  requireThat(!old || old.trade_product, "ID занят обычным рецептом");
  requireThat(Array.isArray(p.ingredients) && p.ingredients.length > 0 && p.ingredients.length <= 30,
    "Нужно от 1 до 30 ингредиентов");
  const prior = new Map(e.ingredients.filter((row) => row.recipe_id === recipe.id).map((row) => [row.item_id, row]));
  const seen = new Set(), ingredients = p.ingredients.map((line) => {
    requireThat(!seen.has(line.item_id), "Повтор ингредиента");
    seen.add(line.item_id);
    const existing = prior.get(line.item_id);
    return { ...existing, item_id: line.item_id, quantity: line.quantity,
      id: existing?.id || crypto.randomUUID(), recipe_id: recipe.id };
  });
  e.ingredients = e.ingredients.filter((row) => row.recipe_id !== recipe.id);
  const plan = planImport(s, { tradeRecipes: [recipe], ingredients }, "update");
  requireThat(!plan.count.errors, plan.issues.join("\n"));
  Object.assign(s, plan.next);
});
function campTier(s, service) {
  return s.company.talents?.[service] ? (s.engine.facilityTiers?.[service] || 1) : 0;
}
function facilityLevel(s, service) {
  const stay = currentStay(s);
  return Math.max(campTier(s, service), stay?.services?.includes(service) ? (stay.serviceTiers?.[service] || 1) : 0,
    stay?.rentals?.[service]?.node_id === stay?.location ? stay?.rentals?.[service]?.tier || 0 : 0);
}
function facilityPrices(s, service) {
  return (s.engine.facilities || []).find((row) => row.service === service) ||
    { tier2_gp: 300, tier3_gp: 750 };
}
register("facilityTier", "master", (s, p) => {
  const tier = integer(p.tier, 2, 3), cost = tradeMoney(p.cost ?? facilityPrices(s, p.service)["tier" + tier + "_gp"]);
  requireThat(productionServices.includes(p.service) && campTier(s, p.service) === tier - 1,
    "Сначала откройте предыдущую ступень");
  requireThat(s.company.gold >= cost, "Недостаточно золота в казне");
  s.company.gold = tradeMoney(s.company.gold - cost);
  (s.engine.facilityTiers ??= {})[p.service] = tier;
});
function localServices(s, service) {
  const stay = currentStay(s);
  return (s.engine.localServices || []).filter((row) => row.node_id === stay?.location && row.service === service && !row.hidden);
}
function trainingOffer(s, profession, rank, withCompanion = false) {
  const stay = currentStay(s), mentors = localServices(s, "Наставник");
  const found = mentors.find((row) => row.profession_id === profession) || mentors.find((row) => !row.profession_id);
  if (!stay || (!withCompanion && !found && !stay.services?.includes("Наставник"))) return null;
  return { fee: found?.fee ?? 2 * rank, hours: found?.hours ?? rank * stay.hours };
}
function rentalPrice(s, service, tier) {
  return localServices(s, service).find((row) => row.tier === tier)?.fee ?? facilityPrices(s, service)["rent" + tier + "_gp"];
}
register("facilityRental", "master", (s, p) => {
  const stay = currentStay(s), tier = integer(p.tier, 1, 3);
  requireThat(stay && s.engine.phase === "stay" && productionServices.includes(p.service) &&
    s.nodes.some((node) => node.id === stay.location && node.type === "city"), "Аренда доступна на стоянке в городе");
  requireThat(facilityLevel(s, p.service) < tier, "Услуга уже доступна");
  const cost = tradeMoney(p.cost ?? rentalPrice(s, p.service, tier));
  requireThat(s.company.gold >= cost, "Недостаточно золота в казне");
  s.company.gold = tradeMoney(s.company.gold - cost);
  (stay.rentals ??= {})[p.service] = { node_id: stay.location, tier, cost };
});

function craftTempoHours(s, r) {
  if (r.trade_product) return r.hours;
  const item = byId(s.engine.items, r.item_id);
  if (r.tempo_hours) return Math.min(r.hours, r.tempo_hours);
  if (item.quality === "legendary") return r.hours;
  const kind = r.tempo_class || (item.category === "Припасы" ? "consumable" :
    item.category === "Магические предметы" || item.quality !== "common" ? "magic" :
      ["Оружие", "Броня"].includes(item.category) ? "equipment" : "manual");
  return Math.min(r.hours, tempoDefaults[kind === "magic" ? item.quality : kind] ?? r.hours);
}
register("craftTempo", "master", (s, p) => {
  requireThat(Array.isArray(p.ids) && p.ids.length && new Set(p.ids).size === p.ids.length, "Выберите рецепты без повторов");
  for (const id of p.ids) {
    const r = byId(s.engine.recipes, id), target = craftTempoHours(s, r);
    requireThat(!r.trade_product, "Торговые товары имеют собственные сроки");
    if (r.hours === target) continue;
    r.reference_hours ??= r.hours;
    r.hours = target;
    r.time_policy = "atlas-weekly";
  }
});

function validateDelivery(s, contract) {
  requireThat(typeof contract.title === "string" && contract.title.trim() &&
    typeof contract.consignee === "string" && contract.consignee.trim(), "Нужны название и получатель поставки");
  byId(s.nodes, contract.location);
  if (contract.giver) byId(s.portal.people, contract.giver);
  integer(contract.due_year, 1);
  integer(contract.due_day, 1);
  requireThat(["personal", "shared"].includes(contract.stock_source) && ["hero", "company"].includes(contract.reward_recipient),
    "Не выбраны источник товаров или получатель награды");
  requireThat(Array.isArray(contract.goods) && contract.goods.length > 0 && contract.goods.length <= 30, "Нужно от 1 до 30 позиций поставки");
  const goods = new Set();
  for (const row of contract.goods) {
    requireThat(byId(s.engine.items, row.item_id).trade_product, "Поставка принимает торговые товары");
    requireThat(!goods.has(row.item_id), "Повтор товара в поставке");
    goods.add(row.item_id);
    integer(row.quantity, 1);
  }
  requireThat(Array.isArray(contract.rewards) && contract.rewards.length > 0 && contract.rewards.length <= 30, "Укажите награду поставки");
  for (const row of contract.rewards) {
    if (row.type === "gold") tradeMoney(row.amount);
    else if (row.type === "item") {
      byId(s.engine.items, row.item_id);
      integer(row.qty || row.quantity, 1);
    } else if (row.type === "rep") {
      byId(s.factions, row.faction);
      integer(row.amount, -100000, 100000);
    } else throw Error("Награда поставки: золото, предмет или репутация");
  }
}
function deliveryQuote(s, actor, hero, q) {
  const owner = q.stock_source === "shared" ? "" : "member:" + hero;
  const place = s.nodes.find((node) => node.id === q.location);
  const goods = q.goods.map((row) => ({ ...row,
    have: tradeStock(s, row.item_id, owner).reduce((sum, stack) => sum + stack.qty, 0) }));
  const reasons = [];
  if (q.archived || q.rewardReceipt || !["active", "available"].includes(q.status)) reasons.push("Поставка недоступна");
  if (!owned(actor, hero) || (actor.role !== "master" && (q.hidden || place?.visibility === "hidden")))
    reasons.push("Нет доступа к поставке");
  if (s.journey || s.company.location !== q.location) reasons.push("Компания ещё не в месте доставки");
  if (s.company.year > q.due_year || (s.company.year === q.due_year && s.company.day > q.due_day)) reasons.push("Срок доставки истёк");
  if (q.stock_source === "shared" && !sharedAccess(s, actor, hero)) reasons.push("Нет доступа к общему банку");
  if (goods.some((row) => row.have < row.quantity)) reasons.push("Недостаточно доступных товаров");
  return { goods, owner, reasons };
}
register("deliveryContract", "master", (s, p) => {
  const current = p.id && byId(s.contracts, p.id);
  requireThat(!current || (current.type === "delivery" && !current.rewardReceipt && current.status !== "done"),
    "Завершённая поставка не редактируется");
  const allowedFields = ["title", "desc", "consignee", "location", "giver", "due_year", "due_day",
    "stock_source", "reward_recipient", "goods", "rewards", "hidden"];
  const q = Object.fromEntries(allowedFields.map((key) => [key, p[key]]));
  validateDelivery(s, q);
  if (current) Object.assign(current, q);
  else s.contracts.push({ ...q, id: crypto.randomUUID(), type: "delivery", status: "available" });
});
register("deliverGoods", "hero", (s, p, actor) => {
  const q = byId(s.contracts, p.id);
  requireThat(q.type === "delivery", "Нужен контракт поставки");
  heroOf(s, p.hero);
  validateDelivery(s, q);
  const quote = deliveryQuote(s, actor, p.hero, q);
  requireThat(!quote.reasons.length, quote.reasons.join(" · "));
  for (const row of quote.goods) useTradeStock(s, row.item_id, quote.owner, row.quantity);
  const rewardHero = q.reward_recipient === "hero" ? p.hero : "";
  const rows = q.rewards.map((row) => row.type === "item"
    ? { ...row, owner: rewardHero ? "member:" + rewardHero : "" } : row);
  settleContract(s, q, rows, true, { hero: p.hero, rewardHero, owner: quote.owner, goods: q.goods });
});

const contentFormat = "atlas-content";
function versionParts(version) {
  requireThat(typeof version === "string" && /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(version), "Версия пакета указывается как X.Y.Z");
  return version.split(".").map(Number);
}
function compareContentVersions(a, b) {
  const right = versionParts(b);
  return versionParts(a).map((x, i) => x - right[i]).find(Boolean) || 0;
}
function contentMetadata(pack) {
  requireThat(pack.format === contentFormat && pack.schemaVersion === 1 && validId(pack.id), "Нужен пакет atlas-content со схемой 1 и постоянным ID");
  versionParts(pack.version);
  for (const key of ["name", "author", "description"])
    requireThat(typeof pack[key] === "string" && pack[key].trim() && pack[key].length <= 3000, "Заполните " + key);
  requireThat(Array.isArray(pack.sources) && pack.sources.length && Array.isArray(pack.dependencies), "Нужны источники и список зависимостей");
  for (const source of pack.sources) catalogSource(source);
  const dependencies = new Set();
  for (const dep of pack.dependencies) {
    requireThat(validId(dep?.id) && dep.id !== pack.id && !dependencies.has(dep.id), "Неверная или повторная зависимость");
    dependencies.add(dep.id);
    versionParts(dep.minVersion);
  }
  return Object.fromEntries(["format", "schemaVersion", "id", "name", "description", "version", "author", "sources", "dependencies"].map((key) => [key, pack[key]]));
}
function catalogIdentity(table, id) {
  return tables[table][1] + " / " + id;
}
function preserveRuntimeFields(table, old, incoming, resetMarket = false) {
  const path = tables[table][1];
  const runtime = {
    nodes: ["visibility"],
    routes: ["status"],
    factions: ["repPoints", "charter"],
    "portal.people": ["attitude", "promises", "history", "relations", "dossier", "firstMeeting", "participation", "archived"],
    "portal.achievements": ["earned", "earnedDate", "grants", "archived"],
    contracts: ["type", "status", "rewardReceipt", "rewardRevealed", "archived"],
  };
  const blocked = [...(runtime[path] || [])];
  if (path === "engine.items" && old.original) blocked.push("original");
  if (path === "portal.mail") blocked.push("read");
  if (table === "markets" && !resetMarket) blocked.push("stock", "demand", "budget");
  if (path === "contracts" && old.rewardReceipt) blocked.push("rewards", "goods", "stock_source", "reward_recipient");
  if (path === "portal.news") blocked.push("archived");
  for (const key of blocked) delete incoming[key];
}
function contentDefinition(table, row) {
  const path = tables[table][1];
  const stateFields = {
    contracts: ["status", "rewardReceipt", "rewardRevealed", "archived"],
    "portal.people": ["history", "archived"],
    "portal.achievements": ["earned", "earnedDate", "grants", "archived"],
    "portal.news": ["archived"], "portal.mail": ["read"],
  };
  const copy = { ...row };
  for (const key of stateFields[path] || []) delete copy[key];
  if (copy.extra && typeof copy.extra === "object") {
    copy.extra = { ...copy.extra };
    for (const key of stateFields[path] || []) delete copy.extra[key];
  }
  return copy;
}
function checkPackageGraph(packages) {
  const active = new Map(packages.filter((row) => !row.archived).map((row) => [row.id, row]));
  const checked = new Set(), visiting = new Set();
  function check(record) {
    if (checked.has(record.id)) return;
    requireThat(!visiting.has(record.id), "Цикл зависимостей пакетов");
    visiting.add(record.id);
    for (const dep of record.dependencies) {
      const target = active.get(dep.id);
      requireThat(target && compareContentVersions(target.version, dep.minVersion) >= 0, "Не хватает зависимости " + dep.id + " ≥ " + dep.minVersion);
      check(target);
    }
    visiting.delete(record.id);
    checked.add(record.id);
  }
  for (const record of active.values()) check(record);
}
function contentPlan(s, pack, options = {}) {
  inspectJSON(pack);
  const metadata = contentMetadata(pack);
  const registry = s.engine.contentPackages || [], previous = registry.find((x) => x.id === pack.id);
  requireThat(!previous || compareContentVersions(pack.version, previous.version) > 0, "Пакет этой или более новой версии уже установлен");
  requireThat(pack.tables && typeof pack.tables === "object" && !Array.isArray(pack.tables) &&
    Object.keys(pack.tables).length, "Нужны справочники пакета");
  const issues = [], changes = [], included = new Map();
  const owner = new Map(registry.flatMap((entry) => entry.records.map((record) =>
    [catalogIdentity(record.table, record.id), entry.id])));
  const data = structuredClone(pack.tables), lookup = structuredClone(s);
  for (const [table, rows] of Object.entries(data)) {
    requireThat(Object.hasOwn(tables, table) && Array.isArray(rows), "Неизвестный справочник " + table);
    const exists = new Set(records(lookup, table).map((row) => row.id));
    data[table] = rows.map((row) => row && typeof row === "object" ? contentDefinition(table, row) : row);
    for (const row of data[table]) {
      if (!validId(row?.id)) {
        issues.push(table + " · нужен постоянный ID");
        continue;
      }
      const key = catalogIdentity(table, row.id), currentOwner = owner.get(key);
      const conflict = included.has(key) || (currentOwner && currentOwner !== pack.id) ||
        (exists.has(row.id) && currentOwner !== pack.id);
      if (conflict) issues.push(key + " · запись уже принадлежит " + (currentOwner || "другому справочнику"));
      changes.push({ table, id: row.id, change: conflict ? "conflict" : exists.has(row.id) ? "update" : "new" });
      included.set(key, { table, id: row.id });
    }
  }
  requireThat(included.size, "Пакет пуст");
  const combined = new Map((previous?.records || []).map((row) => [catalogIdentity(row.table, row.id), row]));
  for (const [key, row] of included) combined.set(key, row);
  const entry = { ...metadata, records: [...combined.values()] };
  const packages = [...registry.filter((x) => x.id !== pack.id), entry];
  checkPackageGraph(packages);
  const declared = new Set(pack.dependencies.map((dep) => dep.id));
  for (const [table, rows] of Object.entries(data)) {
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const fields = columns(table).filter((field) => field.type.startsWith("@"));
      const refs = fields.map((field) => [field.type.slice(1), row[field.name]]);
      for (const id of row.locations || []) refs.push(["nodes", id]);
      for (const id of row.craft_properties || []) refs.push(["craftProperties", id]);
      for (const line of Array.isArray(row.goods) ? row.goods : []) refs.push(["items", line.item_id]);
      for (const [target, id] of refs) {
        const other = id && owner.get(catalogIdentity(target, id));
        if (other && other !== pack.id && !declared.has(other))
          issues.push(table + " " + row.id + " · нужна явная зависимость " + other);
      }
    }
  }
  const plan = planImport(s, data, "update", options);
  plan.issues.push(...issues);
  plan.count.errors += issues.length;
  plan.changes = changes;
  plan.next.engine.contentPackages = packages;
  return plan;
}
function exportContentPack(s, id) {
  const { records: members, ...pack } = byId(s.engine.contentPackages || [], id);
  delete pack.archived;
  pack.tables = {};
  for (const ref of members) {
    const row = records(s, ref.table).find((x) => x.id === ref.id);
    if (row) (pack.tables[ref.table] ??= []).push(contentDefinition(ref.table, row));
  }
  return pack;
}
register("contentImport", "master", (s, p) => {
  const plan = contentPlan(s, p.pack, { resetMarket: p.resetMarket === true });
  requireThat(!plan.count.errors, plan.issues.join("\n"));
  Object.assign(s, plan.next);
});
register("contentArchive", "master", (s, p) => {
  const pack = byId(s.engine.contentPackages || [], p.id);
  requireThat(!pack.archived, "Пакет уже архивирован");
  pack.archived = true;
  checkPackageGraph(s.engine.contentPackages);
});

const companionStates = {
  traveling: "Путешествует с компанией",
  away: "Временно отсутствует",
  settled: "Оставлен в поселении",
  left: "Покинул компанию",
  dead: "Погиб",
};
const companionKinds = {
  gather: "Занятие стоянки", errand: "Местное поручение", quest: "Личное задание",
  trade: "Торговая услуга", recipe: "Изучение рецепта", craft: "Ремесленная услуга",
  mentor: "Наставничество", scout: "Разведка", info: "Сбор сведений", text: "Разговор",
};

function companionTarget(s, action) {
  const e = s.engine;
  const rows = {
    gather: e.professions, scout: e.professions, mentor: e.professions,
    errand: s.contracts, quest: s.contracts, trade: e.items,
    recipe: e.recipes, craft: e.recipes,
  }[action.kind];
  return rows?.find((row) => row.id === action.target &&
    (action.kind !== "errand" || row.type === "local") &&
    (!["gather", "scout"].includes(action.kind) || row.kind === "gathering"));
}

function companionMechanic(s, action) {
  const target = companionTarget(s, action);
  if (!target) return null;
  if (["gather", "scout"].includes(action.kind)) return ["gather", "profession"];
  if (["errand", "quest"].includes(action.kind)) {
    if (target.type === "local") return ["quest", "quest"];
    if (target.type === "delivery") return ["deliverGoods", "id"];
  }
  if (action.kind === "trade") return ["tradeDeal", "item"];
  if (action.kind === "craft") return ["craft", "recipe"];
  if (action.kind === "mentor") return ["train", "profession"];
  return null;
}

function validateParticipation(value) {
  requireThat(value && typeof value === "object" && !Array.isArray(value), "Проверьте состав компании");
  const companion = value.companion, specialist = value.specialist;
  if (companion) {
    requireThat(Object.hasOwn(companionStates, companion.state), "Неизвестное состояние спутника");
    if (companion.joined) {
      integer(companion.joined.day, 1);
      integer(companion.joined.year, 1);
    }
  }
  if (specialist?.legacyStaff) requireThat(validId(specialist.legacyStaff), "Неверная запись специалиста");
  const ids = new Set();
  const actions = value.actions ?? [];
  requireThat(Array.isArray(actions) && actions.length <= 100, "Некорректный список взаимодействий");
  for (const a of actions) {
    requireThat(validId(a.id) && !ids.has(a.id) && typeof a.name === "string" && a.name.trim() &&
      Object.hasOwn(companionKinds, a.kind), "Некорректное взаимодействие");
    ids.add(a.id);
    requireThat(a.states?.length && Array.isArray(a.states) &&
      a.states.every((state) => Object.hasOwn(companionStates, state) && state !== "dead"),
    "Выберите допустимые состояния спутника");
    requireThat(!a.phase || Object.hasOwn(phases, a.phase), "Неизвестная фаза");
    tradeMoney(a.gold);
    if (a.hours) validateHours(a.hours);
    else requireThat(a.hours === 0, "Некорректное время");
    requireThat(!a.conditions || (typeof a.conditions === "object" && !Array.isArray(a.conditions)), "Некорректные условия");
  }
}

function companySpecialists(s) {
  const linked = (s.portal?.people || []).filter((npc) => npc.participation?.specialist);
  const staff = s.company.staff || [];
  const replaced = new Set(linked.map((npc) => npc.participation.specialist.legacyStaff).filter(Boolean));
  return [...staff.filter((row) => !replaced.has(row.id)), ...linked.filter((npc) => !npc.archived).map((npc) => ({
    id: npc.participation.specialist.legacyStaff || npc.id,
    npcId: npc.id, name: npc.title, role: npc.participation.specialist.role,
    hidden: npc.hidden, image: npc.image,
  }))];
}

function specialistAvailable(s, staff) {
  if (!staff.npcId) return true;
  const npc = s.portal.people.find((row) => row.id === staff.npcId);
  const companion = npc.participation.companion;
  if (!companion || companion.state === "traveling") return true;
  const place = companion.location || npc.location;
  return companion.state === "settled" && !!place && !s.journey && place === currentStay(s)?.location;
}

function companionActionState(s, actor, hero, ref) {
  const npc = s.portal?.people?.find((row) => row.id === ref.npc);
  const participation = npc?.participation;
  const companion = participation?.companion;
  const state = companion?.state || (participation?.specialist ? "traveling" : "");
  const action = participation?.actions?.find((row) => row.id === ref.action);
  const place = currentStay(s)?.location || s.company.location;
  const phase = s.journey ? "travel" : s.engine.phase;
  const denied = (reason) => ({ reason, npc, action });
  if (!npc || !action || !state || npc.archived || (npc.hidden && actor.role !== "master"))
    return denied("Взаимодействие недоступно");
  if (!action.states.includes(state)) return denied(companionStates[state] || "Спутник недоступен");
  if (state === "settled" && (s.journey || !place || (companion.location || npc.location) !== place))
    return denied("Спутник в другом поселении");
  if (action.location && (s.journey || action.location !== place))
    return denied("Компания ещё не в нужном месте");
  if (action.phase && action.phase !== phase) return denied("Сейчас другая фаза кампании");
  if (!hero || !s.company.members.some((row) => row.id === hero) || !owned(actor, hero))
    return denied("Выберите своего героя");
  adventure(s);
  if (action.conditions && !meetsConditions(s, hero, action.conditions))
    return denied("Условия взаимодействия не выполнены");
  if (action.hours && (phase !== "stay" || remaining(s, hero) < action.hours))
    return denied("Недостаточно времени стоянки");
  if (profile(s, hero).wallet < action.gold) return denied("Недостаточно золота");
  const target = companionTarget(s, action);
  if (action.target && (!target || target.archived || (target.hidden && actor.role !== "master")))
    return denied("Связанная запись недоступна");
  return { npc, action, target, mechanic: companionMechanic(s, action) };
}

function chargeCompanionAction(s, hero, action) {
  if (action.hours) spend(s, hero, action.hours, action.name);
  if (action.gold) profile(s, hero).wallet = tradeMoney(profile(s, hero).wallet - action.gold);
}

function applyCompanionContext(s, actor, name, payload) {
  const { reason, action, mechanic } = companionActionState(s, actor, payload.hero, payload.companion);
  requireThat(!reason, reason);
  requireThat(mechanic?.[0] === name && payload[mechanic[1]] === action.target,
    "Действие спутника не соответствует операции");
  chargeCompanionAction(s, payload.hero, action);
}

register("npcParticipation", "master", (s, p) => {
  const npc = byId(s.portal.people, p.id);
  inspectJSON(p.value);
  validateParticipation(p.value);
  const config = p.value;
  for (const id of [config.companion?.location, ...(config.actions || []).map((a) => a.location)].filter(Boolean))
    byId(s.nodes, id);
  for (const a of config.actions || []) if (a.target)
    requireThat(companionTarget(s, a), "Связанная запись не найдена");
  if (config.specialist?.legacyStaff) {
    byId(s.company.staff, config.specialist.legacyStaff);
    requireThat(!s.portal.people.some((row) => row.id !== npc.id && row.participation?.specialist?.legacyStaff === config.specialist.legacyStaff),
      "Запись специалиста уже связана с другим персонажем");
  } else if (config.specialist) {
    requireThat(!(s.company.staff || []).some((row) => row.id === npc.id),
      "Свяжите NPC с существующей записью специалиста");
  }
  npc.participation = config;
});

register("companionRequest", "hero", (s, p, actor) => {
  const { npc, action, reason, mechanic } = companionActionState(s, actor, p.hero, p.ref);
  requireThat(!reason && !mechanic, reason || "Используйте связанное игровое действие");
  requireThat(typeof p.message === "string" && p.message.trim() && p.message.length <= 4000, "Опишите обращение к спутнику");
  const rows = (s.engine.companionRequests ??= []);
  requireThat(!rows.some((r) => r.status === "pending" && r.hero === p.hero && r.npc === npc.id && r.action === action.id),
    "Это обращение уже ожидает решения мастера");
  rows.unshift({
    id: crypto.randomUUID(), npc: npc.id, action: action.id, hero: p.hero, status: "pending",
    title: action.name, message: p.message.trim(), day: s.company.day, year: s.company.year,
    gold: action.gold, hours: action.hours,
  });
});

register("resolveCompanionRequest", "master", (s, p, actor) => {
  const r = byId(s.engine.companionRequests || [], p.id);
  requireThat(r.status === "pending", "Мастер уже рассмотрел обращение");
  requireThat(typeof p.result === "string" && p.result.trim() && p.result.length <= 4000, "Запишите решение мастера");
  if (p.approve === true) {
    const { reason, action, mechanic } = companionActionState(s, actor, r.hero, { npc: r.npc, action: r.action });
    requireThat(!reason && !mechanic, reason || "Взаимодействие изменилось");
    requireThat(action.gold === r.gold && action.hours === r.hours, "Условия обращения изменились");
    chargeCompanionAction(s, r.hero, action);
  }
  Object.assign(r, { status: p.approve === true ? "approved" : "declined", result: p.result.trim() });
});

// Validate incoming saves before the legacy normalizer has a chance to repair them.
function validateBackup(raw) {
  inspectJSON(raw);
  requireThat(
    raw && raw.version === 1 && raw.company,
    "Неизвестный формат резервной копии",
  );
  for (const k of ["accounts", "password", "hash", "salt", "secrets"])
    requireThat(
      !Object.hasOwn(raw, k),
      "Файл содержит поля локальной авторизации",
    );
  function unique(list, label) {
    if (list == null) return;
    requireThat(Array.isArray(list), "Ожидался список: " + label);
    const seen = new Set();
    for (const x of list) {
      requireThat(
        validId(x?.id) && !seen.has(x.id),
        "Некорректный или повторный ID: " + label,
      );
      seen.add(x.id);
    }
  }
  for (const k of ["nodes", "routes", "factions", "contracts"])
    unique(raw[k], k);
  for (const k of ["members", "staff", "inventory"]) unique(raw.company[k], k);
  for (const k of mapTables) unique(raw.engine?.[k], k);
  validateCartography(raw);
  requireThat(
    Number.isFinite(Number(raw.company.gold ?? 0)) &&
      Number(raw.company.gold ?? 0) >= 0,
    "Отрицательная казна",
  );
  for (const x of raw.company.inventory || [])
    if (x.qty != null) integer(Number(x.qty));
  for (const c of raw.contracts || [])
    if (c.status)
      requireThat(
        [
          "available",
          "active",
          "done",
          "failed",
          "locked",
          "cancelled",
          "paused",
          "draft",
        ].includes(c.status) || /^[a-z_-]+$/.test(c.status),
        "Недопустимый статус задания",
      );
  for (const npc of raw.portal?.people || [])
    if (npc.participation) validateParticipation(npc.participation);
  for (const row of raw.portal?.achievements || [])
    if (row.unique)
      requireThat(!row.earned && !invalidUniqueGrants(row), "Уникальное достижение может принадлежать только одному герою");
  if (!raw.engine) return;
  const e = raw.engine;
  requireThat(
    e.schemaVersion === 1 && Array.isArray(e.receipts),
    "Неизвестная схема кампании",
  );
  for (const k of [
    "items",
    "regions",
    "professions",
    "recipes",
    "ingredients",
    "loot",
    "projects",
    "stays",
    "solutions",
    "rewards",
    "sessions",
    "markets",
    "facilities",
    "craftProperties",
    "campUpgrades",
    "localServices",
    "contentPackages",
    "companionRequests",
  ])
    unique(e[k], k);
  for (const h of Object.values(e.profiles || {})) {
    integer(h.level, 1, 20);
    requireThat(
      typeof h.wallet === "number" &&
        Number.isFinite(h.wallet) &&
        h.wallet >= 0,
      "Неверный баланс кошелька",
    );
    for (const k of Object.keys(stats)) integer(h.stats[k], 1, 30);
    for (const k of ["tools", "recipes", "professions"])
      requireThat(
        Array.isArray(h[k]) && h[k].every((v) => typeof v === "string"),
        "Недопустимый профиль",
      );
  }
  for (const p of e.projects || [])
    requireThat(
      Number.isFinite(p.left) &&
        p.left >= 0 &&
        p.left <= p.work &&
        ["active", "done", "cancelled", "failed"].includes(p.status),
      "Неверный остаток проекта",
    );
  requireThat(
    (e.stays || []).filter((t) => !t.closed).length <= 1,
    "Две активные стоянки",
  );
  for (const t of e.stays || []) {
    integer(t.hours, 1, 24);
    integer(t.days, 1, 3650);
    for (const v of Object.values(t.spent))
      requireThat(
        Number.isFinite(v) && v >= 0 && v <= t.hours * t.days,
        "Превышен бюджет стоянки",
      );
  }
  validateTradeCatalog(raw);
  for (const [service, tier] of Object.entries(e.facilityTiers || {})) {
    requireThat(productionServices.includes(service), "Неизвестное сооружение");
    integer(tier, 2, 3);
  }
  for (const stay of e.stays || []) {
    for (const [service, rental] of Object.entries(stay.rentals || {})) {
      requireThat(productionServices.includes(service) && rental.node_id === stay.location &&
        raw.nodes.some((node) => node.id === rental.node_id && node.type === "city"), "Неверная аренда");
      integer(rental.tier, 1, 3);
      tradeMoney(rental.cost);
    }
  }
  const packageKeys = new Set();
  for (const pack of e.contentPackages || []) {
    contentMetadata(pack);
    requireThat(Array.isArray(pack.records), "Неверный реестр контента");
    for (const row of pack.records) {
      requireThat(Object.hasOwn(tables, row.table) && validId(row.id), "Неверная запись реестра контента");
      const key = catalogIdentity(row.table, row.id);
      requireThat(!packageKeys.has(key), "Запись указана в нескольких пакетах");
      packageKeys.add(key);
    }
  }
  checkPackageGraph(e.contentPackages || []);
  const receipts = new Set();
  for (const r of e.receipts) {
    requireThat(
      typeof r.key === "string" && !receipts.has(r.key),
      "Дубликат операции в журнале",
    );
    receipts.add(r.key);
  }
}
const atlasStorageReference = "atlas-storage:v1:";
const atlasMediaTypes = "png|jpeg|webp|gif|bmp|avif";
const atlasMediaName = new RegExp("^[a-f0-9]{64}\\.(" + atlasMediaTypes + ")$");
const atlasImagePattern = new RegExp("^data:image/(" + atlasMediaTypes + ");base64,([A-Za-z0-9+/=]+)$", "i");

function mapBackupValues(value, visit) {
  if (Array.isArray(value)) return value.map((entry) => mapBackupValues(entry, visit));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, mapBackupValues(entry, visit)]));
  return typeof value === "string" ? visit(value) : value;
}

async function splitOnlineBackup(raw, { allowReferences = false } = {}) {
  validateBackup(raw);
  const dataUrls = new Set();
  mapBackupValues(raw, (value) => {
    requireThat(allowReferences || !value.startsWith(atlasStorageReference), "Загрузите исходный экспорт Атласа с изображениями");
    if (/^data:image\//i.test(value)) dataUrls.add(value);
    return value;
  });
  const images = new Map(), references = new Map();
  for (const url of dataUrls) {
    const [, extension, base64] = atlasImagePattern.exec(url) || [];
    requireThat(extension, "В сохранении есть изображение неподдерживаемого формата");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    requireThat(bytes.length > 0 && bytes.length <= 20 * 1024 * 1024, "Размер изображения должен быть от 1 байта до 20 МиБ");
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (byte) => byte.toString(16).padStart(2,"0")).join("");
    const name = hash + "." + extension.toLowerCase();
    references.set(url, atlasStorageReference + name);
    images.set(name, new Blob([bytes], { type: "image/" + extension.toLowerCase() }));
  }
  const document = mapBackupValues(raw, (value) => references.get(value) || value);
  requireThat(new TextEncoder().encode(JSON.stringify(document)).length <= 8 * 1024 * 1024,
    "JSON без изображений превышает 8 МиБ");
  return { document, images };
}

async function joinOnlineBackup(document, download) {
  const names = new Set(), images = new Map();
  mapBackupValues(document, (value) => {
    if (!value.startsWith(atlasStorageReference)) return value;
    const name = value.slice(atlasStorageReference.length);
    requireThat(atlasMediaName.test(name), "Некорректная ссылка на изображение");
    names.add(name);
    return value;
  });
  for (const name of names) images.set(name, await download(name));
  return mapBackupValues(document, (value) =>
    value.startsWith(atlasStorageReference) ? images.get(value.slice(atlasStorageReference.length)) : value);
}

function projectFields(row, fields) {
  return Object.fromEntries(fields.split(" ").filter((key) => Object.hasOwn(row || {}, key))
    .map((key) => [key, row[key]]));
}
function publicRows(rows) {
  return (rows || []).filter((row) => !row.hidden && !row.archived);
}
function containsId(rows, id) {
  return (rows || []).some((row) => row.id === id);
}
const publicItem = "id name item_id owner qty desc icon iconId category quality value_gp unit profession_id stackable original base_item_id craft_slots magic_slots craft_properties trade_product fragmentOrigin";
const publicRecipe = "id name profession_id item_id quantity hours rank gold basic service facility_rank tempo_class trade_product tools locations description acquisition equipment";
const publicConditions = "race class level skill recipe profession item faction rep npc achievement quest";
const publicEntry = "id title body category source location faction day year group rewardTitle points closed unique attitude promises";
function recipePreview(row) {
  return { ...projectFields(row, publicRecipe),
    ...(row.experiment ? { experiment: projectFields(row.experiment, "skill tool") } : {}),
    ...(row.properties ? { properties: {} } : {}),
  };
}

function gameView(state, access) {
  const a = access.actor;
  if (a.role === "master") return state;
  const e = state.engine, c = state.company, mine = new Set(a.role === "observer" ? [] : a.heroes);
  const members = c.members.filter((row) => !row.hidden || mine.has(row.id));
  const crew = new Set(members.map((row) => row.id));
  const canSeePlace = (row) => row.visibility === "known" && !row.hidden;
  const nodes = state.nodes.filter(canSeePlace);
  const locations = new Set(nodes.map((row) => row.id));
  const routes = publicRows(state.routes).filter((row) => row.visibility === "known" && locations.has(row.a) && locations.has(row.b));
  const factions = publicRows(state.factions);
  const factionIds = new Set(factions.map((row) => row.id));
  const inventory = publicRows(c.inventory).filter((row) => !row.owner || row.owner.startsWith("member:") && mine.has(row.owner.slice(7)));
  const itemIds = new Set(inventory.map((row) => row.item_id));
  const items = (e.items || []).filter((row) => !row.archived && (!row.hidden || itemIds.has(row.id)));
  const visibleItem = new Set(items.map((row) => row.id));
  const recipes = publicRows(e.recipes).filter((row) => visibleItem.has(row.item_id));
  const contracts = publicRows(state.contracts).filter((row) => !row.location || locations.has(row.location));
  const questIds = new Set(contracts.map((row) => row.id));
  const rewardVisible = (row) => !row.secret && (!row.item_id || visibleItem.has(row.item_id)) &&
    (!row.faction || factionIds.has(row.faction));
  const rewardFields = "type amount item_id qty quantity faction name category quality owner text";
  const ownProfile = (row) => ({
    ...projectFields(row, "race class level stats skills tools professions recipes professionsLimited bonus proficiency wallet trained failedRelics"),
    contacts: (row.contacts || []).filter((id) => containsId(publicRows(state.portal?.people), id)),
  });
  const portal = {};
  for (const key of ["news", "rumors", "mail", "codex", "chronicle", "people", "achievements"]) {
    portal[key] = publicRows(state.portal?.[key]).filter((row) =>
      !["news", "rumors", "mail"].includes(key) ||
      (row.year || 27) < c.year || (row.year || 27) === c.year && (row.day || 1) <= c.day,
    ).flatMap((row) => {
      if (key === "achievements") {
        const grants = (row.grants || []).filter((g) => g.recipient === "company" ||
          g.recipient?.startsWith("hero:") && mine.has(g.recipient.slice(5)));
        if (row.secret && !row.closed && !grants.length) return [];
        return [{ ...projectFields(row, row.closed ? "id title closed points category" : publicEntry),
          grants: grants.map((grant) => projectFields(grant, "recipient name date")) }];
      }
      const view = projectFields(row, publicEntry);
      if (key === "people" && row.participation) {
        const p = row.participation;
        view.participation = {
          companion: p.companion ? projectFields(p.companion, "state role location joined circumstances goals questIds") : null,
          specialist: p.specialist ? projectFields(p.specialist, "role legacyStaff") : null,
          actions: publicRows(p.actions).map((x) => ({
            ...projectFields(x, "id name description kind target phase location gold hours states"),
            conditions: projectFields(x.conditions, publicConditions),
          })),
        };
      }
      return [view];
    });
  }
  const activeStay = currentStay(state);
  const t = locations.has(activeStay?.location) ? activeStay : null;
  const stay = t ? {
    ...projectFields(t, "id name location region days hours start services description limits early showDC"),
    spent: Object.fromEntries(Object.entries(t.spent || {}).filter(([id]) => mine.has(id))),
    history: (t.history || []).filter((row) => mine.has(row.hero)).slice(-160)
      .map((row) => projectFields(row, "hero hours activity item_id qty day result")),
    plans: (t.plans || []).filter((row) => mine.has(row.hero)).map((row) => projectFields(row, "id hero activity hours done")),
    carcasses: publicRows(t.carcasses).map((row) => projectFields(row, "id name kind used" + (t.showDC === false ? "" : " cr"))),
  } : null;
  const j = state.journey;
  const journey = j && access.share_map && containsId(routes, j.routeId) ? {
    ...projectFields(j, "routeId from to routeName start days risk guide guideDie guideSides cost rolls outcome guideCheck"),
    events: Array.from({ length: 6 }, (_, i) => i + 1 === j.outcome ? j.events?.[i] || "" : ""),
  } : null;
  const mapPath = access.map_path;
  const map = mapPath && access.prefix + state.map?.src?.slice(atlasStorageReference.length) === mapPath
    ? projectFields(state.map, "src w h name") : null;
  const chart = mapData(state);
  const openMaps = access.share_map ? publicSheets(chart.maps) : [];
  const mapIds = new Set(openMaps.map((row) => row.id));
  const places = chart.mapPlacements.filter((row) => !row.hidden && locations.has(row.node_id) && mapIds.has(row.map_id));
  const routeIds = new Map(routes.map((row) => [row.id,row]));
  const layeredPlaces = new Set(places.map((row) => JSON.stringify([row.map_id,row.node_id])));
  const lines = chart.routeGeometries.filter((row) => {
    const route = routeIds.get(row.route_id);
    return !row.hidden && route && [route.a,route.b].every((id) => layeredPlaces.has(JSON.stringify([row.map_id,id])));
  });
  const openRegions = publicRows(e.regions);
  const regionIds = new Set(openRegions.map((row) => row.id));
  const boundaries = chart.regionBoundaries.filter((row) => !row.hidden && mapIds.has(row.map_id) && regionIds.has(row.region_id));
  const chartView = {engine:{...e,maps:openMaps,mapPlacements:places,regionBoundaries:boundaries,regions:openRegions}};
  const regionByNode = new Map(nodes.map((row) => [row.id,regionAt(chartView,row)?.id]).filter(([,id]) => regionIds.has(id)));
  const projectedRegions = new Set([...regionByNode.values(), ...boundaries.map((row) => row.region_id), t?.region]);
  const overviewPoints = new Map(places.filter((row) => row.map_id === overviewMap).map((row) => [row.node_id,row]));
  return {
    version: 1, map, journey,
    nodes: nodes.map((row) => ({ ...projectFields(row, "id name type visibility desc faction"),
      regionId: regionByNode.get(row.id), x: overviewPoints.get(row.id)?.x ?? 0, y: overviewPoints.get(row.id)?.y ?? 0 })),
    routes: access.share_map ? routes.map((row) => projectFields(row, "id name a b kind min max risk status visibility cost desc")) : [],
    factions: factions.map((row) => projectFields(row, "id name leader color icon iconId desc repPoints rep charter region")),
    diplomacy: publicRows(state.diplomacy).filter((row) => factionIds.has(row.a) && factionIds.has(row.b))
      .map((row) => projectFields(row, "id a b state desc day year")),
    journal: publicRows(state.journal).filter((row) => row.kind !== "achievement").slice(0,150)
      .map((row) => projectFields(row, row.kind === "contract" ? "id kind title day year" : "id kind title text day year")),
    worldBook: publicRows(state.worldBook?.chapters).length ? {
      ...projectFields(state.worldBook, "title subtitle year author"),
      chapters: publicRows(state.worldBook.chapters).map((row) => ({ ...projectFields(row, "uxid title text"), image: "" })),
    } : undefined,
    settings: { achievementBookInstalled: true },
    portal,
    contracts: contracts.map((row) => ({
      ...projectFields(row, "id type title desc objectives employer giver faction location status reward rewardRevealed hours region_id repeat period consignee due_day due_year stock_source reward_recipient"),
      conditions: projectFields(row.conditions, publicConditions),
      goods: (row.goods || []).filter((g) => visibleItem.has(g.item_id)).map((g) => projectFields(g, "item_id quantity")),
      rewards: (row.rewards || []).filter((x) => (!row.rewardHidden || row.rewardRevealed) && rewardVisible(x)).map((x) => projectFields(x, rewardFields)),
      ...(row.rewardRevealed && row.rewardSecret ? { rewardSecret: row.rewardSecret } : {}),
      ...(row.rewardReceipt ? { rewardReceipt: {
        ...projectFields(row.rewardReceipt, "day year"),
        rewards: (row.rewardReceipt.rewards || []).filter((x) => row.rewardRevealed || rewardVisible(x))
          .map((x) => projectFields(x, rewardFields)),
      } } : {}),
    })),
    company: {
      ...projectFields(c, "name day year gold notes development talents"),
      location: locations.has(c.location) ? c.location : "",
      members: members.map((row) => {
        const hero = projectFields(row, "id name role bio active race class faction factionRank mod");
        if (mine.has(row.id) && access.portraits?.[row.id] === access.prefix + row.image?.slice(atlasStorageReference.length))
          hero.image = row.image;
        return hero;
      }),
      staff: publicRows(c.staff).map((row) => projectFields(row, "id name role desc")),
      inventory: inventory.map((row) => ({
        ...projectFields(row, publicItem),
        ...(row.properties ? {properties: projectFields(row.properties, "otherAttuned")} : {}),
      })),
    },
    engine: {
      schemaVersion: 1, receipts: [], phase: e.phase,
      regions: openRegions.filter((row) => projectedRegions.has(row.id))
        .map((row) => ({...projectFields(row, "id name continent biome description tier levels danger"), dc: t?.showDC === false ? 10 : row.dc})),
      ...(access.share_map ? {
        maps:openMaps.map((row) => ({
          ...projectFields(row,"id name kind parent_id desc shared x y zoom"),
          ...(locations.has(row.node_id) ? {node_id:row.node_id} : {}),
          ...(regionIds.has(row.region_id) ? {region_id:row.region_id} : {}),
          ...(typeof row.image === "string" && row.image.startsWith(atlasStorageReference) ?
            projectFields(row,"image width height filename") : {}),
        })),
        mapPlacements:places.map((row) => ({
          ...projectFields(row,"id map_id node_id x y scale labels"),
          ...(mapIds.has(row.child_id) ? {child_id:row.child_id} : {}),
        })),
        routeGeometries:lines.map((row) => projectFields(row,"id map_id route_id points style")),
        regionBoundaries:boundaries.map((row) => projectFields(row,"id map_id region_id points")),
      } : {}),
      stays: stay ? [stay] : [],
      profiles: Object.fromEntries(Object.entries(e.profiles || {}).filter(([id]) => mine.has(id)).map(([id,value]) => [id,ownProfile(value)])),
      rolls: (e.rolls || []).filter((row) => mine.has(row.hero)).slice(0,100)
        .map((row) => projectFields(row, "hero label natural raw mod total success showDC" + (row.showDC === false ? "" : " dc"))),
      professions: publicRows(e.professions).map((row) => projectFields(row, "id name kind description summary special tools skill icon iconId")),
      items: items.map((row) => projectFields(row, publicItem)),
      recipes: recipes.map(recipePreview),
      ingredients: publicRows(e.ingredients).filter((row) => containsId(recipes,row.recipe_id) && visibleItem.has(row.item_id))
        .map((row) => projectFields(row, "id recipe_id item_id quantity")),
      loot: publicRows(e.loot).filter((row) => row.region_id === t?.region && visibleItem.has(row.item_id)).map((row) => ({
        ...projectFields(row, "id region_id profession_id item_id hours attempts skill required_tool_id"),
        stock: row.stock === 0 ? 0 : 1, weight: 1, min_quantity: 1, max_quantity: 1, min_margin: 0,
        ...(t.showDC !== false ? { dc: row.dc } : {}),
      })),
      gathering: (e.gathering || []).map((row) => projectFields(row, "common_gp rare_gp dc")),
      solutions: publicRows(e.solutions).filter((row) => questIds.has(row.quest_id))
        .map((row) => projectFields(row, "id quest_id name skill stat tool encounter")),
      completions: (e.completions || []).filter((row) => mine.has(row.hero)).slice(-150)
        .map((row) => projectFields(row, "hero quest option stay day result")),
      projects: (e.projects || []).filter((row) => mine.has(row.hero)).slice(-100).map((row) => ({
        ...projectFields(row, "id hero name cost qty left work status"),
        recipe: recipePreview(row.recipe),
        reserve: (row.reserve || []).map((x) => projectFields(x,"item qty")),
        contributors: (row.contributors || []).filter((x) => crew.has(x.hero)).map((x) => projectFields(x, "hero hours")),
      })),
      markets: publicRows(e.markets).filter((row) => row.node_id === t?.location && visibleItem.has(row.item_id)
        && (!row.faction_id || factionIds.has(row.faction_id)))
        .map((row) => projectFields(row, "id node_id item_id faction_id stock demand budget buy_factor sell_factor rep_bonuses")),
      localServices: publicRows(e.localServices).filter((row) => row.node_id === t?.location)
        .map((row) => projectFields(row, "id node_id service profession_id fee hours tier")),
      craftProperties: publicRows(e.craftProperties).map((row) => projectFields(row, "id name kind trigger action effect limits uses recovery")),
      facilities: publicRows(e.facilities).map((row) => projectFields(row, "id service tier2_gp tier3_gp rent1_gp rent2_gp rent3_gp")),
      facilityTiers: e.facilityTiers,
      campEffects: Object.fromEntries(Object.entries(e.campEffects || {}).map(([id,value]) =>
        [id,projectFields(value,"service profession recipes bonus advantage discount speed wage productivity")])),
      campUpgrades: publicRows(e.campUpgrades).map((row) => projectFields(row, "id service profession recipes bonus advantage discount speed wage productivity")),
      companionRequests: (e.companionRequests || []).filter((row) => mine.has(row.hero)).map((row) =>
        projectFields(row,"id npc action hero title message response gold hours day year status")),
      ...projectFields(e, "categories captainBank requireTrainer refund"),
      sharedHeroes: (e.sharedHeroes || []).filter((id) => mine.has(id)),
    },
  };
}

function initializeGame(document) {
  const state = migrate(structuredClone(document));
  state.settings ??= {};
  state.company.inventory ??= [];
  state.company.talents ??= {};
  state.portal ??= {};
  state.journal ??= [];
  state.contracts ??= [];
  adventure(state);
  tradeState(state);
  return state;
}
const heroCommands = new Set("profile roll rest schedule resolvePlan transfer withdraw merge gather project craft work cancelProject train disenchant enchant assemble quest tradeDeal tradeDonation deliverGoods companionRequest".split(" "));
function authorizeGameCommand(state, access, name, args) {
  const a = access.actor;
  if (a.role === "master") return;
  requireThat(["player","captain"].includes(a.role), "Действие недоступно");
  if (["travelStart","travelRoll","travelGuide"].includes(name)) {
    requireThat(a.role === "captain" && a.travel && access.share_map, "Нет права вести отряд");
    if (name !== "travelStart") {
      const r = state.routes.find((row) => row.id === state.journey?.routeId);
      requireThat(r?.visibility === "known" && !r.hidden && [r.a,r.b].every((id) =>
        state.nodes.some((node) => node.id === id && node.visibility === "known" && !node.hidden)), "Переход недоступен");
    }
    return;
  }
  requireThat(heroCommands.has(name) && owned(a, args.hero), "Действие недоступно");
  const assertVisible = (rows, id) => requireThat(publicRows(rows).some((row) => row.id === id), "Действие недоступно");
  if (args.stack) assertVisible(state.company.inventory,args.stack);
  if (args.to) requireThat(state.company.members.some((row) => row.id === args.to && !row.hidden), "Получатель недоступен");
  if (args.recipe) {
    assertVisible(state.engine.recipes,args.recipe);
    const recipe=byId(state.engine.recipes,args.recipe);
    if (recipe.item_id) assertVisible(state.engine.items,recipe.item_id);
  }
  if (args.resource) assertVisible(state.engine.items,args.resource);
  if (args.fragment) assertVisible(state.engine.items,args.fragment);
  if (args.profession) assertVisible(state.engine.professions,args.profession);
  if (args.carcass) assertVisible(currentStay(state)?.carcasses,args.carcass);
  if (args.project) requireThat(owned(a,byId(state.engine.projects,args.project).hero), "Проект недоступен");
  if (name === "quest") assertVisible(state.contracts,args.quest);
  if (name === "deliverGoods") assertVisible(state.contracts,args.id);
  if (["rest","gather","craft","project","work","schedule","resolvePlan","disenchant","train","enchant","assemble","quest"].includes(name)) {
    const t = currentStay(state);
    requireThat(t && !state.nodes.find((row) => row.id === t.location)?.hidden &&
      state.nodes.find((row) => row.id === t.location)?.visibility === "known", "Стоянка недоступна");
  }
}
function mutateGame(access, name, args, key) {
  const state = initializeGame(access.document);
  inspectJSON(args);
  requireThat(args && !Array.isArray(args) && typeof args === "object", "Некорректные параметры");
  authorizeGameCommand(state,access,name,args);
  if (name === "masterSave") {
    requireThat(access.actor.role === "master", "Действие недоступно");
    requireThat(JSON.stringify(args.document?.engine?.receipts) === JSON.stringify(state.engine.receipts),
      "Редактор не может изменять журнал игровых операций");
    return initializeGame(args.document);
  }
  const next = applyCommand(state,access.actor,name,args,key);
  const counters = {
    contract:next.contracts.filter((row)=>row.status==="done").length,
    arrival:next.journal.filter((row)=>row.kind==="travel"&&row.title?.startsWith("Прибытие:")).length,
    staff:companySpecialists(next).length,
    charter:next.factions.filter((row)=>row.charter).length,
    talent:Object.values(next.company.talents).filter(Boolean).length,
  };
  for (const row of next.portal.achievements || []) {
    if (row.auto && counters[row.auto] >= (row.target || 1))
      grant(next,{type:"achievement",achievement:row.id});
  }
  return next;
}

function onlineTravelAllowed(a) {
  return a.role === "master" || a.role === "captain" && a.travel;
}
function travelLog(s,title,text) {
  s.journal.unshift({ id:crypto.randomUUID(), kind:"travel", title, text, day:s.company.day, year:s.company.year });
}
register("travelStart","party",(s,p,a)=>{
  requireThat(onlineTravelAllowed(a) && !s.journey && !currentStay(s), "Переход недоступен");
  const r=byId(s.routes,p.route), from=s.company.location;
  const to=r.a===from?r.b:r.a, nodes=[byId(s.nodes,from),byId(s.nodes,to)];
  requireThat([r.a,r.b].includes(from) && r.status!=="closed", "Переход недоступен");
  requireThat(a.role==="master" || r.visibility==="known" && r.status!=="conditional" &&
    nodes.every((row)=>row.visibility==="known"&&!row.hidden), "Маршрут должен подтвердить мастер");
  const roster=s.company.members.filter((m)=>m.active && (a.role==="master"||!m.hidden));
  let guideDie=null, guide=p.guide||"";
  if (guide==="random"||guide==="physical") {
    if (guide==="physical") requireThat(a.role==="master" && roster.length,"Физический результат вводит мастер");
    guideDie=roster.length ? guide==="physical"?integer(p.guideDie,1,roster.length):dice(roster.length):null;
    guide=roster[guideDie-1]?.id||"";
  }
  requireThat(!guide||containsId(roster,guide),"Проводник недоступен");
  const cost=tradeMoney(a.role==="master" ? p.cost : r.cost||0);
  requireThat(s.company.gold>=cost,"Недостаточно золота");
  const days=r.min===r.max?r.min:r.min+dice(r.max-r.min+1)-1;
  const routeName=r.name||nodes.map((row)=>row.name).join(" — ");
  s.company.gold=tradeMoney(s.company.gold-cost);
  s.engine.phase="travel";
  s.journey={routeId:r.id,from,to,routeName,start:s.company.day,days,risk:r.risk,
    events:[...r.events],guide,guideDie,guideSides:roster.length,cost,rolls:[],outcome:null,guideCheck:null};
  travelLog(s,"Выход в путь",routeName+" · "+days+" дн.");
});
register("travelGuide","party",(s,p,a)=>{
  const j=s.journey;
  requireThat(onlineTravelAllowed(a)&&j?.guide&&j.guideCheck==null,"Проверка недоступна");
  const g=heroOf(s,j.guide), h=profile(s,j.guide);
  const mod=Math.floor((h.stats.wis-10)/2)+(h.skills["Выживание"]||0)*bv(h)+h.bonus;
  const roll=dice(20);
  j.guideCheck={roll,mod,total:roll+mod};
});
register("travelRoll","party",(s,p,a)=>{
  const j=s.journey;
  requireThat(onlineTravelAllowed(a)&&j&&j.outcome===null,"Бросок недоступен");
  const count=j.risk===1?1:2;
  if (p.values) requireThat(a.role==="master" && Array.isArray(p.values) && p.values.length===count,"Физический результат вводит мастер");
  j.rolls=p.values ? p.values.map((x)=>integer(x,1,6)) : Array.from({length:count},()=>dice(6));
  j.outcome=j.risk===0?Math.min(...j.rolls):j.risk===2?Math.max(...j.rolls):j.rolls[0];
});

export { initializeGame, gameView, mutateGame, splitOnlineBackup, mapBackupValues, atlasStorageReference, atlasMediaName, validateBackup };
