const companionSurfaces = {
  stay: ["gather", "scout", "info", "text", "errand"],
  contracts: ["quest", "errand"],
  craft: ["recipe", "craft", "mentor"],
  trade: ["trade"],
};
const actionIcons = {
  gather: "stay", scout: "map", info: "search", text: "mail", errand: "contracts",
  quest: "contracts", recipe: "craft", craft: "craft", mentor: "codex", trade: "bank",
};
function companionTerms(action) {
  return [
    action.gold ? goldText(action.gold) + " дополнительно" : "",
    action.hours ? timeLabel(action.hours) + " дополнительно" : "",
    action.phase ? phases[action.phase] : "",
    action.location ? locLabel(action.location) : "",
  ].filter(Boolean).join(" · ");
}
function companionAvailability(hero, ref) {
  const entry = companionActionState(S, actor, hero, ref);
  if (entry.reason || !entry.mechanic) return entry;
  const { target, action } = entry, code = entry.mechanic[0], stay = currentStay(S);
  const h = profile(S, hero);
  try {
    if (code === "gather") {
      if (!stay) entry.reason = "Нужна активная стоянка";
      else {
        const activity = activityState(hero, target, stay);
        entry.reason = activity.reason;
        if (!entry.reason && remaining(S, hero) < activity.details.hours + action.hours)
          entry.reason = "Недостаточно времени на занятие и помощь спутника";
      }
    } else if (code === "quest") {
      if (!questAvailable(S, target, hero) || remaining(S, hero) < target.hours + action.hours)
        entry.reason = "Поручение сейчас недоступно";
    } else if (code === "deliverGoods") {
      entry.reason = deliveryQuote(S, actor, hero, target).reasons[0];
    } else if (code === "trade") {
      const row = localMarket(S, actor).find((res) => res.item_id === target.id);
      if (row) tradePrices(S, row);
      else entry.reason = "Товар пока недоступен на местном рынке";
    } else if (code === "train") {
      const offer = trainingOffer(S, target.id, bv(h), true);
      if (!offer || !eligibleProfession(S, h, target.id) || bv(h) <= (h.trained?.[target.id] || 2))
        entry.reason = "Нужны стоянка, подходящие владения и новый ранг";
      else if (h.wallet < offer.fee + action.gold || remaining(S, hero) < offer.hours + action.hours)
        entry.reason = "Недостаточно времени или золота на обучение";
    }
  } catch (error) {
    entry.reason = error.message;
  }
  return entry;
}
function companionRows(surface, onlyNpc) {
  const hero = chosen(), allowed = companionSurfaces[surface];
  return visiblePortalRows("people").filter((npc) => !onlyNpc || npc.id === onlyNpc)
    .flatMap((npc) => {
      if (!npc.participation?.companion && !npc.participation?.specialist) return [];
      return (npc.participation?.actions || []).filter((a) => !allowed || allowed.includes(a.kind)).map((a) => {
        const ref = { npc: npc.id, action: a.id };
        return companionAvailability(hero, ref);
      });
    });
}
function companionActionCard(entry) {
  const { npc, action, reason } = entry;
  return '<article class="companion-action"><div class="kit-row">' + uiIcon(actionIcons[action.kind]) +
    '<div class="kit-grow"><strong>' + esc(action.name) + '</strong><small>' +
    esc(npc.title + " · " + companionKinds[action.kind]) + '</small></div></div>' +
    (action.description ? '<p class="record-body">' + esc(action.description) + '</p>' : '') +
    (companionTerms(action) ? '<p class="muted">' + esc(companionTerms(action)) + '</p>' : '') +
    (reason ? '<small class="muted">' + esc(reason) + '</small>' :
      visualAction("Открыть", "openCompanionAction(" + jsid(npc.id) + "," + jsid(action.id) + ")")) + '</article>';
}
function companionPanel(surface) {
  const rows = companionRows(surface);
  return rows.length ? '<section class="companion-panel">' + kitSubhead("Возможности от спутников и специалистов") +
    '<div class="company-roster">' + rows.map(companionActionCard).join("") + '</div></section>' : "";
}
function companionDossier(npc) {
  const p = npc.participation;
  if (!p?.companion && !p?.specialist) return "";
  const c = p.companion;
  const location = c?.state === "traveling" || !c
    ? S.journey ? "В пути с компанией" : locLabel(S.company.location)
    : locLabel(c.location || npc.location);
  const actions = companionRows("", npc.id);
  return '<section class="companion-dossier"><h3>Участие в компании</h3>' +
    (c ? '<p><strong>' + esc(c.role || "Спутник") + '</strong> · ' + esc(companionStates[c.state]) + '</p>' : '') +
    (location ? '<p>Местоположение · ' + esc(location) + '</p>' : '') +
    (c?.joined ? '<p>В компании с дня ' + c.joined.day + ' · ' + c.joined.year + '-й год</p>' : '') +
    (c?.history ? '<p class="record-body">' + esc(c.history) + '</p>' : '') +
    (c?.goals ? '<h4>Личные цели</h4><p class="record-body">' + esc(c.goals) + '</p>' : '') +
    (p.specialist ? '<p>Специалист · ' + esc(p.specialist.role || "Лагерь") + '</p>' : '') +
    (actions.length ? '<h4>Взаимодействия</h4>' + actions.map(companionActionCard).join("") : "") +
    companionRequestHistory(npc.id) + '</section>';
}
function companionRequestHistory(npcId) {
  const rows = (S.engine.companionRequests || []).filter((row) => row.npc === npcId &&
    (!player || owned(actor, row.hero)));
  return rows.length ? '<h4>Обращения</h4>' + rows.slice(0, 12).map(companionRequestRow).join("") : "";
}
function companionRequestRow(row) {
  const labels = { pending: "Ожидает решения", approved: "Принято", declined: "Отклонено" };
  return '<article class="kit-panel"><strong>' + esc(row.title) + '</strong><small>' +
    esc(labels[row.status] || "") + '</small><p class="record-body">' + esc(row.message) + '</p>' +
    (row.hours || row.gold ? '<small>' + esc([row.hours && timeLabel(row.hours), row.gold && goldText(row.gold)].filter(Boolean).join(" · ")) + "</small>" : "") +
    (row.result ? '<p class="record-body">' + esc(row.result) + '</p>' : "") +
    (!player && row.status === "pending" ? visualAction("Записать решение", "resolveCompanionDialog(" + jsid(row.id) + ")") : "") +
    '</article>';
}
function companionRequestsPage() {
  if (player) return;
  const rows = S.engine.companionRequests || [];
  openModal("Обращения к спутникам", '<div class="stack">' + (rows.map((row) =>
    '<div><small>' + esc(S.portal.people.find((x) => x.id === row.npc)?.title || "Персонаж") +
    ' · ' + esc(memberName(S.company.members.find((m) => m.id === row.hero))) +
    '</small>' + companionRequestRow(row) + '</div>').join("") || emptyScene("Обращений пока нет.")) + '</div>');
}
function resolveCompanionDialog(id) {
  if (player) return;
  const row = S.engine.companionRequests?.find((r) => r.id === id);
  if (!row || row.status !== "pending") return;
  commandForm("Решение · " + row.title,
    '<p class="record-body">' + esc(row.message) + '</p>' +
    pick("Ответ", "npcApprove", [["approve","Принять"],["decline","Отклонить"]], "approve") +
    area("Что произошло", "npcResult"), "resolveCompanionRequest",
    () => ({ id, approve: val("npcApprove") === "approve", result: val("npcResult") }));
}

