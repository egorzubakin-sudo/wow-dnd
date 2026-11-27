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
