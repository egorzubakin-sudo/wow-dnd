{
  const s = migrate({
    company: {
      day: 1,
      gold: 5,
      members: [{ id: "h", name: "Мастер" }],
      inventory: [],
      talents: {},
      staff: [{ id: "npc" }],
    },
    contracts: [],
    journal: [],
    nodes: [{ id: "n" }],
    factions: [],
    routes: [],
    portal: {},
  });
  const run = (name, p, token) =>
    Object.assign(s, applyCommand(s, gm, name, p, token));
  run("demo", {}, "demo");
  run(
    "stay",
    {
      location: "n",
      region: "durotar",
      days: 3,
      hours: 8,
      services: ["Оружейная"],
      early: true,
    },
    "stay",
  );
  const h = profile(s, "h");
  h.tools = ["Инструменты каменщика"];
  h.recipes = ["make-bar"];
  const original = JSON.stringify(s);
  assert.throws(() =>
    applyCommand(
      s,
      gm,
      "project",
      { hero: "h", recipe: "make-bar", qty: 2 },
      "bad",
    ),
  );
  assert.equal(JSON.stringify(s), original);
  deposit(s, "ore", "member:h", 2);
  run("project", { hero: "h", recipe: "make-bar", qty: 2 }, "craft");
  run(
    "work",
    { hero: "h", project: s.engine.projects[0].id, hours: 1 },
    "work",
  );
  run("closeStay", {}, "close");
  assert.equal(s.company.day, 4);
  assert.equal(
    s.portal.achievements.find((a) => a.scope === "company").grants[0]
      .recipient,
    "company",
  );
  run(
    "stay",
    { location: "n", days: 1, hours: 8, services: ["Оружейная"], early: true },
    "stay2",
  );
  run(
    "staffWork",
    { staff: "npc", project: s.engine.projects[0].id, hours: 3 },
    "staff",
  );
  assert.equal(s.engine.projects[0].status, "done");
  assert.equal(s.company.inventory.find((x) => x.item_id === "bar").qty, 2);
  run("gold", { hero: "h", amount: 3 }, "wallet");
  assert.equal(profile(s, "h").wallet, 3);
  assert.throws(() =>
    applyCommand(s, gm, "gold", { hero: "h", amount: 3 }, "excess"),
  );
  run("schedule", { hero: "h", activity: "Разведка", hours: 2 }, "plan");
  run(
    "resolvePlan",
    { hero: "h", id: currentStay(s).plans[0].id, cancel: false },
    "resolve",
  );
  assert.equal(remaining(s, "h"), 6);
  const other = { role: "player", nick: "p", heroes: ["other"] };
  assert.throws(() =>
    applyCommand(s, other, "rest", { hero: "h", hours: 1 }, "steal"),
  );
}
