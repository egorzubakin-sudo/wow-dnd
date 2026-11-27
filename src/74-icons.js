const iconDefaults = /*ATLAS_ICON_DEFAULTS*/ null;
let iconIndexRequest;

function iconPath(id) {
  const parts =
    typeof id === "string" &&
    /^(armour|weapons|creatures|places|trade|misc):([A-Za-z0-9_-][A-Za-z0-9_.-]*)$/.exec(
      id,
    );
  return parts ? "assets/icons/" + parts[1] + "/" + parts[2] + ".png" : "";
}
function libraryIconSrc(record, defaultId) {
  return (
    safeImage(record?.image) ||
    safeImage(record?.icon) ||
    iconPath(record?.iconId) ||
    iconPath(defaultId)
  );
}
function libraryIcon(record, defaultId, fallback = "◆") {
  const src = libraryIconSrc(record, defaultId);
  return (
    '<span class="kit-iconbox" aria-hidden="true">' +
    (src
      ? '<img src="' + esc(src) + '" alt="">'
      : esc(record?.icon || fallback)) +
    "</span>"
  );
}
function professionIcon(profession) {
  return libraryIcon(
    profession,
    iconDefaults.professions[profession?.id],
    "⚒",
  );
}
function itemIcon(item) {
  return libraryIcon(item, iconDefaults.items[item?.item_id || item?.id]);
}
function stackIconSrc(stack, catalog = S.engine.items.find((item) => item.id === stack.item_id)) {
  return safeImage(stack.image) || safeImage(stack.icon) || safeImage(catalog?.image) ||
    safeImage(catalog?.icon) || iconPath(stack.iconId) || iconPath(catalog?.iconId) ||
    iconPath(iconDefaults.items[stack.item_id]);
}
function uiIcon(name) {
  return libraryIcon(
    null,
    iconDefaults.components[name] || iconDefaults.nav[name],
  );
}
function loadIconIndex() {
  iconIndexRequest ??= fetch("icons.json")
    .then((response) => {
      if (!response.ok) throw Error("Не удалось открыть icons.json.");
      return response.json();
    })
    .catch((error) => {
      iconIndexRequest = null;
      throw error;
    });
  return iconIndexRequest;
}

