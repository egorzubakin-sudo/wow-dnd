const companionStates = {
  traveling: "Путешествует с компанией",
  away: "Временно отсутствует",
  settled: "Оставлен в поселении",
  left: "Покинул компанию",
  dead: "Погиб",
};
const companionKinds = {
  gather: "Занятие стоянки", errand: "Местное поручение", quest: "Личное задание",
  trade: "Торговая услуга", recipe: "Изучение рецепта", craft: "Ремесленная услуга",
  mentor: "Наставничество", scout: "Разведка", info: "Сбор сведений", text: "Разговор",
};

function companionTarget(s, action) {
  const e = s.engine;
  const rows = {
    gather: e.professions, scout: e.professions, mentor: e.professions,
    errand: s.contracts, quest: s.contracts, trade: e.items,
    recipe: e.recipes, craft: e.recipes,
  }[action.kind];
  return rows?.find((row) => row.id === action.target &&
    (action.kind !== "errand" || row.type === "local") &&
    (!["gather", "scout"].includes(action.kind) || row.kind === "gathering"));
}

function companionMechanic(s, action) {
  const target = companionTarget(s, action);
  if (!target) return null;
  if (["gather", "scout"].includes(action.kind)) return ["gather", "profession"];
  if (["errand", "quest"].includes(action.kind)) {
    if (target.type === "local") return ["quest", "quest"];
    if (target.type === "delivery") return ["deliverGoods", "id"];
  }
  if (action.kind === "trade") return ["tradeDeal", "item"];
  if (action.kind === "craft") return ["craft", "recipe"];
  if (action.kind === "mentor") return ["train", "profession"];
  return null;
}

function validateParticipation(value) {
  requireThat(value && typeof value === "object" && !Array.isArray(value), "Проверьте состав компании");
  const companion = value.companion, specialist = value.specialist;
  if (companion) {
    requireThat(Object.hasOwn(companionStates, companion.state), "Неизвестное состояние спутника");
    if (companion.joined) {
      integer(companion.joined.day, 1);
      integer(companion.joined.year, 1);
    }
  }
  if (specialist?.legacyStaff) requireThat(validId(specialist.legacyStaff), "Неверная запись специалиста");
  const ids = new Set();
  const actions = value.actions ?? [];
  requireThat(Array.isArray(actions) && actions.length <= 100, "Некорректный список взаимодействий");
  for (const a of actions) {
    requireThat(validId(a.id) && !ids.has(a.id) && typeof a.name === "string" && a.name.trim() &&
      Object.hasOwn(companionKinds, a.kind), "Некорректное взаимодействие");
    ids.add(a.id);
    requireThat(a.states?.length && Array.isArray(a.states) &&
      a.states.every((state) => Object.hasOwn(companionStates, state) && state !== "dead"),
    "Выберите допустимые состояния спутника");
    requireThat(!a.phase || Object.hasOwn(phases, a.phase), "Неизвестная фаза");
    tradeMoney(a.gold);
    if (a.hours) validateHours(a.hours);
    else requireThat(a.hours === 0, "Некорректное время");
    requireThat(!a.conditions || (typeof a.conditions === "object" && !Array.isArray(a.conditions)), "Некорректные условия");
  }
}

function companySpecialists(s) {
  const linked = (s.portal?.people || []).filter((npc) => npc.participation?.specialist);
  const staff = s.company.staff || [];
  const replaced = new Set(linked.map((npc) => npc.participation.specialist.legacyStaff).filter(Boolean));
  return [...staff.filter((row) => !replaced.has(row.id)), ...linked.filter((npc) => !npc.archived).map((npc) => ({
    id: npc.participation.specialist.legacyStaff || npc.id,
    npcId: npc.id, name: npc.title, role: npc.participation.specialist.role,
    hidden: npc.hidden, image: npc.image,
  }))];
}

function specialistAvailable(s, staff) {
  if (!staff.npcId) return true;
  const npc = s.portal.people.find((row) => row.id === staff.npcId);
  const companion = npc.participation.companion;
  if (!companion || companion.state === "traveling") return true;
  const place = companion.location || npc.location;
  return companion.state === "settled" && !!place && !s.journey && place === currentStay(s)?.location;
}

