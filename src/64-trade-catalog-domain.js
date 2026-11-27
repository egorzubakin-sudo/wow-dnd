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
