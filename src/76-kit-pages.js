function kitHomeRow(label, detail, icon, action, image = "") {
  return (
    '<button class="kit-listrow" onclick="' + action + '">' +
    (image ? '<img class="kit-feed-thumb" src="' + esc(image) + '" alt="" loading="lazy">' : uiIcon(icon)) +
    '<span class="kit-grow"><b>' + esc(label) + '</b><small>' +
    esc(detail) + '</small></span><span aria-hidden="true">›</span></button>'
  );
}

function renderHome() {
  const p = getHomePrefs(), c = S.company, hero = chosen();
  const stay = currentStay(S), phase = S.journey ? "travel" : S.engine.phase;
  const place = locLabel(c.location);
  const ready = S.contracts.filter((q) => !q.archived && !q.hidden && q.status === "available");
  const active = S.contracts.filter((q) => !q.archived && !q.hidden && q.status === "active");
  const letters = visiblePortalRows("mail").filter((x) => !x.hidden && published("mail", x) && !x.read && !uxReadSet()[1].has("mail:" + x.id));
  const points = publicItems("achievements").filter((x) => !x.archived && hasGrant(x, "company")).length;
  const advances = Object.values(c.talents).filter(Boolean).length;
  const chronicle = publicItems("chronicle").filter((x) => !x.archived).sort(
    (a, b) => n(b.year) - n(a.year) || n(b.day) - n(a.day),
  );
  const stories = ["news", "rumors"].flatMap((kind) =>
    publicItems(kind).filter((x) => !x.archived).map((x) => ({ kind, x })),
  ).sort((a, b) => n(b.x.year) - n(a.x.year) || n(b.x.day) - n(a.x.day));
  const settings = visualMenu("Главная страница",
    visualAction("Настроить блоки", "openHomeAppearance()") +
    (!player ? visualAction("Изменить обложку", "uxCover()") : ""),
  );
  const links = [
    ["news", "Вестник", stories.length + " записей"],
    ["worldbook", "Хроники Азерота", S.worldBook.chapters.length + " глав"],
    ["diplomacy", "Дипломатия", S.diplomacy.filter(visibleDiplomacy).length + " отношений"],
    ["contracts", "Доска заданий", ready.length + " доступно"],
    ["bank", "Общий банк", c.inventory.filter((x) => !x.owner && canSeeStack(x)).length + " позиций"],
    ["mail", "Почта", letters.length + " непрочитанных"],
    ["chronicle", "Летопись", chronicle.length + " записей"],
    ["achievements", "Достижения", points + " у отряда", "openCompanyAchievements()"],
  ];
  const data = [
    ["coins", c.gold.toLocaleString("ru-RU") + " зм", "Общая казна", "bank"],
    ["company", c.members.filter((m) => m.active && (!player || !m.hidden)).length, "Герои", "company"],
    ["camp", advances + "/12", "Улучшения лагеря", "camp"],
    ["achievements", points, "Достижения", "achievements", "openCompanyAchievements()"],
  ];
  $("main").innerHTML = `<div class="atlas-kit kit-home">
    <section class="kit-wideart kit-welcome">
      <img class="kit-cover-image" src="${esc(uxPrepare().cover || kitArtUrl("hero"))}" alt="">
      <div class="kit-herotext">
        <div class="eyebrow">${esc(dayLabel())}</div>
        <h2>Дорога ждёт,<br>путешественник.</h2>
        <p>${esc(c.name)}${place ? " · " + esc(place) : ""}</p>
        ${p.hero ? '<div class="actions">' +
          kitLink(hero ? "Мой герой" : "Открыть карту", hero ? "switchTab('hero')" : "switchTab('map')", hero ? "company" : "map", "primary") +
          (!player && !S.map ? visualAction("Загрузить карту", "$('mapFile').click()") : "") +
          '</div>' : ""}
      </div>
      <div class="kit-hero-actions">${settings}</div>
    </section>
    ${p.stats ? '<div class="kit-home-metrics">' + data.map(([icon, value, label, target, action]) =>
      '<button onclick="' + (action || "switchTab(" + jsid(target) + ")") + '">' + uiIcon(icon) +
      '<span><strong>' + esc(value) + '</strong><small>' + esc(label) + '</small></span></button>',
    ).join("") + '</div>' : ""}
    ${p.feed ? `<div class="kit-home-grid">
      <section>
        <div class="kit-subhead"><h3>Вести из Азерота</h3>${visualAction("Весь вестник →", "switchTab('news')", "ghost")}</div>
        <div class="kit-panel kit-feed">${stories.slice(0, 3).map(({ kind, x }) =>
          kitHomeRow(x.title, portalMeta(x) || excerpt(x.body, 115), "news",
          "switchTab('news');openPortalRecord(" + jsid(kind) + "," + jsid(x.id) + ")",
          safeImage(x.image) || kitArtUrl(kind === "rumors" ? "market" : "news")),
        ).join("") || emptyScene("Вестник ждёт первых сообщений.")}</div>
      </section><aside>
        ${homePhasePanel(hero, stay, active, phase, chronicle)}
        ${kitSubhead("Письма и достижения")}
        <div class="kit-panel kit-feed">
          ${kitHomeRow(letters[0]?.title || "Почта", letters.length + " новых", "mail", "switchTab('mail')")}
          ${homeAchievements(hero)}
        </div>
      </aside>
    </div>` : ""}
    ${p.shortcuts ? '<div class="kit-home-shortcuts">' + links.filter(([id]) => p.tiles[id] !== false)
      .map(([id, label, detail, action]) => kitHomeRow(label, detail, id, action || "switchTab(" + jsid(id) + ")")).join("") + '</div>' : ""}
    ${p.footer ? '<div class="actions kit-home-footer">' +
      kitLink("Книга знакомств", "switchTab('people')", "people") +
      kitLink("Фракции", "switchTab('factions')", "factions") +
      kitLink("Кодекс", "switchTab('codex')", "codex") +
      kitLink("Журнал приключений", "switchTab('journal')", "journal") + '</div>' : ""}
  </div>`;
}

