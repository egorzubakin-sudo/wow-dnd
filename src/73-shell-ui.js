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
  rememberNavPage(section);
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
    "personalAchievements",
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
      companySpecialists(S)
        .filter((x) => !player || !x.hidden)
        .map((x) => {
          const id = jsid(x.id);
          const projects = (S.engine.projects || []).filter(
            (p) =>
              p.status === "active" &&
              p.contributors?.some((c) => c.staff === x.id),
          );
          return (
            '<article class="visual-card person-card"><button class="visual-open person-open" onclick="' +
            (x.npcId ? "openPortalRecord('people'," + jsid(x.npcId) + ")" : "openAffPerson('staff'," + id + ")") + '">'  +
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
                  x.npcId ? visualAction("Участие в компании", "editNpcParticipation(" + jsid(x.npcId) + ")") :
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
  const path = selected?.type === "route" ? route(selected.id) : null;
  const panel = $("sidebar")?.querySelector(".side-inner");
  const section = panel && [...panel.children].find((el) => el.querySelector("h2") && el.classList.contains("section"));
  if (!section) return;
  const actions = section.querySelector(".actions");
  if (path && visibleRoute(path)) {
    if (actions) actions.outerHTML = canEditMap() ? visualMenu("Действия с маршрутом",
      visualAction("Изменить маршрут", "editRoute(" + jsid(path.id) + ")") +
      visualAction("Удалить маршрут", "deleteRoute(" + jsid(path.id) + ")", "danger")) : "";
    const table = [...panel.querySelectorAll("section")].find((el) => el.querySelector("h3")?.textContent === "Таблица событий");
    if (table) table.innerHTML = '<details><summary>Таблица событий d6</summary>' + [...table.querySelectorAll("p")].map((row) => row.outerHTML).join("") + '</details>';
  } else if (place && visibleNode(place)) {
    const region = S.engine.regions.find((r) => r.id === place.regionId);
    section.classList.add("place-dossier");
    if (place.image || region?.image)
      section.insertAdjacentHTML("afterbegin", sectionArt(place.image || region.image, "cover", ""));
    if (actions) actions.outerHTML = canEditMap() ? visualMenu("Действия с местом", mapNodeActions(place.id)) : "";
    for (const btn of panel.querySelectorAll("button")) {
      if (btn.getAttribute("onclick")?.startsWith("tool=")) btn.remove();
    }
  }
};
function editPlaceArt(id) {
  const place = node(id);
  if (!canEditMap() || !place) return;
  editVisualImages(
    place.name,
    [{ key: "placeArt", label: "Иллюстрация места", image: place.image }],
    (images) => {
      if (canEditMap()) place.image = images.placeArt;
    },
  );
}
onRender.push(() => {
  renderCampaignBar();
  const main = $("main");
  main.dataset.scene = tab;
  if (tab === "camp") campVisuals();
  if (tab === "journal" && chosen())
    main.querySelector(".section-cover-actions")?.prepend(button("Мои операции", journalPanel));
});
