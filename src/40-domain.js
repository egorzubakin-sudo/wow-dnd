// Field tokens: suffix ? means optional, @table denotes a foreign key.
const tables = {
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
    "id name category quality value_gp:num desc? icon? image? unit? profession_id:@professions? stackable:bool? properties:json?",
  ],
  professions: [
    "Профессии",
    "engine.professions",
    "id name kind? summary? description? special? icon? tools:json? skill?",
  ],
  recipes: [
    "Рецепты",
    "engine.recipes",
    "id name profession_id:@professions item_id:@items quantity:pos hours:pos rank:pos gold:num? basic:bool? service? tools:json? locations:json? properties:json? experiment:json? image? description? acquisition? equipment:json? conditions:json?",
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
    "id title category? body? points:int? engineEvent? scope? secret:bool? hidden:bool?",
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
function columns(k) {
  return (
    tables[k][2] +
    (tables[k][2].includes(" source?") ? " provenance:json?" : " source:json?")
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
    [names, ...rows.map((r) => names.map((n) => r[n]))]
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
  for (const c of columns(k)) {
    let v = row[c.name];
    if (k === "items" && c.name === "quality") v ??= row.rarity;
    if (k === "items" && c.name === "desc") v ??= row.description;
    if (["professions", "recipes"].includes(k) && c.name === "description")
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
  if (k === "items")
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
  return out;
}
function planImport(s, pack, mode) {
  requireThat(
    ["new", "update", "skip", "replace"].includes(mode),
    "Неизвестный режим",
  );
  const next = structuredClone(s),
    count = { created: 0, updated: 0, skipped: 0, errors: 0 },
    issues = [];
  adventure(next);
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
  for (const [k, rows] of Object.entries(pack)) {
    requireThat(
      Object.hasOwn(tables, k) && Array.isArray(rows),
      "Неизвестный справочник " + k,
    );
    const target = arr(next, k),
      seen = new Set();
    if (mode === "replace") {
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
            if (mode === "new") throw Error("ID уже существует");
            if (mode === "skip") {
              count.skipped++;
              return;
            }
            Object.assign(old, v);
            count.updated++;
          } else {
            dest.push(v);
            count.created++;
          }
        },
        k + " #" + (i + 1),
      ),
    );
  }
  const keys = Object.keys(tables).filter(
    (k) => !["hunting", "fishing"].includes(k),
  );
  const ids = Object.fromEntries(
    keys.map((k) => [k, new Set(records(next, k).map((x) => x.id))]),
  );
  for (const k of keys) {
    for (const r of records(next, k)) {
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
  return { next, count, issues };
}
register("import", "master", (s, p) => {
  const plan = planImport(s, p.pack, p.mode);
  requireThat(!plan.count.errors, plan.issues.join("\n"));
  Object.assign(s, plan.next);
});