function homeAchievements(hero) {
  const personal = hero ? "hero:" + hero : "", grants = ["company", personal].filter(Boolean);
  const recent = publicItems("achievements").filter((a) => !a.archived && grants.some((key) => hasGrant(a, key)))
    .sort((a, b) => (b.grants?.filter((g) => grants.includes(g.recipient)).at(-1)?.date || "")
      .localeCompare(a.grants?.filter((g) => grants.includes(g.recipient)).at(-1)?.date || "", "ru", { numeric: true }));
  return recent.slice(0, 2).map((a) =>
    kitHomeRow(a.title, hasGrant(a, personal) ? "Личное достижение" : "Достижение компании", "achievements",
      "openPortalRecord('achievements'," + jsid(a.id) + ")")).join("") ||
    kitHomeRow("Достижения компании", "Новых достижений пока нет", "achievements", "openCompanyAchievements()");
}
function homePhasePanel(hero, stay, active, phase, chronicle) {
  let title, detail, controls;
  const stayPhase = phase === "stay" && stay;
  if (stayPhase) {
    title = locLabel(stay.location) || stay.name || "Стоянка";
    detail = hero ? timeLabel(remaining(S, hero)) + " доступно герою" : "Выберите героя";
    const activities = hero && owned(actor, hero) ? S.engine.professions.filter((p) =>
      p.kind === "gathering" && !activityState(hero, p, stay).reason) : [];
    const errands = hero && owned(actor, hero) ? S.contracts.filter((q) => q.type === "local" && questAvailable(S, q, hero)) : [];
    const projects = S.engine.projects.filter((p) => p.status === "active" && p.hero === hero);
    controls = kitLink("Открыть стоянку", "switchTab('stay')", "stay", "primary") +
      activities.slice(0, 3).map((p) => kitHomeRow(p.name, "Доступное занятие", "stay",
        "openHomeActivity(" + jsid(p.id) + ")")).join("") +
      companionRows("stay").filter((entry) => !entry.reason).slice(0, 2).map(({npc, action}) =>
        kitHomeRow(action.name, npc.title, actionIcons[action.kind], "openCompanionAction(" + jsid(npc.id) + "," + jsid(action.id) + ")")).join("") +
      errands.slice(0, 2).map((q) => kitHomeRow(q.title, "Местное поручение", "contracts",
        "localBoard(" + jsid(q.id) + ")")).join("") +
      projects.slice(0, 2).map((p) => kitHomeRow(p.name, timeLabel(p.left) + " осталось", "craft",
        "openCraftTab('projects')")).join("") +
      (hero && stay.history.some((r) => r.hero === hero) ? '<div class="home-last-activity" id="homeActivity"></div>' : "");
  } else if (phase === "travel") {
    const journey = S.journey, routeRecord = journey && route(journey.routeId), allowed = routeRecord && visibleRoute(routeRecord);
    title = allowed ? routeLabel(routeRecord) : journey ? "Компания в пути" : "Подготовка к пути";
    const guide = S.company.members.find((m) => m.id === journey?.guide && (!player || !m.hidden || owned(actor, m.id)));
    detail = [allowed ? locLabel(journey.from) : locLabel(S.company.location),
      journey ? "День пути " + Math.max(1, S.company.day - (journey.start ?? S.company.day) + 1) + " из " + Math.max(1, journey.days) : "",
      guide ? "Проводник · " + memberName(guide) : ""].filter(Boolean).join(" · ");
    controls = kitLink("Открыть маршрут", "switchTab('map')", "map", "primary") +
      (allowed && canTravel() && journey.outcome === null ? visualAction("Определить событие", "rollJourney()") : "") +
      (allowed && !player && journey.outcome !== null ? visualAction("Завершить переход", "finishJourney()") : "") +
      (!journey && canTravel() ? visualAction("Выбрать маршрут", "choosePartyRoute()") : "");
  } else {
    title = locLabel(S.company.location) || "Приключение";
    detail = active.length ? "Действующих заданий · " + active.length : "Компания готовится к следующему делу.";
    const events = S.journal.filter((e) => !e.hidden && ["contract", "story", "session", "travel", "event"].includes(e.kind));
    controls = kitLink("Задания", "switchTab('contracts')", "contracts", "primary") +
      kitLink("Карта", "switchTab('map')", "map") + kitLink("Журнал", "switchTab('journal')", "journal") +
      (hero ? kitLink("Мой герой", "switchTab('hero')", "company") : "") +
      active.slice(0, 3).map((q) => kitHomeRow(q.title, "Действующее задание", "contracts",
        "openMapQuest(" + jsid(q.id) + ")")).join("") +
      chronicle.slice(0, 1).map((row) => kitHomeRow(row.title, "Летопись компании", "chronicle",
        "openPortalRecord('chronicle'," + jsid(row.id) + ")")).join("") +
      events.slice(0, 2).map((row) => kitHomeRow(row.title, portalDate(row), "journal",
        "uxOpen('journal'," + jsid(row.id) + ")")).join("");
  }
  return '<section class="kit-panel kit-today home-phase"><div class="eyebrow">Сейчас · ' +
    esc(phases[phase] || "") + '</div><h3>' + esc(title) + '</h3><p class="muted">' + esc(detail) +
    '</p><div class="actions home-phase-actions">' + controls + '</div></section>';
}
function openHomeActivity(id) {
  const stay = currentStay(S), hero = chosen();
  const profession = S.engine.professions.find((row) => row.id === id);
  if (!stay || !hero || !owned(actor, hero) || !profession) return;
  switchTab("stay");
  activityDialog(hero, profession, stay);
}
onRender.push(() => {
  if ($("homeActivity")) recentActivity($("homeActivity"), chosen(), currentStay(S));
});
let kitMailSelection = "";
function selectKitMail(id) {
  if (!visiblePortalRows("mail").some((row) => row.id === id)) return;
  kitMailSelection = id;
  uxMarkRead(["mail:" + id]);
  renderMail();
  $("kitMailLetter")?.focus({ preventScroll: true });
  if (matchMedia("(max-width: 700px)").matches)
    $("kitMailLetter")?.scrollIntoView({ block: "start" });
}
function renderMail() {
  const rows = visiblePortalRows("mail").filter((x) => portalQuery(x)).sort(
    (a, b) => n(b.year) - n(a.year) || n(b.day) - n(a.day),
  );
  const letter = rows.find((x) => x.id === kitMailSelection) || rows[0];
  const read = uxReadSet()[1];
  $("main").innerHTML = `<div class="screen visual-screen">
    ${sectionHeader("Корреспонденция", "Письма, приглашения и вести от знакомых.", portalCreate("mail", "Новое письмо"))}
    <div class="visual-filters">${portalSearchField("Найти письмо")}</div>
    ${letter ? `<div class="kit-mail-layout">
      <section class="kit-quest-list">${rows.map((x) =>
        '<button class="kit-quest-line" aria-pressed="' + (x === letter) +
        '" onclick="selectKitMail(' + jsid(x.id) + ')">' + libraryIcon(x, iconDefaults.nav.mail) +
        '<span class="kit-grow"><strong>' + esc(x.title) + '</strong><small>' +
        esc([portalDate(x), x.source, !x.read && !read.has("mail:" + x.id) ? "Новое" : ""].filter(Boolean).join(" · ")) +
        '</small></span><span aria-hidden="true">›</span></button>',
      ).join("")}</section>
      <article class="kit-paper" id="kitMailLetter" tabindex="-1">
        <div class="eyebrow">${esc([letter.category, portalDate(letter)].filter(Boolean).join(" · "))}</div>
        <h3>${esc(letter.title)}</h3>
        ${letter.source ? '<p class="kit-letter-source">' + esc(letter.source) + '</p>' : ""}
        ${safeImage(letter.image) ? sectionArt(letter.image, "cover", "") : ""}
        <p class="record-body">${esc(letter.body || "Текст письма пока пуст.")}</p>
        ${!player && letter.notes ? '<p class="record-body kit-letter-note">' + esc(letter.notes) + '</p>' : ""}
        <div class="actions">
          ${uxFavButton("mail", letter.id)}
          ${locLabel(letter.location) ? uxBtn("node", letter.location, locLabel(letter.location)) : ""}
          ${!player && !letter.read ? visualAction("Отметить прочитанным", "markMail(" + jsid(letter.id) + ")") : ""}
          ${portalMenu("mail", letter)}
        </div>
      </article>
    </div>` : emptyScene(searchText ? "По этому запросу писем нет." : "У компании пока нет писем.")}
  </div>`;
  bindPortalSearch(renderMail);
  uxLinkify($("kitMailLetter"));
}

const kitBaseMap = renderMap;
renderMap = function () {
  kitBaseMap();
  const layout = $("main").querySelector(".map-layout");
  const cover = document.createElement("template");
  cover.innerHTML = sectionHeader("Карта Азерота", "Места, маршруты и текущий путь компании.");
  layout.prepend(cover.content);
  const header = layout.querySelector(".section-cover-actions");
  header.insertAdjacentHTML("beforeend",
    '<div class="actions" id="engineActions">' +
    (!player ? visualMenu("Управление картой",
      visualAction("Создать регион", "regionForm()") +
      visualAction("Нарисовать границу", "drawRegion()") +
      (S.engine.regions.length ? visualAction("Изменить регион", "editRegionList()") : "")) : "") +
    (canTravel() && !S.journey && !currentStay(S) && S.company.location
      ? visualAction("Отправиться в путь", "choosePartyRoute()") : "") + '</div>');
};
