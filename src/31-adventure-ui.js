function errandEditor(quest = null) {
  const c = quest?.conditions || {},
    existing = quest
      ? S.engine.solutions.filter((o) => o.quest_id === quest.id)
      : [];
  const constraints = [
    ["race", "Раса"],
    ["class", "Класс"],
    ["profession", "Профессия"],
    ["skill", "Владение навыком"],
    ["item", "Нужен предмет"],
    ["recipe", "Нужен рецепт"],
    ["npc", "Знакомство с NPC"],
    ["achievement", "Достижение"],
    ["quest", "Предыдущее задание"],
    ["faction", "Фракция"],
  ];
  const conditions =
    "<details><summary>Условия доступности</summary>" +
    constraints
      .map(([k, n]) => input(n, "cond-" + k, "text", c[k] || ""))
      .join("") +
    input("Минимальный уровень", "cond-level", "number", c.level || 1) +
    input("Очки репутации", "cond-rep", "number", c.rep || 0) +
    "</details>";
  form(
    "Местное поручение",
    input("Название", "qt", "text", quest?.title || "", "required") +
      area("Вступление", "qd", quest?.desc || "") +
      pick(
        "Регион",
        "qr",
        [["", "Любой"], ...pairs(S.engine.regions)],
        quest?.region_id || "",
      ) +
      input("Часов", "qh", "number", quest?.hours || 1) +
      pick(
        "Повторять",
        "repeat",
        [
          ["once", "Однократно"],
          ["day", "Раз в игровой день"],
          ["stay", "Раз за стоянку"],
          ["period", "Через указанное число дней"],
        ],
        quest?.repeat || "once",
      ) +
      input("Период в игровых днях", "period", "number", quest?.period || 1) +
      conditions +
      '<div id="optionsBox"></div><button type="button" id="addOption">Добавить решение</button>',
    async () => {
      const options = [...$("optionsBox").children].map((el, i) => ({
        id: el.dataset.id || undefined,
        name: val("op" + i),
        skill: val("skill" + i),
        dc: num("dc" + i),
        success: val("win" + i),
        failure: val("loss" + i),
        gold: num("gold" + i),
        tool: val("tool" + i),
        encounter: $("enc" + i).checked,
      }));
      const filters = Object.fromEntries(
        constraints.map(([k]) => [k, val("cond-" + k)]).filter(([, v]) => v),
      );
      filters.level = num("cond-level");
      filters.rep = num("cond-rep");
      await execute("errand", {
        id: quest?.id,
        title: val("qt"),
        desc: val("qd"),
        region_id: val("qr"),
        hours: num("qh"),
        repeat: val("repeat"),
        period: val("repeat") === "period" ? num("period") : 0,
        conditions: filters,
        options,
      });
    },
  );
  function add(o = {}) {
    const i = $("optionsBox").children.length,
      el = document.createElement("details");
    el.open = true;
    el.dataset.id = o.id || "";
    const gold =
      S.engine.rewards.find(
        (x) =>
          x.solution_id === o.id && x.type === "gold" && x.when === "success",
      )?.amount || 0;
    el.innerHTML =
      "<summary>Решение " +
      (i + 1) +
      "</summary>" +
      input("Действие", "op" + i, "text", o.name || "", "required") +
      pick(
        "Навык",
        "skill" + i,
        Object.keys(skills).map((k) => [k, k]),
        o.skill || "Атлетика",
      ) +
      input("Инструмент", "tool" + i, "text", o.tool || "") +
      input("Сл", "dc" + i, "number", o.dc ?? 10) +
      input("Успех", "win" + i, "text", o.success || "") +
      input("Неудача", "loss" + i, "text", o.failure || "") +
      input("Награда при успехе, зм", "gold" + i, "number", gold) +
      check("Сцену решает мастер", "enc" + i, o.encounter);
    $("optionsBox").append(el);
  }
  $("addOption").onclick = () => add();
  if (existing.length) existing.forEach(add);
  else add();
}
function localBoard(questId = null, companion = null, terms = "") {
  const hero = chosen(),
    e = adventure(S);
  openModal(
    "Местные поручения",
    terms + '<section class="stack" id="localBoard"></section>',
  );
  const box = $("localBoard");
  for (const q of S.contracts.filter(
    (q) =>
      (!questId || q.id === questId) &&
      q.type === "local" &&
      questAvailable(S, q, hero),
  )) {
    const el = document.createElement("article");
    el.className = "quest-card";
    el.innerHTML =
      "<h3>" +
      esc(q.title) +
      "</h3><p>" +
      esc(q.desc) +
      "</p><small>" +
      esc(q.hours) +
      " ч.</small>";
    for (const o of e.solutions.filter((x) => x.quest_id === q.id))
      el.append(
        button(o.name, () =>
          commandForm(
            q.title,
            "<p>" +
              esc(o.name) +
              " · " +
              esc(o.skill) +
              " · Сл " +
              esc(o.dc) +
              "</p>",
            "quest",
            () => ({ hero, quest: q.id, option: o.id, companion }),
            "Выполнить",
          ),
        ),
      );
    box.append(el);
  }
  if (!box.children.length) box.textContent = "Доступных поручений пока нет.";
}
function sessionEditor() {
  form(
    "Последствия приключения",
    input(
      "Идентификатор сессии",
      "sid",
      "text",
      crypto.randomUUID(),
      "required",
    ) +
      input("Краткое содержание", "sum", "text", "", "required") +
      area("Текстовый лог", "logTxt") +
      input("Загрузить лог (.txt)", "logFile", "file") +
      area("Последствия JSON", "effects", "[]") +
      input("Загрузить последствия (.json)", "effectFile", "file") +
      check("Скрыть запись летописи", "privateSession", false),
    () => {
      const p = {
        id: val("sid"),
        summary: val("sum"),
        log: val("logTxt"),
        hidden: $("privateSession").checked,
        effects: JSON.parse(val("effects")),
      };
      applyCommand(S, actor, "session", p, "preview:" + p.id);
      commandForm(
        "Подтверждение последствий",
        "<p>" +
          esc(p.summary) +
          "</p><pre>" +
          esc(JSON.stringify(p.effects, null, 2)) +
          "</pre>",
        "session",
        () => p,
        "Применить",
      );
    },
    "Проверить",
  );
  $("logFile").onchange = async (e) => {
    if (e.target.files[0]) $("logTxt").value = await e.target.files[0].text();
  };
  $("effectFile").onchange = async (e) => {
    if (e.target.files[0]) $("effects").value = await e.target.files[0].text();
  };
}
