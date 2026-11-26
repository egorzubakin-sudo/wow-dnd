function canTravel() {
  return (
    actor?.role === "master" || (actor?.role === "captain" && actor.travel)
  );
}
function canSeeStack(x) {
  return (
    !player ||
    (!x.hidden &&
      (!x.owner?.startsWith("member:") ||
        actor?.heroes.includes(x.owner.slice(7))))
  );
}
function plansPage() {
  const hero = chosen(),
    t = currentStay(S);
  openModal("Расписание стоянки", '<div class="stack" id="scheduleBox"></div>');
  const box = $("scheduleBox");
  box.append(
    button("Запланировать занятие", () =>
      commandForm(
        "План занятия",
        input("Занятие", "activity", "text", "", "required") +
          input("Часов", "hrs", "number", 1),
        "schedule",
        () => ({ hero, activity: val("activity"), hours: num("hrs") }),
      ),
    ),
  );
  for (const p of (t.plans || []).filter((p) => p.hero === hero && !p.done)) {
    const row = document.createElement("p");
    row.textContent = p.activity + " · " + p.hours + " ч. ";
    box.append(row);
    for (const [l, cancel] of [
      ["Выполнить", false],
      ["Отменить", true],
    ])
      row.append(
        button(l, () =>
          commandForm(
            l,
            "<p>" + esc(p.activity) + "</p>",
            "resolvePlan",
            () => ({ hero, id: p.id, cancel }),
          ),
        ),
      );
  }
  for (const h of t.history
    .filter((x) => x.hero === hero)
    .slice()
    .reverse()) {
    const p = document.createElement("p");
    p.textContent =
      "День " +
      h.day +
      " · " +
      h.activity +
      " · " +
      roundedHours(h.hours) +
      " ч.";
    box.append(p);
  }
}
function campControl() {
  const e = S.engine;
  form(
    "Эффекты лагеря",
    pick(
      "Сооружение",
      "facility",
      TALENTS.flatMap((b) => b[1]).map((n) => [n, n]),
      "Арсенал",
    ) +
      input(
        "Рецепты, открываемые сооружением (ID через запятую)",
        "facilityRecipes",
      ) +
      pick(
        "Бонус к добыче по профессии",
        "facilityProf",
        [["", "Без бонуса"], ...pairs(e.professions)],
        "",
      ) +
      input("Модификатор проверки", "facilityBonus", "number", 0) +
      check("Преимущество на проверку", "facilityAdv", false) +
      input("Снижение стоимости, %", "discount", "number", 0) +
      input("Снижение времени, %", "speed", "number", 0) +
      input("Ставка специалиста, зм/ч", "wage", "number", 0) +
      input("Часов специалиста в день", "productivity", "number", 8) +
      input(
        "Возврат при отмене проекта, %",
        "refund",
        "number",
        (e.refund ?? 1) * 100,
      ),
    () =>
      execute("campSettings", {
        facility: val("facility"),
        recipes: listText("facilityRecipes"),
        profession: val("facilityProf"),
        bonus: num("facilityBonus"),
        advantage: $("facilityAdv").checked,
        discount: num("discount"),
        speed: num("speed"),
        wage: num("wage"),
        productivity: num("productivity"),
        refund: num("refund"),
      }),
  );
  const show = () => {
    const v = e.campEffects?.[val("facility")] || {};
    $("facilityRecipes").value = (v.recipes || []).join(", ");
    $("facilityProf").value = v.profession || "";
    $("facilityBonus").value = v.bonus || 0;
    $("facilityAdv").checked = !!v.advantage;
    for (const k of ["discount", "speed", "wage", "productivity"])
      $(k).value = v[k] ?? (k === "productivity" ? 8 : 0);
  };
  $("facility").onchange = show;
  show();
}
function professionPage() {
  const hero = chosen(),
    h = profile(S, hero),
    e = economy(S);
  openModal("Профессии", '<div id="profList" class="stack"></div>');
  const box = $("profList");
  for (const p of e.professions) {
    const card = document.createElement("details"),
      ok = eligibleProfession(S, h, p.id);
    card.innerHTML =
      "<summary>" +
      esc(p.name) +
      " · " +
      (ok ? "доступно" : "нужно владение") +
      "</summary><p>" +
      esc(
        [p.skill, ...(p.tools || [])].filter(Boolean).join(" / ") ||
          "Без обязательного владения",
      ) +
      "</p><small>" +
      esc(
        p.source?.book
          ? p.source.book + " · с. " + p.source.printed_page
          : "Правило кампании",
      ) +
      "</small>";
    if (ok) {
      const rank = e.requireTrainer
        ? Math.min(bv(h), h.trained?.[p.id] || 2)
        : bv(h);
      card.append(
        document.createTextNode(
          " · " +
            ["Ученик", "Подмастерье", "Эксперт", "Искусник", "Мастер"][
              Math.max(0, Math.min(4, rank - 2))
            ],
        ),
      );
      if (e.requireTrainer && bv(h) > rank)
        card.append(
          button("Обучиться у наставника", () =>
            commandForm(
              "Обучение",
              "<p>" + esc(bv(h)) + " дн. · " + esc(bv(h) * 2) + " зм</p>",
              "train",
              () => ({ hero, profession: p.id }),
            ),
          ),
        );
    }
    box.append(card);
  }
}
function gearActions() {
  const hero = chosen(),
    bag = S.company.inventory.filter(
      (x) => x.owner === "member:" + hero && canSeeStack(x),
    );
  openModal(
    "Операции с вещами",
    '<div id="gearActions" class="actions"></div>',
  );
  const box = $("gearActions"),
    select = pick("Стопка", "stack", pairs(bag), "");
  (box.append(
    button("Объединить стопки", () =>
      commandForm("Объединить стопки", select, "merge", () => ({
        hero,
        stack: val("stack"),
      })),
    ),
  ),
    box.append(
      button("Распылить предмет", () =>
        commandForm("Распыление · 1 ч.", select, "disenchant", () => ({
          hero,
          stack: val("stack"),
        })),
      ),
    ),
    box.append(
      button("Зачаровать предмет", () =>
        commandForm(
          "Зачарование",
          select +
            pick(
              "Формула",
              "recipe",
              pairs(
                S.engine.recipes.filter(
                  (r) => r.profession_id === "enchanting" && r.properties,
                ),
              ),
              "",
            ),
          "enchant",
          () => ({ hero, stack: val("stack"), recipe: val("recipe") }),
        ),
      ),
    ),
    box.append(
      button("Собрать реликвию", () =>
        commandForm(
          "Реликвия из шести фрагментов",
          pick(
            "Происхождение",
            "fragment",
            pairs(S.engine.items.filter((i) => i.fragmentOrigin)),
            "",
          ),
          "assemble",
          () => ({ hero, fragment: val("fragment") }),
        ),
      ),
    ));
}
function recentActivity(box, hero, t) {
  const rows = t.history
    .filter((x) => x.hero === hero && x.item_id)
    .slice(-3)
    .map((x) => byId(S.engine.items, x.item_id).name + " × " + x.qty);
  const projects = S.engine.projects
    .filter((j) => j.hero === hero && j.status === "active")
    .map((j) => j.name + " · " + j.left + " ч.");
  const completion = S.engine.completions.filter((x) => x.hero === hero).at(-1);
  for (const [label, txt] of [
    ["Последняя добыча", rows.join(", ")],
    ["В работе", projects.join(", ")],
    ["Итог поручения", completion?.result],
  ]) {
    if (txt) {
      const p = document.createElement("p");
      p.textContent = label + " · " + txt;
      box.append(p);
    }
  }
}
actions.push((a, { gm, hero, t, e, box }) => {
  if (t && hero && owned(actor, hero)) {
    if (tab === "home") recentActivity(box, hero, t);
    if (["home", "camp"].includes(tab))
      a.append(button("Расписание", plansPage));
  }
  if (hero && ["company", "bank"].includes(tab))
    a.append(
      button("Профессии", professionPage),
      button("Операции с вещами", gearActions),
    );
  if (gm && tab === "camp") {
    a.append(
      button("Эффекты лагеря", campControl),
      button("Обучение профессиям", () =>
        commandForm(
          "Наставники",
          check(
            "Обучение обязательно для повышения ранга",
            "trainer",
            e.requireTrainer,
          ),
          "trainingMode",
          () => ({ on: $("trainer").checked }),
        ),
      ),
    );
    if (t)
      a.append(
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
    if (
      t &&
      S.company.staff.length &&
      e.projects.some((j) => j.status === "active")
    )
      a.append(
        button("Работа специалиста", () =>
          commandForm(
            "Проект лагеря",
            pick("Специалист", "worker", pairs(S.company.staff), "") +
              pick(
                "Проект",
                "project",
                pairs(e.projects.filter((j) => j.status === "active")),
                "",
              ) +
              input("Отработать часов", "time", "number", 1),
            "staffWork",
            () => ({
              staff: val("worker"),
              project: val("project"),
              hours: num("time"),
            }),
          ),
        ),
      );
  }
  if (actor.role === "captain" && actor.travel && !t && !S.journey) {
    const routes = S.routes.filter(
      (r) =>
        visibleRoute(r) &&
        r.status === "open" &&
        [r.a, r.b].includes(S.company.location),
    );
    if (routes.length)
      a.append(
        button("Отправиться в путь", () => {
          openModal("Маршруты", '<div id="travelOptions"></div>');
          for (const r of routes)
            $("travelOptions").append(
              button(routeLabel(r), () => beginJourney(r.id)),
            );
        }),
      );
  }
});
const personView = openAffPerson;
openAffPerson = function (kind, id) {
  personView(kind, id);
  if (kind === "hero" && owned(actor, id)) {
    activeHero = id;
    $("modalBody").append(
      button("Сумки", bagPage),
      button("Профессии", professionPage),
    );
    if (!player) $("modalBody").append(button("Характеристики", profileForm));
  }
};
const legacyRecords = uxRecords;
uxRecords = function (arch) {
  const rows = legacyRecords(arch);
  for (const k of ["recipes", "regions", "professions"]) {
    for (const x of S.engine?.[k] || []) {
      if (player && x.hidden) continue;
      rows.push({
        id: x.id,
        k,
        key: k + ":" + x.id,
        x,
        name: x.name,
        desc: x.description || "",
      });
    }
  }
  return rows;
};
const legacyOpen = uxOpen;
uxOpen = function (k, id) {
  if (["recipes", "regions", "professions"].includes(k)) {
    const r = uxFind(k, id);
    if (!r) return;
    const x = r.x;
    openModal(
      x.name,
      "<p>" +
        esc(x.description || x.biome || x.tools?.join(" / ") || "") +
        "</p>",
    );
    if (k === "recipes" && chosen())
      $("modalBody").append(button("Книга рецептов", recipeBook));
    return;
  }
  legacyOpen(k, id);
};
applyQuestRewards = function (c, rows, reveal) {
  execute("finishContract", { id: c.id, rows, reveal }, "contract:" + c.id)
    .then(() => {
      closeModal();
      toast("Награды выданы");
    })
    .catch((e) => toast(e.message));
};
function manageUsers() {
  openModal("Пользователи", '<div id="accountList" class="stack"></div>');
  for (const user of accounts)
    $("accountList").append(
      button(user.name + " · " + user.nick, () => {
        form(
          "Права · " + user.nick,
          input("Имя", "display", "text", user.name, "required") +
            pick(
              "Роль",
              "newrole",
              [
                ["master", "Мастер"],
                ["captain", "Капитан"],
                ["player", "Игрок"],
                ["observer", "Наблюдатель"],
              ],
              user.role,
            ) +
            S.company.members
              .map((m, i) =>
                check(memberName(m), "h" + i, user.heroes.includes(m.id)),
              )
              .join("") +
            check("Путешествия капитана", "tc", user.travel) +
            input("Новый пароль (пусто — сохранить)", "resetpw", "password"),
          async () => {
            requireThat(
              user.nick !== actor.nick || val("newrole") === "master",
              "Текущий мастер сохраняет доступ к управлению",
            );
            const value = {
              ...user,
              name: val("display"),
              role: val("newrole"),
              heroes: S.company.members
                .filter((_, i) => $("h" + i).checked)
                .map((m) => m.id),
              travel: $("tc").checked,
            };
            if (val("resetpw")) {
              requireThat(val("resetpw").length >= 8, "От 8 символов");
              value.salt = Array.from(
                crypto.getRandomValues(new Uint8Array(16)),
              );
              value.hash = await passwordKey(val("resetpw"), value.salt);
            }
            await accountStore("readwrite", (s) => s.put(value));
            accounts = accounts.map((a) => (a.nick === user.nick ? value : a));
            if (value.nick === actor.nick) actor = value;
            render();
          },
        );
      }),
    );
}
const baseAccountMenu = accountMenu;
accountMenu = function () {
  baseAccountMenu();
  if (actor.role === "master")
    $("accountActions").append(
      button("Управление пользователями", manageUsers),
    );
};
function economyForm() {
  const e = S.engine;
  commandForm(
    "Экономика кампании",
    pick(
      "Уровень региона",
      "tier",
      [
        [1, "1–4"],
        [2, "5–10"],
        [3, "11–16"],
        [4, "17–20"],
        [5, "Эндгейм"],
      ],
      1,
    ) +
      input("Сл", "edc", "number", 10) +
      input("Обычный ресурс, зм", "common_gp", "number", 10) +
      input("Редкий ресурс, зм", "rare_gp", "number", 25) +
      check("Доступ капитана к банку", "captainBank", e.captainBank) +
      "<details><summary>Герои с доступом к банку</summary>" +
      S.company.members
        .map((m, i) =>
          check(memberName(m), "bank" + i, e.sharedHeroes?.includes(m.id)),
        )
        .join("") +
      "</details>",
    "economySettings",
    () => ({
      tier: num("tier"),
      dc: num("edc"),
      common_gp: num("common_gp"),
      rare_gp: num("rare_gp"),
      captainBank: $("captainBank").checked,
      sharedHeroes: S.company.members
        .filter((_, i) => $("bank" + i).checked)
        .map((m) => m.id),
    }),
  );
  const fill = () => {
    const tier = e.gathering[num("tier") - 1];
    $("edc").value = tier.dc;
    $("common_gp").value = tier.common_gp;
    $("rare_gp").value = tier.rare_gp;
  };
  $("tier").onchange = fill;
  fill();
}
actions.push((a, { gm, hero }) => {
  if (tab !== "bank") return;
  if (gm) a.append(button("Экономика", economyForm));
  if (hero && sharedAccess(S, actor, hero))
    a.append(
      button("Получить из банка", () =>
        commandForm(
          "Получить из банка",
          input("Золото (0 — предмет)", "wg", "number", 0) +
            pick(
              "Стопка",
              "ws",
              pairs(
                S.company.inventory.filter((x) => !x.owner && canSeeStack(x)),
              ),
              "",
            ) +
            input("Количество предметов", "wq", "number", 1),
          "withdraw",
          () => ({ hero, gold: num("wg"), stack: val("ws"), qty: num("wq") }),
        ),
      ),
    );
});
Object.assign(UX_LABEL, {
  regions: "Регион",
  recipes: "Рецепт",
  professions: "Профессия",
});
function professionEditor() {
  const entries = S.engine.professions;
  openModal("Редактор профессий", '<div id="profEdit" class="actions"></div>');
  function edit(p) {
    form(
      p ? "Изменить профессию" : "Новая профессия",
      input(
        "ID",
        "pk",
        "text",
        p?.id || "",
        "required " + (p ? "readonly" : ""),
      ) +
        input("Название", "pn", "text", p?.name || "", "required") +
        input(
          "Допустимые инструменты (хотя бы одно владение)",
          "pt",
          "text",
          (p?.tools || []).join(", "),
        ) +
        pick(
          "Обязательный навык",
          "ps",
          [["", "Не требуется"], ...Object.keys(skills).map((k) => [k, k])],
          p?.skill || "",
        ),
      () =>
        execute("import", {
          mode: p ? "update" : "new",
          pack: {
            professions: [
              {
                id: val("pk"),
                name: val("pn"),
                tools: listText("pt"),
                skill: val("ps") || undefined,
                source: { origin: "house" },
              },
            ],
          },
        }),
    );
  }
  $("profEdit").append(button("Создать", () => edit(null)));
  for (const p of entries) $("profEdit").append(button(p.name, () => edit(p)));
}
function rollHistory() {
  const hero = chosen(),
    h = profile(S, hero);
  openModal(
    "Проверки · " + memberName(heroOf(S, hero)),
    '<div class="stack"><p>' +
      esc(
        Object.entries(h.stats)
          .map(
            ([k, v]) =>
              stats[k] + " " + v + " (" + Math.floor((v - 10) / 2) + ")",
          )
          .join(" · "),
      ) +
      " · БВ +" +
      esc(bv(h)) +
      "</p>" +
      S.engine.rolls
        .filter((r) => r.hero === hero)
        .slice(0, 100)
        .map(
          (r) =>
            "<p>" +
            esc(r.label) +
            " · [" +
            esc(r.raw.join(", ")) +
            "] + " +
            esc(r.mod) +
            " = " +
            esc(r.total) +
            " · Сл " +
            esc(r.dc) +
            "</p>",
        )
        .join("") +
      "</div>",
  );
}
actions.push((a, { gm, hero, t, box }) => {
  if (tab === "bank" && gm)
    a.append(button("Редактор профессий", professionEditor));
  if (hero && tab === "company")
    a.append(button("Журнал проверок", rollHistory));
  if (t && tab === "camp") {
    const image = safeImage(t.image);
    if (image) {
      const el = document.createElement("img");
      el.src = image;
      el.alt = t.name;
      el.className = "record-image";
      box.append(el);
    }
    const details = document.createElement("details");
    details.innerHTML =
      "<summary>Условия стоянки</summary><p>" +
      esc(t.description || "Особых ограничений нет.") +
      "</p><p>" +
      esc((t.services || []).join(", ")) +
      "</p>";
    box.append(details);
  }
});
function journalPanel() {
  const hero = chosen(),
    rows = S.engine.receipts.filter(
      (r) => !player || (r.hero === hero && owned(actor, hero)),
    );
  const labels = {
    project: "Начат проект",
    work: "Работа над проектом",
    gather: "Добыча",
    transfer: "Передача",
    quest: "Местное поручение",
    rest: "Отдых",
    roll: "Проверка",
    session: "Приключение",
    profile: "Изменение профиля",
    demo: "Добавлен пример",
    import: "Импорт справочников",
    stay: "Начало стоянки",
    closeStay: "Конец стоянки",
    gold: "Перевод золота",
  };
  openModal(
    "Журнал операций",
    '<div class="stack">' +
      rows
        .slice(-100)
        .reverse()
        .map(
          (r) =>
            "<p>День " +
            esc(r.day) +
            " · " +
            esc(labels[r.name] || r.name) +
            " · " +
            esc(r.actor) +
            (r.items?.length
              ? " · " +
                esc(
                  r.items
                    .map(
                      (x) =>
                        (S.engine.items.find((i) => i.id === x.item_id)?.name ||
                          x.item_id) +
                        " " +
                        (x.change > 0 ? "+" : "") +
                        x.change,
                    )
                    .join(", "),
                )
              : "") +
            "</p>",
        )
        .join("") +
      "</div>",
  );
}
onRender.push(() => {
  if (tab === "journal")
    $("main").prepend(button("Журнал операций", journalPanel));
  if (!actor || tab !== "home") return;
  const feed = $("engineActions");
  if (!feed) return;
  const extras = [...feed.querySelectorAll("button")].filter((b) =>
    [
      "Профиль героя",
      "Разбить стоянку",
      "Сменить фазу",
      "Последствия сессии",
      "Мастерская данных",
    ].includes(b.textContent),
  );
  if (extras.length) {
    const group = document.createElement("details");
    group.innerHTML = "<summary>Управление кампанией</summary>";
    extras.forEach((b) => group.append(b));
    feed.after(group);
  }
});
actions.push((a, { gm, e }) => {
  if (gm && tab === "bank")
    a.append(
      button("Категория предметов", () =>
        commandForm(
          "Новая категория",
          input("Название", "newCategory", "text", "", "required"),
          "customCategory",
          () => ({ name: val("newCategory") }),
        ),
      ),
    );
  if (gm && tab === "map" && e.regions.length)
    a.append(
      button("Изменить регион", () => {
        openModal("Регионы", '<div id="regionList" class="actions"></div>');
        for (const r of e.regions)
          $("regionList").append(
            button(r.name, () => regionForm(r.points || [], r)),
          );
      }),
    );
});
