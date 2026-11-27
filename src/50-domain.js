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
      const f = byId(s.factions, r.faction);
      if (!(f.charter || "").split("\n").includes(r.text))
        f.charter = [f.charter, r.text].filter(Boolean).join("\n");
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
