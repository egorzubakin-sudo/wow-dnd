const opts = (o) => Object.entries(o);
const listText = (id) =>
  val(id)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const num = (id) => Number(val(id));
const pick = (title, id, rows, v) => selectField(title, id, rows, v);
const pairs = (rows) => rows.map((x) => [x.id, x.name || x.title]);
function heroRows() {
  return S.company.members.filter(
    (m) => actor.role === "master" || actor.heroes.includes(m.id),
  );
}
function chosen() {
  const rows = heroRows();
  if (!rows.some((m) => m.id === activeHero)) activeHero = rows[0]?.id || "";
  return activeHero;
}
function commandForm(title, fields, name, get, label) {
  const key = crypto.randomUUID();
  form(title, fields, async () => execute(name, await get(), key), label);
}
const heroToolChoices = [
  "Набор для грима",
  "Набор для фальсификации",
  "Набор травника",
  "Инструменты навигатора",
  "Инструменты отравителя",
  "Воровские инструменты",
];
function heroFormSection(id, title, fields, expanded = false) {
  return (
    '<details id="' +
    id +
    '"' +
    (expanded ? " open" : "") +
    "><summary>" +
    esc(title) +
    '</summary><div class="hero-form-fields">' +
    fields +
    "</div></details>"
  );
}
function heroChecklist(name, choices, selected) {
  return (
    '<div class="hero-checklist">' +
    choices
      .map(
        ([value, label]) =>
          '<label class="checkline"><input type="checkbox" name="' +
          name +
          '" value="' +
          esc(value) +
          '"' +
          (selected.includes(value) ? " checked" : "") +
          ">" +
          esc(label) +
          "</label>",
      )
      .join("") +
    "</div>"
  );
}
function editMember(id, focusSection) {
  const master = actor?.role === "master";
  if (!actor || (id ? !owned(actor, id) : !master)) return;
  const member = id ? heroOf(S, id) : {};
  const p = id
    ? profile(S, id)
    : {
        level: 1,
        stats: Object.fromEntries(Object.keys(stats).map((k) => [k, 10])),
        skills: {},
        tools: [],
        professions: [],
        recipes: [],
        bonus: 0,
      };
  const catalog = economy(S);
  const hero = id || uid(),
    key = crypto.randomUUID();
  const byName = (a, b) => a[1].localeCompare(b[1], "ru");
  const unlisted = (rows, selected) =>
    selected.filter((value) => !rows.some(([key]) => key === value));
  const professions = pairs(catalog.professions).sort(byName);
  const recipes = pairs(catalog.recipes).sort(byName);
  const tools = [
    ...new Set([
      ...heroToolChoices,
      ...p.tools,
      ...catalog.professions.flatMap((entry) => entry.tools || []),
      ...catalog.recipes.flatMap((entry) => entry.tools || []),
    ]),
  ].sort((a, b) => a.localeCompare(b, "ru"));
  const oldProfessions = unlisted(professions, p.professions);
  const oldRecipes = unlisted(recipes, p.recipes);
  const describeMissing = (values) =>
    values.map((value, index) => [
      value,
      "Запись из сохранения " + (index + 1),
    ]);
  const professionOptions = (kind) =>
    professions.filter(
      ([key]) => (byId(catalog.professions, key).kind || "production") === kind,
    );
  form(
    id ? "Настройка героя" : "Создание героя",
    '<div class="hero-form">' +
      heroFormSection(
        "heroIdentity",
        "Герой",
        '<div class="hero-field-grid">' +
          input("Имя", "mn", "text", member.name || "") +
          input("Роль в компании", "mr", "text", member.role || "") +
          input("Раса", "race", "text", p.race || "") +
          input("Класс", "heroClass", "text", p.class || "") +
          input(
            "Уровень",
            "lvl",
            "number",
            p.level,
            'min="1" max="20" required',
          ) +
          "</div>",
        true,
      ) +
      heroFormSection(
        "heroStatsSection",
        "Характеристики",
        '<div class="hero-field-grid">' +
          opts(stats)
            .map(([k, label]) =>
              input(
                label,
                k,
                "number",
                p.stats[k],
                'min="1" max="30" required',
              ),
            )
            .join("") +
          "</div>",
        true,
      ) +
      heroFormSection(
        "heroSkills",
        "Навыки",
        '<div class="hero-field-grid">' +
          Object.keys(skills)
            .map((label, i) =>
              pick(
                label,
                "sk" + i,
                [
                  [0, "Без владения"],
                  [1, "Владение"],
                  [2, "Компетентность"],
                ],
                p.skills[label] || 0,
              ),
            )
            .join("") +
          "</div>",
      ) +
      heroFormSection(
        "heroProfessions",
        "Профессии",
        '<p id="heroProfessionCount" class="muted" aria-live="polite"></p>' +
          "<h3>Добывающие</h3>" +
          heroChecklist(
            "heroProfession",
            professionOptions("gathering"),
            p.professions,
          ) +
          "<h3>Производственные</h3>" +
          heroChecklist(
            "heroProfession",
            professionOptions("production"),
            p.professions,
          ) +
          (oldProfessions.length
            ? "<h3>Нет в справочнике</h3>" +
              heroChecklist(
                "heroProfession",
                describeMissing(oldProfessions),
                p.professions,
              )
            : ""),
      ) +
      heroFormSection(
        "heroTraining",
        "Инструменты и известные рецепты",
        "<h3>Владение инструментами</h3>" +
          heroChecklist(
            "heroTool",
            tools.map((name) => [name, name]),
            p.tools,
          ) +
          "<h3>Известные рецепты</h3>" +
          (recipes.length || oldRecipes.length
            ? heroChecklist(
                "heroRecipe",
                [...recipes, ...describeMissing(oldRecipes)],
                p.recipes,
              )
            : '<p class="muted">Рецепты появятся после заполнения книги рецептов.</p>'),
      ) +
      heroFormSection(
        "heroPortrait",
        "Портрет и биография",
        area("Биография", "mb", member.bio || "") +
          input("Портрет", "mi", "file", "", "accept=image/*") +
          (safeImage(member.image)
            ? check("Удалить портрет", "mir", false)
            : ""),
      ) +
      (master
        ? heroFormSection(
            "heroMaster",
            "Настройки мастера",
            affiliationFields("maff", "mrank", member) +
              input(
                "Выживание для переходов (пусто — из характеристик)",
                "mm",
                "number",
                member.mod ?? "",
                'min="-10" max="30"',
              ) +
              input(
                "Поправка к проверкам",
                "bonus",
                "number",
                p.bonus,
                'min="-100" max="100" required',
              ) +
              input(
                "Бонус владения (пусто — по уровню)",
                "bv",
                "number",
                p.proficiency ?? "",
                'min="0" max="20"',
              ) +
              check(
                "Участвует в путешествиях и жребии",
                "ma",
                member.active ?? true,
              ),
          )
        : "") +
      "</div>",
    async () => {
      const fields = $("engineForm");
      const checklist = (name) =>
        [...fields.querySelectorAll('input[name="' + name + '"]:checked')].map(
          (el) => el.value,
        );
      let image = $("mir")?.checked ? "" : member.image || "";
      if ($("mi").files[0]) image = await readImage($("mi").files[0]);
      if (fields !== $("engineForm")) return;
      await execute(
        "profile",
        {
          hero,
          create: !id,
          member: {
            name: val("mn"),
            role: val("mr"),
            bio: val("mb"),
            image,
            ...(master
              ? {
                  ...readAffiliation("maff", "mrank"),
                  mod: val("mm") === "" ? null : num("mm"),
                  active: $("ma").checked,
                }
              : {}),
          },
          value: {
            race: val("race"),
            class: val("heroClass"),
            level: num("lvl"),
            stats: Object.fromEntries(
              Object.keys(stats).map((k) => [k, num(k)]),
            ),
            skills: Object.fromEntries(
              Object.keys(skills).map((k, i) => [k, num("sk" + i)]),
            ),
            tools: checklist("heroTool"),
            professions: checklist("heroProfession"),
            recipes: checklist("heroRecipe"),
            bonus: master ? num("bonus") : p.bonus,
            proficiency: master
              ? val("bv") === ""
                ? null
                : num("bv")
              : p.proficiency,
          },
        },
        key,
      );
      activeHero = hero;
      render();
    },
    id ? "Сохранить героя" : "Создать героя",
  );
  if (master) bindAffiliation("maff", "mrank");
  const checks = [
    ...$("heroProfessions").querySelectorAll('input[type="checkbox"]'),
  ];
  const sync = () => {
    const count = checks.filter((el) => el.checked).length;
    for (const el of checks) el.disabled = !el.checked && count >= 2;
    $("heroProfessionCount").textContent =
      count > 2
        ? "Ранее изучено " +
          count +
          " профессий. Чтобы добавить новую, сначала освободите место."
        : "Выбрано " + count + " из 2";
  };
  for (const el of checks) el.onchange = sync;
  sync();
  if (focusSection && $(focusSection)) {
    $(focusSection).open = true;
    $(focusSection).scrollIntoView({ block: "nearest" });
  }
}
function guideModifier(member) {
  if (member.mod != null) return n(member.mod);
  const p = profile(S, member.id);
  return ability(p, { skill: "Выживание" }, () => 1).mod;
}
function rollForm(stat = "", skill = "") {
  const hero = chosen(),
    p = profile(S, hero),
    rows = (o) => Object.keys(o).map((k) => [k, k]);
  commandForm(
    "Проверка героя",
    pick("Навык", "skill", [["", "Без навыка"], ...rows(skills)], skill) +
      pick("Характеристика", "stat", [["", "По навыку"], ...opts(stats)], stat) +
      pick(
        "Инструмент",
        "tool",
        [["", "Без инструмента"], ...p.tools.map((t) => [t, t])],
        "",
      ) +
      pick(
        "Режим",
        "mode",
        [
          ["normal", "Обычный"],
          ["adv", "Преимущество"],
          ["dis", "Помеха"],
        ],
        "normal",
      ) +
      input("Сложность", "dc", "number", 10) +
      input("Произвольный бросок (например 2d6)", "custom"),
    "roll",
    () => {
      const d = val("custom").trim(),
        m = /^(\d+)d(\d+)$/i.exec(d);
      requireThat(!d || m, "Формат NdM");
      return {
        hero,
        dc: num("dc"),
        stat: val("stat") || skills[val("skill")] || "str",
        skill: val("skill"),
        tool: val("tool"),
        mode: val("mode"),
        count: m && +m[1],
        sides: m && +m[2],
      };
    },
    "Бросить",
  );
}
function stayForm(edit = null) {
  commandForm(
    edit ? "Настроить стоянку" : "Разбить стоянку",
    input("Название", "sn", "text", edit?.name || "Стоянка", "required") +
      pick(
        "Узел карты",
        "loc",
        pairs(S.nodes),
        edit?.location || S.company.location,
      ) +
      pick(
        "Регион",
        "reg",
        [["", "Определить по карте"], ...pairs(S.engine.regions)],
        edit?.region || "",
      ) +
      (edit
        ? ""
        : input(
            "Начало (день кампании)",
            "startDay",
            "number",
            S.company.day,
          )) +
      input(
        "Иллюстрация стоянки",
        "stayImage",
        "file",
        "",
        'accept="image/*"',
      ) +
      input("Дней", "days", "number", edit?.days ?? 3) +
      input("Часов в день", "hrs", "number", edit?.hours ?? 8) +
      input(
        "Местные услуги через запятую",
        "services",
        (edit?.services || []).join(", "),
      ) +
      area("Описание", "notes", edit?.description || "") +
      area("Ограничения", "limits", edit?.limits || "") +
      check(
        "Показывать игрокам сложность занятий",
        "showDC",
        edit ? edit.showDC !== false : false,
      ) +
      check(
        "Разрешить отъезд с открытыми проектами",
        "early",
        edit?.early ?? true,
      ),
    edit ? "editStay" : "stay",
    async () => ({
      image: (await readImage($("stayImage").files[0])) || edit?.image || "",
      startDay: edit?.start ?? num("startDay"),
      limits: val("limits"),
      showDC: $("showDC").checked,
      name: val("sn"),
      location: val("loc"),
      region: val("reg"),
      days: num("days"),
      hours: num("hrs"),
      services: listText("services"),
      description: val("notes"),
      early: $("early").checked,
    }),
  );
}
function regionForm(points = [], r = {}) {
  commandForm(
    "Регион карты",
    input("Название", "rn", "text", r.name || "", "required") +
      input("Континент", "cont", "text", r.continent || "Калимдор") +
      input("Биом", "bio", "text", r.biome || "") +
      input("Сложность добычи", "dc", "number", r.dc ?? 10) +
      input(
        "Уровни героев (рекомендация)",
        "levels",
        "text",
        r.levels || "1–4",
      ) +
      input("Опасность и особенности", "danger", "text", r.danger || "") +
      input(
        "Местные фракции (ID)",
        "localFactions",
        "text",
        (r.factions || []).join(", "),
      ) +
      input("Иллюстрация региона", "regImage", "file", "", 'accept="image/*"') +
      input("Приоритет области", "prio", "number", r.priority || 0) +
      pick(
        "Назначить узлу",
        "rnNode",
        [["", "Без привязки"], ...pairs(S.nodes)],
        "",
      ) +
      area("Описание", "desc", r.description || ""),
    "region",
    async () => ({
      image: (await readImage($("regImage").files[0])) || r.image || "",
      levels: val("levels"),
      danger: val("danger", "text", r.danger || ""),
      factions: listText("localFactions"),
      id: r.id || crypto.randomUUID(),
      name: val("rn"),
      continent: val("cont"),
      biome: val("bio"),
      dc: integer(num("dc"), 0, 100),
      priority: num("prio"),
      description: val("desc"),
      node: val("rnNode"),
      points,
    }),
  );
}
function drawRegion() {
  const svg = $("mapsvg"),
    points = [];
  const shape = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon",
  );
  shape.setAttribute("fill", "#d7b46355");
  svg.append(shape);
  const done = button("Завершить границу (не менее 3 точек)", () => {
    requireThat(points.length >= 3, "Отметьте три точки");
    svg.removeEventListener("pointerdown", add, true);
    done.remove();
    regionForm(points);
  });
  const add = (e) => {
    e.stopImmediatePropagation();
    const p = worldPoint(e),
      d = dims();
    points.push([clamp(p.x / d.w, 0, 1), clamp(p.y / d.h, 0, 1)]);
    shape.setAttribute(
      "points",
      points.map(([x, y]) => [x * d.w, y * d.h].join(",")).join(" "),
    );
  };
  svg.addEventListener("pointerdown", add, true);
  $("engineActions").append(done);
}
const previousDraw = drawMap;
drawMap = function () {
  previousDraw();
  const svg = $("mapsvg");
  if (!svg || player) return;
  const d = dims();
  for (const r of foundation(S).regions) {
    if (!r.points?.length) continue;
    const poly = document.createElementNS(svg.namespaceURI, "polygon");
    poly.setAttribute(
      "points",
      r.points.map(([x, y]) => [x * d.w, y * d.h].join(",")).join(" "),
    );
    poly.setAttribute("fill", "#cea25330");
    poly.setAttribute("stroke", "#d2ad67");
    poly.setAttribute("pointer-events", "none");
    svg.append(poly);
  }
};
const travelStart = beginJourney;
beginJourney = function (id) {
  if (currentStay(S)) return toast("Сначала закройте стоянку");
  return travelStart(id);
};
function phasePanel() {
  const e = foundation(S),
    t = currentStay(S),
    gm = actor.role === "master",
    hero = chosen();
  if (!["home", "map", "camp", "contracts", "company", "bank"].includes(tab))
    return;
  const box = document.createElement("section");
  box.className = "card engine-panel";
  const region = e.regions.find((r) => r.id === t?.region);
  box.innerHTML =
    "<h3>" +
    esc(phases[S.journey ? "travel" : e.phase]) +
    "</h3>" +
    (t
      ? "<p>" +
        esc(
          [
            t.name,
            region?.name,
            hero ? remaining(S, hero) + " ч. доступно" : "",
          ]
            .filter(Boolean)
            .join(" · "),
        ) +
        "</p>"
      : "") +
    '<div id="engineActions" class="actions"></div>';
  if (tab === "map") $("main").querySelector(".map-main").append(box);
  else $("main").append(box);
  const a = $("engineActions");
  if (["home", "camp"].includes(tab))
    a.append(button("К стоянке", () => switchTab("stay")));
  if (gm && tab === "map")
    a.append(
      button("Создать регион", () => regionForm()),
      button("Нарисовать границу", drawRegion),
    );

  if (hero && owned(actor, hero)) {
    a.append(button("Бросок", rollForm));
    const last = e.rolls.find((r) => r.hero === hero);
    if (last) {
      const p = document.createElement("p");
      p.textContent =
        last.label +
        " · [" +
        last.raw.join(", ") +
        "] + " +
        last.mod +
        " = " +
        last.total +
        (!player || last.showDC !== false ? " · Сл " + last.dc : "");
      box.append(p);
    }
  }
  for (const fn of actions) fn(a, { gm, hero, t, e, box });
}
onRender.push(phasePanel);

function companyHeroRows() {
  const members = S.company.members.filter(
    (m) => !player || !m.hidden || owned(actor, m.id),
  );
  if (!player) return members;
  return [
    ...members.filter((m) => owned(actor, m.id)),
    ...members.filter((m) => !owned(actor, m.id)),
  ];
}
function companyHeroActions(member) {
  if (!owned(actor, member.id)) return "";
  const id = jsid(member.id);
  return (
    '<div class="actions">' +
    (chosen() === member.id
      ? '<span class="tag">Активный герой</span>'
      : '<button onclick="selectCompanyHero(' +
        id +
        ')">Сделать активным</button>') +
    '<button class="primary" onclick="editMember(' +
    id +
    ')">Настроить героя</button>' +
    "<button onclick=\"openAffPerson('hero'," +
    id +
    ')">Карточка</button>' +
    (!player
      ? '<button class="danger ghost" onclick="removeMember(' +
        id +
        ')">Удалить</button>'
      : "") +
    "</div>"
  );
}
function selectCompanyHero(id) {
  if (!owned(actor, id)) return;
  activeHero = id;
  render();
}
