const achievementCatalog = /*BUNDLED_ACHIEVEMENTS*/ null;
let achievementCategory = "", achievementStatus = "all", achievementPage = 0;

function installAchievementCatalog(data) {
  if (data.settings.achievementBookInstalled) return;
  const rows = data.portal.achievements;
  const known = new Set(rows.map((x) => x.id));
  const titles = new Set(rows.map((x) => x.title?.trim().toLocaleLowerCase("ru")));
  for (const entry of achievementCatalog.entries) {
    if (known.has(entry.id) || titles.has(entry.title.toLocaleLowerCase("ru"))) continue;
    rows.push({ ...entry, grants: [], day: data.company.day, year: data.company.year });
  }
  data.settings.achievementCategories = [...new Set([
    ...(Array.isArray(data.settings.achievementCategories) ? data.settings.achievementCategories : []),
    ...achievementCatalog.categories.map((x) => x.name),
  ])];
  data.settings.achievementBookInstalled = true;
}

function achievementCategories() {
  const registered = S.settings.achievementCategories;
  return [...new Set([
    ...(Array.isArray(registered) ? registered : []),
    ...S.portal.achievements.map((x) => x.category),
  ])].filter((name) => typeof name === "string" && name.trim());
}

function manageAchievementCategories() {
  if (player) return;
  const categories = achievementCategories();
  openModal("Категории достижений", '<div class="stack">' +
    visualAction("Новая категория", "editAchievementCategory()") +
    categories.map((name) =>
      '<div class="row"><strong>' + esc(name) + '</strong>' +
      visualAction("Переименовать", "editAchievementCategory(" + jsid(name) + ")") +
      visualAction("Удалить", "removeAchievementCategory(" + jsid(name) + ")", "danger") +
      '</div>',
    ).join("") + '</div>');
}

