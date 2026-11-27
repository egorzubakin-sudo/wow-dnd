{
  const master = { role: "master", nick: "gm" };
  const actor = { role: "player", nick: "player", heroes: ["h"] };
  let s = migrate({ version: 1, company: {
    members: [{ id: "h" }, { id: "other" }], gold: 0, day: 5, year: 27,
    inventory: [], staff: [{ id: "old-staff" }], talents: {},
  }, portal: { people: [{ id: "npc", title: "Проводник" }], achievements: [] },
  contracts: [], factions: [], nodes: [{ id: "village" }, { id: "port" }], journal: [] });
  adventure(s);
  profile(s, "h").wallet = 8;
  profile(s, "h").tools = ["Инструменты каменщика"];
  s.engine.regions.push({ id: "valley", dc: 1 });
  s.engine.items.push({ id: "iron", name: "Руда", category: "Материалы", quality: "common" });
  s.engine.loot.push({ id: "iron-vein", region_id: "valley", profession_id: "mining", item_id: "iron", weight: 1,
    min_quantity: 1, max_quantity: 1, min_margin: -20, hours: 1 });
  const actions = [
    { id: "talk", kind: "text", name: "Поговорить", states: ["traveling"], gold: 2, hours: 0.5 },
    { id: "ore", kind: "gather", name: "Показать залежи", states: ["traveling", "settled"],
      target: "mining", gold: 1, hours: 0.5, phase: "stay" },
  ];
  const config = { companion: { state: "traveling", role: "Проводник", joined: { day: 5, year: 27 } },
    specialist: { role: "Снабженец", legacyStaff: "old-staff" }, actions };
  let seq = 0;
  const run = (who, cmd, p, key = "companion-" + ++seq) => { s = applyCommand(s, who, cmd, p, key); };
  run(master, "stay", { location: "village", region: "valley", days: 1, hours: 8 });
  assert.throws(() => run(actor, "npcParticipation", { id: "npc", value: config }), /прав/);
  run(master, "npcParticipation", { id: "npc", value: config });
  assert.equal(s.portal.people.length, 1);
  assert.equal(companySpecialists(s).length, 1);
  assert.equal(companySpecialists(s)[0].npcId, "npc");
  assert.equal(companySpecialists(s)[0].id, "old-staff");
  const ore = { npc: "npc", action: "ore" }, talk = { npc: "npc", action: "talk" };
  assert.throws(() => run(actor, "rest", { hero: "h", hours: 1, companion: ore }), /не соответствует/);
  assert.equal(profile(s, "h").wallet, 8);
  run(actor, "gather", { hero: "h", profession: "mining", companion: ore }, "gather-once");
  assert.equal(profile(s, "h").wallet, 7);
  assert.equal(remaining(s, "h"), 6.5);
  assert.equal(s.engine.receipts.at(-1).companion.npc, "npc");
  assert.equal(s.company.inventory[0].qty, 1);
  assert.throws(() => run(actor, "gather", { hero: "h", profession: "mining", companion: ore }, "gather-once"), /уже применена/);
  s.engine.loot[0].stock = 0;
  assert.throws(() => run(actor, "gather", { hero: "h", profession: "mining", companion: ore }), /ресурса/);
  assert.equal(profile(s, "h").wallet, 7);
  assert.equal(remaining(s, "h"), 6.5);
  delete s.engine.loot[0].stock;
  run(actor, "companionRequest", { hero: "h", ref: talk, message: "Расспросить о шахте" });
  assert.equal(profile(s, "h").wallet, 7);
  assert.throws(() => run(actor, "companionRequest", { hero: "h", ref: talk, message: "Повтор" }), /ожидает/);
  const id = s.engine.companionRequests[0].id;
  assert.throws(() => run(actor, "resolveCompanionRequest", { id, approve: true, result: "Готово" }), /прав/);
  run(master, "resolveCompanionRequest", { id, approve: true, result: "Дорога пролегает через лес" });
  assert.equal(profile(s, "h").wallet, 5);
  assert.equal(remaining(s, "h"), 6);
  assert.throws(() => run(master, "resolveCompanionRequest", { id, approve: true, result: "Повтор" }), /уже рассмотрел/);
  const settled = { ...config, companion: { state: "settled", location: "port" } };
  run(master, "npcParticipation", { id: "npc", value: settled });
  assert.throws(() => run(actor, "gather", { hero: "h", profession: "mining", companion: ore }), /другом поселении/);
  assert.equal(specialistAvailable(s, companySpecialists(s)[0]), false);
  run(master, "npcParticipation", { id: "npc", value: { ...config, companion: { state: "left" } } });
  assert.throws(() => run(actor, "gather", { hero: "h", profession: "mining", companion: ore }), /Покинул компанию/);
  run(master, "npcParticipation", { id: "npc", value: { ...config, companion: null } });
  assert.equal(specialistAvailable(s, companySpecialists(s)[0]), true);
  validateBackup(JSON.parse(JSON.stringify(s)));
}
