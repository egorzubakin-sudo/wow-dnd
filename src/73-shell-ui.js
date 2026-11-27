uxToolbar = function () {
  const el = $("uxTools");
  if (!el) return;
  const count = uxNotifications().filter(
    (row) => !uxReadSet()[1].has(row.notification),
  ).length;
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
  const operations = $("atlasOperations");
  if (operations) operations.hidden = player;
}
function homeSituation() {
  const hero = chosen(),
    stay = currentStay(S),
    routeRecord = S.journey && route(S.journey.routeId);
  const notifications = uxNotifications().filter(
    (row) => !uxReadSet()[1].has(row.notification),
  );
  const current = S.contracts.filter(
    (q) => q.status === "active" && !q.archived && (!player || !q.hidden),
  );
  const mode = S.journey ? "travel" : S.engine.phase;
  const actions =
    mode === "stay"
      ? visualAction("Открыть стоянку", "switchTab('stay')", "primary") +
        (hero ? visualAction("Ремесло", "openCraftTab('recipes')") : "")
      : mode === "travel"
        ? visualAction("Перейти к маршруту", "switchTab('map')", "primary")
        : visualAction(
            "Открыть журнал заданий",
            "switchTab('contracts')",
            "primary",
          );
  let text = "";
  if (stay)
    text =
      stay.name +
      (hero ? " · " + timeLabel(remaining(S, hero)) + " у героя" : "");
  else if (S.journey)
    text =
      routeRecord && visibleRoute(routeRecord)
        ? routeLabel(routeRecord) +
          " · " +
          (S.journey.outcome == null
            ? "ожидается событие"
            : "событие перехода определено")
        : "Компания в пути";
  else
    text = current.length
      ? current
          .slice(0, 2)
          .map((q) => q.title)
          .join(" · ")
      : "Компания готовится к новым приключениям.";
  const portrait = hero ? heroOf(S, hero) : null;
  return (
    '<section class="home-situation" aria-label="Сейчас в кампании"><div>' +
    "<small>" +
    esc(phases[mode]) +
    "</small><strong>" +
    esc(text) +
    '</strong><div class="actions">' +
    actions +
    "</div></div>" +
    "<div><small>" +
    (portrait ? "Активный герой" : "В компании") +
    "</small><strong>" +
    esc(portrait ? memberName(portrait) : S.company.name) +
    "</strong>" +
    visualAction(
      notifications.length
        ? "Новые события · " + notifications.length
        : "Уведомления",
      "uxInbox()",
      "ghost",
    ) +
    "</div></section>"
  );
}
function prepareHomeVisuals() {
  const cover = $("main").querySelector(".home-hero");
  if (!cover) return;
  const p = getHomePrefs();
  if (p.hero) cover.insertAdjacentHTML("afterend", homeSituation());
  $("main").querySelector(".home-hero .ux-cover")?.remove();
  const settings = $("main").querySelector(".home-settings");
  const slot = document.createElement("div");
  slot.className = "home-appearance";
  slot.innerHTML = visualMenu(
    "Главная страница",
    visualAction("Настроить блоки", "openHomeAppearance()") +
      (!player ? visualAction("Изменить обложку", "uxCover()") : ""),
  );
  cover.append(slot);
  if (settings) settings.hidden = true;
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
  const staff = body.querySelector(".camp-grid ~ .cards");
  if (staff) {
    staff.className = "people-gallery camp-staff";
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
            sectionArt(x.image, "portrait", "⚒") +
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
  for (const branch of body.querySelectorAll(".branch")) {
    const icon = branch.querySelector("h2")?.textContent.trim()[0] || "✦";
    for (const node of branch.querySelectorAll(".talent")) {
      node
        .querySelector(".rank")
        ?.insertAdjacentHTML("beforebegin", gameIcon(icon));
      const buttons = node.querySelector(".actions");
      const manual = buttons?.querySelector(".ghost");
      if (manual) {
        const anchor = document.createElement("div");
        anchor.innerHTML = visualMenu(
          "Управление улучшением",
          manual.outerHTML,
        );
        manual.replaceWith(anchor.firstElementChild);
      }
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
    stats.insertAdjacentHTML(
      "afterend",
      '<progress class="collection-meter" aria-label="Заполнение коллекции" value="' +
        earned +
        '" max="' +
        (cardsVisible.length || 1) +
        '"></progress>',
    );
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
      sectionArt(x.image, "emblem", "✦") +
      "<span><small>" +
      esc(x.category || "") +
      "</small><strong>" +
      esc(x.title) +
      "</strong><span>" +
      esc(excerpt(x.body, 155)) +
      "</span><small>" +
      esc(n(x.points) + " очк.") +
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
let achievementCategory = "";
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
    '<div class="achievement-category">' +
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
  if (achievementCategory) {
    const cards = [...gallery.querySelectorAll(".achievement")];
    for (const card of cards)
      if (
        card.querySelector(".achievement-open small")?.textContent !==
        achievementCategory
      )
        card.remove();
    if (!gallery.children.length)
      gallery.innerHTML = emptyScene(
        "В этой категории пока нет подходящих достижений.",
      );
  }
  collectionVisuals();
};
const baseVisualBook = renderWorldBook;
renderWorldBook = function () {
  baseVisualBook();
  $("main")
    .querySelector(".screen")
    ?.classList.add("visual-screen", "book-visual");
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
  revealActiveSection();
  const main = $("main");
  main.dataset.scene = tab;
  if (tab === "home") prepareHomeVisuals();
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
