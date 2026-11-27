let craftTab = "recipes",
  craftProfession = null,
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
function craftTabButton(label, id, container) {
  const b = button(label, () => {
    craftTab = id;
    renderCraft();
  });
  b.className = "kit-small";
  b.setAttribute("aria-pressed", String(craftTab === id));
  container.append(b);
}
function renderCraft() {
  const hero = chosen(),
    member = hero ? heroOf(S, hero) : null,
    p = hero ? profile(S, hero) : null;
  const cover = safeImage(S.settings.visual?.covers?.craft);
  if (craftProfession == null && S.engine.recipes.length)
    craftProfession = S.engine.recipes[0].profession_id;
  $("main").innerHTML =
    '<div class="atlas-kit kit-craft"><div class="kit-sectionhead ' +
    (cover ? "kit-section-art" : "") +
    '">' +
    (cover
      ? '<img class="kit-cover-image" src="' + esc(cover) + '" alt="">'
      : "") +
    '<div><div class="eyebrow">Атлас · Кампания</div><h2>Ремесло</h2>' +
    "<p>Книга профессий, известные рецепты и работа над предметами.</p></div>" +
    kitHeroSelect(hero) +
    "</div>" +
    '<div class="kit-toolbar kit-craft-hero">' +
    (member
      ? '<div class="kit-row kit-grow">' +
        kitAvatar(member) +
        "<div><b>" +
        esc(memberName(member)) +
        "</b><small>" +
        esc(`Уровень ${p.level} · Бонус владения +${bv(p)}`) +
        "</small></div></div>" +
        '<small class="kit-inline">' +
        uiIcon("time") +
        esc(timeLabel(remaining(S, hero)) + " доступно") +
        "</small>" +
        kitLink("Личные сумки", "bagPage()", "bank", "kit-small")
      : '<span class="muted">Герой не назначен</span>') +
    (!player
      ? visualMenu(
          "Управление ремеслом",
          visualAction("Редактор профессий", "professionEditor()") +
            visualAction("Обложка раздела", "editSectionCover('craft')"),
        )
      : "") +
    "</div>" +
    '<div id="craftProfessionPills" class="kit-tabs"></div><section id="craftBody"></section>' +
    '<div id="craftTabs" class="kit-craft-views" aria-label="Виды ремесла"></div></div>';
  bindKitHero();
  const tabs = $("craftTabs");
  for (const [id, label] of [
    ["professions", "Профессии"],
    ["recipes", "Книга рецептов"],
    ["projects", "Проекты"],
  ])
    craftTabButton(label, id, tabs);
  const root = $("craftBody");
  if (craftTab === "professions") renderProfessionCards(root, hero);
  if (craftTab === "recipes") {
    drawProfessionPills();
    renderRecipeList(root, hero);
    $("craftBody").insertAdjacentHTML(
      "afterend",
      '<section id="craftProjectsPreview">' +
        kitSubhead("Производственные проекты") +
        '<div id="craftProjectRows" class="kit-panel"></div></section>',
    );
    renderProjects($("craftProjectRows"), hero);
  }
  if (craftTab === "projects") renderProjects(root, hero);
}
function drawProfessionPills() {
  const table = S.engine.professions.filter((p) =>
    S.engine.recipes.some((r) => r.profession_id === p.id),
  );
  const order = ["smithing", "alchemy", "cooking"];
  const rank = (id) => (order.includes(id) ? order.indexOf(id) : order.length);
  table.sort((a, b) => rank(a.id) - rank(b.id));
  const bar = $("craftProfessionPills");
  for (const p of table) {
    const btn = button(p.name, () => {
      craftProfession = p.id;
      craftRecipe = "";
      renderCraft();
    });
    btn.className = "kit-tab";
    btn.setAttribute("aria-pressed", String(craftProfession === p.id));
    btn.innerHTML = professionIcon(p) + esc(p.name);
    bar.append(btn);
  }
  const all = button("Все рецепты", () => {
    craftProfession = "";
    craftRecipe = "";
    renderCraft();
  });
  all.className = "kit-tab";
  all.setAttribute("aria-pressed", String(!craftProfession));
  if (table.length) bar.append(all);
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
      professionIcon(profession) +
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
    if (!player)
      controls.append(
        button("Иконка профессии", () => pickProfessionIcon(profession.id)),
      );
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
    '<div class="kit-recipe-layout"><div class="kit-recipe-sidebar"><div class="eyebrow">Рецепты профессии</div>' +
    input(
      "Поиск рецептов",
      "recipeQuery",
      "search",
      craftQuery,
      'placeholder="Поиск рецепта"',
    ) +
    '<details class="kit-recipe-filters"><summary>Фильтры и сортировка</summary>' +
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
    '</details><div id="recipeList" class="kit-recipe-list" aria-label="Рецепты"></div></div><article id="recipeDetail" class="kit-recipe-detail"></article></div>';
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
          detail.scrollIntoView({ block: "start" });
      });
      b.className = "recipe-option kit-recipe";
      b.setAttribute("aria-pressed", String(row === selected));
      b.innerHTML =
        itemIcon(row.item) +
        '<span class="kit-grow"><strong class="rarity-' +
        esc(row.item?.quality || "common") +
        '">' +
        esc(row.r.name) +
        "</strong><small>" +
        timeLabel(row.quote?.work ?? row.r.hours) +
        " · " +
        esc(professionRanks[(row.r.rank || 2) - 2] || recipeQuality(row.item)) +
        '</small></span><span aria-hidden="true">›</span>';
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
    '<div class="kit-row">' +
    itemIcon(item) +
    '<div class="kit-grow"><div class="eyebrow">' +
    esc(
      (profession?.name || "Ремесло") +
        " · " +
        (professionRanks[(r.rank || 2) - 2] || "БВ +" + r.rank),
    ) +
    '</div><h3 class="rarity-' +
    esc(item?.quality || "common") +
    '">' +
    esc(r.name) +
    "</h3></div>" +
    (!player && item
      ? visualMenu(
          "Действия с рецептом",
          visualAction(
            "Иконка предмета",
            "pickRecipeItemIcon(" + jsid(item.id) + ")",
          ),
        )
      : "") +
    '</div><p class="kit-recipe-description muted">' +
    esc(
      r.description ||
        r.desc ||
        item?.desc ||
        item?.description ||
        "Описание предмета пока не добавлено.",
    ) +
    "</p><small>" +
    esc(recipeQuality(item)) +
    "</small>" +
    (requirements.length
      ? '<p class="muted">' + esc(requirements.join(" · ")) + "</p>"
      : "") +
    '<div id="craftCosts"></div><div class="kit-recipe-actions"><div id="craftInputs"></div><div id="craftSubmit"></div></div>' +
    '<div id="craftNotice" class="kit-notice" role="status"></div>';
  if (!hero) {
    $("craftCosts").textContent =
      "Выберите героя, чтобы сверить материалы и время.";
    return;
  }
  $("craftInputs").innerHTML =
    '<div class="kit-quantity"><button type="button" id="craftQtyMinus" aria-label="Уменьшить количество">−</button>' +
    input(
      "Количество",
      "craftQty",
      "number",
      1,
      'min="1" max="1000" step="1"',
    ) +
    '<button type="button" id="craftQtyPlus" aria-label="Увеличить количество">+</button></div>' +
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
  create.className = "primary kit-create";
  $("craftSubmit").append(create);
  function refresh() {
    const box = $("craftCosts");
    try {
      const quote = projectQuote(S, payload());
      const reasons = recipeAvailability(hero, p, r, quote);
      create.disabled = !!reasons.length || !owned(actor, hero);
      const needsProject = quote.work > remaining(S, hero) && !create.disabled;
      const label = needsProject ? "Начать проект" : "Создать";
      create.setAttribute("aria-label", label);
      create.innerHTML = uiIcon("craft") + esc(label + " ×" + payload().qty);
      box.innerHTML =
        kitSubhead("Реагенты", "В сумках / Нужно") +
        (quote.materials.length
          ? quote.materials
              .map((x) => {
                const material = S.engine.items.find((i) => i.id === x.item);
                return (
                  '<div class="material-line kit-ingredient">' +
                  itemIcon(material) +
                  '<span class="kit-grow">' +
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
        '<div class="kit-ingredient">' +
        uiIcon("time") +
        '<span class="kit-grow">Время изготовления</span><b>' +
        timeLabel(quote.work) +
        "</b></div>" +
        (quote.cost
          ? '<div class="kit-ingredient">' +
            uiIcon("coins") +
            '<span class="kit-grow">Стоимость</span><b>' +
            esc(quote.cost + " зм") +
            "</b></div>"
          : "");
      $("craftNotice").textContent = reasons.length
        ? reasons.join(" · ")
        : needsProject
          ? "Материалы будут зарезервированы. Работу можно продолжить в проектах."
          : "Результат ×" +
            payload().qty * r.quantity +
            ". Материалы и время будут списаны при создании.";
    } catch (error) {
      create.disabled = true;
      $("craftNotice").textContent = error.message;
    }
  }
  for (const [id, delta] of [
    ["craftQtyMinus", -1],
    ["craftQtyPlus", 1],
  ])
    $(id).onclick = () => {
      $("craftQty").value = Math.min(
        1000,
        Math.max(1, (Number(val("craftQty")) || 1) + delta),
      );
      refresh();
    };
  for (const id of ["craftQty", "craftResource", "craftCredit"])
    if ($(id)) $(id).oninput = refresh;
  refresh();
}
function renderProjects(root, hero) {
  root.classList.add("kit-projects");
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
    section.className = "kit-project-group";
    section.innerHTML = "<h3>" + labels[key] + "</h3>";
    if (!rows.length && root.id === "craftProjectRows") continue;
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
        '<h4 class="kit-row">' +
        itemIcon(S.engine.items.find((item) => item.id === j.recipe.item_id)) +
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
  if (!root.children.length && root.id === "craftProjectRows")
    root.innerHTML = emptyScene("Пока нет производственных проектов.");
  if (!S.engine.projects.length && root.id !== "craftProjectRows")
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
    '<div class="screen visual-screen">' + sectionHeader("Мастерская", "Справочники, шаблоны и импорт кампании.") +
    '<div class="kit-workshop-layout"><section class="kit-panel"><h3>Справочники</h3><p>Скачайте шаблоны, проверьте таблицы и подтвердите импорт.</p><div class="actions" id="workshopLinks"></div></section>' +
    '<section class="kit-panel"><h3>Демонстрационные данные</h3><p>Три региона, ресурсы, рецепты, занятия и местные поручения. Добавляются по подтверждению мастера.</p><div class="actions" id="demoLinks"></div></section></div></div>';
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