function editAchievementCategory(previous = "") {
  if (player) return;
  form(previous ? "Переименовать категорию" : "Новая категория",
    input("Название", "achievementCategoryName", "text", previous, 'required maxlength="120"'),
    () => {
      const name = val("achievementCategoryName").trim();
      const categories = achievementCategories();
      requireThat(name && !categories.some((c) => c !== previous && c.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru")),
        "Введите новое название категории");
      S.settings.achievementCategories = previous ? categories.map((c) => c === previous ? name : c) : [...categories, name];
      if (previous) {
        for (const a of S.portal.achievements) if (a.category === previous) a.category = name;
        if (achievementCategory === previous) achievementCategory = name;
      }
      commit();
      manageAchievementCategories();
    });
}

function removeAchievementCategory(name) {
  if (player || !achievementCategories().includes(name)) return;
  const rows = S.portal.achievements.filter((a) => a.category === name);
  if (rows.length && !confirm("Удалить категорию? Достижения останутся в журнале без категории.")) return;
  S.settings.achievementCategories = achievementCategories().filter((c) => c !== name);
  for (const a of rows) a.category = "";
  if (achievementCategory === name) achievementCategory = "";
  commit();
  manageAchievementCategories();
}

function achievementTitleOnly(entry) {
  return player && entry.closed === true;
}

function linkAchievementHistory(entry) {
  if (!entry.id) return;
  for (const row of S.journal)
    if (!row.achievementId && row.kind === "achievement" && row.title === "Достижение: " + entry.title)
      row.achievementId = entry.id;
}

function achievementJournalText(row) {
  if (player && row.kind === "achievement" && S.portal.achievements.some((a) =>
    a.closed && (row.achievementId ? row.achievementId === a.id : row.title === "Достижение: " + a.title)))
    return "";
  return row.text;
}

function awardAchievement(id, recipient = "") {
  if (player) return;
  const entry = portalData().achievements.find((x) => x.id === id);
  if (!entry || entry.archived) return;
  const options = () => recipientOptions().filter(([key]) => achievementGrantAllowed(entry, key));
  const available = options();
  if (!available.length)
    return toast(entry.unique ? "Уникальное достижение уже вручено или нет доступных героев" : "Все доступные получатели уже имеют это достижение");
  const heroes = available.filter(([key]) => key.startsWith("hero:"));
  const preferred = recipient || achievementFilter;
  const modes = [["one", "Один получатель"]];
  if (!entry.unique && heroes.length) modes.push(["all", "Все герои"], ["some", "Выбранные герои"]);
  openModal("Вручить: " + entry.title, '<form id="awardForm">' +
    (modes.length > 1 ? selectField("Кому вручить", "awardMode", modes, "one") : "") +
    '<div id="awardSingle">' + selectField("Получатель", "awardWho", available,
      available.some(([key]) => key === preferred) ? preferred : (heroes[0]?.[0] || available[0][0])) + '</div>' +
    '<fieldset id="awardChosen" hidden><legend>Выберите героев</legend>' +
    heroes.map(([, name], i) => check(name, "awardHero" + i, false)).join("") + '</fieldset>' +
    '<p class="muted" id="awardAll" hidden>Каждый герой получит полное количество очков.</p>' +
    controls("Вручить достижение") + '</form>');
  const mode = $("awardMode");
  if (mode) mode.onchange = () => {
    $("awardSingle").hidden = mode.value !== "one";
    $("awardChosen").hidden = mode.value !== "some";
    $("awardAll").hidden = mode.value !== "all";
  };
  $("awardForm").onsubmit = (event) => {
    event.preventDefault();
    if (player) return;
    const selected = mode?.value || "one";
    const recipients = selected === "one" ? [val("awardWho")] :
      heroes.filter((_, i) => selected === "all" || $("awardHero" + i).checked).map(([key]) => key);
    if (!recipients.length) return toast("Выберите хотя бы одного героя");
    const allowed = new Set(options().map(([key]) => key));
    if (recipients.some((key) => !allowed.has(key)) || (entry.unique && recipients.length !== 1))
      return toast("Проверьте список получателей");
    recipients.forEach((key) => grantAchievement(entry, key));
    closeModal();
    commit();
    toast(recipients.length === 1 ? "Достижение получено: " + recipientName(recipients[0]) :
      "Достижение вручено · героев: " + recipients.length);
  };
}

const baseAchievementPortalRecord = openPortalRecord;
openPortalRecord = function (kind, id) {
  if (kind === "achievements") {
    const entry = portalData().achievements.find((x) => x.id === id);
    if (!entry || !seen(kind, entry)) return;
    if (achievementTitleOnly(entry)) return openModal(entry.title, "");
    baseAchievementPortalRecord(kind, id);
    if (entry.rewardTitle)
      $("modalBody").querySelector(".record-body")?.insertAdjacentHTML("afterend",
        '<p>Титул · <strong>' + esc(entry.rewardTitle) + '</strong></p>');
    return;
  }
  return baseAchievementPortalRecord(kind, id);
};

function achievementCard(entry, grants) {
  const titleOnly = achievementTitleOnly(entry);
  const title = '<strong>' + esc(entry.title) + '</strong>';
  const meta = [entry.category, entry.group].filter(Boolean).join(" · ");
  const earned = grants.length > 0;
  return '<article class="visual-card achievement ' + (earned ? "earned" : "locked") + '">' +
    '<button class="visual-open achievement-open' + (titleOnly ? ' achievement-title-only' : '') +
    '" onclick="openPortalRecord(\'achievements\',' + jsid(entry.id) + ')">' +
    (titleOnly ? title :
      sectionArt(entry.image, "emblem", "✦", "", iconPath(entry.iconId)) +
      '<span><small>' + esc(meta) + '</small>' + title +
      '<span>' + esc(excerpt(entry.body, 155)) + '</span><small>' +
      esc(n(entry.points) + " очк. · " + (earned ? "Получено" : "Не получено") +
        (entry.unique ? " · Уникальное" : "") + (!player && entry.closed ? " · Закрытое" : "")) +
      '</small>' +
      (earned ? '<small class="achievement-recipients">' +
        esc(grants.map((g) => [recipientName(g.recipient, g.name), g.date].filter(Boolean).join(" · ")).join(" / ")) +
        '</small>' : "") + '</span>') +
    '</button>' + (!player ? '<div class="visual-card-menu">' + portalMenu("achievements", entry) + '</div>' : "") + '</article>';
}

function renderAchievements() {
  const personal = tab === "personalAchievements", hero = chosen(), entries = portalData().achievements;
  const opts = [["all", "Все получатели"], ...recipientOptions()];
  if (!personal && !opts.some(([key]) => key === achievementFilter)) achievementFilter = "all";
  const categories = player
    ? [...new Set(entries.filter((x) => seen("achievements", x) && !achievementTitleOnly(x)).map((x) => x.category).filter(Boolean))]
    : achievementCategories();
  if (!categories.includes(achievementCategory)) achievementCategory = "";
  const visible = entries.filter((x) => seen("achievements", x) &&
    (!player || x.closed || !x.secret || shownGrants(x).length)).map((entry) => ({ entry, grants: shownGrants(entry) }));
  const earned = visible.filter(({ grants }) => grants.length).length;
  const points = visible.reduce((sum, { entry, grants }) => sum + n(entry.points) * grants.length, 0);
  const query = searchText.trim().toLocaleLowerCase("ru");
  const items = visible.filter(({ entry, grants }) =>
    (!achievementCategory || entry.category === achievementCategory) &&
    (achievementStatus === "all" || (achievementStatus === "earned") === !!grants.length) &&
    (!query || (achievementTitleOnly(entry) ? [entry.title] : [entry.title, entry.body, entry.category, entry.group])
      .some((text) => text?.toLocaleLowerCase("ru").includes(query))),
  ).sort((a, b) => Number(!!b.grants.length) - Number(!!a.grants.length));
  const size = 40, pages = Math.max(1, Math.ceil(items.length / size));
  achievementPage = Math.min(achievementPage, pages - 1);
  const actions = (personal ? kitHeroSelect(hero) : "") + (!player
    ? visualAction("Новое достижение", "editPortal('achievements')", "primary") +
      visualMenu("Управление журналом", visualAction("Категории достижений", "manageAchievementCategories()") +
      visualAction("Добавить стартовые шаблоны", "seedAchievements()"))
    : "");
  const rank = achievementCatalog.ranks.findLast((row) => points >= row.points);
  const pager = pages > 1 ? '<div class="actions achievement-pager">' +
    (achievementPage ? visualAction("Назад", "turnAchievementPage(-1)") : "") +
    '<span>' + (achievementPage + 1) + ' / ' + pages + '</span>' +
    (achievementPage + 1 < pages ? visualAction("Дальше", "turnAchievementPage(1)") : "") +
    '</div>' : "";
  $("main").innerHTML = '<div class="screen visual-screen achievement-collection">' +
    header(personal ? "Личные достижения" : "Достижения",
      personal ? memberName(heroOf(S, hero)) : "Книга великих свершений", actions) +
    '<section class="kit-panel kit-ach-summary"><div class="home-stats achievement-stats">' +
    '<div><small>Получено</small><strong>' + earned + ' / ' + visible.length + '</strong></div>' +
    '<div><small>Очки достижений</small><strong>' + points + '</strong></div>' +
    (personal ? '<div><small>Ранг славы</small><strong>' + esc(rank.name) + '</strong></div>' : '') +
    '</div><progress class="collection-meter" aria-label="Заполнение коллекции" value="' +
    earned + '" max="' + (visible.length || 1) + '"></progress></section>' +
    '<div class="kit-tabs" aria-label="Статус достижений">' +
    [["all", "Все"], ["earned", "Полученные"], ["locked", "Не полученные"]].map(([key, label]) =>
      '<button class="kit-tab" aria-pressed="' + (achievementStatus === key) +
      '" onclick="achievementStatus=' + jsid(key) + ';achievementPage=0;renderAchievements()">' + label + '</button>',
    ).join("") + '</div><div class="row ach-filter">' +
    (personal ? '' : pick("Получатель", "achRecipient", opts, achievementFilter)) +
    pick("Категория", "achievementCategory", [["", "Все категории"], ...categories.map((c) => [c, c])], achievementCategory) +
    '<label class="field">Поиск<input class="search" id="portalSearch" type="search" value="' +
    esc(searchText) + '" placeholder="Название или условие"></label></div>' +
    '<div class="cards portal-cards ach-grid">' +
    (items.slice(achievementPage * size, (achievementPage + 1) * size).map(({ entry, grants }) =>
      achievementCard(entry, grants)).join("") || emptyScene("По этим фильтрам достижений нет.")) +
    '</div>' + pager + '</div>';
  if ($("achRecipient")) $("achRecipient").onchange = () => {
    achievementFilter = val("achRecipient");
    achievementPage = 0;
    renderAchievements();
  };
  $("achievementCategory").onchange = () => {
    achievementCategory = val("achievementCategory");
    achievementPage = 0;
    renderAchievements();
  };
  bindPortalSearch(() => {
    achievementPage = 0;
    renderAchievements();
  });
  if (personal) bindKitHero();
}

function turnAchievementPage(delta) {
  achievementPage += delta;
  renderAchievements();
  document.querySelector(".achievement-collection .ach-filter")?.scrollIntoView({ block: "start" });
}

const baseBookPortalCard = portalCard;
portalCard = function (kind, entry) {
  return kind === "mail" ? editorialCard(kind, entry) : baseBookPortalCard(kind, entry);
};
