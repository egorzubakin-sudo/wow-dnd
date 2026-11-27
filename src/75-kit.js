const kitActivityArt = {
  mining: "forge",
  herbalism: "forest",
  hunt: "camp",
  fishing: "fish",
  archaeology: "ruins",
  skinning: "forest",
  smithing: "forge",
  alchemy: "market",
  cooking: "market",
};
const additionalNavIcons = { hero: "company", bags: "bank", personalAchievements: "achievements" };
let activeNavBand = 0;
const navBandIcons = ["hero", "company", "map"];
function uiPreferences() {
  try {
    return JSON.parse(localStorage.getItem("atlas-ui:" + actor?.nick)) || {};
  } catch {
    return {};
  }
}
function saveUiPreferences(values) {
  localStorage.setItem("atlas-ui:" + actor.nick, JSON.stringify({ ...uiPreferences(), ...values }));
}
function applyUiScale() {
  const scale = uiPreferences().scale;
  document.documentElement.style.setProperty("--atlas-ui-scale", [100, 115, 130].includes(scale) ? scale / 100 : 1);
  if ($("mapsvg")) drawMap();
}
function uiScaleDialog() {
  form("Масштаб интерфейса", pick("Размер", "uiScale", [100, 115, 130].map((n) => [n, n + "%"]), uiPreferences().scale || 100), () => {
    saveUiPreferences({ scale: Number(val("uiScale")) });
    applyUiScale();
  });
}
function chooseNavBand(index) {
  const items = NAV_BANDS[index]?.[1];
  if (!items) return;
  const last = uiPreferences().pages?.[index];
  switchTab(items.some(([id]) => id === last) ? last : items[0][0]);
}
function renderNavigation() {
  const group = navGroup(tab);
  const preferences = uiPreferences();
  activeNavBand = group >= 0 ? group : NAV_BANDS[preferences.group] ? preferences.group : 0;
  $("nav").dataset.band = activeNavBand;
  return '<div class="kit-nav-switch" aria-label="Группы разделов">' +
    NAV_BANDS.map(([label], index) =>
      '<button data-group="' + index + '" aria-pressed="' + (activeNavBand === index) +
      '" onclick="chooseNavBand(' + index + ')">' + uiIcon(navBandIcons[index]) + esc(label) + '</button>').join("") + '</div>' +
    NAV_BANDS.map(([label, items], index) =>
      '<div class="nav-band" data-group="' + index + '"><div class="nav-band-label">' + esc(label) +
      '</div><div class="nav-scroll" data-band="' + index + '" onscroll="navOffsets[' + index + ']=this.scrollLeft">' +
      items.map(([id, name, fallback]) =>
        '<button class="nav-tab ' + (tab === id ? "active" : "") + '" aria-label="' + esc(name) +
        '"' + (tab === id ? ' aria-current="page"' : '') + ' onclick="switchTab(' + jsid(id) +
        ')"><span class="menu-icon">' + navIcon(id, fallback) + '</span><span>' + esc(name) +
        '</span></button>').join("") + '</div></div>').join("");
}
function navGroup(section) {
  return NAV_BANDS.findIndex(([, items]) => items.some(([id]) => id === section));
}
function rememberNavPage(section) {
  if (!actor || previewReadOnly) return;
  const page = section === "rumors" ? "news" : section;
  const group = navGroup(page);
  if (group < 0) return;
  const preferences = uiPreferences();
  if (preferences.pages?.[group] !== page || preferences.group !== group)
    saveUiPreferences({ group, pages: { ...preferences.pages, [group]: page } });
}
function kitArtUrl(key) {
  return "assets/ui-kit/" + key + ".webp";
}
function kitActivityPicture(id) {
  return kitArtUrl(kitActivityArt[id] || "forest");
}
function kitAvatar(member) {
  const image =
    safeImage(member?.image) || iconPath(iconDefaults.components.hero);
  return '<img class="kit-avatar" src="' + esc(image) + '" alt="">';
}
function kitHeroSelect(id, fieldId = "gameHero") {
  const heroes = heroRows();
  if (heroes.length < 2) return "";
  return (
    '<select id="' + fieldId + '" class="kit-field" aria-label="Активный герой">' +
    heroes
      .map(
        (member) =>
          '<option value="' +
          esc(member.id) +
          '"' +
          (member.id === id ? " selected" : "") +
          ">" +
          esc(memberName(member)) +
          "</option>",
      )
      .join("") +
    "</select>"
  );
}
function bindKitHero() {
  if ($("gameHero"))
    $("gameHero").onchange = () => {
      activeHero = val("gameHero");
      render();
    };
}
function kitLink(label, action, icon, className = "") {
  return (
    '<button type="button" class="' +
    className +
    '" onclick="' +
    action +
    '">' +
    (icon ? uiIcon(icon) : "") +
    esc(label) +
    "</button>"
  );
}
function kitHeroDescription(p) {
  return [p.race, p.class, `Уровень ${p.level}`, `БВ +${bv(p)}`]
    .filter(Boolean)
    .join(" · ");
}
function kitSubhead(title, side = "") {
  return (
    '<div class="kit-subhead"><h3>' +
    esc(title) +
    "</h3>" +
    (side ? "<small>" + esc(side) + "</small>" : "") +
    "</div>"
  );
}
function moveCampaignFileControls() {
  const panel = $("workshopFiles") || $("atlasOperations").querySelector(".visual-menu-panel");
  for (const id of ["exportBtn", "importBtn"]) {
    $(id).hidden = tab !== "workshop" || player;
    panel.append($(id));
  }
}
function kitUpdateNavigation() {
  document.body.classList.add("atlas-kit-active");
  const top = $("kitTop");
  moveCampaignFileControls();
  const operations = $("atlasOperations");
  operations.querySelector(".kit-operations-extra")?.remove();
  operations.querySelector(".visual-menu-panel").insertAdjacentHTML(
    "afterbegin",
    '<div class="kit-operations-extra">' +
      visualAction("Избранное", "uxFavorites()") +
      visualAction("Масштаб интерфейса", "uiScaleDialog()") +
      visualAction("Дипломатия", "switchTab('diplomacy')") +
      visualAction("Правила", "switchTab('help')") +
      visualAction("Журнал", "switchTab('journal')") +
      (!player
        ? visualAction("Мастерская", "switchTab('workshop')") +
          visualAction("Архив", "uxArchiveView()") +
          visualAction("История", "uxHistory()") +
          (uxUndo.length ? visualAction("Отменить действие", "uxRestore(false)") : "") +
          (uxRedo.length ? visualAction("Повторить действие", "uxRestore(true)") : "")
        : "") +
      "</div>",
  );
  operations.hidden = false;
  const hero = chosen(),
    member = hero ? heroOf(S, hero) : null;
  const here = locLabel(S.company.location),
    phase = phases[S.journey ? "travel" : S.engine.phase];
  const notes = uxNotifications().some(
    (row) => !uxReadSet()[1].has(row.notification),
  );
  top.hidden = false;
  top.innerHTML =
    '<button class="kit-brand" onclick="switchTab(\'home\')" aria-label="Главная">' +
    uiIcon("map") +
    "<span><strong>Warcraft: Век Авантюристов</strong><small>Хроники расколотого мира</small></span></button>" +
    '<div class="kit-topmeta"><span class="kit-day">День ' +
    esc(S.company.day) +
    " · <b>" +
    esc(S.company.year) +
    "-й год</b></span>" +
    '<span class="kit-location">' +
    esc(phase) +
    (here ? " · <b>" + esc(here) + "</b>" : "") +
    "</span>" +
    '<button class="kit-topicon" onclick="switchTab(\'mail\')" aria-label="Почта">' + uiIcon("mail") + "</button>" +
    '<button class="kit-topicon" onclick="uxSearch()" aria-label="Поиск">' +
    uiIcon("search") +
    "</button>" +
    '<button id="kitNotifications" class="kit-topicon' +
    (notes ? " kit-unread" : "") +
    '" onclick="uxInbox()" aria-label="Уведомления">' +
    uiIcon("bell") +
    "</button>" +
    '<button class="kit-topicon" id="kitAccount" onclick="accountMenu()" aria-label="Профиль">' +
    kitAvatar(member) +
    "</button>" +
    '<b class="kit-username">' +
    esc(actor.name) +
    "</b></div>";
  top.lastElementChild.append(operations);
  revealActiveSection();
}
onRender.push(kitUpdateNavigation);
const existingNavIcon = navIcon;
navIcon = function (key, fallback) {
  const custom = safeImage(S.settings.navIcons?.[key]);
  const chosenId = S.settings.navIconIds?.[key];
  if (custom) return '<img src="' + esc(custom) + '" alt="">';
  const path = iconPath(chosenId) || iconPath(iconDefaults.nav[additionalNavIcons[key] || key]);
  return path
    ? '<img src="' + esc(path) + '" alt="">'
    : existingNavIcon(key, fallback);
};
