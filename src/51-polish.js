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
function gearActions(stackId) {
  const stack = S.company.inventory.find((x) => x.id === stackId);
  const hero = stack?.owner.startsWith("member:") ? stack.owner.slice(7) : "";
  if (!hero || !owned(actor, hero) || !canSeeStack(stack)) return;
  openModal(
    "Работа со снаряжением",
    '<div id="gearActions" class="actions"></div>',
  );
  const box = $("gearActions"),
    select = pick("Стопка", "stack", pairs([stack]), stackId);
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
function recentActivity(box, hero, stay) {
  const loot = stay.history.filter((row) => row.hero === hero && row.item_id).slice(-3)
    .map((row) => {
      const item = S.engine.items.find((entry) => entry.id === row.item_id);
      return item && (!player || !item.hidden) ? item.name + " × " + row.qty : "";
    }).filter(Boolean).join(", ");
  const completion = S.engine.completions.filter((row) => row.hero === hero).at(-1);
  for (const [label, value] of [["Последняя добыча", loot], ["Итог поручения", completion?.result]]) {
    if (!value) continue;
    const line = document.createElement("p");
    line.textContent = label + " · " + value;
    box.append(line);
  }
}
const personView = openAffPerson;
openAffPerson = function (kind, id) {
  personView(kind, id);
  if (kind === "hero" && owned(actor, id)) {
    activeHero = id;
    const links = document.createElement("div");
    links.className = "hero-shortcuts";
    links.append(
      button("Характеристики", heroStats),
      button("Сумки", bagPage),
      button("Профессии", () => openCraftTab("professions")),
      button("Рецепты", () => openCraftTab("recipes")),
      button("Занятия", () => {
        closeModal();
        switchTab("stay");
      }),
      button("Достижения", () => openPersonalAchievements("hero:" + id)),
    );
    $("modalBody").append(links);
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
  if (previewReadOnly) return;
  if (heroRows().length || actor.role === "master")
    $("accountActions").append(
      button(actor.role === "master" ? "Герои компании" : "Мои герои", () => {
        closeModal();
        switchTab(actor.role === "master" ? "company" : "hero");
      }),
    );
  if (actor.role === "master")
    $("accountActions").append(
      button("Мастерская", () => { closeModal(); switchTab("workshop"); }),
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
function bankWithdrawal(stackId = "") {
  const hero = chosen();
  if (!hero || !owned(actor, hero) || !sharedAccess(S, actor, hero)) return;
  commandForm("Получить из банка",
    input("Золото (0 — предмет)", "wg", "number", 0) +
    pick("Стопка", "ws", pairs(S.company.inventory.filter((x) => !x.owner && canSeeStack(x))), stackId) +
    input("Количество предметов", "wq", "number", 1), "withdraw",
    () => ({ hero, gold: num("wg"), stack: val("ws"), qty: num("wq") }));
}
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
        pick(
          "Тип",
          "pkind",
          [
            ["gathering", "Добыча и исследование"],
            ["production", "Производство"],
          ],
          p?.kind || "production",
        ) +
        input("Иконка", "picon", "text", p?.icon || "") +
        area("Краткое описание", "psummary", p?.summary || "") +
        area("Механика", "pdescription", p?.description || "") +
        area("Особые правила", "pspecial", p?.special || "") +
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
                skill: val("ps"),
                kind: val("pkind"),
                icon: val("picon"),
                summary: val("psummary"),
                description: val("pdescription"),
                special: val("pspecial"),
                source: p?.source || { origin: "house" },
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
            (!player || r.showDC !== false ? " · Сл " + esc(r.dc) : "") +
            "</p>",
        )
        .join("") +
      "</div>",
  );
}
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
    tradeDeal: "Рыночная сделка",
    tradeDonation: "Торговый взнос в казну",
    tradeMarkets: "Обновлён рынок",
    tradeProducts: "Обновлено торговое производство",
    tradeRecipeEdit: "Обновлён торговый рецепт",
    facilityTier: "Куплено оборудование",
    facilityRental: "Арендована мастерская",
    deliverGoods: "Выполнена поставка",
    deliveryContract: "Настроена поставка",
    craftTempo: "Изменён темп ремесла",
    contentImport: "Импорт пакета контента",
    contentArchive: "Архивирование пакета",
    npcParticipation: "Изменено участие NPC в компании",
    companionRequest: "Обращение к спутнику",
    resolveCompanionRequest: "Решение по обращению",

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
function editRegionList() {
  if (player) return;
  openModal("Регионы", '<div id="regionList" class="actions"></div>');
  for (const r of S.engine.regions)
    $("regionList").append(button(r.name, () => regionForm(r.points || [], r)));
}
function customCategoryForm() {
  commandForm("Новая категория", input("Название", "newCategory", "text", "", "required"),
    "customCategory", () => ({ name: val("newCategory") }));
}
function trainingModeForm() {
  commandForm("Наставники", check("Обучение обязательно для повышения ранга", "trainer", S.engine.requireTrainer),
    "trainingMode", () => ({ on: $("trainer").checked }));
}
function choosePartyRoute() {
  if (!canTravel() || currentStay(S) || S.journey) return;
  const rows = S.routes.filter((r) => visibleRoute(r) && r.status !== "closed" && [r.a, r.b].includes(S.company.location));
  openModal("Маршруты", '<div id="travelOptions" class="actions"></div>');
  for (const r of rows) $("travelOptions").append(button(routeLabel(r), () => beginJourney(r.id)));
  if (!rows.length) $("travelOptions").textContent = "Из текущего места пока нет доступных маршрутов.";
}
