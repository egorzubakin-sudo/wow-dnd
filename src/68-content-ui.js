function downloadContentSpecification() {
  if (player) return;
  downloadText("atlas-content-specification.json", JSON.stringify(schemaDoc()));
}
function listImportChanges(rows) {
  const labels = { new: "Создание", update: "Обновление", skip: "Пропуск", conflict: "Конфликт" };
  return rows.slice(0, 80).map((r) => labels[r.change] + " · " + r.table + " / " + r.id).join("\n") +
    (rows.length > 80 ? "\n… ещё " + (rows.length - 80) + " записей" : "");
}
function catalogRecords(table) {
  if (player || !Object.hasOwn(tables, table)) return;
  openModal(tables[table][0], '<div class="engine-form"><div class="actions" id="catalogActions"></div>' +
    input("Поиск по имени или ID", "catalogQuery", "search") + '<div id="catalogRows"></div></div>');
  $("catalogActions").append(button("Новая запись", () => editCatalogRow(table)),
    button("CSV и JSON", () => workshop(table)));
  function draw() {
    const query = val("catalogQuery").toLowerCase();
    const candidates = records(S, table).filter((row) =>
      (row.id + " " + catalogRowLabel(row)).toLowerCase().includes(query));
    const panel = $("catalogRows");
    panel.innerHTML = candidates.length ? "<small>Найдено · " + candidates.length + "</small>" :
      emptyScene("Записи пока не найдены.");
    for (const row of candidates.slice(0, 60)) {
      const control = button(catalogRowLabel(row) + " · " + row.id, () => editCatalogRow(table, row));
      control.className = "kit-listrow";
      panel.append(control);
    }
  }
  $("catalogQuery").oninput = draw;
  draw();
}
function catalogRowLabel(row) {
  return row.name || row.title || [row.service, row.item_id, row.node_id].filter(Boolean).join(" · ") || row.id;
}
function editCatalogRow(table, old = null) {
  if (player) return;
  const tradeRecipe = table === "tradeRecipes";
  const columnsList = columns(table).filter((field) => field.name !== "extra" &&
    !(tradeRecipe && field.name === "trade_product"));
  const materials = tradeRecipe ? S.engine.items.filter((row) =>
    ["Материалы", "Припасы"].includes(row.category) && !row.hidden && row.stackable !== false) : [];
  let ingredients = tradeRecipe ? S.engine.ingredients.filter((row) => row.recipe_id === old?.id) : [];
  const example = sampleRow(table);
  form((old ? "Изменить запись" : "Новая запись") + " · " + tables[table][0],
    columnsList.map((field, i) => {
      const key = "catalogEdit" + i, name = field.name;
      const schema = describeField(table, field, example);
      const label = name + " · " + schema.purpose + (field.optional ? "" : " *");
      const value = old?.[name];
      if (schema.reference) {
        const rows = records(S, schema.reference).map((row) => [row.id, catalogRowLabel(row) + " · " + row.id]);
        return pick(label, key, [["", "Выберите запись"], ...rows], value || "");
      }
      if (field.type === "bool" || schema.allowed)
        return pick(label, key, [["", "Не задано"], ...(schema.allowed || ["true", "false"]).map((x) => [x, x])],
          value == null ? "" : String(value));
      if (field.type === "json")
        return area(label + " (JSON)", key, value == null ? "" : typeof value === "string" ? value : JSON.stringify(value));
      if (["pos", "int", "signed", "num", "ratio"].includes(field.type))
        return input(label, key, "number", value ?? "",
          field.type === "num" || field.type === "ratio" ? 'step="any"' : 'step="1"');
      return input(label, key, "text", value ?? "", name === "id" && old ? "readonly" : "");
    }).join("") + (tradeRecipe ? '<h3>Ингредиенты</h3><div id="tradeIngredientRows"></div><div id="tradeIngredientTools" class="actions"></div>' : ""),
    async () => {
      const next = old ? { ...old } : {};
      for (const [i, field] of columnsList.entries()) next[field.name] = val("catalogEdit" + i);
      if (tradeRecipe) await execute("tradeRecipeEdit", { recipe: next, ingredients: readIngredients() });
      else await execute("import", { pack: { [table]: [next] }, mode: old ? "update" : "new" });
      toast("Запись сохранена");
    }, "Сохранить запись");
  if (!tradeRecipe) return;
  function readIngredients() {
    return ingredients.map((_, i) => ({ item_id: val("tradeIngredient" + i), quantity: num("tradeAmount" + i) }));
  }
  function renderIngredients() {
    const panel = $("tradeIngredientRows");
    panel.replaceChildren();
    if (!ingredients.length) panel.append("Добавьте хотя бы один ингредиент.");
    ingredients.forEach((row, i) => {
      const line = document.createElement("div");
      line.className = "row trade-editor-row";
      line.innerHTML = pick("Материал", "tradeIngredient" + i, pairs(materials), row.item_id) +
        input("Количество", "tradeAmount" + i, "number", row.quantity, 'required min="1" step="1"');
      const remove = button("Убрать", () => {
        ingredients = readIngredients().filter((_, index) => index !== i);
        renderIngredients();
      });
      remove.type = "button";
      line.append(remove);
      panel.append(line);
    });
  }
  const add = button("Добавить ингредиент", () => {
    ingredients = [...readIngredients(), { item_id: materials[0]?.id, quantity: 1 }];
    renderIngredients();
  });
  add.type = "button";
  add.disabled = !materials.length;
  $("tradeIngredientTools").append(add);
  renderIngredients();
}

