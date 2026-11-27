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
  const primary = stay
    ? kitLink("Продолжить стоянку", "switchTab('stay')", "stay", "primary")
    : S.journey ? kitLink("Продолжить путь", "switchTab('map')", "map", "primary") : "";
  const settings = visualMenu("Главная страница",
    visualAction("Настроить блоки", "openHomeAppearance()") +
    (!player ? visualAction("Изменить обложку", "uxCover()") : ""),
  );
  const links = [
    ["news", "Вестник", stories.length + " записей"],
    ["worldbook", "Хроники Азерота", S.worldBook.chapters.length + " глав"],
    ["diplomacy", "Дипломатия", S.diplomacy.filter(visibleDiplomacy).length + " отношений"],
    ["contracts", "Доска заданий", ready.length + " доступно"],
    ["bank", "Хранилище", c.inventory.filter(canSeeStack).length + " позиций"],
    ["mail", "Почта", letters.length + " непрочитанных"],
    ["chronicle", "Летопись", chronicle.length + " записей"],
    ["achievements", "Достижения", points + " у отряда"],
  ];
  const data = [
    ["coins", c.gold.toLocaleString("ru-RU") + " зм", "Общая казна", "bank"],
    ["company", c.members.filter((m) => m.active && (!player || !m.hidden)).length, "Герои", "company"],
    ["camp", advances + "/12", "Улучшения лагеря", "camp"],
    ["achievements", points, "Достижения", "achievements"],
  ];
  $("main").innerHTML = `<div class="atlas-kit kit-home">
    <section class="kit-wideart kit-welcome">
      <img class="kit-cover-image" src="${esc(uxPrepare().cover || kitArtUrl("hero"))}" alt="">
      <div class="kit-herotext">
        <div class="eyebrow">${esc(dayLabel())}</div>
        <h2>Дорога ждёт,<br>путешественник.</h2>
        <p>${esc(c.name)}${place ? " · " + esc(place) : ""}</p>
        ${p.hero ? '<div class="actions">' + primary +
          kitLink("Открыть карту", "switchTab('map')", "map") +
          (!player && !S.map ? visualAction("Загрузить карту", "$('mapFile').click()") : "") +
          '</div>' : ""}
      </div>
      <div class="kit-hero-actions">${settings}</div>
    </section>
    ${p.stats ? '<div class="kit-home-metrics">' + data.map(([icon, value, label, target]) =>
      '<button onclick="switchTab(' + jsid(target) + ')">' + uiIcon(icon) +
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
        <div class="kit-panel kit-today">
          <div class="eyebrow">Сейчас · ${esc(phases[phase])}</div>
          <h3>${esc(stay?.name || place || c.name)}</h3>
          ${hero && stay ? '<p class="muted">' + esc(timeLabel(remaining(S, hero))) + ' у героя</p>' : ""}
          ${primary ? '<div class="actions">' + primary + '</div>' : ""}
        </div>
        ${kitSubhead("Дела компании")}
        <div class="kit-panel kit-feed">
          ${kitHomeRow("Доска заданий", ready.length + " доступно", "contracts", "switchTab('contracts')")}
          ${kitHomeRow(letters[0]?.title || "Почта", letters.length + " новых", "mail", "switchTab('mail')")}
          ${kitHomeRow("Книга рецептов", "Ремесло и проекты", "craft", "openCraftTab('recipes')")}
          ${active.slice(0, 3).map((q) => kitHomeRow(q.title, "Действующее задание", "contracts", "openMapQuest(" + jsid(q.id) + ")")).join("")}
          ${chronicle[0] ? kitHomeRow(chronicle[0].title, "Последняя запись летописи", "chronicle", "openPortalRecord('chronicle'," + jsid(chronicle[0].id) + ")") : ""}
        </div>
      </aside>
    </div>` : ""}
    ${p.shortcuts ? '<div class="kit-home-shortcuts">' + links.filter(([id]) => p.tiles[id] !== false)
      .map(([id, label, detail]) => kitHomeRow(label, detail, id, "switchTab(" + jsid(id) + ")")).join("") + '</div>' : ""}
    ${p.footer ? '<div class="actions kit-home-footer">' +
      kitLink("Книга знакомств", "switchTab('people')", "people") +
      kitLink("Фракции", "switchTab('factions')", "factions") +
      kitLink("Кодекс", "switchTab('codex')", "codex") +
      kitLink("Технический журнал", "switchTab('journal')", "journal") + '</div>' : ""}
  </div>`;
}

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

const kitBaseCompany = renderCompany;
renderCompany = function () {
  kitBaseCompany();
  const root = $("main").firstElementChild;
  root.classList.add("kit-company");
  const title = root.querySelector(".section-cover");
  title.querySelector("h2").textContent = "Герои Вольной компании";
  title.querySelector("p").textContent = "Персонажи, навыки, профессии и хартия отряда.";
  const hero = chosen();
  if (!hero) return;
  const member = heroOf(S, hero), p = profile(S, hero);
  const canAct = owned(actor, hero);
  const professions = S.engine.professions.filter((record) => p.professions.includes(record.id));
  const highSkills = ["Выживание", "Атлетика", "История", "Восприятие"];
  const statRows = Object.entries(stats).map(([key, label]) => {
    const mod = ability(p, { stat: key }, () => 1).mod;
    return '<div><small>' + esc(label) + '</small><strong>' + esc(p.stats[key]) + '</strong>' +
      (canAct ? visualAction(signed(mod), "rollForm(" + jsid(key) + ")") : '<small>' + signed(mod) + '</small>') + '</div>';
  }).join("");
  const skillRow = (skill) => {
    const mod = ability(p, { skill }, () => 1).mod;
    return '<div class="kit-profile-skill"><span class="kit-grow">' + esc(skill) + '</span><b>' +
      signed(mod) + '</b>' + (canAct ? visualAction("Бросок", "rollForm(''," + jsid(skill) + ")", "ghost") : '') + '</div>';
  };
  title.querySelector(".section-cover-actions").insertAdjacentHTML("afterbegin", kitHeroSelect(hero));
  title.insertAdjacentHTML("afterend", `<div class="kit-company-layout">
    <section class="kit-panel kit-company-portrait">
      ${sectionArt(member.image, "portrait", "", "", iconPath(iconDefaults.components.hero))}
      <div class="eyebrow">${esc(member.role || "Участник компании")}</div>
      <h3>${esc(memberName(member))}</h3>
      <small>${esc(kitHeroDescription(p))}</small>
      <div class="kit-quick">
        ${kitLink("Сумки", "bagPage()", "bank")}
        ${kitLink("Ремесло", "openCraftTab('professions')", "craft")}
        ${kitLink("Достижения", "openPersonalAchievements(" + jsid("hero:" + hero) + ")", "achievements")}
      </div>
      ${canAct ? '<div class="actions">' + visualAction("Редактировать профиль", "editMember(" + jsid(hero) + ")", "primary") + '</div>' : ''}
    </section>
    <section>
      <div class="kit-panel">
        <div class="kit-subhead"><h3>Характеристики</h3><small>Бонус владения +${bv(p)}</small></div>
        <div class="kit-stat-grid">${statRows}</div>
        ${kitSubhead("Навыки для занятий")}
        ${highSkills.map(skillRow).join("")}
        <details><summary>Все навыки</summary>${Object.keys(skills).filter((skill) => !highSkills.includes(skill)).map(skillRow).join("")}</details>
      </div>
      ${kitSubhead("Профессии")}
      <div class="kit-panel">${professions.map((record) => {
        const eligible = eligibleProfession(S, p, record.id);
        const rank = eligible ? professionRank(p, record.id) : 0;
        const label = eligible ? professionRanks[rank - 2] || "Ранг " + rank : "Требуется владение";
        return '<div class="kit-listrow">' + professionIcon(record) +
          '<span class="kit-grow"><b>' + esc(record.name) + '</b><small>' + esc(label) + '</small></span></div>';
      }).join("") || emptyScene("У героя пока нет выбранных профессий.")}</div>
    </section>
  </div>`);
  bindKitHero();
};

const kitBaseMap = renderMap;
renderMap = function () {
  kitBaseMap();
  const layout = $("main").querySelector(".map-layout");
  const cover = document.createElement("template");
  cover.innerHTML = sectionHeader("Карта Азерота", "Места, маршруты и текущий путь компании.");
  layout.prepend(cover.content);
};
