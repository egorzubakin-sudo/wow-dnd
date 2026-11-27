function gameIcon(symbol, image) {
  const url = safeImage(image) || safeImage(symbol);
  return (
    '<span class="game-icon" aria-hidden="true">' +
    (url ? '<img src="' + esc(url) + '" alt="">' : esc(symbol || "◆")) +
    "</span>"
  );
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
  box.append(button("Обложка раздела", () => editSectionCover("stay")));
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
    .map((item) => itemIcon(item) + " " + esc(item.name))
    .join(" · ");
  const body =
    '<img class="kit-modal-cover" src="' +
    esc(kitActivityPicture(profession.id)) +
    '" alt=""><p>' +
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
            ? itemIcon(item) +
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
    "Отправиться на вылазку",
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
function kitStayHero(hero, stay) {
  if (!hero) return emptyScene("Ваш герой не назначен.");
  const member = heroOf(S, hero),
    hours = remaining(S, hero),
    total = stay.hours * stay.days;
  const p = profile(S, hero);
  const known = S.engine.professions
    .filter((profession) => p.professions.includes(profession.id))
    .map((profession) => profession.name);
  return (
    '<div class="kit-panel kit-today"><div class="eyebrow">Ваш герой</div>' +
    '<div class="kit-row">' +
    kitAvatar(member) +
    '<div class="kit-grow"><b>' +
    esc(memberName(member)) +
    '</b><div class="muted">' +
    esc(kitHeroDescription(p)) +
    "</div>" +
    (known.length ? "<small>" + esc(known.join(" · ")) + "</small>" : "") +
    "</div></div>" +
    '<div class="kit-time"><span class="muted">Свободное время</span><b>' +
    esc(timeLabel(hours)) +
    " <small>/ " +
    esc(timeLabel(total)) +
    "</small></b></div>" +
    '<div class="kit-progress" role="progressbar" aria-label="Свободное время" aria-valuenow="' +
    hours +
    '" aria-valuemax="' +
    total +
    '"><i style="width:' +
    (hours / total) * 100 +
    '%"></i></div>' +
    '<div class="kit-quick">' +
    kitLink("Сумки", "bagPage()", "bank") +
    kitLink("Ремесло", "openCraftTab('recipes')", "craft") +
    kitLink("Герой", "openAffPerson('hero'," + jsid(hero) + ")", "company") +
    "</div></div>"
  );
}
function kitActivityCard({
  name,
  picture,
  icon,
  stamp = "",
  description,
  loot = "",
  status,
  reason = "",
  action,
}) {
  const card = button(name, action);
  card.className = "kit-artcard" + (reason ? " kit-locked" : "");
  card.innerHTML =
    '<img class="kit-card-art" src="' +
    esc(picture) +
    '" alt="" loading="lazy">' +
    (stamp ? '<span class="kit-stamp">' + esc(stamp) + "</span>" : "") +
    '<div class="kit-card-content"><div class="kit-row">' +
    icon +
    "<h3>" +
    esc(name) +
    "</h3></div>" +
    '<p class="muted">' +
    esc(description) +
    '</p>' +
    (loot
      ? '<small class="kit-card-loot" title="' + esc(loot) + '">' + esc(loot) + '</small>'
      : '') +
    '<span class="kit-badge' +
    (reason ? " kit-no" : "") +
    '">' +
    esc(reason || status) +
    "</span></div>";
  return card;
}
function renderStay() {
  const stay = currentStay(S),
    hero = chosen(),
    root = $("main"),
    master = !player;
  const customArt = safeImage(S.settings.visual?.covers?.stay);
  if (!stay) {
    root.innerHTML =
      '<div class="atlas-kit kit-stay"><section class="kit-wideart"><img class="kit-cover-image" src="' +
      esc(customArt || kitArtUrl("camp")) +
      '" alt="">' +
      '<div class="kit-herotext"><div class="eyebrow">' +
      esc(phases[S.journey ? "travel" : S.engine.phase]) +
      "</div>" +
      "<h2>Стоянка</h2><p>Добыча, отдых и местные поручения станут доступны, когда компания разобьёт стоянку.</p></div>" +
      '<div class="kit-hero-actions" id="stayActions"></div></section></div>';
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
  const region = S.engine.regions.find((r) => r.id === stay.region);
  const place = locLabel(stay.location);
  const cover =
    safeImage(stay.image) ||
    safeImage(region?.image) ||
    customArt ||
    kitArtUrl("camp");
  const description =
    stay.description ||
    region?.description ||
    "Компания остановилась, чтобы пополнить припасы и подготовиться к дороге.";
  const actions = master
    ? '<div id="stayAdminLink" class="kit-hero-actions">' +
      kitLink("Управление стоянкой", "stayAdmin()", "gear", "kit-small") +
      "</div>"
    : "";
  root.innerHTML =
    '<div class="atlas-kit kit-stay"><section class="kit-wideart">' +
    '<img class="kit-cover-image" src="' +
    esc(cover) +
    '" alt="">' +
    '<div class="kit-herotext"><div class="eyebrow">' +
    esc(
      [region?.continent, region?.name, "День " + S.company.day]
        .filter(Boolean)
        .join(" · "),
    ) +
    "</div><h2>" +
    esc(stay.name || place || "Стоянка") +
    "</h2><p>" +
    esc(description) +
    '</p><p class="kit-stay-dates">' +
    esc(`${stay.days} дн. · День ${stay.start}–${stay.start + stay.days}`) +
    "</p></div>" +
    actions +
    "</section>" +
    '<div class="kit-staylayout"><section>' +
    kitSubhead("Чем займёмся сегодня?", "Добыча и исследование") +
    (stay.limits ? '<p class="kit-notice">' + esc(stay.limits) + "</p>" : "") +
    '<div class="kit-activitygrid" id="activitiesGrid"></div>' +
    kitSubhead("Местные дела") +
    '<div class="kit-panel kit-task-panel" id="stayTasks"></div></section>' +
    '<aside class="kit-sticky"><div class="kit-toolbar">' +
    kitHeroSelect(hero) +
    "</div>" +
    kitStayHero(hero, stay) +
    kitSubhead("Сегодня") +
    '<div class="kit-panel">' +
    kitStayHistory(hero, stay, place) +
    "</div></aside></div></div>";
  bindKitHero();
  const list = $("activitiesGrid");
  if (hero && owned(actor, hero)) {
    const professions = S.engine.professions.filter(
      (p) =>
        p.kind === "gathering" ||
        S.engine.loot.some(
          (row) => row.region_id === stay.region && row.profession_id === p.id,
        ),
    );
    const order = [
      "mining",
      "herbalism",
      "hunt",
      "fishing",
      "archaeology",
      "skinning",
    ];
    const rank = (id) =>
      order.includes(id) ? order.indexOf(id) : order.length;
    professions.sort((a, b) => rank(a.id) - rank(b.id));
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
      list.append(
        kitActivityCard({
          name: profession.name,
          picture: kitActivityPicture(profession.id),
          icon: professionIcon(profession),
          description: profession.summary || "Региональное занятие",
          loot: activityLoot(rows).map((item) => item.name).join(", "),
          stamp: rows.length
            ? timeLabel(profession.id === "skinning" ? 1 / 6 : rows[0].hours || 1)
            : "",
          status: "Доступно",
          reason: state.reason,
          action: () => activityDialog(hero, profession, stay),
        }),
      );
    }
    list.append(
      kitActivityCard({
        name: "Ремесло",
        picture: kitArtUrl("market"),
        icon: uiIcon("craft"),
        stamp: "Книга рецептов",
        description: "Создавайте предметы и продолжайте проекты.",
        status: "Открыть",
        action: () => openCraftTab("recipes"),
      }),
    );
  }
  if (!list.children.length)
    list.innerHTML = emptyScene("Выберите героя, чтобы увидеть занятия.");
  drawKitStayTasks(hero, stay, master);
}
function kitStayHistory(hero, stay, place) {
  const rows = stay.history
    .filter((row) => row.hero === hero)
    .slice(-3)
    .reverse();
  return rows.length
    ? rows
        .map(
          (row) =>
            '<p class="kit-listrow"><small>' +
            esc(
              "День " +
                row.day +
                " · " +
                (S.engine.professions.find((p) => p.id === row.activity)
                  ?.name || row.activity) +
                " · " +
                timeLabel(row.hours),
            ) +
            "</small></p>",
        )
        .join("")
    : '<p class="kit-listrow"><small>' +
        esc(
          "День " +
            stay.start +
            " · Компания разбила стоянку" +
            (place ? " · " + place : "") +
            " · " +
            stay.days +
            " дн.",
        ) +
        "</small></p>";
}
function drawKitStayTasks(hero, stay, master) {
  const box = $("stayTasks");
  function task(name, detail, icon, action) {
    const control = button(name, action);
    control.className = "kit-listrow";
    control.setAttribute("aria-label", name);
    control.innerHTML =
      uiIcon(icon) +
      '<span class="kit-grow"><b>' +
      esc(name) +
      "</b><small>" +
      esc(detail) +
      '</small></span><span aria-hidden="true">›</span>';
    box.append(control);
    return control;
  }
  if (hero && owned(actor, hero)) {
    const local = S.contracts.filter(
      (q) => q.type === "local" && questAvailable(S, q, hero),
    );
    if (local[0])
      task(
        local[0].title,
        "Местное поручение · " + timeLabel(local[0].hours),
        "contracts",
        () => localBoard(local[0].id),
      );
    task(
      "Местные поручения",
      local.length
        ? "Доступные поручения · " + local.length
        : "Пока нет доступных поручений",
      "contracts",
      () => localBoard(),
    );
    task("Отдохнуть", "Провести время у костра", "rest", () =>
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
    ).disabled = remaining(S, hero) < 1;
    task(
      "Расписание и история",
      "Записки о времени на стоянке",
      "journal",
      plansPage,
    );
  }
  if (
    master &&
    S.company.staff.length &&
    S.engine.projects.some((j) => j.status === "active")
  )
    task(
      "Работа специалистов",
      "Распределить работу в лагере",
      "gear",
      staffWorkDialog,
    );
  if (!box.children.length)
    box.innerHTML = emptyScene("Дела компании доступны назначенным героям.");
}
