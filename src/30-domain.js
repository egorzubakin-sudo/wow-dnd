function meetsConditions(s, hero, c = {}) {
  const h = profile(s, hero),
    m = heroOf(s, hero),
    e = s.engine;
  if (
    (c.race && c.race !== (h.race || m.race)) ||
    (c.class && c.class !== (h.class || m.class)) ||
    (c.level && c.level > h.level)
  )
    return false;
  if (
    (c.skill && !h.skills[c.skill]) ||
    (c.recipe && !h.recipes.includes(c.recipe)) ||
    (c.profession && !eligibleProfession(s, h, c.profession))
  )
    return false;
  if (
    c.item &&
    !s.company.inventory.some(
      (i) => i.owner === "member:" + hero && i.item_id === c.item && i.qty > 0,
    )
  )
    return false;
  if (
    c.faction &&
    (s.factions.find((f) => f.id === c.faction)?.repPoints ?? -Infinity) <
      (c.rep || 0)
  )
    return false;
  if (
    (c.npc && !h.contacts?.includes(c.npc)) ||
    (c.achievement &&
      !s.portal.achievements.some(
        (a) =>
          a.id === c.achievement &&
          a.grants?.some((g) => g.recipient === "hero:" + hero),
      ))
  )
    return false;
  if (
    c.quest &&
    !e.completions.some((r) => r.hero === hero && r.quest === c.quest) &&
    !s.contracts.some((r) => r.id === c.quest && r.status === "done")
  )
    return false;
  return true;
}
function adventure(s) {
  const e = economy(s);
  for (const k of ["solutions", "rewards", "completions", "sessions"])
    e[k] ??= [];
  return e;
}
function questAvailable(s, q, hero) {
  const e = adventure(s),
    t = currentStay(s),
    c = q.conditions || {};
  if (
    !t ||
    q.archived ||
    q.hidden ||
    (q.region_id && q.region_id !== t.region) ||
    (q.location && q.location !== t.location)
  )
    return false;
  if (!meetsConditions(s, hero, c)) return false;
  return !e.completions.some(
    (r) =>
      r.hero === hero &&
      r.quest === q.id &&
      (q.repeat === "stay"
        ? r.stay === t.id
        : q.repeat === "day"
          ? r.day === s.company.day
          : q.period
            ? s.company.day - r.day < q.period
            : true),
  );
}
function grant(s, r, hero) {
  const h = hero ? profile(s, hero) : null;
  if (r.type === "item") {
    deposit(
      s,
      r.item_id,
      hero ? "member:" + hero : "",
      integer(r.quantity, 1),
      { hidden: !!r.secret },
    );
    return;
  }
  if (r.type === "gold") {
    integer(r.amount, 0);
    if (h) h.wallet += r.amount;
    else s.company.gold += r.amount;
    return;
  }
  if (r.type === "rep") {
    const f = byId(s.factions, r.faction);
    integer(r.amount, -100000);
    f.repPoints = Math.max(-6000, Math.min(42999, f.repPoints + r.amount));
    return;
  }
  if (r.type === "contact") {
    byId(s.portal.people, r.npc);
    requireThat(h, "Нужен герой");
    h.contacts ??= [];
    if (!h.contacts.includes(r.npc)) h.contacts.push(r.npc);
    return;
  }
  if (r.type === "discover") {
    byId(s.nodes, r.node).visibility = "known";
    return;
  }
  if (r.type === "achievement") {
    const a = byId(s.portal.achievements, r.achievement);
    a.grants ??= [];
    const recipient = hero ? "hero:" + hero : "company";
    if (!a.grants.some((g) => g.recipient === recipient)) {
      const date = "День " + s.company.day;
      a.grants.push({
        recipient,
        date,
        name: hero ? heroOf(s, hero).name : s.company.name,
        recipientHidden: hero ? !!heroOf(s, hero).hidden : false,
      });
      if (!hero) {
        a.earned = true;
        a.earnedDate = date;
      }
    }
    return;
  }
  requireThat(false, "Неизвестная награда");
}
register("errand", "master", (s, p) => {
  adventure(s);
  requireThat(p.title && p.options.length, "Нужны название и варианты");
  const id = p.id || crypto.randomUUID();
  const q = {
    id,
    title: p.title,
    type: "local",
    desc: p.desc,
    region_id: p.region_id,
    hours: integer(p.hours, 1),
    repeat: p.repeat,
    period: p.period || 0,
    conditions: p.conditions || {},
    status: "available",
    rewards: [],
  };
  const prior = s.contracts.find((x) => x.id === id);
  requireThat(!prior || prior.type === "local", "ID занят контрактом");
  if (prior) Object.assign(prior, q);
  else s.contracts.push(q);
  for (const o of p.options) {
    integer(o.dc, 0, 100);
    requireThat(o.name && Object.hasOwn(skills, o.skill), "Проверьте вариант");
    const existing =
      o.id &&
      s.engine.solutions.find((x) => x.id === o.id && x.quest_id === id);
    const key = existing?.id || crypto.randomUUID();
    if (existing) Object.assign(existing, o);
    else s.engine.solutions.push({ ...o, id: key, quest_id: id });
    const reward = s.engine.rewards.find(
      (r) => r.solution_id === key && r.when === "success" && r.type === "gold",
    );
    if (reward) reward.amount = integer(o.gold);
    else if (o.gold)
      s.engine.rewards.push({
        id: crypto.randomUUID(),
        solution_id: key,
        type: "gold",
        amount: integer(o.gold),
        when: "success",
      });
  }
});
register("quest", "hero", (s, p) => {
  const e = adventure(s),
    q = byId(s.contracts, p.quest),
    o = byId(e.solutions, p.option);
  requireThat(
    q.type === "local" && q.id === o.quest_id && questAvailable(s, q, p.hero),
    "Поручение недоступно",
  );
  spend(s, p.hero, q.hours || 1, q.title);
  const r = ability(profile(s, p.hero), {
    skill: o.skill,
    tool: o.tool,
    stat: o.stat,
    dc: o.dc,
    mode: "normal",
  });
  e.rolls.unshift({ ...r, hero: p.hero, label: q.title });
  for (const rw of e.rewards.filter(
    (x) =>
      x.solution_id === o.id && x.when === (r.success ? "success" : "failure"),
  ))
    grant(s, rw, p.hero);
  const result = o.encounter
    ? "Требуется решение мастера"
    : r.success
      ? o.success
      : o.failure;
  e.completions.push({
    hero: p.hero,
    quest: q.id,
    option: o.id,
    stay: currentStay(s).id,
    day: s.company.day,
    result,
  });
  s.journal.unshift({
    id: crypto.randomUUID(),
    kind: "contract",
    title: q.title,
    text: result || "",
    day: s.company.day,
    year: s.company.year,
  });
});
register("session", "master", (s, p) => {
  const e = adventure(s);
  requireThat(
    typeof p.id === "string" &&
      p.id &&
      p.summary &&
      !e.sessions.some((x) => x.id === p.id),
    "Нужны уникальный ID и краткое содержание",
  );
  for (const r of p.effects) {
    if (r.type === "quest") {
      const q = byId(s.contracts, r.quest);
      settleContract(s, q, q.rewards || [], false);
    } else grant(s, r, r.hero || "");
  }
  e.sessions.push(structuredClone(p));
  s.journal.unshift({
    id: crypto.randomUUID(),
    kind: "note",
    title: p.summary,
    text: p.log,
    hidden: !!p.hidden,
    day: s.company.day,
    year: s.company.year,
  });
});
