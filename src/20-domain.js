const rulebook = /*BUNDLED_RULES*/ null;
const demoPack = /*BUNDLED_DEMO*/ null;
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
