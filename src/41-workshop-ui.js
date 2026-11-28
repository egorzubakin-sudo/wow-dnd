const contentExamples = /*BUNDLED_CONTENT*/ null;
function downloadText(filename, body, type = "application/json") {
  const a = document.createElement("a"),
    url = URL.createObjectURL(new Blob([body], { type }));
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
const sampleRows = {
  maps: {id:"kalimdor", name:"Калимдор", kind:"continent", parent_id:"overview", shared:false, x:.5, y:.5, zoom:1},
  mapPlacements: {id:"kalimdor-crossroads", map_id:"kalimdor", node_id:"crossroads", x:.54, y:.42, scale:100, labels:"hover"},
  routeGeometries: {id:"kalimdor-trade-road", map_id:"kalimdor", route_id:"trade-road", points:[[.58,.39],[.66,.45]], style:"smooth"},
  regionBoundaries: {id:"kalimdor-durotar", map_id:"kalimdor", region_id:"durotar", points:[[.5,.3],[.7,.3],[.7,.5],[.5,.5]], hidden:true},
  nodes: {
    id: "crossroads",
    name: "Перекрёсток",
    x: 0.5,
    y: 0.5,
    regionId: "durotar",
    type: "city",
  },
  routes: {
    id: "trade-road",
    name: "Торговый тракт",
    a: "crossroads",
    b: "port",
    min: 1,
    max: 2,
    risk: 1,
    kind: "road",
    status: "open",
  },
  factions: { id: "caravan", name: "Караванщики", color: "#b99755" },
  diplomacy: { id: "trade-pact", a: "caravan", b: "guild", state: "neutral" },
  people: { id: "trader", title: "Гоблин-торговец" },
  achievements: { id: "first-ingot", title: "Первый слиток", points: 5 },
  news: {
    id: "caravan-news",
    title: "Прибыл караван",
    kind: "news",
    day: 1,
    year: 27,
  },
  campUpgrades: { id: "upgrade.armory", service: "Оружейная", speed: 10, source: { origin: "demo" } },
  services: { id: "service.crossroads.mentor", node_id: "crossroads", service: "Наставник", profession_id: "smithing", fee: 6, hours: 8, source: { origin: "demo" } },
  quests: { id: "quest.crossroads.notice", title: "Дорожное объявление", location: "crossroads", source: { origin: "demo" } },
  craftProperties: {
    id: "trait.demo.riposte", name: "Учебная контратака", kind: "counterattack", action: "reaction",
    trigger: "Видимое существо в досягаемости промахивается по владельцу рукопашной атакой.",
    effect: "Сделать одну рукопашную атаку этим оружием.",
    limits: "Одна атака, не является действием Атака и не запускает другие дополнительные атаки.",
    uses: 1, recovery: "После продолжительного отдыха", source: { origin: "demo" },
  },
  enchantments: {
    id: "recipe.demo.enchant", name: "Пример формулы", profession_id: "enchanting", item_id: "item.enchanted",
    quantity: 1, hours: 8, rank: 2, service: "Зачаровательная", properties: { effect: "Авторский пример" },
    source: { origin: "demo" },
  },
  archaeology: {
    id: "loot.archaeology.example", region_id: "durotar", profession_id: "archaeology",
    item_id: "relic", weight: 1, min_quantity: 1, max_quantity: 1, min_margin: 0, source: { origin: "demo" },
  },
  codex: {
    id: "copper-notes",
    title: "Медные жилы",
    body: "Заметки старателя.",
  },
};
function sampleRow(k) {
  if (k === "professions") return rulebook.professions[0];
  if (k === "fishing" || k === "hunting")
    return demoPack.loot.find((r) => subset(k, r));
  if (k === "originalEquipment") return contentExamples.bookEquipment.tables.originalEquipment[0];
  if (k === "magicItems") return contentExamples.bookEquipment.tables.originalEquipment.find((row) => row.category === "Магические предметы");
  const example = demoPack[k]?.[0] || sampleRows[k] || contentExamples.tradeLoop.tables[k]?.[0];
  if (k === "regions") {
    const { image, ...region } = example;
    return region;
  }
  return example;
}
const formatNotes = {
  maps: "overview — существующая обзорная карта. parent_id ссылается на родителя. shared включает доступ игроков, если открыты и родительские карты. Подложку обзорной карты меняют на самой карте.",
  mapPlacements: "Одна отметка на пару карта и место. Координаты от 0 до 1. scale — размер иконки 50–200%. labels: always, hover, never. child_id — дочерняя карта.",
  routeGeometries: "Одна линия на пару карта и маршрут. Оба конца маршрута должны иметь отметки на карте. points — массив пар [x,y], пустой массив задаёт линию без изгибов. style: line, smooth.",
  regionBoundaries: "Контур из 3–256 вершин [x,y] по порядку. По нему автоматически определяются места региона. hidden скрывает границу от игроков.",
  items:
    "quality: common, uncommon, rare, epic, legendary. category: Оружие, Броня, Материалы, Магические предметы, Припасы, Снаряжение, Ездовые питомцы, Прочее или созданная мастером категория.",
  regions:
    "points: массив пар [x,y] в диапазоне 0–1. При перекрытии выше priority. tier: 1–5.",
  recipes:
    "rank: требуемый бонус владения. gold: стоимость в зм на один экземпляр. equipment: массив ID инструментов из каталога. experiment: объект с полями skill и dc.",
  ingredients:
    "Количество списывается при резервировании проекта. Одна строка связывает один рецепт с одним ингредиентом.",
  loot: "weight: положительный относительный вес. min_margin: минимальное превышение Сл. stock: остаток в регионе. min_quantity и max_quantity включительны.",
  errands:
    "repeat: once, stay, day или period. При period задайте period в игровых днях. conditions поддерживает race, class, level, skill, profession, item, recipe, faction, rep, npc, achievement, quest.",
  rewards:
    "type: gold, item, rep, contact, discover, achievement. when: success или failure. Для item обязательны item_id и quantity, для rep — faction и amount.",
  diplomacy:
    "state: alliance, cooperation, neutral, truce, tension, hostility, war.",
  professions:
    "tools: массив альтернативных владений инструментом. Пустой массив снимает требование. skill: название обязательного навыка. kind: gathering или production. summary: текст карточки. description и special: механика и особые правила.",
  news: "kind: news или rumors. day и year используют календарь компании.",
};
Object.assign(formatNotes, {
  tradeGoods: "Абстрактная партия: common/uncommon/rare, value_gp > 0, stackable=true, profession_id, без боевых свойств.",
  tradeRecipes: "Обычный движок проектов. Ингредиенты задаются отдельно. Ступень производственной мастерской = rank−1. Упаковка не увеличивает стоимость сырья.",
  markets: "buy_factor — цена для покупателя, sell_factor — цена, которую платит скупщик. rep_bonuses — [[очки, доля поправки], ...] по возрастанию. stock, demand и budget — текущие остатки.",
  facilities: "service — название существующего улучшения. tier2_gp и tier3_gp — настройки стоимости оборудования, rent1_gp–rent3_gp — аренда на стоянку.",
  craftProperties: "kind — вид эффекта. action — тип действия. Обязательны триггер, точный эффект, ограничения и источник house/demo. uses и recovery задаются вместе.",
  originalEquipment: "rules — исходные книжные характеристики, source содержит book и printed_page. value_gp — отдельно настраиваемая цена кампании. Книжные предметы без авторских ячеек.",
  deliveries: "goods — [{item_id,quantity}], rewards — [{type:'gold',amount}, ...]. stock_source: personal/shared. reward_recipient: hero/company.",
  services: "Наставник может ограничиваться profession_id. fee — цена в зм, hours — время обучения. Для предложений аренды используйте service, tier и fee.",
  campUpgrades: "Эффекты открытого улучшения. Ручные настройки кампании имеют приоритет. discount и speed указываются в процентах.",
  enchantments: "Рецепт профессии enchanting со свойствами properties. Дополнительные эффекты хранятся отдельно от книжной характеристики.",
  magicItems: "Представление категории «Магические предметы» из общего каталога.",
  materials: "Представление категории «Материалы» из общего каталога.",
  quests: "Обычные контракты. Поставки и индивидуальные поручения используют отдельные схемы.",
  archaeology: "Региональные таблицы с profession_id=archaeology.",
});
formatNotes.hunting = formatNotes.fishing = formatNotes.loot;
const formatEnums = {
  quality: ["common", "uncommon", "rare", "epic", "legendary"],
  stock_source: ["personal", "shared"], reward_recipient: ["hero", "company"],
  action: ["attack", "bonus", "reaction", "magic", "utilize", "passive", "other"],
  tempo_class: ["consumable", "equipment", "magic", "manual"],
  visibility: ["known", "rumor", "hidden"], when: ["success", "failure"],
  repeat: ["once", "stay", "day", "period"], time_policy: ["atlas-weekly"],
  state: ["alliance", "cooperation", "neutral", "truce", "tension", "hostility", "war"],
  kind: { maps: ["world","continent","region","local"], professions: ["gathering", "production"], news: ["news", "rumors"] },
  type: { rewards: ["gold", "rep", "item", "contact", "discover", "achievement"] },
};
const fieldPurposes = {
  id: "Постоянный ключ записи", name: "Отображаемое имя", title: "Отображаемый заголовок",
  desc: "Описание в карточке", description: "Полное описание механики", summary: "Краткое описание для списка",
  body: "Текст записи", status: "Текущее состояние маршрута или задания", special: "Особые правила профессии", source: "Источник или издатель; для правил используйте объект происхождения",
  provenance: "Структурированный источник записи", extra: "Дополнительные поля, сохраняемые при круговом импорте",
  category: "Категория интерфейса", quality: "Редкость", kind: "Подтип записи", type: "Тип записи",
  value_gp: "Цена кампании за единицу", gold: "Золото за экземпляр рецепта", amount: "Размер награды по её типу",
  min: "Минимальная длительность маршрута", max: "Максимальная длительность маршрута", cost: "Стоимость маршрута",
  risk: "Уровень риска маршрута", events: "Шесть записей таблицы d6", day: "День кампании", year: "Год кампании",
  hours: "Длительность занятия или работы", tempo_hours: "Индивидуальный предел недельного профиля",
  reference_hours: "Длительность до применения профиля", tempo_class: "Класс применения недельного профиля",
  time_policy: "Отметка применённого профиля", rank: "Минимальный бонус владения",
  quantity: "Количество экземпляров или материала", min_quantity: "Минимальная выдача", max_quantity: "Максимальная выдача",
  stock: "Остаток предложения или добычи", demand: "Оставшийся спрос скупщика", budget: "Оставшийся бюджет скупщика",
  buy_factor: "Множитель цены продавца для героя", sell_factor: "Множитель цены скупки у героя",
  rep_bonuses: "Пары из порога репутации и доли поправки", repPoints: "Текущая репутация компании",
  service: "Название сооружения или услуги", facility_rank: "Требуемая ступень сооружения", fee: "Цена местной услуги",
  tier: "Ступень сооружения или ранг региона", tier2_gp: "Покупка оборудования ступени 2", tier3_gp: "Покупка оборудования ступени 3",
  rent1_gp: "Аренда ступени 1", rent2_gp: "Аренда ступени 2", rent3_gp: "Аренда ступени 3",
  original: "Книжная запись", rules: "Исходные характеристики предмета", base_item_id: "Книжная основа авторского предмета",
  craft_properties: "ID ремесленных свойств", craft_slots: "Разрешённые ремесленные ячейки", magic_slots: "Разрешённые магические ячейки",
  properties: "Структурированные эффекты предмета или рецепта", trade_product: "Обозначение торговой партии или её рецепта",
  stackable: "Разрешить объединение экземпляров", basic: "Рецепт не требует отдельного изучения",
  trigger: "Точное событие применения свойства", action: "Тип расходуемого действия", effect: "Точный эффект",
  limits: "Ограничения и взаимодействие с другими эффектами", uses: "Число применений", recovery: "Условие восстановления применений",
  tools: "Названия владений инструментами", equipment: "ID предметов, нужных для работы",
  locations: "ID допустимых мест", factions: "ID региональных фракций", recipes: "ID рецептов, открываемых улучшением",
  conditions: "Условия доступности", experiment: "Параметры проверки экспериментального рецепта",
  acquisition: "Как узнать рецепт", skill: "Название навыка", tool: "Название инструмента", stat: "Код характеристики",
  dc: "Сложность проверки", weight: "Относительный вес добычи", min_margin: "Минимальное превышение сложности",
  attempts: "Доступные попытки", rare_chance: "Шанс редкой находки в процентах", fail_text: "Текст при неудаче",
  biome: "Окружение региона", continent: "Континент", points: "Координаты полигона или очки достижения",
  priority: "Приоритет наложенных регионов", levels: "Диапазон уровней", danger: "Уровень опасности",
  x: "Нормализованная координата по горизонтали", y: "Нормализованная координата по вертикали",
  visibility: "Видимость на карте", state: "Дипломатическое состояние", leader: "Имя главы фракции",
  color: "Цвет на карте", icon: "Символ иконки", iconId: "ID из icons.json", image: "Растровый data URL",
  unit: "Подпись единицы предмета", hidden: "Скрыто от игроков", secret: "Скрытая награда или достижение",
  origin: "Пометка происхождения", due_year: "Год окончания срока поставки", due_day: "Последний допустимый день",
  consignee: "Кому передают поставку", stock_source: "Откуда списываются товары", reward_recipient: "Кому начисляется награда",
  goods: "Строки поставки с item_id и quantity", rewards: "Строки структурированных наград",
  reward: "Текст награды", objectives: "Цели задания", encounter: "Сообщить о встрече после решения",
  when: "Условие выдачи награды", success: "Текст успешного решения", failure: "Текст неудачного решения",
  repeat: "Периодичность поручения", period: "Интервал повторения поручения",
  engineEvent: "Событие движка для достижения", scope: "Кому выдаётся достижение",
  bonus: "Поправка к проверке", advantage: "Предоставить преимущество", discount: "Снижение цены",
  speed: "Сокращение времени", wage: "Оплата специалиста", productivity: "Работа специалиста в день",
};
const fieldUnits = {
  value_gp: "зм", gold: "зм", cost: "зм", fee: "зм", budget: "зм", wage: "зм",
  tier2_gp: "зм", tier3_gp: "зм", rent1_gp: "зм", rent2_gp: "зм", rent3_gp: "зм",
  hours: "ч", tempo_hours: "ч", reference_hours: "ч", productivity: "ч/день", min: "дни", max: "дни",
  speed: "%", discount: "%", rare_chance: "%", day: "игровые дни", due_day: "игровые дни", period: "игровые дни",
  quantity: "шт.", stock: "шт.", demand: "шт.", buy_factor: "множитель", sell_factor: "множитель", repPoints: "очки",
};
const fieldLimits = {
  id: "1–128 символов: буквы, цифры, точка, двоеточие, дефис, подчёркивание",
  x: "0–1", y: "0–1", risk: "0–2", facility_rank: "1–3", craft_slots: "0–1", magic_slots: "0–1",
  buy_factor: "0 < buy_factor ≤ 10", sell_factor: "0 ≤ sell_factor ≤ buy_factor",
  rep_bonuses: "Пороги возрастают, каждая доля ≥ 0 и < 1", speed: "0–100", discount: "0–100",
  due_day: "Целый положительный день срока", image: "Растровый data URL",
};
const optionalExamples = {
  description: "Полное описание работы", iconId: "trade:Copper_01", tools: ["Инструменты кузнеца"],
  equipment: [], factions: [], locations: [], rules: { "Урон": "1к8 рубящего" }, craft_properties: [],
  conditions: { level: 1 }, experiment: { skill: "История", dc: 15 }, requires: [],
  rep_bonuses: [[3000, 0.05], [9000, 0.1]], tempo_class: "equipment", tempo_hours: 24,
  reference_hours: 40, time_policy: "atlas-weekly", provenance: { origin: "house" }, source: { origin: "house" },
  extra: {}, image: null,
};
function describeField(table, field, row) {
  const key = field.name, reference = field.type.startsWith("@") ? field.type.slice(1) : null;
  const namedEnum = key === "service" && ["facilities", "tradeRecipes"].includes(table) ? productionServices :
    key === "service" && table === "services" ? [...productionServices, "Наставник"] :
    key === "kind" && table === "craftProperties" ? Object.keys(propertyKinds) : formatEnums[key];
  const kinds = Array.isArray(namedEnum) ? namedEnum : namedEnum?.[table] || null;
  const fallback = { text: "Пример", int: 0, signed: 0, pos: 1, num: 1.5, ratio: 0.5, bool: false, json: {} };
  const example = Object.hasOwn(optionalExamples, key) ? optionalExamples[key] :
    kinds?.[0] ?? (reference ? sampleRow(reference)?.id || "external.record" : fallback[field.type]);
  return { ...field, purpose: fieldPurposes[key] || (reference ? "ID связанной записи из " + reference : "Поле " + key + " из справочника"),
    allowed: kinds, constraint: fieldLimits[key] || null,
    default: key === "stackable" ? true : key === "facility_rank" && ["recipes", "tradeRecipes"].includes(table) ? 1 : field.type === "bool" ? false : null,
    unit: fieldUnits[key] || null, reference, example: row[key] ?? example };
}
function blankContentPackage() {
  return {
    format: contentFormat, schemaVersion: 1, id: "campaign.example", name: "Новый пакет",
    description: "Назначение пакета", version: "1.0.0", author: "Автор", sources: [{ origin: "house" }],
    dependencies: [], tables: { items: [] },
  };
}
function schemaDoc() {
  return {
    format: "atlas-tables",
    version: 1,
    encoding: "UTF-8",
    csvDelimiter: ";",
    csvBOM: true,
    contentPackage: {
      template: blankContentPackage(), example: contentExamples.tradeLoop,
      dependency: { id: "core.book-equipment", minVersion: "1.0.0" },
      versions: "X.Y.Z; при обновлении увеличьте версию",
      install: "Таблицы одного пакета проверяются вместе. Чужая установленная запись требует зависимости, совпадающий ID чужой записи считается конфликтом.",
      sources: { allowed: sourceIds, bookFields: ["book", "printed_page"], homeField: "origin" },
    },
    types: {
      text: "Строка",
      int: "Целое ≥ 0",
      pos: "Целое ≥ 1",
      signed: "Целое со знаком",
      num: "Число ≥ 0",
      ratio: "Число от 0 до 1",
      bool: "true или false",
      json: "JSON-массив или объект",
      "@table": "Стабильный ID строки указанной таблицы",
    },
    tables: Object.fromEntries(
      Object.keys(tables).map((k) => [
        k,
        {
          title: tables[k][0],
          notes: formatNotes[k] || "",
          fields: columns(k).map((field) => describeField(k, field, sampleRow(k))),
          example: sampleRow(k),
        },
      ]),
    ),
  };
}
function workshop(initialTable = "regions") {
  if (actor.role !== "master") return;
  openModal(
    "Мастерская данных",
    '<section class="engine-form">' +
      pick(
        "Справочник",
        "tableKey",
        Object.entries(tables).map(([k, t]) => [k, t[0]]),
        initialTable,
      ) +
      pick(
        "Формат",
        "tableFmt",
        [
          ["json", "JSON"],
          ["csv", "CSV · UTF-8, разделитель ;"],
        ],
        "json",
      ) +
      '<div id="tableTools" class="actions"></div><details><summary>Поля и формат данных</summary><div id="formatHelp"></div></details>' +
      pick(
        "Режим импорта",
        "tableMode",
        [
          ["new", "Только новые (конфликт — ошибка)"],
          ["update", "Обновить по ID"],
          ["skip", "Пропустить конфликты"],
          ["replace", "Полная замена выбранных справочников"],
        ],
        "new",
      ) +
      input("Файл CSV / JSON", "tableFile", "file") +
      area("Данные для проверки", "tableRaw") +
      '<div id="verifyTools" class="actions"></div><pre id="importReport" role="status"></pre><div id="applyTools" class="actions"></div></section>',
  );
  const key = () => val("tableKey");
  const write = (name, rows) => {
    const k = key();
    if (val("tableFmt") === "csv")
      downloadText(
        k + "-" + name + ".csv",
        csvWrite(
          rows,
          columns(k).map((c) => c.name),
        ),
        "text/csv;charset=utf-8",
      );
    else
      downloadText(
        k + "-" + name + ".json",
        JSON.stringify({ [k]: rows }, null, 2),
      );
  };
  $("tableTools").append(
    button("Пустой шаблон", () => write("empty", [])),
    button("Пример", () => write("sample", [sampleRow(key())])),
    button("Экспорт", () => write("export", records(S, key()))),
    button("Скачать спецификацию для генерации контента", downloadContentSpecification),
    button("Редактор записей", () => catalogRecords(key())),
    button("Пакеты контента", contentWorkshop),
  );
  const reset = () => {
    $("applyTools").replaceChildren();
    $("importReport").textContent = "";
  };
  const help = () => {
    reset();
    const doc = schemaDoc();
    $("formatHelp").innerHTML =
      "<dl>" +
      columns(key())
        .map(
          (c) =>
            "<dt>" +
            esc(c.name) +
            (c.optional ? "" : " *") +
            "</dt><dd>" +
            esc(doc.types[c.type] || "ID из " + c.type.slice(1)) +
            "</dd>",
        )
        .join("") +
      "</dl><p>" +
      esc(formatNotes[key()] || "") +
      "</p><p>Для связанных записей можно загрузить единый JSON-объект с ключами справочников.</p>";
  };
  $("tableKey").onchange = help;
  help();
  $("tableMode").onchange = reset;
  $("tableFmt").onchange = reset;
  $("tableRaw").oninput = reset;
  $("tableFile").onchange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      $("tableRaw").value = await file.text();
      $("tableFmt").value = /\.csv$/i.test(file.name) ? "csv" : "json";
      reset();
    }
  };
  $("verifyTools").append(
    button("Проверить и просмотреть", () => {
      reset();
      try {
        const raw = val("tableRaw"),
          k = key(),
          mode = val("tableMode"),
          parsed = val("tableFmt") === "csv" ? csvRead(raw) : JSON.parse(raw);
        const pack = Array.isArray(parsed) ? { [k]: parsed } : parsed,
          plan = planImport(S, pack, mode, { resetMarket: true });
        const c = plan.count;
        $("importReport").textContent =
          "Создание: " +
          c.created +
          " · обновление: " +
          c.updated +
          " · пропуск: " +
          c.skipped +
          " · ошибки: " +
          c.errors +
          "\n" + listImportChanges(plan.changes) + "\n" +
          plan.issues.slice(0, 30).join("\n") +
          "\n" +
          JSON.stringify(
            pack,
            (_, value) => (safeImage(value) ? "[изображение]" : value),
            2,
          ).slice(0, 4800);
        if (!c.errors) {
          const token = crypto.randomUUID();
          $("applyTools").append(
            button("Подтвердить импорт", async () => {
              if (
                mode === "replace" &&
                !confirm(
                  "Заменить содержимое: " + Object.keys(pack).join(", ") + "?",
                )
              )
                return;
              await execute("import", { pack, mode }, token);
              closeModal();
              toast("Импорт завершён. Отмена доступна в истории.");
            }),
            button("Отменить импорт", reset),
          );
        }
      } catch (e) {
        $("importReport").textContent = e.message;
      }
    }),
  );
}
