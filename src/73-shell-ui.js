uxToolbar = function () {
  const el = $("uxTools");
  if (!el) return;
  const count = uxNotifications().filter(
    (row) => !uxReadSet()[1].has(row.notification),
  ).length;
  $("kitNotifications")?.classList.toggle("kit-unread", count > 0);
  el.innerHTML =
    visualAction("Поиск", "uxSearch()", "toolbar-search") +
    '<button type="button" onclick="uxInbox()">Уведомления' +
    (count ? ' <span class="ux-count">' + count + "</span>" : "") +
    "</button>" +
    visualAction("Избранное", "uxFavorites()", "toolbar-favorites") +
    (!player
      ? visualMenu(
          "История и архив",
          visualAction("Архив", "uxArchiveView()") +
            visualAction("История", "uxHistory()") +
            (uxUndo.length
              ? visualAction("Отменить действие", "uxRestore(false)")
              : "") +
            (uxRedo.length
              ? visualAction("Повторить действие", "uxRestore(true)")
              : ""),
        )
      : "");
};
const existingSwitchTab = switchTab;
switchTab = function (section) {
  document.querySelectorAll("[data-context-menu][open]").forEach((menu) => {
    menu.open = false;
  });
  return existingSwitchTab(section);
};
function revealActiveSection() {
  const active = $("nav")?.querySelector("[aria-current='page']");
  if (!active) return;
  const strip = active.closest(".nav-scroll");
  const item = active.getBoundingClientRect(),
    view = strip.getBoundingClientRect();
  if (item.left < view.left) strip.scrollLeft += item.left - view.left;
  if (item.right > view.right) strip.scrollLeft += item.right - view.right;
}
function renderCampaignBar() {
  const phase = S.journey ? "travel" : S.engine.phase;
  const here = locLabel(S.company.location);
  const hero = chosen();
  const roles = heroRows();
  $("status").innerHTML =
    '<div class="status-campaign"><strong>' +
    esc(S.company.name) +
    "</strong><span>" +
    esc(dayLabel()) +
    "</span></div>" +
    '<div class="status-location"><span class="phase-indicator phase-' +
    esc(phase) +
    '">' +
    esc(phases[phase]) +
    "</span>" +
    (here ? "<span>" + esc(here) + "</span>" : "") +
    "</div>" +
    (hero
      ? '<div class="status-hero">' +
        (roles.length > 1
          ? pick(
              "Герой",
              "statusHero",
              roles.map((m) => [m.id, memberName(m)]),
              hero,
            )
          : visualAction(
              memberName(heroOf(S, hero)),
              "openAffPerson('hero'," + jsid(hero) + ")",
              "ghost",
            )) +
        "</div>"
      : "") +
    '<span id="saveState" class="save">' +
    (player ? "" : "Локальная кампания") +
    "</span>";
  if ($("statusHero"))
    $("statusHero").onchange = () => {
      activeHero = val("statusHero");
      render();
    };
}
function openHomeAppearance() {
  openModal("Оформление главной страницы", homeSettingsPanel(getHomePrefs()));
  $("modalBody").querySelector(".home-settings").open = true;
}
const baseSectionHeader = header;
header = function (title, desc, action = "") {
  return [
    "camp",
    "company",
    "achievements",
    "mail",
    "help",
    "diplomacy",
    "journal",
    "worldbook",
  ].includes(tab)
    ? sectionHeader(title, desc, action)
    : baseSectionHeader(title, desc, action);
};
function editStaffPortrait(id) {
  const staff = S.company.staff.find((x) => x.id === id);
  if (!staff || player) return;
  editVisualImages(
    staff.name,
    [{ key: "staffPortrait", label: "Портрет", image: staff.image }],
    (images) => {
      staff.image = images.staffPortrait;
    },
  );
}
function campVisuals() {
  const body = $("main");
  body.querySelector(".screen")?.classList.add("visual-screen", "camp-visual");
  body.querySelector(".section-cover")?.insertAdjacentHTML("afterend",
    '<section class="kit-wideart kit-camp-cover"><img class="kit-cover-image" src="' +
    esc(safeImage(S.settings.visual?.covers?.camp) || kitArtUrl("party")) +
    '" alt=""><div class="kit-herotext"><div class="eyebrow">Инфраструктура</div>' +
    '<h2>Свой уголок в мире</h2><p>Улучшения и специалисты открывают возможности в дороге и на стоянке.</p></div></section>',
  );
  const tree = body.querySelector(".camp-grid");
  tree.insertAdjacentHTML("beforebegin", kitSubhead("Дерево улучшений", S.company.gold.toLocaleString("ru-RU") + " зм"));
  const stay = currentStay(S);
  if (!player && stay && node(stay.location)?.type === "city")
    body.querySelector(".section-cover-actions")?.insertAdjacentHTML("afterbegin", visualAction("Аренда мастерской", "rentalForm()"));
  const counters = body.querySelector(".home-stats");
  const notice = counters.nextElementSibling;
  const resources = document.createElement("details");
  resources.className = "kit-panel camp-resources";
  resources.innerHTML = "<summary>Ресурсы и условия развития</summary>";
  tree.after(resources);
  resources.append(counters, notice);
  const staff = body.querySelector(".camp-grid ~ .cards");
  if (staff) {
    staff.className = "kit-panel camp-staff";
    staff.innerHTML =
      S.company.staff
        .filter((x) => !player || !x.hidden)
        .map((x) => {
          const id = jsid(x.id);
          const projects = (S.engine.projects || []).filter(
            (p) =>
              p.status === "active" &&
              p.contributors?.some((c) => c.staff === x.id),
          );
          return (
            '<article class="visual-card person-card"><button class="visual-open person-open" onclick="openAffPerson(\'staff\',' +
            id +
            ')">' +
            sectionArt(x.image, "emblem", "⚒", "", iconPath(iconDefaults.components.hero)) +
            '<span class="person-info"><strong>' +
            esc(x.name) +
            "</strong><span>" +
            esc(x.role || "Специалист") +
            "</span>" +
            (projects.length
              ? "<small>" +
                esc(projects.map((p) => p.name).join(" · ")) +
                "</small>"
              : "") +
            "</span></button>" +
            (!player
              ? '<div class="visual-card-menu">' +
                visualMenu(
                  "Действия специалиста",
                  visualAction("Изменить", "editStaff(" + id + ")") +
                    visualAction("Портрет", "editStaffPortrait(" + id + ")") +
                    visualAction(
                      "Удалить",
                      "removeStaff(" + id + ")",
                      "danger",
                    ),
                ) +
                "</div>"
              : "") +
            "</article>"
          );
        })
        .join("") || emptyScene("У лагеря пока нет специалистов.");
  }
  for (const [i, branch] of [...body.querySelectorAll(".branch")].entries()) {
    for (const node of branch.querySelectorAll(".talent")) {
      const row = node.querySelector(".row");
      const name = row.querySelector("h3").textContent;
      const details = document.createElement("details"), summary = document.createElement("summary");
      details.className = node.className;
      const chosenIcon = S.settings.visual?.talentIcons?.[name];
      summary.innerHTML = libraryIcon(chosenIcon, campBranchIcons[i]);
      summary.append(row.querySelector("h3"), row.querySelector("small"));
      const buttons = node.querySelector(".actions");
      const manual = buttons?.querySelector(".ghost");
      if (!player) {
        manual?.insertAdjacentHTML("afterend", visualMenu("Управление улучшением",
          visualAction("Выбрать иконку", "pickTalentIcon(" + jsid(name) + "," + i + ")"),
        ));
      }
      if (productionServices.includes(name)) {
        const tier = campTier(S, name), level = facilityLevel(S, name);
        summary.insertAdjacentHTML("beforeend", "<small>" + esc(tier ? "Сооружение · ступень " + tier : "Сооружение не приобретено") + "</small>");
        if (level > tier) node.insertAdjacentHTML("beforeend", "<p>Местное оборудование · ступень " + level + "</p>");
        if (!player && tier > 0 && tier < 3)
          buttons?.insertAdjacentHTML("beforeend", visualAction("Купить оборудование · " + (tier + 1) + " ступень",
            "facilityUpgradeForm(" + jsid(name) + ")", "primary"));
      }
      row.remove();
      details.append(summary, ...node.childNodes);
      node.replaceWith(details);
    }
  }
}
function collectionVisuals() {
  const root = $("main");
  root
    .querySelector(".screen")
    ?.classList.add("visual-screen", "achievement-collection");
  const cards = [...root.querySelectorAll(".achievement")];
  const stats = root.querySelector(".achievement-stats");
  if (stats) {
    const cardsVisible = portalData().achievements.filter(
      (x) =>
        seen("achievements", x) &&
        (!player || !x.secret || shownGrants(x).length),
    );
    const earned = cardsVisible.filter((x) => shownGrants(x).length).length;
    const summary = document.createElement("section");
    summary.className = "kit-panel kit-ach-summary";
    stats.before(summary);
    summary.append(stats);
    summary.insertAdjacentHTML(
      "beforeend",
      '<progress class="collection-meter" aria-label="Заполнение коллекции" value="' +
        earned +
        '" max="' +
        (cardsVisible.length || 1) +
        '"></progress>',
    );
    const filter = root.querySelector(".ach-filter");
    filter?.before(summary);
    const seed = root.querySelector('button[onclick="seedAchievements()"]');
    if (seed) {
      root.querySelector(".section-cover-actions").insertAdjacentHTML(
        "beforeend", visualMenu("Шаблоны достижений", seed.outerHTML),
      );
      seed.parentElement.remove();
    }
  }
  if (!cards.length)
    root
      .querySelector(".empty")
      ?.replaceChildren("У компании пока нет подвигов в этой коллекции.");
}
const fallbackVisualCard = portalCard;
portalCard = function (k, x) {
  if (k === "achievements") {
    const grants = shownGrants(x);
    return (
      '<article class="visual-card achievement ' +
      (grants.length ? "earned" : "locked") +
      '">' +
      '<button class="visual-open achievement-open" onclick="openPortalRecord(\'achievements\',' +
      jsid(x.id) +
      ')">' +
      sectionArt(x.image, "emblem", "✦", "", iconPath(x.iconId) || iconPath(iconDefaults.nav.achievements)) +
      "<span><small>" +
      esc(x.category || "") +
      "</small><strong>" +
      esc(x.title) +
      "</strong><span>" +
      esc(excerpt(x.body, 155)) +
      "</span><small>" +
      esc(n(x.points) + " очк. · " + (grants.length ? "Получено" : "Не получено")) +
      "</small>" +
      (grants.length
        ? '<small class="achievement-recipients">' +
          esc(
            grants
              .map(
                (g) =>
                  recipientName(g.recipient, g.name) +
                  (g.date ? " · " + g.date : ""),
              )
              .join(" / "),
          ) +
          "</small>"
        : "") +
      '</span></button><div class="visual-card-menu">' +
      portalMenu(k, x) +
      "</div></article>"
    );
  }
  if (k === "mail") return editorialCard(k, x);
  return fallbackVisualCard(k, x);
};
const visualAchievementList = renderAchievements;
let achievementCategory = "", achievementStatus = "all";
renderAchievements = function () {
  visualAchievementList();
  const root = $("main"),
    gallery = root.querySelector(".ach-grid");
  if (!gallery) return;
  const categories = [
    ...new Set(
      visiblePortalRows("achievements")
        .filter((x) => !player || !x.secret || shownGrants(x).length)
        .map((x) => x.category)
        .filter(Boolean),
    ),
  ];
  if (achievementCategory && !categories.includes(achievementCategory))
    achievementCategory = "";
  gallery.insertAdjacentHTML(
    "beforebegin",
    '<div class="kit-tabs" aria-label="Статус достижений">' +
    [["all", "Все"], ["earned", "Полученные"], ["locked", "Не полученные"]].map(([key, label]) =>
      '<button class="kit-tab" aria-pressed="' + (achievementStatus === key) +
      '" onclick="achievementStatus=' + jsid(key) + ';renderAchievements()">' + label + '</button>',
    ).join("") + '</div><div class="achievement-category">' +
      pick(
        "Категория",
        "achievementCategory",
        [["", "Все категории"], ...categories.map((c) => [c, c])],
        achievementCategory,
      ) +
      "</div>",
  );
  $("achievementCategory").onchange = () => {
    achievementCategory = val("achievementCategory");
    renderAchievements();
  };
  if (achievementCategory || achievementStatus !== "all") {
    const cards = [...gallery.querySelectorAll(".achievement")];
    for (const card of cards)
      if (
        (achievementCategory && card.querySelector(".achievement-open small")?.textContent !== achievementCategory) ||
        (achievementStatus !== "all" && !card.classList.contains(achievementStatus))
      )
        card.remove();
    if (!gallery.children.length)
      gallery.innerHTML = emptyScene(
        "По этим фильтрам достижений нет.",
      );
  }
  collectionVisuals();
};
const baseVisualBook = renderWorldBook;
renderWorldBook = function () {
  baseVisualBook();
  const main = $("main"), book = S.worldBook;
  main.querySelector(".screen")?.classList.add("visual-screen", "book-visual");
  const toc = main.querySelector(".world-toc"), page = main.querySelector(".world-paper");
  toc.insertAdjacentHTML("afterbegin", '<div class="eyebrow">' + esc(book.year) + '</div><h3>' + esc(book.title) + '</h3>');
  const controls = main.querySelector(".world-book-tools");
  if (controls) {
    const actions = main.querySelector(".section-cover-actions");
    actions.insertAdjacentHTML("beforeend", visualMenu("Управление книгой", controls.innerHTML));
    controls.remove();
  }
  if (!bookImage(book.chapters[bookPage].image) && !safeImage(S.settings.visual?.covers?.worldbook))
    page.insertAdjacentHTML("beforebegin", sectionArt("", "cover", "", "kit-book-illustration", kitArtUrl("history")));
  const column = document.createElement("div");
  column.id = "kitBookChapter";
  column.tabIndex = -1;
  page.before(column);
  const art = main.querySelector(".kit-book-illustration");
  if (art) column.append(art);
  column.append(page);
};
const baseVisualSidebar = renderSidebar;
renderSidebar = function () {
  baseVisualSidebar();
  const place = selected?.type === "node" ? node(selected.id) : null;
  const panel = $("sidebar")?.querySelector(".side-inner");
  if (!place || !panel || !visibleNode(place)) return;
  const section = [...panel.children].find((el) => el.querySelector("h2"));
  if (!section) return;
  const region = S.engine.regions.find((r) => r.id === place.regionId);
  section.classList.add("place-dossier");
  section.insertAdjacentHTML(
    "afterbegin",
    sectionArt(
      place.image || region?.image,
      "cover",
      type(place.type)[0] ? "⌖" : "✦",
    ),
  );
  if (!player) {
    const actions = section.querySelector(".actions");
    const menu = visualMenu(
      "Действия с местом",
      (actions?.innerHTML || "") +
        visualAction(
          "Иллюстрация места",
          "editPlaceArt(" + jsid(place.id) + ")",
        ),
    );
    if (actions) actions.outerHTML = menu;
    else section.insertAdjacentHTML("beforeend", menu);
  }
};
function editPlaceArt(id) {
  const place = node(id);
  if (player || !place) return;
  editVisualImages(
    place.name,
    [{ key: "placeArt", label: "Иллюстрация места", image: place.image }],
    (images) => {
      place.image = images.placeArt;
    },
  );
}
onRender.push(() => {
  renderCampaignBar();
  const main = $("main");
  main.dataset.scene = tab;
  if (tab === "camp") campVisuals();
  const panel = $("engineActions");
  if (panel) {
    const box = panel.closest(".engine-panel");
    const decisions = new Set([
      "Создать регион",
      "Нарисовать границу",
      "Изменить регион",
      "Эффекты лагеря",
      "Обучение профессиям",
      "Новое местное поручение",
      "Изменить поручение",
      "Последствия сессии",
      "Категория предметов",
      "Экономика",
      "Закрыть стоянку",
    ]);
    const admin = [...panel.children].filter((el) =>
      decisions.has(el.textContent),
    );
    if (admin.length && !player) {
      const details = document.createElement("details");
      details.className = "visual-menu";
      details.dataset.contextMenu = "";
      details.innerHTML =
        '<summary aria-label="Управление разделом" title="Управление разделом">⋯</summary><div class="visual-menu-panel"></div>';
      details.lastElementChild.append(...admin);
      panel.append(details);
    }
    box?.classList.add("context-panel");
  }
});
