function gameIcon(symbol, image) {
  const url = safeImage(image) || safeImage(symbol);
  return (
    '<span class="game-icon" aria-hidden="true">' +
    (url ? '<img src="' + esc(url) + '" alt="">' : esc(symbol || "◆")) +
    "</span>"
  );
}
function gameHero(hero, stay) {
  if (!hero)
    return '<p class="muted">Назначенный герой появится здесь после привязки аккаунта.</p>';
  const member = heroOf(S, hero),
    p = profile(S, hero);
  return (
    '<div class="game-hero">' +
    gameIcon("♙", member.image) +
    "<div><strong>" +
    esc(memberName(member)) +
    '</strong><p class="muted">' +
    esc(
      [p.race, p.class, "Уровень " + p.level, "БВ +" + bv(p)]
        .filter(Boolean)
        .join(" · "),
    ) +
    "</p>" +
    (tab === "stay" && p.professions.length
      ? '<p class="stay-professions">' +
        esc(
          S.engine.professions
            .filter((record) => p.professions.includes(record.id))
            .map((record) => record.name)
            .join(" · "),
        ) +
        "</p>"
      : "") +
    '</div><div id="gameHeroSelect"></div>' +
    (tab === "stay" ? visualAction("Личные сумки", "bagPage()", "ghost") : "") +
    "</div>" +
    (stay
      ? '<div class="game-time"><label for="stayTime">Игровое время <strong>' +
        timeLabel(remaining(S, hero)) +
        " / " +
        timeLabel(stay.hours * stay.days) +
        "</strong></label>" +
        '<progress id="stayTime" max="' +
        stay.hours * stay.days +
        '" value="' +
        remaining(S, hero) +
        '"></progress></div>'
      : '<p class="muted">Игровое время появится с началом стоянки.</p>')
  );
}
function bindGameHero(hero) {
  const rows = heroRows();
  if (rows.length < 2 || !$("gameHeroSelect")) return;
  $("gameHeroSelect").innerHTML = pick(
    "Активный персонаж",
    "gameHero",
    rows.map((m) => [m.id, memberName(m)]),
    hero,
  );
  $("gameHero").onchange = () => {
    activeHero = val("gameHero");
    render();
  };
}
function timeLabel(hours) {
  const minutes = Math.round(hours * 60);
  return [
    minutes >= 60 || !minutes ? Math.floor(minutes / 60) + " ч." : "",
    minutes % 60 ? (minutes % 60) + " мин." : "",
  ]
    .filter(Boolean)
    .join(" ");
}
function professionRequirements(p) {
  return (
    [
      p.skill && "Навык «" + p.skill + "»",
      p.tools?.length &&
        (p.tools.length > 1 ? "Один из инструментов: " : "") +
          p.tools.join(" / "),
    ]
      .filter(Boolean)
      .join(" · ") || "Владение не требуется"
  );
}
function stayAdmin() {
  const stay = currentStay(S);
  openModal(
    "Управление стоянкой",
    '<div class="actions" id="stayAdmin"></div>',
  );
  const box = $("stayAdmin");
  if (stay)
    box.append(
      button("Параметры стоянки", () => stayForm(stay)),
      button("Завершить стоянку", () =>
        commandForm(
          "Завершить стоянку",
          "<p>Оставшееся время будет учтено как отдых.</p>",
          "closeStay",
          () => ({}),
          "Завершить",
        ),
      ),
      button("Добавить тушу", () =>
        commandForm(
          "Снятие шкур",
          input("Название", "car", "text", "", "required") +
            input("Показатель опасности", "cr", "number", 1) +
            pick(
              "Тип",
              "kind",
              [
                ["beast", "Зверь"],
                ["fiend", "Исчадие"],
                ["dragon", "Дракон"],
              ],
              "beast",
            ),
          "carcass",
          () => ({ name: val("car"), cr: num("cr"), kind: val("kind") }),
        ),
      ),
    );
  else if (!S.journey) box.append(button("Разбить стоянку", stayForm));
  box.append(
    button("Занятия и таблицы добычи", () => workshop("loot")),
    button("Создать регион", () => regionForm()),
  );
  if (!stay && !S.journey)
    box.append(
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
            S.engine.phase,
          ),
          "phase",
          () => ({ phase: val("phase") }),
        ),
      ),
    );
}
function activityState(hero, profession, stay) {
  const payload = { hero, profession: profession.id };
  if (profession.id === "skinning") {
    const carcasses = (stay.carcasses || []).filter((c) => !c.used);
    if (!carcasses.length) return { reason: "Нет подходящей туши" };
    const eligible = carcasses.filter(
      (c) =>
        bv(profile(S, hero)) >=
        (c.kind === "dragon" ? 5 : c.kind === "fiend" ? 3 : 2),
    );
    if (!eligible.length)
      return { reason: "Недостаточный ранг для доступных туш" };
    payload.carcass = eligible[0].id;
    payload.carcasses = eligible;
  }
  try {
    const heroProfile = profile(S, hero);
    if (!learnedProfession(heroProfile, profession.id))
      return { reason: "Профессия не изучена" };
    if (!eligibleProfession(S, heroProfile, profession.id))
      return { reason: professionRequirements(profession) };
    const details = gatheringDetails(S, payload);
    return { payload, details };
  } catch (error) {
    return { reason: error.message };
  }
}
function activityLoot(rows) {
  return [...new Set(rows.flatMap((r) => [r.item_id, r.treasure_id]))]
    .map((id) => S.engine.items.find((i) => i.id === id))
    .filter((item) => item && (!player || !item.hidden));
}
function activityDialog(hero, profession, stay) {
  const state = activityState(hero, profession, stay);
  const { payload, details, reason } = state;
  const ids = S.engine.loot.filter(
    (r) => r.region_id === stay.region && r.profession_id === profession.id,
  );
  const loot = activityLoot(ids)
    .map((item) => gameIcon(item.icon, item.image) + " " + esc(item.name))
    .join(" · ");
  const body =
    "<p>" +
    esc(
      profession.description ||
        profession.summary ||
        "Проведите разведку по месту стоянки.",
    ) +
    "</p>" +
    '<p class="muted">' +
    esc(professionRequirements(profession)) +
    "</p>" +
    (loot ? "<p>Возможная добыча · " + loot + "</p>" : "");
  if (reason) {
    openModal(
      profession.name,
      body + '<p class="game-bad">' + esc(reason) + "</p>",
    );
    return;
  }
  const choice = payload.carcasses?.map((c) => [c.id, c.name]);
  const key = crypto.randomUUID();
  form(
    profession.name,
    body +
      (choice ? pick("Туша", "activityCarcass", choice, payload.carcass) : "") +
      '<div id="activityCheck"></div>',
    async () => {
      await execute(
        "gather",
        {
          hero,
          profession: profession.id,
          carcass: $("activityCarcass")?.value,
        },
        key,
      );
      const result = currentStay(S).history.at(-1);
      const roll = S.engine.rolls[0];
      const item = S.engine.items.find((i) => i.id === result.item_id);
      openModal(
        profession.name,
        "<p><strong>" +
          esc(roll.success || item ? "Занятие удалось" : "Занятие не удалось") +
          "</strong></p>" +
          "<p>Бросок " +
          esc(roll.raw.join(" / ")) +
          " " +
          esc(signed(roll.mod)) +
          " = " +
          esc(roll.total) +
          (!player || stay.showDC !== false ? " · Сл " + esc(roll.dc) : "") +
          "</p>" +
          "<p>" +
          (item
            ? gameIcon(item.icon, item.image) +
              esc(item.name) +
              " × " +
              esc(result.qty) +
              " в сумках."
            : esc(result.result || "На этот раз добычи не оказалось.")) +
          '</p><p class="muted">Потрачено ' +
          timeLabel(result.hours) +
          "</p>",
      );
      $("modalBody").append(
        button("Открыть сумки", bagPage),
        button("К занятиям", closeModal),
      );
    },
    "Начать занятие",
  );
  const show = () => {
    const info = choice
      ? gatheringDetails(S, { ...payload, carcass: val("activityCarcass") })
      : details;
    const { mod, raw } = ability(info.heroProfile, info.modifiers, () => 1);
    $("activityCheck").innerHTML =
      "<p>" +
      esc(
        [info.modifiers.skill, info.modifiers.tool].filter(Boolean).join(" · "),
      ) +
      " <strong>" +
      esc(signed(mod)) +
      "</strong>" +
      (raw.length > 1 ? " · преимущество" : "") +
      "</p>" +
      "<p>" +
      timeLabel(info.hours) +
      (!player || stay.showDC !== false ? " · Сл " + esc(info.dc) : "") +
      "</p>";
  };
  if (choice) $("activityCarcass").onchange = show;
  show();
}
function signed(value) {
  return value >= 0 ? "+" + value : String(value);
}
function staffWorkDialog() {
  commandForm(
    "Проект лагеря",
    pick("Специалист", "worker", pairs(S.company.staff), "") +
      pick(
        "Проект",
        "project",
        pairs(S.engine.projects.filter((j) => j.status === "active")),
        "",
      ) +
      input("Отработать часов", "time", "number", 1),
    "staffWork",
    () => ({
      staff: val("worker"),
      project: val("project"),
      hours: num("time"),
    }),
  );
}
function renderStay() {
  const stay = currentStay(S),
    master = !player,
    hero = chosen();
  const root = $("main");
  if (!stay) {
    root.innerHTML =
      '<div class="screen game-screen"><section class="card game-cover"><h2>Стоянка</h2><p>Сейчас · ' +
      esc(phases[S.journey ? "travel" : S.engine.phase]) +
      '</p><p class="muted">Добыча, отдых и местные поручения станут доступны, когда компания разобьёт стоянку.</p><div class="actions" id="stayActions"></div></section></div>';
    $("stayActions").append(button("Открыть карту", () => switchTab("map")));
    if (master && !S.journey)
      $("stayActions").append(
        button(
          S.nodes.length ? "Разбить стоянку" : "Добавить место на карте",
          S.nodes.length ? stayForm : () => switchTab("map"),
        ),
      );
    if (master)
      $("stayActions").append(button("Управление стоянкой", stayAdmin));
    return;
  }
  const region = S.engine.regions.find((r) => r.id === stay.region),
    place = node(stay.location);
  const illustration = safeImage(stay.image) || safeImage(region?.image);
  root.innerHTML =
    '<div class="screen game-screen"><section class="card game-cover">' +
    (illustration
      ? '<img class="stay-illustration" src="' + esc(illustration) + '" alt="">'
      : "") +
    '<div class="game-intro"><div><p class="eyebrow">' +
    esc(
      [region?.continent, region?.name].filter(Boolean).join(" · ") ||
        "Стоянка компании",
    ) +
    "</p>" +
    "<h2>" +
    esc(stay.name || (place && visibleNode(place) ? place.name : "Стоянка")) +
    "</h2>" +
    "<p>" +
    esc(
      stay.description ||
        region?.description ||
        "Компания остановилась, чтобы пополнить припасы и подготовиться к дороге.",
    ) +
    "</p>" +
    '<p class="muted">' +
    esc(
      stay.days +
        " дн. · начало в день " +
        stay.start +
        " · завершение в день " +
        (stay.start + stay.days) +
        " · " +
        S.company.year +
        " год",
    ) +
    (place && visibleNode(place) ? " · " + esc(place.name) : "") +
    '</p></div><div id="stayAdminLink"></div></div>' +
    (stay.limits ? '<p class="notice">' + esc(stay.limits) + "</p>" : "") +
    gameHero(hero, stay) +
    "</section>" +
    '<section class="game-section"><h3>Добыча и исследование</h3><div id="activitiesGrid" class="activity-grid"></div></section>' +
    '<section class="game-section"><h3>Дела компании</h3><div id="stayTasks" class="activity-grid stay-task-grid"></div></section></div>';
  bindGameHero(hero);
  if (master)
    $("stayAdminLink").append(button("Управление стоянкой", stayAdmin));
  const grid = $("activitiesGrid"),
    tasks = $("stayTasks");
  const professions = S.engine.professions.filter(
    (p) =>
      p.kind === "gathering" ||
      S.engine.loot.some(
        (r) => r.region_id === stay.region && r.profession_id === p.id,
      ),
  );
  if (hero && owned(actor, hero))
    for (const profession of professions) {
      if (
        profession.id === "skinning" &&
        !(stay.carcasses || []).some((c) => !c.used)
      )
        continue;
      const state = activityState(hero, profession, stay);
      const rows = S.engine.loot.filter(
        (r) => r.region_id === stay.region && r.profession_id === profession.id,
      );
      const loot = activityLoot(rows)
        .map((i) => i.name)
        .join(", ");
      const card = button(profession.name, () =>
        activityDialog(hero, profession, stay),
      );
      card.className =
        "activity-card" + (state.reason ? " activity-unavailable" : "");
      card.innerHTML =
        gameIcon(profession.icon) +
        "<strong>" +
        esc(profession.name) +
        "</strong><span>" +
        esc(profession.summary || "Региональное занятие") +
        "</span>" +
        (rows.length
          ? "<small>" +
            timeLabel(
              profession.id === "skinning" ? 1 / 6 : rows[0].hours || 1,
            ) +
            (loot ? " · " + esc(loot) : "") +
            "</small>"
          : "") +
        '<small class="' +
        (state.reason ? "activity-reason" : "game-good") +
        '">' +
        esc(state.reason || "Доступно") +
        "</small>";
      grid.append(card);
    }
  if (!grid.children.length)
    grid.innerHTML =
      '<p class="muted">Выберите героя, чтобы увидеть доступные занятия.</p>';
  if (hero && owned(actor, hero)) {
    tasks.append(
      button("Заняться ремеслом", () => openCraftTab("recipes")),
      button("Местные поручения", localBoard),
      button("Расписание и история", plansPage),
      button("Отдохнуть", () =>
        commandForm(
          "Отдых",
          input(
            "Часов",
            "rh",
            "number",
            1,
            'min="1" max="' + Math.floor(remaining(S, hero)) + '"',
          ),
          "rest",
          () => ({ hero, hours: num("rh") }),
        ),
      ),
    );
    if (remaining(S, hero) < 1) tasks.lastElementChild.disabled = true;
  }
  if (
    master &&
    S.company.staff.length &&
    S.engine.projects.some((j) => j.status === "active")
  )
    tasks.append(button("Работа специалистов", staffWorkDialog));
  const taskArt = [
    ["⚒", "Рецепты и незавершённые проекты"],
    ["!", "Работа для жителей региона"],
    ["▤", "Записки о времени на стоянке"],
    ["☾", "Восстановить силы"],
    ["⚙", "Распределить работу в лагере"],
  ];
  [...tasks.children].forEach((item, i) => {
    const [icon, caption] = taskArt[i];
    const title = item.textContent;
    item.innerHTML =
      gameIcon(icon) +
      "<strong>" +
      esc(title) +
      "</strong><small>" +
      esc(caption) +
      "</small>";
    item.setAttribute("aria-label", title);
    item.classList.add("activity-card");
    if (item.disabled) item.classList.add("activity-unavailable");
  });
  if (!tasks.children.length)
    tasks.innerHTML =
      '<p class="muted">Дела компании доступны назначенным героям.</p>';
}
