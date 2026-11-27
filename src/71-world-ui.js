const peopleView = { mode: "gallery", faction: "", status: "", place: "" };
let codexCategory = "",
  gazetteRegion = "";
const legacyPortalRecord = openPortalRecord;
const legacyPortalSection = renderPortal;
function visiblePortalRows(kind) {
  return portalData()[kind].filter((x) => !x.archived && seen(kind, x));
}
function portalQuery(record, extra = []) {
  const query = searchText.trim().toLocaleLowerCase("ru");
  return (
    !query ||
    [record.title, record.body, record.source, record.category, ...extra].some(
      (value) =>
        String(value || "")
          .toLocaleLowerCase("ru")
          .includes(query),
    )
  );
}
function portalSearchField(placeholder) {
  return (
    '<input type="search" id="portalSearch" value="' +
    esc(searchText) +
    '" aria-label="' +
    esc(placeholder) +
    '" placeholder="' +
    esc(placeholder) +
    '">'
  );
}
function portalCreate(k, label) {
  return !player
    ? visualAction(label, "editPortal(" + jsid(k) + ")", "primary")
    : "";
}
function renderPeopleGallery() {
  const records = visiblePortalRows("people");
  const rows = records.filter(
    (x) =>
      portalQuery(x, [affiliationText(x), x.attitude]) &&
      (!peopleView.faction || x.faction === peopleView.faction) &&
      (!peopleView.status || x.category === peopleView.status) &&
      (!peopleView.place || x.location === peopleView.place),
  );
  $("main").innerHTML =
    '<div class="screen visual-screen">' +
    sectionHeader(
      "Персонажи мира",
      "Знакомые, союзники и соперники компании.",
      portalCreate("people", "Новый персонаж"),
    ) +
    '<div class="visual-filters">' +
    portalSearchField("Найти персонажа") +
    pick(
      "Фракция",
      "peopleFaction",
      [["", "Все фракции"], ...pairs(S.factions.filter(visibleFaction))],
      peopleView.faction,
    ) +
    pick(
      "Статус",
      "peopleStatus",
      [
        ["", "Все статусы"],
        ...[
          ...new Set([
            ...PORTAL.people.cats,
            ...records.map((x) => x.category).filter(Boolean),
          ]),
        ].map((s) => [s, s]),
      ],
      peopleView.status,
    ) +
    pick(
      "Место",
      "peoplePlace",
      [["", "Все места"], ...pairs(S.nodes.filter(visibleNode))],
      peopleView.place,
    ) +
    '<div class="visual-switch">' +
    visualAction(
      peopleView.mode === "gallery" ? "Список" : "Галерея",
      "togglePeopleView()",
    ) +
    "</div></div>" +
    '<small class="kit-result-count">' + rows.length + ' персонажей</small>' +
    '<div class="people-gallery ' +
    (peopleView.mode === "list" ? "is-list" : "") +
    '">' +
    (rows.map(personCard).join("") ||
      emptyScene(
        records.length
          ? "По этим фильтрам никого не найдено."
          : "Ваша компания ещё не встретила известных персонажей.",
      )) +
    "</div></div>";
  for (const [field, id] of [
    ["faction", "peopleFaction"],
    ["status", "peopleStatus"],
    ["place", "peoplePlace"],
  ])
    $(id).onchange = () => {
      peopleView[field] = val(id);
      renderPeopleGallery();
    };
  bindPortalSearch(renderPeopleGallery);
}
function togglePeopleView() {
  peopleView.mode = peopleView.mode === "gallery" ? "list" : "gallery";
  renderPeopleGallery();
}
function personCard(x) {
  const f = faction(x.faction);
  const relation = f && visibleFaction(f) ? f.name + " · " + rankLabel(x) : "";
  return (
    '<article class="visual-card person-card">' +
    '<button class="visual-open person-open" onclick="openPortalRecord(\'people\',' +
    jsid(x.id) +
    ')">' +
    sectionArt(x.image, "portrait", "♟", "", iconPath(x.iconId) || iconPath(iconDefaults.components.hero)) +
    '<span class="person-info"><strong>' +
    esc(x.title) +
    "</strong>" +
    (x.source || x.category
      ? "<span>" + esc(x.source || x.category) + "</span>"
      : "") +
    (relation ? "<small>" + esc(relation) + "</small>" : "") +
    (!player && x.hidden
      ? '<small class="record-private">Скрыто от игроков</small>'
      : "") +
    ([x.attitude, locLabel(x.location)].filter(Boolean).length
      ? "<small>" +
        esc([x.attitude, locLabel(x.location)].filter(Boolean).join(" · ")) +
        "</small>"
      : "") +
    '</span></button><div class="visual-card-menu">' +
    portalMenu("people", x) +
    "</div></article>"
  );
}
function editDossier(id) {
  const x = portalData().people.find((record) => record.id === id);
  if (player || !x) return;
  const options = (name, rows, selected) =>
    '<div class="hero-checklist">' +
    rows
      .map(
        (row) =>
          '<label class="checkline"><input type="checkbox" name="' +
          name +
          '" value="' +
          esc(row.id) +
          '"' +
          (selected?.includes(row.id) ? " checked" : "") +
          ">" +
          esc(row.title) +
          "</label>",
      )
      .join("") +
    "</div>";
  form(
    "Подробности досье",
    area("Характеристика", "personTraits", x.traits || "") +
      area("История знакомства", "personHistory", x.history || "") +
      "<details><summary>Связанные персонажи</summary>" +
      options(
        "personLinks",
        portalData().people.filter((p) => p.id !== id),
        x.relatedPeople,
      ) +
      "</details>" +
      "<details><summary>Связанные письма</summary>" +
      options("personLetters", portalData().mail, x.letters) +
      "</details>",
    () => {
      const picked = (name) =>
        [
          ...$("engineForm").querySelectorAll(
            'input[name="' + name + '"]:checked',
          ),
        ].map((el) => el.value);
      Object.assign(x, {
        traits: val("personTraits"),
        history: val("personHistory"),
        relatedPeople: picked("personLinks"),
        letters: picked("personLetters"),
      });
      commit();
      openPortalRecord("people", id);
    },
  );
}
function dossier(x) {
  const links = (kind, ids) =>
    visiblePortalRows(kind)
      .filter((row) => ids?.includes(row.id))
      .map((row) => uxBtn(kind, row.id, row.title))
      .join("");
  const quests = S.contracts
    .filter((q) => q.giver === x.id && uxFind("contract", q.id))
    .map((q) => uxBtn("contract", q.id, q.title))
    .join("");
  const block = (title, text) =>
    text
      ? "<section><h3>" +
        title +
        '</h3><p class="record-body">' +
        esc(text) +
        "</p></section>"
      : "";
  const list = (title, items) =>
    items
      ? "<section><h3>" +
        title +
        '</h3><div class="actions">' +
        items +
        "</div></section>"
      : "";
  openModal(
    x.title,
    '<div class="dossier"><aside>' +
      sectionArt(x.image, "portrait", "♟", "", iconPath(x.iconId) || iconPath(iconDefaults.components.hero)) +
      "<small>" +
      esc(x.source || x.category || "") +
      "</small>" +
      affiliationBadge(x) +
      (locLabel(x.location)
        ? uxBtn("node", x.location, locLabel(x.location))
        : "") +
      (x.attitude ? "<p>" + esc(x.attitude) + "</p>" : "") +
      '<div class="actions">' +
      uxFavButton("people", x.id) +
      (!player
        ? visualMenu(
            "Действия с досье",
            visualAction(
              "Изменить",
              "editPortal(\'people\'," + jsid(x.id) + ")",
            ) +
              visualAction(
                "Связи и знакомство",
                "editDossier(" + jsid(x.id) + ")",
              ) +
              visualAction(
                "Дублировать",
                "uxDuplicate(\'people\'," + jsid(x.id) + ")",
              ) +
              visualAction(
                "В архив",
                "uxArchive(\'people\'," + jsid(x.id) + ")",
                "danger",
              ),
          )
        : "") +
      "</div></aside>" +
      '<div class="reader dossier-copy">' +
      (x.body
        ? block("Биография", x.body)
        : emptyScene("Биография ещё не записана.")) +
      block("Характеристика", x.traits) +
      block("История знакомства", x.history) +
      block("Обязательства", x.promises) +
      list("Связанные задания", quests) +
      list("Письма", links("mail", x.letters)) +
      list("Связанные персонажи", links("people", x.relatedPeople)) +
      personAchievements("npc", x.id) +
      (!player && x.notes ? block("Заметки мастера", x.notes) : "") +
      "</div></div>",
  );
  uxLinkify($("modalBody"));
}
function codexCategories() {
  return [
    ...new Set([
      ...(S.settings.visual?.codexCategories || PORTAL.codex.cats),
      ...visiblePortalRows("codex")
        .map((x) => x.category)
        .filter(Boolean),
    ]),
  ];
}
function editCodexCategories() {
  if (player) return;
  form(
    "Категории Кодекса",
    area(
      "Одна категория на строку",
      "codexCategoryList",
      codexCategories().join("\n"),
    ),
    () => {
      (S.settings.visual ??= {}).codexCategories = [
        ...new Set(
          val("codexCategoryList")
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ];
      codexCategory = "";
      commit();
    },
  );
}
function editCodexCover(category) {
  editVisualImages(
    category,
    [
      {
        key: "categoryArt",
        label: "Обложка категории",
        image: S.settings.visual?.codexArt?.[category],
      },
    ],
    (images) => {
      const settings = (S.settings.visual ??= {});
      settings.codexArt = {
        ...settings.codexArt,
        [category]: images.categoryArt,
      };
    },
  );
}
function showCodexCategory(category) {
  codexCategory = category;
  searchText = "";
  renderCodex();
}
function renderCodex() {
  const records = visiblePortalRows("codex"),
    categories = codexCategories();
  if (codexCategory && !categories.includes(codexCategory)) codexCategory = "";
  const rows = records.filter(
    (x) => (!codexCategory || x.category === codexCategory) && portalQuery(x),
  );
  const editing = !player
    ? visualMenu(
        "Настройки Кодекса",
        visualAction("Изменить категории", "editCodexCategories()") +
          (codexCategory
            ? visualAction(
                "Обложка категории",
                "editCodexCover(" + jsid(codexCategory) + ")",
              )
            : ""),
      )
    : "";
  $("main").innerHTML =
    '<div class="screen visual-screen">' +
    sectionHeader(
      "Кодекс путешественника",
      codexCategory || "Места, легенды и открытия компании.",
      (!player
        ? visualAction(
            "Новая статья",
            "editPortal(\'codex\',null,{category:" +
              jsid(codexCategory || categories[0] || "Прочее") +
              "})",
            "primary",
          )
        : "") + editing,
    ) +
    '<div class="visual-filters">' +
    (codexCategory
      ? visualAction("Все категории", "showCodexCategory(\'\')")
      : "") +
    portalSearchField("Найти статью") +
    "</div>" +
    (!codexCategory && !searchText.trim()
      ? '<div class="codex-grid">' +
        categories
          .map((category, i) => {
            const count = records.filter((x) => x.category === category).length;
            const image = Object.hasOwn(
              S.settings.visual?.codexArt || {},
              category,
            )
              ? S.settings.visual.codexArt[category]
              : "";
            return (
              '<article class="visual-card codex-category"><button class="visual-open" onclick="showCodexCategory(' +
              jsid(category) +
              ')">' +
              sectionArt(
                image,
                "cover",
                ["▥", "✥", "⌖", "☾", "⚑", "♞", "◇"][i % 7],
                "",
                kitArtUrl(Object.hasOwn(codexCategoryArt, category) ? codexCategoryArt[category] : "dungeon"),
              ) +
              "<span><strong>" +
              esc(category) +
              "</strong><small>Статей · " +
              count +
              "</small></span></button></article>"
            );
          })
          .join("") +
        "</div>"
      : '<div class="codex-articles">' +
        (rows.map((x) => editorialCard("codex", x)).join("") ||
          emptyScene("В этом разделе пока нет подходящих статей.")) +
        "</div>") +
    (!records.length && !codexCategory && !searchText
      ? emptyScene("Кодекс ждёт первых открытий.")
      : "") +
    "</div>";
  bindPortalSearch(renderCodex);
}
function readCodex(x) {
  const lines = String(x.body || "").split(/\r?\n/);
  const predefined = lines.some((line) => /^#{1,4}\s+/.test(line));
  const blocks = predefined ? lines : String(x.body || "").split(/\n\s*\n/);
  const headings = [];
  const content = blocks
    .map((line, i) => {
      const mark = line.match(/^#{1,4}\s+(.+)/);
      const title =
        mark?.[1] ||
        (!predefined && blocks.length > 5 && i % 3 === 0
          ? excerpt(line.split(/[.!?]/)[0], 50)
          : "");
      if (title) headings.push([i, title]);
      return mark
        ? '<h3 id="codex-part-' + i + '">' + esc(title) + "</h3>"
        : line
          ? '<p id="codex-part-' +
            i +
            '" class="record-body">' +
            esc(line) +
            "</p>"
          : "";
    })
    .join("");
  openModal(
    x.title,
    '<article class="reader codex-reader">' +
      '<div class="reader-meta"><small>' +
      esc(portalMeta(x)) +
      "</small>" +
      portalMenu("codex", x) +
      "</div>" +
      (safeImage(x.image) ? sectionArt(x.image, "cover", "") : "") +
      (headings.length > 1
        ? '<nav class="reader-toc" aria-label="Оглавление">' +
          headings
            .map(([i, title]) =>
              visualAction(
                title,
                "document.getElementById(\'codex-part-" +
                  i +
                  "\').scrollIntoView({block:\'nearest\'})",
                "ghost",
              ),
            )
            .join("") +
          "</nav>"
        : "") +
      (content || emptyScene("Текст статьи ещё не добавлен.")) +
      "</article>",
  );
  uxDetailExtras("codex", x.id);
  uxLinkify($("modalBody"));
}
const codexCategoryArt = {
  История: "history", Народы: "party", География: "forest", Религия: "ruins",
  Обычаи: "market", Бестиарий: "monster", Артефакты: "dungeon", Магия: "dragon",
  Правила: "forge",
};
function editorialCard(k, x, feature = false) {
  const picture = feature || k === "news" || k === "rumors" || safeImage(x.image);
  return (
    '<article class="visual-card editorial-card ' +
    (feature ? "featured-story" : "") +
    '">' +
    '<button class="visual-open" onclick="openPortalRecord(' +
    jsid(k) +
    "," +
    jsid(x.id) +
    ')">' +
    (picture ? sectionArt(x.image, "cover", "▤", "", kitArtUrl(k === "rumors" ? "market" : "news")) : "") +
    '<span class="editorial-copy"><small>' +
    esc(
      [
        k === "rumors"
          ? "Слух"
          : k === "news"
            ? "Новость"
            : k === "mail" && !x.read && !uxReadSet()[1].has("mail:" + x.id)
              ? "Новое письмо"
              : "",
        portalDate(x),
        portalMeta(x),
      ]
        .filter(Boolean)
        .join(" · "),
    ) +
    "</small>" +
    "<strong>" +
    esc(x.title) +
    "</strong><span>" +
    esc(excerpt(x.body, feature ? 260 : 137)) +
    "</span>" + (feature ? '<span class="kit-read-story">Читать подробнее →</span>' : '') + "</span></button>" +
    '<div class="visual-card-menu">' +
    portalMenu(k, x) +
    "</div></article>"
  );
}
function renderGazette() {
  const issueRegion = (x) => {
    const place = node(x.location);
    return place && visibleNode(place)
      ? S.engine.regions.find((region) => region.id === place.regionId)?.name ||
          place.name
      : "";
  };
  const all = ["news", "rumors"].flatMap((k) =>
    visiblePortalRows(k).map((x) => ({ k, x, region: issueRegion(x) })),
  );
  const regions = [
    ...new Set(all.map((row) => row.region).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "ru"));
  if (gazetteRegion && !regions.includes(gazetteRegion)) gazetteRegion = "";
  const rows = all
    .filter(
      ({ k, x, region }) =>
        (newsFilter === "all" || newsFilter === k) &&
        (!gazetteRegion || region === gazetteRegion) &&
        portalQuery(x, [region]),
    )
    .sort((a, b) => n(b.x.year) - n(a.x.year) || n(b.x.day) - n(a.x.day));
  const feature =
    rows.find((row) => row.k === "news" && safeImage(row.x.image)) ||
    rows.find((row) => row.k === "news") ||
    rows[0];
  $("main").innerHTML =
    '<div class="screen visual-screen gazette">' +
    sectionHeader(
      "Вестник Азерота",
      "События, донесения и слухи.",
      portalCreate("news", "Новая новость") +
        portalCreate("rumors", "Новый слух"),
    ) +
    '<div class="visual-filters"><div class="actions game-tabs">' +
    [
      ["all", "Всё"],
      ["news", "Новости"],
      ["rumors", "Слухи"],
    ]
      .map(
        ([k, l]) =>
          '<button aria-pressed="' +
          (newsFilter === k) +
          '" onclick="newsFilter=' +
          jsid(k) +
          ';renderGazette()">' +
          l +
          "</button>",
      )
      .join("") +
    "</div>" +
    portalSearchField("Поиск по Вестнику") +
    (regions.length
      ? pick(
          "Место или регион",
          "gazetteRegion",
          [["", "Все места"], ...regions.map((r) => [r, r])],
          gazetteRegion,
        )
      : "") +
    "</div>" +
    (feature
      ? '<div class="gazette-layout">' +
        editorialCard(feature.k, feature.x, true) +
        kitSubhead("Лента событий") +
        '<div class="gazette-feed">' +
        rows
          .filter((row) => row !== feature)
          .map((row) => editorialCard(row.k, row.x))
          .join("") + (rows.length === 1 ? emptyScene("Других сообщений в этой рубрике пока нет.") : "") +
        "</div></div>"
      : emptyScene(
          searchText ? "Ничего не найдено." : "Вестник ждёт первых сообщений.",
        )) +
    "</div>";
  if ($("gazetteRegion"))
    $("gazetteRegion").onchange = () => {
      gazetteRegion = val("gazetteRegion");
      renderGazette();
    };
  bindPortalSearch(renderGazette);
}
function renderChronicle() {
  const rows = visiblePortalRows("chronicle")
    .filter((x) => portalQuery(x))
    .sort((a, b) => n(b.year) - n(a.year) || n(b.day) - n(a.day));
  $("main").innerHTML =
    '<div class="screen visual-screen">' +
    sectionHeader(
      "Летопись Вольной компании",
      "История отряда в приключениях и открытиях.",
      portalCreate("chronicle", "Добавить запись"),
    ) +
    '<div class="visual-filters">' +
    portalSearchField("Поиск по летописи") +
    "</div>" +
    '<div class="kit-chronicle">' +
    (rows.length && !safeImage(S.settings.visual?.covers?.chronicle)
      ? sectionArt("", "cover", "", "kit-chronicle-cover", kitArtUrl("camp")) : "") +
    '<div class="chronicle-timeline">' +
    (rows.map((x) => editorialCard("chronicle", x)).join("") ||
      emptyScene(
        searchText
          ? "Ничего не найдено."
          : "Летопись ждёт первой записи о приключениях компании.",
      )) +
    "</div></div></div>";
  bindPortalSearch(renderChronicle);
}
renderPortal = function (kind) {
  const draws = {
    people: renderPeopleGallery,
    codex: renderCodex,
    news: renderGazette,
    chronicle: renderChronicle,
    mail: renderMail,
  };
  if (Object.hasOwn(draws, kind)) return draws[kind]();
  return legacyPortalSection(kind);
};
openPortalRecord = function (kind, id) {
  const x = portalData()[kind]?.find((row) => row.id === id);
  if (!x || !seen(kind, x)) return;
  if (kind === "people") return dossier(x);
  if (kind === "codex") return readCodex(x);
  if (kind === "mail") uxMarkRead(["mail:" + id]);
  legacyPortalRecord(kind, id);
  $("modalBody").querySelector(".stack")?.classList.add("reader");
  compactPortalDetails(kind, x);
};
function compactPortalDetails(kind, x) {
  const modal = $("modalBody");
  for (const row of modal.querySelectorAll("button")) {
    if (
      ["Изменить", "Копия", "В архив", "Архивировать", "Дублировать"].includes(
        row.textContent.trim(),
      )
    )
      row.remove();
  }
  if (!player)
    modal.insertAdjacentHTML(
      "afterbegin",
      '<div class="modal-tools">' + portalMenu(kind, x) + "</div>",
    );
  uxLinkify(modal);
}