function companionActionState(s, actor, hero, ref) {
  const npc = s.portal?.people?.find((row) => row.id === ref.npc);
  const participation = npc?.participation;
  const companion = participation?.companion;
  const state = companion?.state || (participation?.specialist ? "traveling" : "");
  const action = participation?.actions?.find((row) => row.id === ref.action);
  const place = currentStay(s)?.location || s.company.location;
  const phase = s.journey ? "travel" : s.engine.phase;
  const denied = (reason) => ({ reason, npc, action });
  if (!npc || !action || !state || npc.archived || (npc.hidden && actor.role !== "master"))
    return denied("Взаимодействие недоступно");
  if (!action.states.includes(state)) return denied(companionStates[state] || "Спутник недоступен");
  if (state === "settled" && (s.journey || !place || (companion.location || npc.location) !== place))
    return denied("Спутник в другом поселении");
  if (action.location && (s.journey || action.location !== place))
    return denied("Компания ещё не в нужном месте");
  if (action.phase && action.phase !== phase) return denied("Сейчас другая фаза кампании");
  if (!hero || !s.company.members.some((row) => row.id === hero) || !owned(actor, hero))
    return denied("Выберите своего героя");
  adventure(s);
  if (action.conditions && !meetsConditions(s, hero, action.conditions))
    return denied("Условия взаимодействия не выполнены");
  if (action.hours && (phase !== "stay" || remaining(s, hero) < action.hours))
    return denied("Недостаточно времени стоянки");
  if (profile(s, hero).wallet < action.gold) return denied("Недостаточно золота");
  const target = companionTarget(s, action);
  if (action.target && (!target || target.archived || (target.hidden && actor.role !== "master")))
    return denied("Связанная запись недоступна");
  return { npc, action, target, mechanic: companionMechanic(s, action) };
}

function chargeCompanionAction(s, hero, action) {
  if (action.hours) spend(s, hero, action.hours, action.name);
  if (action.gold) profile(s, hero).wallet = tradeMoney(profile(s, hero).wallet - action.gold);
}

function applyCompanionContext(s, actor, name, payload) {
  const { reason, action, mechanic } = companionActionState(s, actor, payload.hero, payload.companion);
  requireThat(!reason, reason);
  requireThat(mechanic?.[0] === name && payload[mechanic[1]] === action.target,
    "Действие спутника не соответствует операции");
  chargeCompanionAction(s, payload.hero, action);
}

register("npcParticipation", "master", (s, p) => {
  const npc = byId(s.portal.people, p.id);
  inspectJSON(p.value);
  validateParticipation(p.value);
  const config = p.value;
  for (const id of [config.companion?.location, ...(config.actions || []).map((a) => a.location)].filter(Boolean))
    byId(s.nodes, id);
  for (const a of config.actions || []) if (a.target)
    requireThat(companionTarget(s, a), "Связанная запись не найдена");
  if (config.specialist?.legacyStaff) {
    byId(s.company.staff, config.specialist.legacyStaff);
    requireThat(!s.portal.people.some((row) => row.id !== npc.id && row.participation?.specialist?.legacyStaff === config.specialist.legacyStaff),
      "Запись специалиста уже связана с другим персонажем");
  } else if (config.specialist) {
    requireThat(!(s.company.staff || []).some((row) => row.id === npc.id),
      "Свяжите NPC с существующей записью специалиста");
  }
  npc.participation = config;
});

register("companionRequest", "hero", (s, p, actor) => {
  const { npc, action, reason, mechanic } = companionActionState(s, actor, p.hero, p.ref);
  requireThat(!reason && !mechanic, reason || "Используйте связанное игровое действие");
  requireThat(typeof p.message === "string" && p.message.trim() && p.message.length <= 4000, "Опишите обращение к спутнику");
  const rows = (s.engine.companionRequests ??= []);
  requireThat(!rows.some((r) => r.status === "pending" && r.hero === p.hero && r.npc === npc.id && r.action === action.id),
    "Это обращение уже ожидает решения мастера");
  rows.unshift({
    id: crypto.randomUUID(), npc: npc.id, action: action.id, hero: p.hero, status: "pending",
    title: action.name, message: p.message.trim(), day: s.company.day, year: s.company.year,
    gold: action.gold, hours: action.hours,
  });
});

register("resolveCompanionRequest", "master", (s, p, actor) => {
  const r = byId(s.engine.companionRequests || [], p.id);
  requireThat(r.status === "pending", "Мастер уже рассмотрел обращение");
  requireThat(typeof p.result === "string" && p.result.trim() && p.result.length <= 4000, "Запишите решение мастера");
  if (p.approve === true) {
    const { reason, action, mechanic } = companionActionState(s, actor, r.hero, { npc: r.npc, action: r.action });
    requireThat(!reason && !mechanic, reason || "Взаимодействие изменилось");
    requireThat(action.gold === r.gold && action.hours === r.hours, "Условия обращения изменились");
    chargeCompanionAction(s, r.hero, action);
  }
  Object.assign(r, { status: p.approve === true ? "approved" : "declined", result: p.result.trim() });
});