function contentWorkshop() {
  if (player) return;
  const registry = S.engine.contentPackages || [];
  openModal("Пакеты контента", '<section class="engine-form"><div class="actions" id="packageTools"></div>' +
    '<div id="installedContent"></div>' + input("Файл пакета JSON", "packageFile", "file", "", 'accept=".json,application/json"') +
    area("JSON пакета", "packageRaw") + check("Заменить склад, спрос и бюджет рынка значениями из пакета", "resetPackageMarket", false) +
    '<div class="actions" id="packagePreview"></div><pre id="packageReport" role="status"></pre>' +
    '<div class="actions" id="packageConfirm"></div></section>');
  $("packageTools").append(
    button("Скачать спецификацию для генерации контента", downloadContentSpecification),
    button("Шаблон пакета", () => downloadText("atlas-content-template.json", JSON.stringify(blankContentPackage(), null, 2))),
    button("Собрать пакет из справочников", buildContentPack),
    button("Учебный пакет торговли", () => {
      $("packageRaw").value = JSON.stringify(contentExamples.tradeLoop, null, 2); clearPreview();
    }),
    button("Книжная экипировка", () => {
      $("packageRaw").value = JSON.stringify(contentExamples.bookEquipment, null, 2); clearPreview();
    }),
    button("Скачать резерв перед последним импортом пакета", async () => {
      const backup = await dbGet("pre-content-import");
      if (!backup) return toast("Резерв появится после первого импорта пакета");
      downloadText("atlas-before-package.json", JSON.stringify(backup, null, 2));
    }),
  );
  const installed = $("installedContent");
  installed.innerHTML = '<h3>Установленные пакеты</h3>' + (registry.length ? '' : '<p class="muted">Пакеты пока не установлены.</p>');
  for (const pack of registry) {
    const row = document.createElement("section");
    row.className = "kit-panel";
    row.innerHTML = '<strong>' + esc(pack.name) + '</strong><p class="muted">' +
      esc(pack.id + " · " + pack.version + " · записей: " + pack.records.length +
        (pack.archived ? " · архив" : "")) + '</p><div class="actions"></div>';
    const buttons = row.lastElementChild;
    buttons.append(button("Экспорт пакета", () => downloadText(pack.id + ".json", JSON.stringify(exportContentPack(S, pack.id), null, 2))));
    if (!pack.archived) buttons.append(button("Архивировать пакет", async () => {
      if (!confirm("Архивировать пакет? Записи и история кампании сохранятся.")) return;
      await execute("contentArchive", { id: pack.id });
      contentWorkshop();
    }));
    installed.append(row);
  }
  function clearPreview() {
    $("packageReport").textContent = "";
    $("packageConfirm").replaceChildren();
  }
  $("packageRaw").oninput = $("resetPackageMarket").onchange = clearPreview;
  $("packageFile").onchange = async (event) => {
    const file = event.target.files[0], field = $("packageRaw");
    if (file) {
      const text = await file.text();
      if (!field.isConnected) return;
      field.value = text;
      clearPreview();
    }
  };
  $("packagePreview").append(button("Проверить пакет", () => {
    clearPreview();
    try {
      const pack = JSON.parse(val("packageRaw")), resetMarket = $("resetPackageMarket").checked;
      const plan = contentPlan(S, pack, { resetMarket });
      const c = plan.count;
      const update = (S.engine.contentPackages || []).some((entry) => entry.id === pack.id);
      $("packageReport").textContent = pack.name + " · " + pack.version + "\n" +
        "Создание: " + c.created + " · обновление: " + c.updated + " · ошибки: " + c.errors + "\n" +
        listImportChanges(plan.changes) + "\n" + plan.issues.join("\n");
      if (c.errors) return;
      const token = crypto.randomUUID();
      $("packageConfirm").append(button(update ? "Подтвердить обновление пакета" : "Установить пакет", async () => {
        await execute("contentImport", { pack, resetMarket }, token);
        contentWorkshop();
        toast("Пакет сохранён · " + pack.name);
      }), button("Отменить", clearPreview));
    } catch (error) {
      $("packageReport").textContent = error.message;
    }
  }));
}
function buildContentPack() {
  const options = Object.keys(tables).filter((table) => records(S, table).length);
  form("Создать пакет из справочников",
    input("ID пакета", "cpId", "text", "", "required") +
    input("Версия X.Y.Z", "cpVersion", "text", "1.0.0", "required") +
    input("Название", "cpName", "text", "", "required") +
    input("Автор", "cpAuthor", "text", actor.name, "required") +
    area("Описание", "cpDescription", "") +
    area("Источники · JSON", "cpSources", JSON.stringify([{ origin: "house" }])) +
    area("Зависимости · JSON", "cpDependencies", "[]") +
    options.map((table, i) => check(tables[table][0], "cpTable" + i, false)).join(""),
    () => {
      const data = {}, included = new Set();
      for (const [i, table] of options.entries()) {
        if (!$("cpTable" + i).checked) continue;
        data[table] = records(S, table).filter((row) => {
          const key = catalogIdentity(table, row.id);
          if (included.has(key)) return false;
          included.add(key);
          return true;
        }).map((row) => contentDefinition(table, row));
      }
      requireThat(included.size, "Выберите справочники");
      const pack = { ...blankContentPackage(), id: val("cpId"), version: val("cpVersion"), name: val("cpName"),
        author: val("cpAuthor"), description: val("cpDescription"), sources: JSON.parse(val("cpSources")),
        dependencies: JSON.parse(val("cpDependencies")), tables: data };
      contentMetadata(pack);
      downloadText(pack.id + ".json", JSON.stringify(pack, null, 2));
    }, "Скачать пакет");
}
