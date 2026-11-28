function downloadContentSpecification() {
  if (player) return;
  downloadText("atlas-content-specification.json", JSON.stringify(schemaDoc()));
}
function listImportChanges(rows) {
  const labels = { new: "Создание", update: "Обновление", skip: "Пропуск", conflict: "Конфликт" };
  return rows.slice(0, 80).map((r) => labels[r.change] + " · " + r.table + " / " + r.id).join("\n") +
    (rows.length > 80 ? "\n… ещё " + (rows.length - 80) + " записей" : "");
}
function catalogRecords(table, hero = "") {
  if (player || !Object.hasOwn(tables, table)) return;
  const itemCatalog = table === "items";
  const categories = itemCatalog ? [...new Set(records(S, table).map((row) => row.category))].filter(Boolean).sort() : [];
  const pageSize = 60;
  let page = 0;
  openModal(tables[table][0], '<div class="engine-form"><div class="actions" id="catalogActions"></div>' +
    input("Поиск по имени или ID", "catalogQuery", "search") +
    (itemCatalog ? pick("Категория", "catalogCategory", [["", "Все категории"], ...categories.map((c) => [c, c])], "") : "") +
    '<div id="catalogRows"></div><div id="catalogPages" class="actions"></div></div>');
  $("catalogActions").append(button(itemCatalog ? "Новый предмет в каталоге" : "Новая запись", () => editCatalogRow(table)),
    button("CSV и JSON", () => workshop(table)));
  function draw() {
    const query = val("catalogQuery").trim().toLowerCase();
    const category = $("catalogCategory")?.value;
    const candidates = records(S, table).filter((row) =>
      (!category || row.category === category) && (row.id + " " + catalogRowLabel(row)).toLowerCase().includes(query));
    if (itemCatalog) candidates.sort((a, b) => String(catalogRowLabel(a)).localeCompare(catalogRowLabel(b), "ru"));
    const panel = $("catalogRows");
    panel.innerHTML = candidates.length ? "<small>Найдено · " + candidates.length + "</small>" :
      emptyScene("Записи пока не найдены.");
    for (const row of candidates.slice(page * pageSize, (page + 1) * pageSize)) {
      const control = button(catalogRowLabel(row) + " · " + (itemCatalog ? row.category : row.id),
        () => itemCatalog ? openCatalogItem(row.id, hero) : editCatalogRow(table, row));
      control.className = "kit-listrow";
      panel.append(control);
    }
    const pages = $("catalogPages");
    pages.replaceChildren();
    const totalPages = Math.ceil(candidates.length / pageSize);
    if (itemCatalog && totalPages > 1) {
      const previous = button("Назад", () => { page--; draw(); });
      const next = button("Далее", () => { page++; draw(); });
      previous.disabled = page === 0;
      next.disabled = page + 1 === totalPages;
      pages.append(previous, `${page + 1} / ${totalPages}`, next);
    }
  }
  $("catalogQuery").oninput = () => { page = 0; draw(); };
  if (itemCatalog) $("catalogCategory").onchange = () => { page = 0; draw(); };
  draw();
}
function catalogRowLabel(row) {
  return row.name || row.title || [row.service, row.item_id, row.node_id].filter(Boolean).join(" · ") || row.id;
}
function itemCatalogLink(hero = "", label = "Каталог предметов") {
  return !player && actor?.role === "master" && !previewReadOnly
    ? kitLink(label, "catalogRecords('items'," + jsid(hero) + ")", "bank") : "";
}
function openCatalogItem(id, hero = "") {
  if (player || actor?.role !== "master" || previewReadOnly) return;
  const item = records(S, "items").find((row) => row.id === id);
  if (!item) return toast("Предмет не найден в каталоге");
  const quality = ITEM_QUAL.find(([code]) => code === item.quality) || ITEM_QUAL[0];
  openModal(item.name, '<article class="reader item-dossier"><div class="item-dossier-title">' +
    itemIcon(item) + '<div><strong style="color:' + quality[2] + '">' + esc(item.name) + '</strong>' +
    '<small>' + esc([item.category, quality[1], item.hidden ? "Скрыт от игроков" : ""].filter(Boolean).join(" · ")) + '</small></div></div>' +
    (item.desc ? '<p class="record-body">' + esc(item.desc) + '</p>' : '') +
    (item.value_gp != null ? '<p>Цена за единицу · ' + esc(goldText(item.value_gp)) + '</p>' : '') +
    equipmentDetails(item, item) + '<div class="actions" id="catalogItemActions"></div></article>');
  const give = button("Выдать предмет", () => {
    const recipients = [["", "Банк компании"], ...S.company.members.map((m) => [m.id, memberName(m)])];
    commandForm("Выдать · " + item.name,
      pick("Получатель", "catalogRecipient", recipients, hero) +
      input("Количество", "catalogQty", "number", 1, 'required min="1" step="1"') +
      (item.hidden ? '<p class="muted">Выданный предмет будет виден только мастеру.</p>' : ''),
      "grantCatalogItem", () => ({ item: id, hero: val("catalogRecipient"), qty: num("catalogQty") }), "Добавить в хранилище");
  });
  give.className = "primary";
  $("catalogItemActions").append(give,
    button("Редактировать в каталоге", () => editCatalogRow("items", item)),
    button("К списку предметов", () => catalogRecords("items", hero)));
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
      if (sharedGame) return sharedGame.downloadPackageBackup();
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