function openIconPicker({
  category = "",
  current = {},
  onSave,
  allowUpload = true,
}) {
  const dialog = document.createElement("dialog");
  dialog.className = "atlas-icon-picker";
  dialog.setAttribute("aria-label", "Библиотека иконок");
  document.body.append(dialog);
  let selected = current.iconId || "",
    image = safeImage(current.image),
    page = 0;
  let icons = [],
    filtered = [];
  const perPage = 48,
    key = (id) => dialog.querySelector("#" + id);
  dialog.innerHTML =
    '<header><h2>Библиотека иконок</h2><button type="button" id="closeIcons" aria-label="Закрыть">×</button></header>' +
    '<div class="icon-filters"><label>Имя файла<input id="iconSearch" type="search" placeholder="Например, Copper"></label>' +
    '<label>Категория<select id="iconCategory"><option value="">Все категории</option></select></label></div>' +
    '<p id="iconPickerStatus" role="status">Загрузка библиотеки…</p><label id="iconLocalIndex" hidden>Открыть icons.json<input id="iconLocalFile" type="file" accept=".json,application/json"></label><div id="iconResults" class="icon-picker-grid"></div>' +
    '<nav class="icon-pagination" aria-label="Страницы иконок"><button id="iconPrev">Назад</button>' +
    '<span id="iconPage"></span><button id="iconNext">Далее</button></nav>' +
    '<div class="icon-picker-preview"><div id="iconPreview"></div><div><strong>Предпросмотр</strong><p id="iconSelected"></p></div></div>' +
    (allowUpload
      ? '<div class="icon-upload"><label>Своя иконка<input id="iconUpload" type="file" accept="image/*"></label>' +
        '<button type="button" id="removeCustomIcon">Убрать свою</button></div>'
      : "") +
    '<footer><button type="button" id="clearIconChoice">Использовать стандартную</button>' +
    '<button type="button" class="primary" id="saveIconChoice">Применить</button></footer>';
  function preview() {
    const entry = icons.find((x) => x.id === selected);
    key("iconPreview").innerHTML = libraryIcon(
      { image, iconId: selected },
      current.defaultId,
    );
    key("iconSelected").textContent = image
      ? "Показана своя иконка. Она имеет приоритет над библиотекой."
      : entry?.file ||
        (selected ? "Иконка из библиотеки" : "Стандартная иконка");
    if (key("removeCustomIcon")) key("removeCustomIcon").disabled = !image;
  }
  function showPage() {
    const pages = Math.max(1, Math.ceil(filtered.length / perPage));
    page = Math.min(page, pages - 1);
    key("iconResults").innerHTML = filtered
      .slice(page * perPage, (page + 1) * perPage)
      .map(
        (entry) =>
          '<button type="button" aria-pressed="' +
          (entry.id === selected) +
          '" data-icon-id="' +
          esc(entry.id) +
          '" title="' +
          esc(entry.file) +
          '">' +
          '<img src="' +
          esc(entry.path) +
          '" loading="lazy" alt=""><span>' +
          esc(entry.file) +
          "</span></button>",
      )
      .join("");
    key("iconPage").textContent = page + 1 + " / " + pages;
    key("iconPrev").disabled = page === 0;
    key("iconNext").disabled = page + 1 === pages;
  }
  function search() {
    const query = key("iconSearch").value.trim().toLowerCase(),
      cat = key("iconCategory").value;
    filtered = icons.filter(
      (entry) =>
        (!cat || entry.categories.includes(cat)) &&
        entry.file.toLowerCase().includes(query),
    );
    page = 0;
    key("iconPickerStatus").textContent = filtered.length
      ? "Найдено: " + filtered.length
      : "Иконок с таким именем нет.";
    showPage();
  }
  key("iconSearch").oninput = search;
  key("iconCategory").onchange = search;
  key("iconResults").onclick = (event) => {
    const target = event.target.closest("[data-icon-id]");
    if (!target) return;
    key("iconResults")
      .querySelector('[aria-pressed="true"]')
      ?.setAttribute("aria-pressed", "false");
    selected = target.dataset.iconId;
    target.setAttribute("aria-pressed", "true");
    preview();
  };
  key("iconPrev").onclick = () => {
    page--;
    showPage();
  };
  key("iconNext").onclick = () => {
    page++;
    showPage();
  };
  key("clearIconChoice").onclick = () => {
    selected = "";
    showPage();
    preview();
  };
  if (allowUpload) {
    key("iconUpload").onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const save = key("saveIconChoice");
      save.disabled = true;
      try {
        image = await readImage(file);
        preview();
      } catch (error) {
        key("iconPickerStatus").textContent = error.message;
      } finally {
        save.disabled = false;
      }
    };
    key("removeCustomIcon").onclick = () => {
      image = "";
      key("iconUpload").value = "";
      preview();
    };
  }
  key("saveIconChoice").onclick = () => {
    try {
      onSave({ iconId: selected, image });
      dialog.close();
    } catch (error) {
      key("iconPickerStatus").textContent = error.message;
    }
  };
  key("closeIcons").onclick = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") event.stopPropagation();
  });
  dialog.showModal();
  preview();
  function setRegistry(registry) {
    if (!dialog.open) return;
    if (!Array.isArray(registry?.icons) || !registry.categories)
      throw Error("Неверный формат icons.json.");
    icons = registry.icons.filter(
      (entry) =>
        entry &&
        typeof entry.file === "string" &&
        Array.isArray(entry.categories) &&
        iconPath(entry.id) &&
        iconPath(entry.id) === entry.path,
    );
    key("iconCategory").replaceChildren(
      new Option("Все категории", ""),
      ...Object.entries(registry.categories).map(
        ([id, name]) => new Option(name, id),
      ),
    );
    key("iconCategory").value = Object.hasOwn(registry.categories, category)
      ? category
      : "";
    key("iconLocalIndex").hidden = true;
    search();
    preview();
  }
  key("iconLocalFile").onchange = async (event) => {
    if (!event.target.files[0]) return;
    try {
      setRegistry(JSON.parse(await event.target.files[0].text()));
    } catch (error) {
      key("iconPickerStatus").textContent = error.message;
    }
  };
  loadIconIndex()
    .then(setRegistry)
    .catch(() => {
      if (!dialog.open) return;
      key("iconPickerStatus").textContent =
        "Откройте icons.json из папки Атласа или запустите приложение через localhost.";
      key("iconLocalIndex").hidden = false;
      showPage();
    });
}
function pickProfessionIcon(id) {
  if (player) return;
  const p = S.engine.professions.find((x) => x.id === id);
  if (!p) return;
  openIconPicker({
    category: "professions",
    current: { ...p, defaultId: iconDefaults.professions[id] },
    onSave: (choice) => {
      if (player) return;
      Object.assign(p, choice);
      commit();
    },
  });
}
function pickRecipeItemIcon(id) {
  if (player) return;
  const item = S.engine.items.find((x) => x.id === id);
  pickRecordIcon(item, itemIconCategory(item), iconDefaults.items[id]);
}
function itemIconCategory(item) {
  const categories = {
    Материалы: "resources",
    Оружие: "equipment",
    Броня: "equipment",
    "Магические предметы": "magic",
    Припасы: "consumables",
    "Ездовые питомцы": "mounts",
  };
  return categories[item?.category] || "";
}
function pickNavigationIcon(key) {
  if (player || !iconBands.some(([, rows]) => rows.some(([id]) => id === key))) return;
  openIconPicker({
    category: "navigation",
    current: {
      iconId: S.settings.navIconIds?.[key],
      image: S.settings.navIcons?.[key],
      defaultId: iconDefaults.nav[additionalNavIcons[key] || key],
    },
    onSave: ({ iconId, image }) => {
      if (player) return;
      (S.settings.navIconIds ??= {})[key] = iconId;
      (S.settings.navIcons ??= {})[key] = image;
      commit();
      editNavIcons();
    },
  });
}
function pickRecordIcon(record, category, defaultId, imageKey = "image") {
  if (player || !record) return;
  openIconPicker({
    category,
    current: { iconId: record.iconId, image: record[imageKey], defaultId },
    onSave: ({ iconId, image }) => {
      if (player) return;
      record.iconId = iconId;
      record[imageKey] = image;
      commit();
    },
  });
}
function pickPortalIcon(kind, id, category) {
  const record = portalData()[kind]?.find((row) => row.id === id);
  pickRecordIcon(record, category,
    kind === "people" ? iconDefaults.components.hero : iconDefaults.nav[kind],
  );
}
function pickInventoryIcon(id) {
  if (player) return;
  const stack = S.company.inventory.find((row) => row.id === id);
  if (stack) pickRecordIcon(stack, itemIconCategory(stack), iconDefaults.items[stack.item_id]);
}
function pickQuestIcon(id) {
  if (player) return;
  pickRecordIcon(S.contracts.find((row) => row.id === id), "quests", iconDefaults.nav.contracts, "badgeImage");
}
const campBranchIcons = ["weapons:Bow_01", "misc:Gear_01", "misc:Bag_01", "misc:Book_01"];
function pickTalentIcon(name, branch) {
  if (player || !TALENTS[branch]?.[1].includes(name)) return;
  openIconPicker({
    category: "upgrades",
    current: { ...S.settings.visual?.talentIcons?.[name], defaultId: campBranchIcons[branch] },
    onSave: (choice) => {
      if (player) return;
      const visual = S.settings.visual ??= {};
      (visual.talentIcons ??= {})[name] = choice;
      commit();
    },
  });
}


document.addEventListener("error", (event) => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement) || !img.hasAttribute("src")) return;
  const src = img.getAttribute("src");
  const fallback = img.classList.contains("kit-cover-image") || img.classList.contains("kit-card-art")
    ? kitArtUrl("camp") : iconPath(iconDefaults.components.hero);
  if (img.dataset.atlasFallback || src === fallback) {
    img.removeAttribute("src");
    img.alt = "";
    img.classList.add("atlas-image-missing");
    return;
  }
  img.dataset.atlasFallback = "true";
  img.src = fallback;
}, true);
