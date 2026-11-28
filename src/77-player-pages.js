let heroProfileTab = "stats";
function openHeroProfile(id = chosen()) {
  if (!id || !owned(actor, id)) return;
  activeHero = id;
  heroProfileTab = "stats";
  closeModal();
  switchTab("hero");
}

function previewHero(id) {
  if (player || !S.company.members.some((row) => row.id === id)) return;
  previewActor = actor;
  previewReadOnly = true;
  actor = { role: "player", nick: actor.nick, name: actor.name, heroes: [id] };
  player = true;
  openHeroProfile(id);
}
function returnFromHeroView() {
  if (!previewReadOnly || !previewActor) return;
  actor = previewActor;
  previewActor = null;
  previewReadOnly = false;
  player = false;
  applyUiScale();
  closeModal();
  switchTab("hero");
}
function selectHeroProfileTab(section) {
  heroProfileTab = section;
  renderHero();
  $("heroProfileTabs")?.querySelector('[aria-pressed="true"]')?.focus();
}
function renderHero() {
  const hero = chosen(), root = $("main");
  if (!hero) {
    root.innerHTML = '<div class="atlas-kit"><h2>Мой герой</h2>' +
      emptyScene("Герой ещё не назначен.", !player ? visualAction("Создать героя", "editMember()") : "") + '</div>';
    return;
  }
  const member = heroOf(S, hero), p = profile(S, hero), canAct = owned(actor, hero);
  const profileTabs = [["stats","Характеристики"],["bio","Биография"],["professions","Профессии"]];
  const options = (canAct ? visualAction("Редактировать профиль", "editMember(" + jsid(hero) + ")") : "") +
    (!player ? visualAction("Посмотреть от лица героя", "previewHero(" + jsid(hero) + ")") : "");
  root.innerHTML = `<div class="atlas-kit kit-hero-page">
    <div class="kit-sectionhead"><div><div class="eyebrow">Мой герой</div><h2>${esc(memberName(member))}</h2>
    <p>${esc(kitHeroDescription(p))}</p></div><div class="actions">${kitHeroSelect(hero)}${visualMenu("Действия с героем", options)}</div></div>
    ${previewReadOnly ? '<p class="kit-notice">Просмотр от лица героя</p>' : ""}
    <div class="kit-company-layout">
      <section class="kit-panel kit-company-portrait">
        ${sectionArt(member.image, "portrait", "", "", iconPath(iconDefaults.components.hero))}
        <div class="eyebrow">${esc(member.role || "Участник компании")}</div>
        ${affiliationBadge(member)}
        <div class="hero-wallet"><div><small>Личный кошелёк</small><strong>${esc(goldText(p.wallet))}</strong></div>${heroWalletActions(hero)}</div>
        <div class="kit-quick">
          ${kitLink("Сумки", "switchTab('bags')", "bank")}
          ${kitLink("Рецепты", "openCraftTab('recipes')", "craft")}
          ${kitLink("Достижения", "switchTab('personalAchievements')", "achievements")}
        </div>
      </section>
      <section class="kit-panel hero-details">
        <div class="kit-tabs" id="heroProfileTabs" aria-label="Разделы профиля">${profileTabs.map(([id, label]) =>
          '<button class="kit-tab" aria-pressed="' + (id === heroProfileTab) + '" onclick="selectHeroProfileTab(' +
          jsid(id) + ')">' + label + '</button>').join("")}</div>
        ${heroProfileTab === "stats" ? renderHeroChecks(p, canAct) :
          heroProfileTab === "bio" ? '<h3>Биография</h3><p class="record-body">' + esc(member.bio || "Биография пока не записана.") + '</p>' :
          renderHeroProfessions(p)}
      </section>
    </div>
  </div>`;
  bindKitHero();
}
function renderHeroChecks(p, canAct) {
  return `<div class="kit-subhead"><h3>Характеристики</h3><small>Бонус владения +${bv(p)}</small></div>
    <div class="kit-stat-grid">${Object.entries(stats).map(([key, label]) => {
      const mod = signed(ability(p, { stat: key }, () => 1).mod);
      return '<div><small>' + esc(label) + '</small><strong>' + esc(p.stats[key]) + '</strong>' +
        (canAct ? visualAction(mod, "rollForm(" + jsid(key) + ")") : '<small>' + mod + '</small>') + '</div>';
    }).join("")}</div>
    ${kitSubhead("Навыки")}
    ${Object.keys(skills).map((skill) => {
      const mod = signed(ability(p, { skill }, () => 1).mod);
      return '<div class="kit-profile-skill"><span class="kit-grow">' + esc(skill) + '</span>' +
        (canAct ? '<button class="ghost" aria-label="' + esc("Проверка · " + skill) +
          '" onclick="rollForm(\'\',' + jsid(skill) + ')">' + mod + '</button>' : '<b>' + mod + '</b>') + '</div>';
    }).join("")}
    <div class="actions">${canAct ? visualAction("Произвольная проверка", "rollForm()") : ""}
      ${visualAction("Журнал проверок", "rollHistory()", "ghost")}</div>`;
}
function renderHeroProfessions(p) {
  const professions = S.engine.professions.filter((row) => p.professions.includes(row.id));
  return '<h3>Профессии</h3>' + (professions.map((record) => {
    const eligible = eligibleProfession(S, p, record.id);
    const rank = professionRank(p, record.id);
    return '<div class="kit-listrow">' + professionIcon(record) +
      '<span class="kit-grow"><b>' + esc(record.name) + '</b><small>' +
      esc(eligible ? professionRanks[rank - 2] || "Ранг " + rank : "Требуется владение") + '</small></span></div>';
  }).join("") || emptyScene("У героя пока нет выбранных профессий.")) +
    '<div class="actions">' + visualAction("Открыть профессии", "openCraftTab('professions')") + '</div>';
}
function heroWalletActions(hero) {
  if (!owned(actor, hero)) return "";
  return visualMenu("Действия с кошельком",
    visualAction("Внести золото в казну", "donateTradeGold()") +
    (!player ? visualAction("Перевести из казны", "transferPersonalGold()") : ""));
}
function transferPersonalGold() {
  if (player || !chosen()) return;
  const hero = chosen();
  commandForm("Перевод между казной и кошельком",
    input("Зм (отрицательное — в казну)", "amt", "number", 1), "gold",
    () => ({ hero, amount: num("amt") }));
}
function personalSlots(hero) {
  const rows = S.company.inventory.filter((x) => x.owner === "member:" + hero && canSeeStack(x));
  return rows.length ? slotGrid(rows) : "";
}
function personalBagContent(hero) {
  return '<div class="hero-wallet"><div><small>Личный кошелёк</small><strong>' +
    esc(goldText(profile(S, hero).wallet)) + '</strong></div>' + heroWalletActions(hero) +
    '</div><section id="bagRows" class="personal-bags">' +
    (personalSlots(hero) ||
      emptyScene("Сумки пусты")) + '</section>';
}
function bagPage() {
  const hero = chosen();
  if (!hero) return;
  openModal("Сумки · " + memberName(heroOf(S, hero)), personalBagContent(hero) +
    '<div class="actions">' + kitLink("Открыть личные сумки", "closeModal();switchTab('bags')", "bank") +
    itemCatalogLink(hero, "Добавить из каталога") + '</div>');
}
function renderBags() {
  const hero = chosen();
  $("main").innerHTML = '<div class="atlas-kit">' + sectionHeader("Личные сумки",
    hero ? memberName(heroOf(S, hero)) : "Выберите героя",
    kitHeroSelect(hero) + (hero ? itemCatalogLink(hero, "Добавить из каталога") : "")) +
    (hero ? '<div class="kit-panel hero-bags">' + personalBagContent(hero) + '</div>' :
      emptyScene("Сумки доступны назначенному герою.")) + '</div>';
  bindKitHero();
}
function renderHeroAchievements() {
  const hero = chosen();
  if (!hero) {
    $("main").innerHTML = '<div class="atlas-kit"><h2>Личные достижения</h2>' + emptyScene("Выберите героя.") + '</div>';
    return;
  }
  achievementFilter = "hero:" + hero;
  renderAchievements();
}

