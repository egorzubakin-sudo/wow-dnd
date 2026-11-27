let factionPanel = "overview",
  factionRegion = "",
  storageView = "grid",
  storageQuality = "";
function factionTowns(f) {
  return S.nodes.filter((n) => n.faction === f.id && visibleNode(n));
}
function factionQuests(f) {
  return S.contracts.filter(
    (q) => q.faction === f.id && uxFind("contract", q.id),
  );
}
function factionEmblem(f) {
  return sectionArt(f.emblem, "emblem", f.icon || "⚑", "", iconPath(f.iconId));
}
function factionMenu(f) {
  if (player) return "";
  const id = jsid(f.id);
  return visualMenu(
    "Действия с фракцией",
    visualAction("Изменить", "editFaction(" + id + ")") +
      visualAction("Обложка и эмблема", "editFactionArt(" + id + ")") +
      visualAction("Эмблема из библиотеки", "pickRecordIcon(faction(" + id + "),'factions',null,'emblem')") +
      visualAction("Изменить репутацию", "changeRep(" + id + ")") +
      visualAction("Удалить", "deleteFaction(" + id + ")", "danger"),
  );
}
function editFactionArt(id) {
  const f = faction(id);
  if (!f || player) return;
  editVisualImages(
    f.name,
    [
      { key: "factionCover", label: "Широкая обложка", image: f.cover },
      { key: "factionEmblem", label: "Квадратная эмблема", image: f.emblem },
    ],
    (images) =>
      Object.assign(f, {
        cover: images.factionCover,
        emblem: images.factionEmblem,
      }),
  );
}
function factionOverviewCard(f) {
  const leader = factionLeaderLabel(f),
    quests = factionQuests(f).filter((q) => q.status === "available");
  return (
    '<article class="visual-card faction-wow faction-overview">' +
    '<button class="visual-open" onclick="focusFaction(' +
    jsid(f.id) +
    ')">' +
    sectionArt(f.cover, "cover", "⚑", "", kitArtUrl(f.repPoints < -3000 ? "ruins" : f.region === "kalimdor" ? "forest" : "city")) +
    '<span class="faction-card-title">' +
    factionEmblem(f) +
    "<span><strong>" +
    esc(f.name) +
    "</strong>" +
    (leader ? "<small>" + esc(leader) + "</small>" : "") +
    "</span></span></button>" +
    '<div class="faction-card-copy">' +
    repBar(f) +
    (f.desc ? "<p>" + esc(excerpt(f.desc, 120)) + "</p>" : "") +
    "<small>" +
    factionPeople(f).length +
    " предст. · " +
    factionTowns(f).length +
    " мест · " +
    quests.length +
    " заданий</small></div>" +
    '<div class="visual-card-menu">' +
    factionMenu(f) +
    "</div></article>"
  );
}
renderFactions = function () {
  const groups = [...REGIONS, ["hostile", "Враждебные фракции"]];
  const factions = S.factions.filter(visibleFaction);
  const controls =
    visualAction("Дипломатия", "switchTab(\'diplomacy\')") +
    (!player ? visualAction("Новая фракция", "editFaction()", "primary") : "");
  $("main").innerHTML =
    '<div class="screen visual-screen">' +
    sectionHeader(
      "Фракции",
      "Союзы, соперники и репутация компании.",
      controls,
    ) +
    '<div class="kit-tabs" aria-label="Регионы фракций">' +
    [["", "Все регионы"], ...groups].map(([key, label]) =>
      '<button class="kit-tab" aria-pressed="' + (factionRegion === key) +
      '" onclick="factionRegion=' + jsid(key) + ';renderFactions()">' + esc(label) + '</button>'
    ).join("") + '</div>' +
    groups
      .filter(([key]) => !factionRegion || factionRegion === key)
      .map(([key, label]) => {
        const rows = factions.filter((f) =>
          key === "hostile"
            ? f.repPoints < -3000
            : f.repPoints >= -3000 && f.region === key,
        );
        return rows.length
          ? '<section class="faction-region"><h3>' +
              esc(label) +
              '</h3><div class="faction-gallery">' +
              rows.map(factionOverviewCard).join("") +
              "</div></section>"
          : "";
      })
      .join("") +
    (factions.some((f) => !factionRegion || (f.repPoints < -3000 ? factionRegion === "hostile" : f.region === factionRegion))
      ? ""
      : emptyScene(factionRegion ? "В этом регионе пока нет известных фракций." : "Компания ещё не знает местных фракций.")) +
    '<details class="visual-guide"><summary>Уровни репутации</summary>' +
    reputationGuide() +
    "</details></div>";
};
function reputationGuide() {
  return REP_LEVELS.slice()
    .reverse()
    .map(
      (l) =>
        '<div class="rep-guide"><b style="color:' +
        l.color +
        '">' +
        esc(l.name) +
        "</b><span>" +
        esc(l.min.toLocaleString("ru-RU")) +
        " очков</span><span>" +
        esc(l.desc) +
        (l.discount ? " · ориентир скидки " + l.discount + "%" : "") +
        "</span></div>",
    )
    .join("");
}
focusFaction = function (id) {
  factionPanel = "overview";
  openFactionPanel(id);
};
function openFactionPanel(id, selected = factionPanel) {
  const f = faction(id);
  if (!f || !visibleFaction(f)) return;
  factionPanel = selected;
  const panels = [
    ["overview", "Обзор"],
    ["people", "Представители"],
    ["places", "Территории"],
    ["diplomacy", "Дипломатия"],
    ["quests", "Задания"],
    ["reputation", "Репутация и привилегии"],
  ];
  const region = REGIONS.find(([key]) => key === f.region)?.[1];
  openModal(
    f.name,
    '<div class="faction-dossier">' +
      sectionArt(f.cover, "cover", "⚑") +
      '<div class="faction-card-title">' +
      factionEmblem(f) +
      "<div><strong>" +
      esc(f.name) +
      "</strong><small>" +
      esc([factionLeaderLabel(f), region].filter(Boolean).join(" · ")) +
      "</small></div>" +
      factionMenu(f) +
      "</div>" +
      '<div class="actions game-tabs">' +
      panels
        .map(
          ([key, label]) =>
            '<button aria-pressed="' +
            (key === selected) +
            '" onclick="openFactionPanel(' +
            jsid(id) +
            "," +
            jsid(key) +
            ')">' +
            label +
            "</button>",
        )
        .join("") +
      "</div>" +
      '<div id="factionPanel" class="reader"></div></div>',
  );
  const list = (rows, empty) =>
    rows.length
      ? '<div class="faction-links">' + rows.join("") + "</div>"
      : emptyScene(empty);
  const tabs = {
    overview: () =>
      repBar(f) +
      (f.desc ? '<p class="record-body">' + esc(f.desc) + "</p>" : "") +
      '<div class="actions">' +
      uxFavButton("faction", id) +
      "</div>" +
      (!player && f.notes
        ? '<p class="notice record-body">' + esc(f.notes) + "</p>"
        : ""),
    people: () =>
      list(
        factionPeople(f).map(
          (x) =>
            '<button class="aff-person" onclick="openAffPerson(' +
            jsid(x.kind) +
            "," +
            jsid(x.record.id) +
            ')">' +
            sectionArt(x.record.image, "emblem", "♟") +
            "<span>" +
            esc(x.name) +
            "<small>" +
            esc(rankLabel(x.record)) +
            "</small></span></button>",
        ),
        "Представители пока неизвестны.",
      ),
    places: () =>
      list(
        factionTowns(f).map((x) => uxBtn("node", x.id, x.name)),
        "Известные территории пока не отмечены на карте.",
      ),
    diplomacy: () =>
      list(
        S.diplomacy
          .filter((r) => (r.a === id || r.b === id) && visibleDiplomacy(r))
          .map((r) => {
            const other = faction(r.a === id ? r.b : r.a);
            return uxBtn("diplomacy", r.id, other.name + " · " + dipInfo(r)[1]);
          }),
        "Дипломатические отношения пока не записаны.",
      ),
    quests: () =>
      list(
        factionQuests(f).map((q) => uxBtn("contract", q.id, q.title)),
        "Связанные задания пока неизвестны.",
      ),
    reputation: () =>
      repBar(f) +
      "<p>" +
      esc(reputation(f).desc) +
      "</p>" +
      (f.charter
        ? '<h3>Привилегии и грамоты</h3><p class="record-body">' +
          esc(f.charter) +
          "</p>"
        : emptyScene("Верительных грамот пока нет.")) +
      '<details class="visual-guide"><summary>Уровни репутации</summary>' +
      reputationGuide() +
      "</details>",
  };
  $("factionPanel").innerHTML = tabs[selected]();
  uxLinkify($("factionPanel"));
}
function slotButton(x) {
  const quality = ITEM_QUAL.find((q) => q[0] === x.quality) || ITEM_QUAL[0];
  const image = stackIconSrc(x);
  return (
    '<button class="item-slot inventory-slot" style="--quality:' +
    quality[2] +
    '" onclick="openItem(' +
    jsid(x.id) +
    ')" aria-label="' +
    esc(x.name + " × " + x.qty) +
    '" title="' +
    esc(
      x.name +
        " · " +
        quality[1] +
        (x.desc ? " · " + excerpt(x.desc, 100) : ""),
    ) +
    '">' +
    (image
      ? '<img src="' + esc(image) + '" alt="">'
      : '<span aria-hidden="true">' + esc(x.icon || "◆") + "</span>") +
    '<b aria-hidden="true">' +
    esc(x.qty) +
    "</b></button>"
  );
}
function slotGrid(rows) {
  return (
    '<div class="inventory-slots">' + rows.map(slotButton).join("") + "</div>"
  );
}
function changeBankOwner(owner) {
  bankOwner = owner;
  render();
}
function storageGroups(rows) {
  const company = rows.filter((x) => !x.owner);
  const personal = rows.filter((x) => x.owner);
  if (!rows.length)
    return emptyScene(
      bankQuery || bankFilter || storageQuality
        ? "По этим фильтрам нет предметов."
        : "В хранилище пока нет добычи и припасов.",
      !player ? visualAction("Добавить предмет", "editItem()") : "",
    );
  if (storageView === "table" && !player)
    return (
      '<div class="storage-table"><table><thead><tr><th>Предмет</th><th>Владелец</th><th>Категория</th><th>Количество</th></tr></thead><tbody>' +
      rows
        .map(
          (x) =>
            "<tr><td>" +
            visualAction(x.name, "openItem(" + jsid(x.id) + ")", "ghost") +
            "</td><td>" +
            esc(ownerLabel(x.owner)) +
            "</td><td>" +
            esc(x.category) +
            "</td><td>" +
            esc(x.qty) +
            "</td></tr>",
        )
        .join("") +
      "</tbody></table></div>"
    );
  return [
    [company, "Общий банк"],
    [personal, "Личное и фракционное имущество"],
  ]
    .filter(([items]) => items.length)
    .map(
      ([items, label]) =>
        '<section class="storage-chest"><h3>' +
        label +
        "</h3>" +
        slotGrid(items) +
        "</section>",
    )
    .join("");
}
renderBank = function () {
  const hero = chosen(), personalOwner = hero ? "member:" + hero : null;
  const visible = S.company.inventory.filter(canSeeStack);
  const rows = visible.filter(
    (x) =>
      (!bankFilter || x.category === bankFilter) &&
      (bankOwner === "all" || (x.owner || "") === bankOwner) &&
      (!storageQuality || x.quality === storageQuality) &&
      (!bankQuery ||
        [x.name, x.desc, x.category, ownerLabel(x.owner)].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(bankQuery.toLowerCase()),
        )),
  );
  const categories = [
    ...new Set([...ITEM_TYPES, ...(S.engine?.categories || [])]),
  ];
  const controls = !player
    ? visualMenu(
        "Управление хранилищем",
        visualAction("Добавить предмет", "editItem()") +
          visualAction("Зачислить или списать золото", "treasury()") +
          visualAction("Установить остаток", "setGold()"),
      )
    : "";
  $("main").innerHTML =
    '<div class="screen visual-screen">' +
    sectionHeader(
      "Хранилище",
      "Добыча, припасы и имущество компании.",
      kitHeroSelect(hero) + controls,
    ) +
    '<div class="kit-tabs" aria-label="Доступное имущество">' +
    [[personalOwner, "Сумки героя", "bank"], ["", "Банк компании", "bank"], ["all", "Все владельцы", "company"]]
      .filter(([owner]) => owner !== null)
      .map(([owner, label, icon]) => '<button class="kit-tab" aria-pressed="' + (bankOwner === owner) +
        '" onclick="changeBankOwner(' + jsid(owner) + ')">' + uiIcon(icon) + esc(label) + '</button>')
      .join("") + '</div>' +
    '<div class="kit-bank-layout"><div class="kit-panel kit-bank-main">' +
    '<div class="treasury-strip">' + uiIcon("bank") + '<div><small>' +
    esc(personalOwner && bankOwner === personalOwner ? ownerLabel(personalOwner) : "Казна компании") + '</small><strong>' +
    esc((personalOwner && bankOwner === personalOwner ? profile(S, hero).wallet : S.company.gold).toLocaleString("ru-RU")) +
    ' зм</strong></div>' +
    (hero ? visualAction("Личные сумки", "bagPage()") : "") +
    '</div>' +
    '<div class="visual-filters"><input id="bankSearch" type="search" aria-label="Поиск предметов" placeholder="Поиск предметов" value="' +
    esc(bankQuery) +
    '">' +
    pick(
      "Категория",
      "bankCategory",
      [["", "Все категории"], ...categories.map((c) => [c, c])],
      bankFilter,
    ) +
    pick(
      "Владелец",
      "bankOwnerPicker",
      [
        ["all", "Все владельцы"],
        ...ownerOptions(bankOwner).filter(
          ([id]) => !id || id === personalOwner || !player || visible.some((x) => x.owner === id),
        ),
      ],
      bankOwner,
    ) +
    pick(
      "Редкость",
      "bankQuality",
      [["", "Любая редкость"], ...ITEM_QUAL.map((q) => q.slice(0, 2))],
      storageQuality,
    ) +
    (!player
      ? '<div class="visual-switch">' +
        visualAction(
          storageView === "grid" ? "Таблица" : "Ячейки",
          "toggleStorageView()",
        ) +
        "</div>"
      : "") +
    "</div>" +
    storageGroups(rows) +
    '</div><aside class="kit-panel kit-bank-aside"><div class="eyebrow">Имущество</div><h3>Снаряжение и ресурсы</h3>' +
    '<p class="muted">Добытые материалы появляются в личных сумках. Оттуда их можно передать в общий банк или использовать в ремесле.</p>' +
    kitLink("Книга рецептов", "openCraftTab('recipes')", "craft", "primary") + '</aside></div></div>';
  if ($("gameHero")) $("gameHero").onchange = () => {
    const personal = personalOwner && bankOwner === personalOwner;
    activeHero = val("gameHero");
    if (personal) bankOwner = "member:" + activeHero;
    render();
  };
  $("bankSearch").oninput = (e) => {
    const end = e.target.selectionStart;
    bankQuery = e.target.value;
    render();
    $("bankSearch").focus({ preventScroll: true });
    $("bankSearch").setSelectionRange(end, end);
  };
  $("bankCategory").onchange = () => {
    bankFilter = val("bankCategory");
    render();
  };
  $("bankOwnerPicker").onchange = () => {
    bankOwner = val("bankOwnerPicker");
    render();
  };
  $("bankQuality").onchange = () => {
    storageQuality = val("bankQuality");
    render();
  };
};
function toggleStorageView() {
  if (!player) {
    storageView = storageView === "grid" ? "table" : "grid";
    render();
  }
}
openItem = function (id) {
  const x = S.company.inventory.find((i) => i.id === id);
  if (!x || !canSeeStack(x)) return;
  const q = ITEM_QUAL.find((q) => q[0] === x.quality) || ITEM_QUAL[0],
    catalog = S.engine.items.find((i) => i.id === x.item_id);
  const properties = x.properties ?? catalog?.properties;
  const details =
    properties && typeof properties === "object"
      ? Object.entries(properties)
          .map(
            ([key, value]) =>
              "<li>" +
              esc(key) +
              " · " +
              esc(typeof value === "object" ? JSON.stringify(value) : value) +
              "</li>",
          )
          .join("")
      : "";
  const args = jsid(id);
  const admin = !player
    ? visualMenu(
        "Действия с предметом",
        visualAction("Редактировать", "editItem(" + args + ")") +
          visualAction("Выбрать иконку", "pickInventoryIcon(" + args + ")") +
          visualAction("Увеличить количество", "itemQty(" + args + ",1)") +
          (x.qty > 0
            ? visualAction("Уменьшить количество", "itemQty(" + args + ",-1)") +
              visualAction("Передать как мастер", "transferItem(" + args + ")")
            : ""),
      )
    : "";
  openModal(
    x.name,
    '<article class="reader item-dossier"><div class="item-dossier-title">' +
      sectionArt("", "emblem", x.icon || "◆", "", stackIconSrc(x, catalog)) +
      '<div><strong style="color:' +
      q[2] +
      '">' +
      esc(x.name) +
      "</strong><small>" +
      esc([q[1], x.category, ownerLabel(x.owner)].filter(Boolean).join(" · ")) +
      "</small></div>" +
      admin +
      '</div><dl class="item-values"><div><dt>Количество</dt><dd>' +
      esc(x.qty) +
      "</dd></div>" +
      "<div><dt>Цена за единицу</dt><dd>" +
      ((x.value_gp ?? catalog?.value_gp) != null
        ? esc(x.value_gp ?? catalog.value_gp) + " зм"
        : "Не указана") +
      "</dd></div></dl>" +
      (x.desc || catalog?.desc
        ? '<p class="record-body">' + esc(x.desc || catalog.desc) + "</p>"
        : "") +
      (details ? "<ul>" + details + "</ul>" : "") +
      equipmentDetails(x, catalog) +
      '<div class="actions">' +
      uxFavButton("item", id) +
      (x.qty > 0 &&
      x.owner?.startsWith("member:") &&
      owned(actor, x.owner.slice(7))
        ? visualAction(
            "Передать или разделить",
            "bagTransfer(" + args + ")",
            "primary",
          )
        : "") +
      "</div></article>",
  );
};
function questMainActions(q) {
  const id = jsid(q.id);
  if (q.type === "delivery")
    return deliveryQuote(S, actor, chosen(), q).reasons.length ? "" :
      visualAction("Доставить товары", "confirmDelivery(" + id + ")", "primary");
  if (q.type === "local") {
    const hero = chosen();
    return hero && owned(actor, hero) && questAvailable(S, q, hero)
      ? visualAction("Выбрать решение", "localBoard(" + id + ")", "primary")
      : "";
  }
  if (player) return "";
  if (q.status === "available")
    return visualAction(
      "Принять",
      "closeModal();questStatus(" + id + ",'active')",
      "primary",
    );
  if (q.status === "active")
    return visualAction(
      "Завершить",
      "rewardDialog(" + id + ",true)",
      "primary",
    );
  return "";
}
function questMenu(q) {
  if (player) return "";
  const id = jsid(q.id);
  return visualMenu(
    "Действия с заданием",
    visualAction(
      "Изменить",
      q.type === "local"
        ? "errandEditor(S.contracts.find(q=>q.id===" + id + "))"
        : q.type === "delivery" ? "editDelivery(" + id + ")" : "editContract(" + id + ")",
    ) +
      visualAction("Выбрать иконку", "pickQuestIcon(" + id + ")") +
      (q.type !== "local" && q.type !== "delivery" && q.status !== "done" && !q.rewardReceipt
        ? visualAction("Настроить награды", "rewardDialog(" + id + ",false)")
        : "") +
      ((q.rewardHidden || q.rewardSecret) && !q.rewardRevealed
        ? visualAction("Открыть награду", "revealReward(" + id + ")")
        : "") +
      (q.type !== "local" && q.type !== "delivery"
        ? visualAction("Дублировать", "uxDuplicate('contract'," + id + ")")
        : "") +
      visualAction("В архив", "removeContract(" + id + ")", "danger"),
  );
}
let selectedBoardQuest = "";
function questOverview(q) {
  const active = selectedBoardQuest === q.id;
  return (
    '<button type="button" class="kit-quest-line quest-' + esc(q.status) +
    '" aria-pressed="' + active + '" onclick="selectBoardQuest(' + jsid(q.id) +
    ')"><span class="quest-seal" aria-hidden="true">' + questIcon(q) +
    '</span>' + questIllustration(q) + '<span class="kit-grow"><small>' +
    esc([q.type === "local" ? "Поручение" : q.type === "delivery" ? "Поставка" : "Контракт", CS.find(([key]) => key === q.status)?.[1], questPlace(q)].filter(Boolean).join(" · ")) +
    '</small><strong>' + esc(q.title) + '</strong><small>' + esc(questGiver(q)) +
    '</small></span><span aria-hidden="true">›</span></button>'
  );
}
function questIllustration(q) {
  return q.badgeImage || q.iconId
    ? libraryIcon({ image: q.badgeImage, iconId: q.iconId }, iconDefaults.nav.contracts)
    : "";
}
function selectBoardQuest(id) {
  selectedBoardQuest = id;
  renderContracts();
  $("boardQuestDetail")?.focus({ preventScroll: true });
  if (matchMedia("(max-width: 700px)").matches)
    $("boardQuestDetail")?.scrollIntoView({ block: "start" });
}
renderContracts = function () {
  const all = S.contracts.filter((c) => !c.archived && (!player || !c.hidden));
  const rows = all.filter(
    (c) =>
      (questFilter === "all" || c.status === questFilter) &&
      (!questFaction ||
        (questFaction === "none" ? !c.faction : c.faction === questFaction)),
  );
  const controls = !player
    ? visualAction("Новое задание", "editContract()", "primary") + visualAction("Новая поставка", "editDelivery()")
    : "";
  const selected = rows.find((q) => q.id === selectedBoardQuest) || rows[0];
  selectedBoardQuest = selected?.id || "";
  $("main").innerHTML =
    '<div class="screen visual-screen">' +
    sectionHeader(
      "Журнал заданий",
      "Контракты компании и местные поручения.",
      controls,
    ) +
    '<div class="visual-filters"><div class="actions game-tabs">' +
    [["all", "Все задания"], ...CS]
      .map(
        ([key, label]) =>
          '<button aria-pressed="' +
          (questFilter === key) +
          '" onclick="questFilter=' +
          jsid(key) +
          ';render()">' +
          esc(label) +
          "</button>",
      )
      .join("") +
    "</div>" +
    pick(
      "Фракция",
      "questFactionPicker",
      [
        ["", "Все фракции"],
        ["none", "Без фракции"],
        ...pairs(S.factions.filter(visibleFaction)),
      ],
      questFaction,
    ) +
    "</div>" +
    (selected
      ? '<div class="kit-quest-layout"><div class="kit-quest-list">' +
        [["contract", "Контракты"], ["local", "Местные поручения"], ["delivery", "Поставки"]]
          .map(([kind, title]) => {
            const portion = rows.filter((q) => kind === "contract" ? !["local", "delivery"].includes(q.type) : q.type === kind);
            return portion.length ? '<section><h3>' + title + '</h3>' +
              portion.map(questOverview).join("") + '</section>' : "";
          }).join("") + '</div><div id="boardQuestDetail" tabindex="-1" aria-label="Выбранное задание">' +
        questPaper(selected, true) + '</div></div>'
      : "") +
    (rows.length
      ? ""
      : emptyScene(
          all.length
            ? "По этим условиям заданий нет."
            : "Журнал ждёт первого задания.",
        )) +
    "</div>";
  $("questFactionPicker").onchange = () => {
    questFaction = val("questFactionPicker");
    render();
  };
  uxLinkify($("boardQuestDetail"));
};
openMapQuest = function (id) {
  const q = S.contracts.find((x) => x.id === id);
  if (!q || q.archived || (player && q.hidden)) return;
  openModal(q.title, questPaper(q));
  uxLinkify($("modalBody"));
};
function questPaper(q, inline = false) {
  const id = q.id;
  const reward = q.rewardReceipt?.rewards || q.rewards || [];
  const visible = reward.filter(
    (r) => !player || !(q.rewardHidden || r.secret) || q.rewardRevealed,
  );
  const region = S.engine.regions.find((r) => r.id === q.region_id);
  const place = questPlace(q);
  const conditions = q.conditions || {};
  const conditionNotes = [
    conditions.race,
    conditions.class,
    conditions.level ? "Уровень от " + conditions.level : "",
    conditions.skill,
    S.engine.professions.find((p) => p.id === conditions.profession)?.name,
  ]
    .filter(Boolean)
    .join(" · ");
  const relation = uxRelated("contract", id);
  return (
    '<article class="quest-paper reader"><header><span class="quest-seal" aria-hidden="true">' +
      questIcon(q) +
      "</span>" + questIllustration(q) + "<div><small>" +
      esc(q.type === "local" ? "Местное поручение" : q.type === "delivery" ? "Поставка" : "Контракт") +
      "</small><p>" +
      esc(
        [questGiver(q), place, region?.name, questFactionName(q)]
          .filter(Boolean)
          .join(" · "),
      ) +
      "</p></div>" +
      questMenu(q) +
      "</header>" +
      (inline ? "<h2>" + esc(q.title) + "</h2>" : "") +
      (safeImage(q.image) ? sectionArt(q.image, "cover", "") : "") +
      (q.desc
        ? '<section><h3>Завязка</h3><p class="record-body">' +
          esc(q.desc) +
          "</p></section>"
        : "") +
      (q.objectives
        ? '<section><h3>Цели</h3><p class="record-body">' +
          esc(q.objectives) +
          "</p></section>"
        : "") +
      (q.hours || conditionNotes
        ? "<section><h3>Условия</h3><p>" +
          esc(
            [q.hours ? timeLabel(q.hours) : "", conditionNotes]
              .filter(Boolean)
              .join(" · "),
          ) +
          "</p></section>"
        : "") +
      (q.type === "delivery" ? deliveryDetail(q) : questReward(q)) +
      (visible.length
        ? '<div class="structured-loot">' +
          visible
            .map(
              (r) =>
                "<span>" +
                gameIcon(
                  r.type === "gold" ? "◉" : r.type === "rep" ? "⚑" : "◆",
                  r.image,
                ) +
                esc(rewardText(r)) +
                "</span>",
            )
            .join("") +
          "</div>"
        : "") +
      (!player && q.notes
        ? '<p class="notice record-body">' + esc(q.notes) + "</p>"
        : "") +
      relation +
      '<div class="actions">' +
      questMainActions(q) +
      uxFavButton("contract", id) +
      (place
        ? visualAction("На карте", "focusQuestMap(" + jsid(id) + ")")
        : "") +
      "</div></article>"
  );
}
