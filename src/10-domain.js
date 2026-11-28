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
