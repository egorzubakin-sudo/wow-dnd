{
  const s = migrate({
    company: { members: [{ id: "h" }], inventory: [], day: 1, talents: {} },
    nodes: [{ id: "n" }],
    contracts: [],
    journal: [],
  });
  commands.get("demo").run(s, {});
  commands.get("stay").run(s, { location: "n", days: 3, hours: 8 });
  const q = { hero: "h", quest: "task-0", option: "option-0" };
  commands.get("quest").run(s, q);
  assert.throws(() => commands.get("quest").run(s, q));
  assert.equal(remaining(s, "h"), 23);
  const session = {
    id: "campaign-1",
    summary: "Возвращение",
    effects: [{ type: "gold", hero: "h", amount: 12 }],
  };
  commands.get("session").run(s, session);
  assert.throws(() => commands.get("session").run(s, session));
  assert(profile(s, "h").wallet >= 12);
}