function openCompanyAchievements() {
  achievementFilter = "company";
  switchTab("achievements");
}
function companyRosterSection(title, cards, id = "", action = "") {
  return '<section' + (id ? ' id="' + id + '"' : "") + '>' + '<div class="kit-subhead"><h3>' + esc(title) + '</h3>' + action + '</div>' +
    (cards.length ? '<div class="company-roster">' + cards.join("") + '</div>' :
      '<p class="company-roster-empty">В этой группе пока никого нет.</p>') + '</section>';
}
function companyCard(name, role, member, action, details = "", extra = "", opportunity = "") {
  return '<article class="kit-panel company-member" ' + extra + '><button class="company-member-open" onclick="' + action + '">' +
    kitAvatar(member) + '<span class="kit-grow"><strong>' + esc(name) + '</strong><small>' + esc(role) +
    '</small>' + (opportunity ? '<small class="company-opportunity">' + esc(opportunity) + '</small>' : '') + '</span></button>' + details + '</article>';
}
function renderCompany() {
  const c = S.company, art = safeImage(S.settings.visual?.covers?.company) || kitArtUrl("party");
  const roster = companyHeroRows().map((m) => {
    const id = jsid(m.id);
    const details = !player ? visualMenu("Управление героем",
      visualAction("Настроить героя", "editMember(" + id + ")") +
      visualAction("Переименовать", "renameHero(" + id + ")") +
      visualAction("Удалить", "removeMember(" + id + ")", "danger")) : "";
    return companyCard(memberName(m), m.role || "Герой", m,
      owned(actor, m.id) ? "openHeroProfile(" + id + ")" : "openAffPerson('hero'," + id + ")",
      details, 'data-hero="' + esc(m.id) + '"');
  });
  const allCompanions = visiblePortalRows("people").filter((npc) => npc.participation?.companion);
  const former = (npc) => ["left", "dead"].includes(npc.participation.companion.state);
  const card = (npc) => companyCard(npc.title,
    [npc.participation.companion.role, companionStates[npc.participation.companion.state]].filter(Boolean).join(" · "),
    npc, "openPortalRecord('people'," + jsid(npc.id) + ")", "", "",
    npc.participation.actions?.[0]?.name || "");
  const companions = allCompanions.filter((npc) => !former(npc)).map(card);
  const departed = allCompanions.filter(former).map(card);
  const staff = companySpecialists(S).filter((row) => !player || !row.hidden).map((row) =>
    companyCard(row.name, row.role || "Специалист лагеря", row,
      row.npcId ? "openPortalRecord('people'," + jsid(row.npcId) + ")" : "openAffPerson('staff'," + jsid(row.id) + ")"));
  const charters = S.factions.filter((f) => visibleFaction(f) && f.charter);
  const achievements = visiblePortalRows("achievements").filter((a) => hasGrant(a, "company"));
  const admin = !player ? visualMenu("Управление компанией",
    visualAction("Изменить хартию", "editCompany()") +
    visualAction("Переименовать компанию", "renameCompany()") +
    visualAction("Сменить обложку", "editSectionCover('company')") +
    visualAction("Создать героя", "editMember()") +
    visualAction("Назначить NPC", "chooseCompanyNpc()")) : "";
  $("main").innerHTML = `<div class="atlas-kit kit-company-overview">
    <section class="kit-wideart"><img class="kit-cover-image" src="${esc(art)}" alt="">
      <div class="kit-herotext"><div class="eyebrow">Компания · ${esc(dayLabel())}</div><h2>${esc(c.name)}</h2>
      <p>${esc(locLabel(c.location))}</p></div><div class="kit-hero-actions">${admin}</div>
    </section>
    <div class="company-summary">
      <section class="kit-panel"><h3>Хартия</h3><p class="record-body">${esc(c.notes || "Хартия пока не заполнена.")}</p></section>
      <section class="kit-panel"><h3>Общая казна</h3><div class="hero-wallet"><strong>${esc(goldText(c.gold))}</strong>
        ${!player ? visualMenu("Управление казной", visualAction("Операция с казной", "treasury()") + visualAction("Установить остаток", "setGold()")) : ""}
      </div><div class="actions">${kitLink("Общий банк", "switchTab('bank')", "bank")}${kitLink("Лагерь", "switchTab('camp')", "camp")}</div></section>
    </div>
    ${companyRosterSection("Герои", roster, "companyHeroes")}
    ${companyRosterSection("Спутники", companions, "companyCompanions", !player ? kitLink("Пригласить спутника", "chooseCompanyNpc(true)", "people", "primary") : "")}
    ${departed.length ? '<details class="kit-panel"><summary>Бывшие спутники</summary><div class="company-roster">' + departed.join("") + '</div></details>' : ""}
    ${companyRosterSection("Специалисты", staff)}
    <div class="company-summary">
      <section class="kit-panel"><div class="kit-subhead"><h3>Верительные грамоты</h3>
        ${!player ? kitLink("Выдать грамоту", "charterDialog()", "contracts", "primary") : ""}</div>
        ${charterCollection(charters)}</section>
      <section class="kit-panel"><h3>Коллективные достижения</h3>${achievements.slice(0, 3).map((a) =>
        kitHomeRow(a.title, "", "achievements", "openPortalRecord('achievements'," + jsid(a.id) + ")")).join("")}
        ${visualAction("Все достижения компании", "openCompanyAchievements()")}
      </section>
    </div>
  </div>`;
}