function openCompanionAction(npcId, actionId) {
  const hero = chosen(), ref = { npc: npcId, action: actionId };
  const result = companionAvailability(hero, ref);
  if (result.reason) return toast(result.reason);
  const { npc, action, target, mechanic } = result;
  const code = mechanic?.[0];
  const line = '<p class="muted">' + esc(npc.title + (companionTerms(action) ? " · " + companionTerms(action) : "")) + '</p>';
  if (code === "gather") {
    const stay = currentStay(S);
    if (!stay) return toast("Нужна активная стоянка");
    return activityDialog(hero, target, stay, ref, line);
  }
  if (code === "quest") return localBoard(target.id, ref, line);
  if (code === "deliverGoods") return confirmDelivery(target.id, ref, line);
  if (code === "craft") return openTradeRecipe(target.id, ref);
  if (code === "train") return trainingDialog(hero, target.id, ref, line);
  if (code === "trade") return companionTradeOffer(target.id, ref, line);
  commandForm(action.name,
    line + '<p class="record-body">' + esc(action.description || "Опишите, чего хотите от персонажа.") + '</p>' +
    (target ? '<p>Связанная запись · ' + esc(target.name || target.title) + '</p>' : '') +
    '<p class="muted">Мастер рассмотрит обращение. Время и золото списываются при принятии.</p>' +
    area("Ваше обращение", "npcMessage"), "companionRequest",
    () => ({ hero, ref, message: val("npcMessage") }), "Передать мастеру");
}

