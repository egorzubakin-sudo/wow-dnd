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
const kitNavLabels = {
  people: "Персонажи",
  worldbook: "Хроники",
  company: "Герои",
  bank: "Сумки и банк",
  contracts: "Задания",
};
function kitNavLabel(key, label) {
  return kitNavLabels[key] || label;
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
function kitUpdateNavigation() {
  document.body.classList.add("atlas-kit-active");
  const top = $("kitTop");
  const operations = $("atlasOperations");
  operations.querySelector(".kit-operations-extra")?.remove();
  operations.querySelector(".visual-menu-panel").insertAdjacentHTML(
    "afterbegin",
    '<div class="kit-operations-extra">' +
      visualAction("Избранное", "uxFavorites()") +
      (!player
        ? visualAction("Архив", "uxArchiveView()") +
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
    "<span><strong>Атлас расколотого мира</strong><small>Хроники Азерота</small></span></button>" +
    '<div class="kit-topmeta"><span class="kit-day">День ' +
    esc(S.company.day) +
    " · <b>" +
    esc(S.company.year) +
    "-й год</b></span>" +
    '<span class="kit-location">' +
    esc(phase) +
    (here ? " · <b>" + esc(here) + "</b>" : "") +
    "</span>" +
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
  const path = iconPath(chosenId) || iconPath(iconDefaults.nav[key]);
  return path
    ? '<img src="' + esc(path) + '" alt="">'
    : existingNavIcon(key, fallback);
};