function administrationSections() {
  const adminLink = (label, action) => visualAction(label, action);
  const blocks = [
    ["Пользователи и герои", adminLink("Аккаунты и герои", "manageUsers()") +
      adminLink("Создать пользователя", "createUserDialog()") + adminLink("Состав компании", "switchTab('company')") +
      adminLink("Назначить NPC", "chooseCompanyNpc()") + adminLink("Обращения к спутникам", "companionRequestsPage()")],
    ["Кампания и календарь", adminLink("Фазы и стоянка", "stayAdmin()") +
      (!S.journey ? adminLink("Пропустить дни", "advanceTime()") : "") +
      adminLink("Последствия сессии", "sessionEditor()") + adminLink("Журнал событий", "switchTab('journal')")],
    ["Экономика и лагерь", adminLink("Экономика", "economyForm()") +
      adminLink("Казна", "treasury()") + adminLink("Эффекты лагеря", "campControl()") +
      adminLink("Обучение профессиям", "trainingModeForm()")],
    ["Редактирование мира", adminLink("Карта", "switchTab('map')") + adminLink("Персонажи мира", "switchTab('people')") +
      adminLink("Фракции", "switchTab('factions')") + adminLink("Хроники", "switchTab('worldbook')")],
    ["Сохранения и история", '<div id="workshopFiles" class="actions"></div>' + adminLink("Журнал операций", "journalPanel()") +
      adminLink("История изменений", "uxHistory()") + adminLink("Архив", "uxArchiveView()")],
  ];
  return '<div class="kit-workshop-layout">' + blocks.map(([title, actions]) =>
    '<section class="kit-panel"><h3>' + title + '</h3><div class="actions">' + actions + '</div></section>').join("") + '</div>';
}