function chooseCompanyNpc(invite = false) {
  if (player) return;
  const rows = visiblePortalRows("people").filter((npc) =>
    !invite || !npc.participation?.companion || ["left", "away", "settled"].includes(npc.participation.companion.state));
  openModal(invite ? "Пригласить спутника" : "Назначить NPC", pick("Персонаж мира", "assignNpc", pairs(rows), "") +
    '<div class="actions" id="assignNpcTools"></div>');
  if (rows.length) $("assignNpcTools").append(button(invite ? "Продолжить" : "Открыть участие в компании", () => editNpcParticipation(val("assignNpc"), invite)));
  else $("assignNpcTools").append(button("Создать персонажа мира", () => editPortal("people")));
}
function editNpcParticipation(id, invite = false) {
  const npc = S.portal.people.find((x) => x.id === id);
  if (player || !npc) return;
  const p = npc.participation || {}, c = p.companion || {}, specialist = p.specialist || {};
  form("Участие в компании · " + npc.title,
    pick("Состояние спутника", "npcState", [["","Без статуса спутника"], ...Object.entries(companionStates)], (invite ? "traveling" : c.state) || "") +
    input("Роль спутника", "npcCompanyRole", "text", c.role || "") +
    pick("Местоположение, если отдельно от компании", "npcPlace", [["","По досье персонажа"], ...pairs(S.nodes)], c.location || "") +
    '<div class="cols">' + input("День присоединения", "npcJoinDay", "number", c.joined?.day ?? S.company.day, 'min="1"') +
    input("Год присоединения", "npcJoinYear", "number", c.joined?.year ?? S.company.year, 'min="1"') + '</div>' +
    area("Обстоятельства присоединения", "npcJoinHistory", c.history || "") +
    area("Личные цели", "npcGoals", c.goals || "") +
    check("Специалист лагеря", "npcSpecialist", !!p.specialist) +
    input("Роль специалиста", "npcStaffRole", "text", specialist.role || "") +
    pick("Связать с прежней записью специалиста", "npcLegacyStaff",
      [["","Использовать ID персонажа мира"], ...pairs(S.company.staff)], specialist.legacyStaff || "") +
    '<div class="actions">' + visualAction("Настроить взаимодействия", "editNpcActions(" + jsid(id) + ")") + '</div>',
    async () => {
      await execute("npcParticipation", { id, value: {
        companion: val("npcState") ? { state: val("npcState"), role: val("npcCompanyRole"), location: val("npcPlace"),
          joined: { day: num("npcJoinDay"), year: num("npcJoinYear") }, history: val("npcJoinHistory"), goals: val("npcGoals") } : null,
        specialist: $("npcSpecialist").checked ? { role: val("npcStaffRole"), legacyStaff: val("npcLegacyStaff") } : null,
        actions: p.actions || [],
      } });
      openPortalRecord("people", id);
    });
}
function editNpcActions(id) {
  const npc = S.portal.people.find((x) => x.id === id);
  if (player || !npc) return;
  openModal("Взаимодействия · " + npc.title, '<div class="actions" id="npcActionList"></div>');
  $("npcActionList").append(button("Новое взаимодействие", () => editNpcAction(id)));
  for (const action of npc.participation?.actions || [])
    $("npcActionList").append(button(action.name, () => editNpcAction(id, action.id)));
}
function npcTargetOptions(kind) {
  const e = S.engine;
  const rows = {
    gather: e.professions, scout: e.professions, mentor: e.professions,
    errand: S.contracts, quest: S.contracts, trade: e.items,
    recipe: e.recipes, craft: e.recipes,
  }[kind] || [];
  return pairs(rows.filter((x) => !x.archived && companionTarget(S, { kind, target: x.id })));
}
function editNpcAction(id, actionId) {
  const npc = S.portal.people.find((x) => x.id === id);
  if (player || !npc) return;
  const p = npc.participation || {};
  const old = p.actions?.find((x) => x.id === actionId);
  const kind = old?.kind || "text";
  const states = Object.entries(companionStates).filter(([state]) => state !== "dead");
  function targetPicker(type, target) {
    return pick("Связанная запись", "npcTarget", [["","Текстовое обращение"], ...npcTargetOptions(type)], target);
  }
  form(old?.name || "Новое взаимодействие",
    input("Название", "npcActionName", "text", old?.name || "", "required") +
    area("Описание", "npcActionDesc", old?.description || "") +
    pick("Вид взаимодействия", "npcKind", Object.entries(companionKinds), kind) +
    '<div id="npcTargetBox">' + targetPicker(kind, old?.target || "") + '</div>' +
    pick("Фаза", "npcPhase", [["","Любая"], ...Object.entries(phases)], old?.phase || "") +
    pick("Узел компании", "npcActionPlace", [["","Любой"], ...pairs(S.nodes)], old?.location || "") +
    '<fieldset><legend>Допустимые состояния спутника</legend>' + states.map(([state, label]) =>
      check(label, "npcAvailable-" + state, (old?.states || ["traveling", "settled"]).includes(state))).join("") + '</fieldset>' +
    '<div class="cols">' + input("Дополнительная стоимость, зм", "npcGold", "number", old?.gold ?? 0, 'min="0" step="0.01" required') +
    input("Дополнительное время, минут", "npcMinutes", "number", Math.round((old?.hours || 0) * 60), 'min="0" step="1" required') + '</div>' +
    '<details><summary>Условия игрока</summary>' +
      '<p class="muted">Поддерживаются обычные условия заданий, например {"level":3}.</p>' +
      area("Условия JSON", "npcConditions", JSON.stringify(old?.conditions || {})) + '</details>' +
    (old ? visualAction("Убрать взаимодействие", "removeNpcAction(" + jsid(id) + "," + jsid(old.id) + ")", "danger") : ""),
    async () => {
      const row = { id: old?.id || crypto.randomUUID(), name: val("npcActionName").trim(),
        description: val("npcActionDesc"), kind: val("npcKind"), target: val("npcTarget"), phase: val("npcPhase"),
        location: val("npcActionPlace"), gold: num("npcGold"), hours: roundedHours(num("npcMinutes") / 60),
        states: states.filter(([state]) => $("npcAvailable-" + state).checked).map(([state]) => state),
        conditions: JSON.parse(val("npcConditions") || "{}"),
      };
      await execute("npcParticipation", { id, value: { ...p, actions: [...(p.actions || []).filter((x) => x.id !== row.id), row] } });
      editNpcActions(id);
    });
  $("npcKind").onchange = () => { $("npcTargetBox").innerHTML = targetPicker(val("npcKind"), ""); };
}
async function removeNpcAction(id, actionId) {
  if (player || !confirm("Убрать это взаимодействие? История обращений сохранится.")) return;
  const p = S.portal.people.find((x) => x.id === id)?.participation;
  if (!p) return;
  await execute("npcParticipation", { id, value: { ...p, actions: p.actions.filter((x) => x.id !== actionId) } });
  editNpcActions(id);
}
