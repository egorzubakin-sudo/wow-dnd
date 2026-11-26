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
function profileForm() {
  const hero = chosen(),
    p = profile(S, hero);
  const group = (name, body) =>
    "<details><summary>" + name + "</summary>" + body + "</details>";
  commandForm(
    "Профиль героя",
    input("Уровень", "lvl", "number", p.level, 'min="1" max="20"') +
      input("Раса", "race", "text", p.race || "") +
      input("Класс", "heroClass", "text", p.class || "") +
      group(
        "Характеристики",
        opts(stats)
          .map(([k, l]) =>
            input(l, k, "number", p.stats[k], 'min="1" max="30"'),
          )
          .join(""),
      ) +
      group(
        "Владения навыками",
        Object.keys(skills)
          .map((k, i) =>
            pick(
              k,
              "sk" + i,
              [
                [0, "Нет"],
                [1, "Владение"],
                [2, "Компетентность"],
              ],
              p.skills[k] || 0,
            ),
          )
          .join(""),
      ) +
      input("Инструменты через запятую", "tools", "text", p.tools.join(", ")) +
      input("Профессии (ID)", "prof", "text", p.professions.join(", ")) +
      input("Рецепты (ID)", "rec", "text", p.recipes.join(", ")) +
      input("Поправка к проверкам", "bonus", "number", p.bonus) +
      input(
        "Бонус владения (пусто — по уровню)",
        "bv",
        "number",
        p.proficiency ?? "",
      ),
    "profile",
    () => ({
      hero,
      value: {
        race: val("race"),
        class: val("heroClass"),
        level: num("lvl"),
        stats: Object.fromEntries(Object.keys(stats).map((k) => [k, num(k)])),
        skills: Object.fromEntries(
          Object.keys(skills).map((k, i) => [k, num("sk" + i)]),
        ),
        tools: listText("tools"),
        professions: listText("prof"),
        recipes: listText("rec"),
        bonus: num("bonus"),
        proficiency: val("bv") === "" ? null : num("bv"),
      },
    }),
  );
}
function rollForm() {
  const hero = chosen(),
    p = profile(S, hero),
    rows = (o) => Object.keys(o).map((k) => [k, k]);
  commandForm(
    "Проверка героя",
    pick("Навык", "skill", [["", "Без навыка"], ...rows(skills)], "") +
      pick("Характеристика", "stat", [["", "По навыку"], ...opts(stats)], "") +
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
function stayForm() {
  commandForm(
    "Разбить стоянку",
    input("Название", "sn", "text", "Стоянка", "required") +
      pick("Узел карты", "loc", pairs(S.nodes), S.company.location) +
      pick(
        "Регион",
        "reg",
        [["", "Определить по карте"], ...pairs(S.engine.regions)],
        "",
      ) +
      input("Начало (день кампании)", "startDay", "number", S.company.day) +
      input(
        "Иллюстрация стоянки",
        "stayImage",
        "file",
        "",
        'accept="image/*"',
      ) +
      input("Дней", "days", "number", 3) +
      input("Часов в день", "hrs", "number", 8) +
      input("Местные услуги через запятую", "services") +
      area("Описание и ограничения", "notes") +
      check("Разрешить отъезд с открытыми проектами", "early", true),
    "stay",
    async () => ({
      image: await readImage($("stayImage").files[0]),
      startDay: num("startDay"),
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
  $("main").prepend(box);
  const a = $("engineActions");
  if (hero) {
    const select = document.createElement("select");
    select.ariaLabel = "Герой";
    for (const m of heroRows())
      select.add(new Option(memberName(m), m.id, false, m.id === hero));
    select.onchange = () => {
      activeHero = select.value;
      render();
    };
    a.append(select);
  }
  if (gm && !t && !S.journey)
    a.append(
      button("Разбить стоянку", stayForm),
      button("Сменить фазу", () =>
        commandForm(
          "Фаза кампании",
          pick(
            "Фаза",
            "phase",
            [
              ["adventure", "Приключение"],
              ["travel", "Путешествие"],
            ],
            e.phase,
          ),
          "phase",
          () => ({ phase: val("phase") }),
        ),
      ),
    );
  if (t && gm)
    a.append(
      button("Закрыть стоянку", () => {
        if (confirm("Учесть отдых и продвинуть календарь?"))
          return execute("closeStay", {});
      }),
    );
  if (gm && tab === "map")
    a.append(
      button("Создать регион", () => regionForm()),
      button("Нарисовать границу", drawRegion),
    );
  if (hero && gm) a.append(button("Профиль героя", profileForm));
  if (hero && owned(actor, hero)) {
    a.append(button("Бросок", rollForm));
    if (t)
      a.append(
        button("Отдых", () =>
          commandForm(
            "Отдых",
            input("Часов", "rh", "number", 1),
            "rest",
            () => ({ hero, hours: num("rh") }),
          ),
        ),
      );
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
        " · Сл " +
        last.dc;
      box.append(p);
    }
  }
  for (const fn of actions) fn(a, { gm, hero, t, e, box });
}
onRender.push(phasePanel);
