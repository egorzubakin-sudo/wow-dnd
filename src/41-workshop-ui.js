function downloadText(filename, body, type = "application/json") {
  const a = document.createElement("a"),
    url = URL.createObjectURL(new Blob([body], { type }));
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
const sampleRows = {
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
  return demoPack[k]?.[0] || sampleRows[k];
}
const formatNotes={
 items:"quality: common, uncommon, rare, epic, legendary. category: Оружие, Броня, Материалы, Магические предметы, Припасы, Снаряжение, Ездовые питомцы, Прочее или созданная мастером категория.",
 regions:"points: массив пар [x,y] в диапазоне 0–1. При перекрытии выше priority. tier: 1–5.",
 recipes:"rank: требуемый бонус владения. gold: стоимость в зм на один экземпляр. equipment: массив ID инструментов из каталога. experiment: объект с полями skill и dc.",
 ingredients:"Количество списывается при резервировании проекта. Одна строка связывает один рецепт с одним ингредиентом.",
 loot:"weight: положительный относительный вес. min_margin: минимальное превышение Сл. stock: остаток в регионе. min_quantity и max_quantity включительны.",
 errands:"repeat: once, stay, day или period. При period задайте period в игровых днях. conditions поддерживает race, class, level, skill, profession, item, recipe, faction, rep, npc, achievement, quest.",
 rewards:"type: gold, item, rep, contact, discover, achievement. when: success или failure. Для item обязательны item_id и quantity, для rep — faction и amount.",
 diplomacy:"state: alliance, cooperation, neutral, truce, tension, hostility, war.",
 professions:"tools: массив альтернативных владений инструментом. Пустой массив снимает требование. skill: название обязательного навыка.",
 news:"kind: news или rumors. day и year используют календарь компании."
};
formatNotes.hunting=formatNotes.fishing=formatNotes.loot;
function schemaDoc() {
  return {
    format: "atlas-tables",
    version: 1,
    encoding: "UTF-8",
    csvDelimiter: ";",
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
        { title: tables[k][0],
          notes: formatNotes[k]||"", fields: columns(k), example: sampleRow(k) },
      ]),
    ),
  };
}
function workshop() {
  if (actor.role !== "master") return;
  openModal(
    "Мастерская данных",
    '<section class="engine-form">' +
      pick(
        "Справочник",
        "tableKey",
        Object.entries(tables).map(([k, t]) => [k, t[0]]),
        "regions",
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
    button("Описание JSON", () =>
      downloadText("atlas-schema.json", JSON.stringify(schemaDoc(), null, 2)),
    ),
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
      "</dl><p>"+esc(formatNotes[key()]||"")+"</p><p>Для связанных записей можно загрузить единый JSON-объект с ключами справочников.</p>";
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
          plan = planImport(S, pack, mode);
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
          "\n" +
          plan.issues.slice(0, 30).join("\n") +
          "\n" +
          JSON.stringify(pack, null, 2).slice(0, 4800);
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
actions.push((a, { gm }) => {
  if (gm && ["bank", "home"].includes(tab))
    a.append(button("Мастерская данных", workshop));
});
