let craftTab = "professions",
  craftProfession = "",
  craftRecipe = "",
  craftQuery = "",
  craftQuality = "",
  craftFilter = "",
  craftSort = "name";
const professionRanks = [
  "Ученик",
  "Подмастерье",
  "Эксперт",
  "Искусник",
  "Мастер",
];
function openCraftTab(section, profession = "") {
  craftTab = section;
  if (profession) {
    craftProfession = profession;
    craftRecipe = "";
  }
  closeModal();
  switchTab("craft");
}
function professionRank(p, id) {
  return S.engine.requireTrainer
    ? Math.min(bv(p), p.trained?.[id] || 2)
    : bv(p);
}
function sourceLabel(source) {
  return source?.book === "wow"
    ? "D&D: World of Warcraft · с. " + source.printed_page
    : source?.origin === "house"
      ? "Домашняя механика Атласа"
      : "";
}
function knownRecipe(p, r) {
  return !!(
    r.basic ||
    p.recipes.includes(r.id) ||
    activeEffects(S).some((e) => e.recipes?.includes(r.id))
  );
}
function recipeAvailability(hero, p, r, quote) {
  const reasons = [];
  const profession = S.engine.professions.find((v) => v.id === r.profession_id);
  if (!knownRecipe(p, r)) reasons.push("Рецепт не изучен");
  if (!profession) reasons.push("Профессия отсутствует в справочнике");
  else if (!learnedProfession(p, profession.id))
    reasons.push("Профессия не изучена");
  else if (!eligibleProfession(S, p, profession.id))
    reasons.push(professionRequirements(profession));
  if (professionRank(p, r.profession_id) < (r.rank || 2))
    reasons.push("Требуется БВ +" + (r.rank || 2));
  if (!currentStay(S)) reasons.push("Нужна активная стоянка");
  else if (!facilities(S, r))
    reasons.push("Недоступно нужное место или сооружение");
  if (currentStay(S) && remaining(S, hero) <= 0)
    reasons.push("Время стоянки исчерпано");
  if (r.tools?.some((t) => !p.tools.includes(t)))
    reasons.push("Нужно владение инструментами рецепта");
  if (
    r.equipment?.some(
      (id) =>
        !S.company.inventory.some(
          (x) => x.owner === "member:" + hero && x.item_id === id && x.qty > 0,
        ),
    )
  )
    reasons.push("В сумках нет нужного оборудования");
  if (r.conditions && !meetsConditions(S, hero, r.conditions))
    reasons.push("Особые условия рецепта не выполнены");
  if (!reasons.length && !canCraft(S, hero, r))
    reasons.push("Условия изготовления не выполнены");
  if (quote.wallet < quote.cost) reasons.push("Не хватает золота");
  if (quote.materials.some((x) => x.have < x.qty))
    reasons.push("Не хватает материалов");
  return reasons;
}
function recipeQuality(item) {
  const row = ITEM_QUAL.find(([key]) => key === item?.quality);
  return row ? row[1] : "Обычный";
}
function renderCraft() {
  const hero = chosen();
  $("main").innerHTML =
    '<div class="screen game-screen"><section class="card game-cover"><div class="game-intro"><h2>Ремесло</h2><div class="actions" id="craftHeroLinks"></div></div>' +
    gameHero(hero, currentStay(S)) +
    '</section><div class="actions game-tabs" id="craftTabs"></div><section id="craftBody"></section></div>';
  bindGameHero(hero);
  if (hero) $("craftHeroLinks").append(button("Личные сумки", bagPage));
  if (!player)
    $("craftHeroLinks").append(button("Редактор профессий", professionEditor));
  for (const [id, label] of [
    ["professions", "Профессии"],
    ["recipes", "Книга рецептов"],
    ["projects", "Проекты"],
  ]) {
    const b = button(label, () => {
      craftTab = id;
      renderCraft();
    });
    b.setAttribute("aria-pressed", String(craftTab === id));
    $("craftTabs").append(b);
  }
  const root = $("craftBody");
  if (craftTab === "professions") renderProfessionCards(root, hero);
  if (craftTab === "recipes") renderRecipeList(root, hero);
  if (craftTab === "projects") renderProjects(root, hero);
}
let professionGroup = "gathering";
function renderProfessionCards(root, hero) {
  root.replaceChildren();
  const p = hero ? profile(S, hero) : null;
  root.className = "stack";
  const tabs = document.createElement("div");
  tabs.className = "actions game-tabs";
  const grid = document.createElement("div");
  grid.className = "activity-grid";
  root.append(tabs, grid);
  for (const [kind, label] of [
    ["gathering", "Добывающие"],
    ["production", "Производственные"],
  ]) {
    const tab = button(label, () => {
      professionGroup = kind;
      renderProfessionCards(root, hero);
    });
    tab.setAttribute("aria-pressed", String(kind === professionGroup));
    tabs.append(tab);
  }
  if (hero && owned(actor, hero))
    tabs.append(
      button("Настроить профессии героя", () =>
        editMember(hero, "heroProfessions"),
      ),
    );
  for (const profession of S.engine.professions) {
    if ((profession.kind || "production") !== professionGroup) continue;
    const eligible = p && eligibleProfession(S, p, profession.id);
    const rank = eligible ? professionRank(p, profession.id) : 0;
    const known = S.engine.recipes.filter(
      (r) => r.profession_id === profession.id && p && knownRecipe(p, r),
    );
    const card = document.createElement("article");
    card.className = "card profession-card";
    card.innerHTML =
      "<h3>" +
      gameIcon(profession.icon) +
      esc(profession.name) +
      "</h3>" +
      "<small>" +
      esc(
        (profession.kind === "gathering"
          ? "Добыча и исследование"
          : "Производство") +
          (p
            ? eligible
              ? " · " + (professionRanks[rank - 2] || "БВ +" + rank)
              : learnedProfession(p, profession.id)
                ? " · Не хватает владения"
                : " · Не изучена"
            : ""),
      ) +
      "</small>" +
      "<p>" +
      esc(profession.summary || "Краткое описание пока не добавлено.") +
      "</p>" +
      '<p class="muted">' +
      esc(professionRequirements(profession)) +
      "</p>" +
      (profession.kind === "gathering"
        ? ""
        : "<small>Известных рецептов · " + known.length + "</small>") +
      "<details><summary>Механика и источник</summary><p>" +
      esc(profession.description || "Описание механики пока не добавлено.") +
      "</p>" +
      (profession.special ? "<p>" + esc(profession.special) + "</p>" : "") +
      (sourceLabel(profession.source)
        ? "<small>" + esc(sourceLabel(profession.source)) + "</small>"
        : "") +
      "</details>";
    const controls = document.createElement("div");
    controls.className = "actions";
    if (profession.kind === "gathering")
      controls.append(button("К занятиям", () => switchTab("stay")));
    else
      controls.append(
        button("Рецепты", () => openCraftTab("recipes", profession.id)),
      );
    if (eligible && S.engine.requireTrainer && bv(p) > rank)
      controls.append(
        button("Обучиться", () =>
          commandForm(
            "Обучение",
            "<p>" + esc(bv(p)) + " дн. · " + esc(bv(p) * 2) + " зм</p>",
            "train",
            () => ({ hero, profession: profession.id }),
          ),
        ),
      );
    card.append(controls);
    grid.append(card);
  }
  if (!grid.children.length)
    grid.textContent = "В этой группе пока нет профессий.";
}
function renderRecipeList(root, hero) {
  root.className = "";
  if (!S.engine.recipes.length) {
    root.innerHTML =
      '<div class="card"><h3>Книга рецептов пока пуста</h3><p class="muted">Рецепты появятся после загрузки справочника мастером.</p></div>';
    if (!player)
      root.firstElementChild.append(
        button("Открыть мастерскую", () => switchTab("workshop")),
      );
    return;
  }
  const p = hero ? profile(S, hero) : null;
  root.innerHTML =
    '<div class="card recipe-filters">' +
    input("Поиск по рецептам", "recipeQuery", "search", craftQuery) +
    pick(
      "Профессия",
      "recipeProfession",
      [["", "Все"], ...pairs(S.engine.professions)],
      craftProfession,
    ) +
    pick(
      "Редкость",
      "recipeQuality",
      [["", "Все"], ...ITEM_QUAL.map(([id, label]) => [id, label])],
      craftQuality,
    ) +
    pick(
      "Доступность",
      "recipeFilter",
      [
        ["", "Все"],
        ["known", "Известные"],
        ["ready", "Можно изготовить"],
        ["missing", "Не хватает материалов"],
        ["locked", "Недоступные"],
      ],
      craftFilter,
    ) +
    pick(
      "Сортировка",
      "recipeSort",
      [
        ["name", "По названию"],
        ["time", "По времени"],
        ["quality", "По редкости"],
      ],
      craftSort,
    ) +
    '</div><div class="recipe-layout"><div id="recipeList" class="recipe-list" aria-label="Рецепты"></div><article id="recipeDetail" class="card recipe-detail"></article></div>';
  function refresh() {
    craftQuery = val("recipeQuery");
    craftProfession = val("recipeProfession");
    craftQuality = val("recipeQuality");
    craftFilter = val("recipeFilter");
    craftSort = val("recipeSort");
    const rows = S.engine.recipes
      .map((r) => {
        const item = S.engine.items.find((i) => i.id === r.item_id);
        const quote = hero
          ? projectQuote(S, { hero, recipe: r.id, qty: 1 })
          : null;
        const reasons = quote
          ? recipeAvailability(hero, p, r, quote)
          : ["Выберите героя"];
        return { r, item, quote, reasons };
      })
      .filter(
        ({ r, item, quote, reasons }) =>
          (!craftProfession || r.profession_id === craftProfession) &&
          (!craftQuality || item?.quality === craftQuality) &&
          (r.name + " " + (item?.name || ""))
            .toLocaleLowerCase("ru")
            .includes(craftQuery.trim().toLocaleLowerCase("ru")) &&
          (!craftFilter ||
            (craftFilter === "known" && p && knownRecipe(p, r)) ||
            (craftFilter === "ready" && !reasons.length) ||
            (craftFilter === "missing" &&
              quote?.materials.some((x) => x.have < x.qty)) ||
            (craftFilter === "locked" && reasons.length)),
      );
    rows.sort(
      (a, b) =>
        (craftSort === "time"
          ? a.r.hours - b.r.hours
          : craftSort === "quality"
            ? ITEM_QUAL.findIndex(([k]) => k === a.item?.quality) -
              ITEM_QUAL.findIndex(([k]) => k === b.item?.quality)
            : 0) || a.r.name.localeCompare(b.r.name, "ru"),
    );
    const list = $("recipeList"),
      detail = $("recipeDetail");
    list.replaceChildren();
    const selected = rows.find((x) => x.r.id === craftRecipe) || rows[0];
    detail.hidden = !selected;
    if (!selected) {
      list.textContent = "Рецепты по выбранным фильтрам не найдены.";
      return;
    }
    craftRecipe = selected.r.id;
    for (const row of rows) {
      const b = button(row.r.name, () => {
        craftRecipe = row.r.id;
        refresh();
        if (matchMedia("(max-width: 700px)").matches)
          $("recipeDetail").scrollIntoView({ block: "start" });
      });
      b.className = "recipe-option";
      b.setAttribute("aria-pressed", String(row === selected));
      b.innerHTML =
        gameIcon(row.item?.icon, row.item?.image) +
        '<span><strong class="rarity-' +
        esc(row.item?.quality || "common") +
        '">' +
        esc(row.r.name) +
        "</strong><small>" +
        timeLabel(row.quote?.work ?? row.r.hours) +
        " · " +
        esc(recipeQuality(row.item)) +
        "</small></span>" +
        '<small class="' +
        (row.reasons.length ? "game-bad" : "game-good") +
        '">' +
        esc(row.reasons[0] || "Доступно") +
        "</small>";
      list.append(b);
    }
    renderRecipeDetail(detail, hero, p, selected.r, selected.item);
  }
  for (const id of [
    "recipeQuery",
    "recipeProfession",
    "recipeQuality",
    "recipeFilter",
    "recipeSort",
  ])
    $(id).oninput = refresh;
  refresh();
}
function renderRecipeDetail(root, hero, p, r, item) {
  const names = (ids) =>
    (ids || []).map(
      (id) => S.engine.items.find((i) => i.id === id)?.name || id,
    );
  const profession = S.engine.professions.find((p) => p.id === r.profession_id);
  const requirements = [
    r.service,
    ...(r.tools || []),
    ...names(r.equipment),
    ...(r.locations || []).map((id) => node(id)?.name || id),
  ];
  root.innerHTML =
    "<h3>" +
    gameIcon(item?.icon, item?.image) +
    esc(r.name) +
    '</h3><p class="rarity-' +
    esc(item?.quality || "common") +
    '">' +
    esc(recipeQuality(item)) +
    "</p><p>" +
    esc(
      r.description ||
        r.desc ||
        item?.desc ||
        item?.description ||
        "Описание предмета пока не добавлено.",
    ) +
    '</p><p class="muted">' +
    esc(
      (profession?.name || "Профессия не задана") + " · БВ +" + (r.rank || 2),
    ) +
    "</p>" +
    (requirements.length
      ? "<p>Место и оборудование · " + esc(requirements.join(" · ")) + "</p>"
      : "") +
    '<div id="craftInputs"></div><div id="craftCosts"></div><div class="actions" id="craftSubmit"></div>';
  if (!hero) {
    $("craftCosts").textContent =
      "Выберите героя, чтобы сверить материалы и время.";
    return;
  }
  $("craftInputs").innerHTML =
    input(
      "Количество",
      "craftQty",
      "number",
      1,
      'min="1" max="1000" step="1"',
    ) +
    (r.gold
      ? "<details><summary>Оплатить часть стоимости ресурсом</summary>" +
        pick(
          "Ресурс",
          "craftResource",
          [
            ["", "Монеты"],
            ...pairs(
              S.engine.items.filter(
                (i) => i.profession_id === r.profession_id && i.value_gp > 0,
              ),
            ),
          ],
          "",
        ) +
        input("Стоимость ресурса, зм", "craftCredit", "number", 0, 'min="0"') +
        "</details>"
      : "");
  const payload = () => ({
    hero,
    recipe: r.id,
    qty: num("craftQty"),
    resource: $("craftResource")?.value,
    credit: $("craftCredit") ? num("craftCredit") : 0,
  });
  const create = button("Создать", async () => {
    const chosenPayload = payload();
    create.disabled = true;
    try {
      await execute("craft", chosenPayload);
      const project = S.engine.projects.at(-1);
      if (project.status === "active") openCraftTab("projects");
      toast(
        project.status === "done"
          ? "Изготовлено: " + project.name
          : project.status === "failed"
            ? "Проверка изготовления не удалась"
            : "Материалы зарезервированы. Проект можно продолжить на стоянке.",
      );
    } finally {
      if (create.isConnected) refresh();
    }
  });
  create.className = "primary";
  $("craftSubmit").append(create);
  function refresh() {
    const box = $("craftCosts");
    try {
      const quote = projectQuote(S, payload());
      const reasons = recipeAvailability(hero, p, r, quote);
      create.disabled = !!reasons.length || !owned(actor, hero);
      create.textContent =
        quote.work > remaining(S, hero) && !create.disabled
          ? "Начать проект"
          : "Создать";
      box.innerHTML =
        "<h4>Необходимые материалы</h4>" +
        (quote.materials.length
          ? quote.materials
              .map((x) => {
                const material = S.engine.items.find((i) => i.id === x.item);
                return (
                  '<div class="material-line">' +
                  gameIcon(material?.icon, material?.image) +
                  "<span>" +
                  esc(material?.name || x.item) +
                  '</span><strong class="' +
                  (x.have >= x.qty ? "game-good" : "game-bad") +
                  '">' +
                  esc(x.have + " / " + x.qty) +
                  "</strong></div>"
                );
              })
              .join("")
          : '<p class="muted">Ингредиенты не требуются.</p>') +
        "<p>Время · " +
        timeLabel(quote.work) +
        ' · <span class="' +
        (quote.wallet >= quote.cost ? "game-good" : "game-bad") +
        '">' +
        esc(quote.cost + " зм") +
        "</span> · Результат × " +
        esc(payload().qty * r.quantity) +
        "</p>" +
        (reasons.length
          ? '<p class="game-bad">' + esc(reasons.join(" · ")) + "</p>"
          : quote.work > remaining(S, hero)
            ? '<p class="muted">Материалы будут зарезервированы. Часы можно внести в разделе проектов.</p>'
            : "");
    } catch (error) {
      create.disabled = true;
      box.textContent = error.message;
    }
  }
  for (const id of ["craftQty", "craftResource", "craftCredit"])
    if ($(id)) $(id).oninput = refresh;
  refresh();
}
function renderProjects(root, hero) {
  root.className = "stack";
  const groups = { active: [], paused: [], done: [] };
  const labels = {
    active: "Активные",
    paused: "Приостановленные",
    done: "Завершённые",
  };
  for (const j of S.engine.projects) {
    if (player && !owned(actor, j.hero)) continue;
    const canContinue =
      hero &&
      facilities(S, j.recipe) &&
      remaining(S, hero) >= 1 &&
      eligibleProfession(S, profile(S, hero), j.recipe.profession_id);
    const key =
      j.status === "active" ? (canContinue ? "active" : "paused") : "done";
    groups[key].push(j);
  }
  for (const [key, rows] of Object.entries(groups)) {
    const section = document.createElement("section");
    section.className = "card game-section";
    section.innerHTML = "<h3>" + labels[key] + "</h3>";
    if (!rows.length)
      section.insertAdjacentHTML(
        "beforeend",
        '<p class="muted">В этом списке пока нет проектов.</p>',
      );
    for (const j of rows) {
      const row = document.createElement("article"),
        member = S.company.members.find((m) => m.id === j.hero);
      row.className = "project-row";
      const reserved = j.reserve.map(
        (line) =>
          (S.engine.items.find((i) => i.id === line.item)?.name || line.item) +
          " × " +
          line.qty,
      );
      const workers = j.contributors.map((c) => {
        const person = c.staff
          ? S.company.staff.find((m) => m.id === c.staff)
          : S.company.members.find((m) => m.id === c.hero);
        return person ? memberName(person) : "Бывший участник";
      });
      const status = {
        active: key === "paused" ? "Ожидает подходящей стоянки" : "В работе",
        done: "Готово",
        failed: "Неудача",
        cancelled: "Отменён",
      };
      row.innerHTML =
        "<h4>" +
        esc(j.name) +
        "</h4><p>" +
        esc(
          [
            member ? memberName(member) : "Бывший участник",
            status[j.status],
            "Осталось " + timeLabel(j.left),
          ].join(" · "),
        ) +
        '</p><progress aria-label="Ход проекта" max="' +
        esc(j.work) +
        '" value="' +
        esc(j.work - j.left) +
        '"></progress>' +
        '<p class="muted">' +
        (j.status === "active" ? "В резерве" : "Материалы проекта") +
        " · " +
        esc(reserved.join(", ") || "без материалов") +
        "</p>" +
        (workers.length
          ? '<p class="muted">Участники · ' +
            esc([...new Set(workers)].join(", ")) +
            "</p>"
          : "");
      if (hero && j.status === "active") {
        const max = Math.floor(Math.min(j.left, remaining(S, hero)));
        if (
          max > 0 &&
          facilities(S, j.recipe) &&
          eligibleProfession(S, profile(S, hero), j.recipe.profession_id)
        )
          row.append(
            button("Продолжить", () =>
              commandForm(
                "Продолжить проект",
                input(
                  "Часов",
                  "wh",
                  "number",
                  max,
                  'min="1" max="' + max + '"',
                ),
                "work",
                () => ({ hero, project: j.id, hours: num("wh") }),
              ),
            ),
          );
        if (hero === j.hero)
          row.append(
            button("Отменить проект", () =>
              commandForm(
                "Отмена проекта",
                "<p>Возврат материалов · " +
                  esc((S.engine.refund ?? 1) * 100) +
                  "%</p>",
                "cancelProject",
                () => ({ hero, project: j.id }),
              ),
            ),
          );
      }
      section.append(row);
    }
    root.append(section);
  }
  if (!S.engine.projects.length)
    root.append(
      button("Открыть книгу рецептов", () => openCraftTab("recipes")),
    );
}
function heroStats() {
  const id = chosen(),
    p = profile(S, id);
  const abilityRows = Object.entries(stats)
    .map(
      ([k, name]) =>
        "<div><strong>" +
        esc(name) +
        " " +
        esc(p.stats[k]) +
        " (" +
        signed(Math.floor((p.stats[k] - 10) / 2)) +
        ')</strong><p class="muted">' +
        esc(rulebook.abilityNotes[k]) +
        "</p></div>",
    )
    .join("");
  const skillRows = Object.entries(skills)
    .map(
      ([name, stat]) =>
        "<div><strong>" +
        esc(name) +
        '</strong><p class="muted">' +
        esc(
          stats[stat] +
            " · " +
            ["Без владения", "Владение", "Компетентность"][p.skills[name] || 0],
        ) +
        "</p><p>" +
        esc(rulebook.skillNotes[name] || "") +
        "</p></div>",
    )
    .join("");
  openModal(
    "Характеристики · " + memberName(heroOf(S, id)),
    "<p>Уровень " +
      esc(p.level) +
      " · БВ +" +
      esc(bv(p)) +
      '</p><div class="stat-grid">' +
      abilityRows +
      '</div><details><summary>Навыки</summary><div class="stat-grid">' +
      skillRows +
      "</div></details>" +
      '<small>Книга игрока 2024 · с. 10, 14</small><div class="actions" id="statActions"></div>',
  );
  $("statActions").append(button("Сделать проверку", rollForm));
  if (owned(actor, id))
    $("statActions").append(button("Настроить героя", () => editMember(id)));
}
function renderWorkshop() {
  if (player) {
    $("main").innerHTML =
      '<div class="screen"><p>Мастерская доступна мастеру кампании.</p></div>';
    return;
  }
  $("main").innerHTML =
    '<div class="screen game-screen"><section class="card game-cover"><h2>Мастерская</h2><p>Справочники, шаблоны и импорт кампании.</p><div class="actions" id="workshopLinks"></div></section>' +
    '<section class="card"><h3>Демонстрационные данные</h3><p>Три региона, ресурсы, рецепты, занятия и местные поручения. Добавляются по подтверждению мастера.</p><div class="actions" id="demoLinks"></div></section></div>';
  $("workshopLinks").append(
    button("Мастерская данных", () => workshop()),
    button("Редактор профессий", professionEditor),
  );
  $("demoLinks").append(
    button("Скачать демонстрационный пакет", () =>
      downloadText("atlas-demo.json", JSON.stringify(demoPack, null, 2)),
    ),
  );
  if (!S.engine.demo)
    $("demoLinks").append(
      button("Добавить демонстрационный набор", () =>
        commandForm(
          "Добавить демонстрационный набор",
          "<p>Добавить тестовые данные отдельными записями в текущую кампанию?</p>",
          "demo",
          () => ({}),
          "Добавить",
        ),
      ),
    );
  else
    $("demoLinks").append(
      document.createTextNode("Демонстрационные данные добавлены."),
    );
}
