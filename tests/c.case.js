{
  const s = migrate({
    company: {
      members: [{ id: "h" }, { id: "i" }],
      inventory: [],
      day: 1,
      talents: {},
    },
    nodes: [{ id: "n" }],
    contracts: [],
  });
  economy(s);
  commands.get("demo").run(s, {});
  commands
    .get("stay")
    .run(s, {
      location: "n",
      region: "durotar",
      days: 3,
      hours: 8,
      early: true,
      services: ["Оружейная"],
    });
  const h = profile(s, "h");
  h.tools = ["Инструменты каменщика"];
  h.recipes = ["make-bar"];
  gather(s, { hero: "h", profession: "mining" }, (sides) =>
    Math.min(10, sides),
  );
  assert(s.company.inventory.some((x) => x.item_id === "ore"));
  assert.equal(remaining(s, "h"), 23);
  commands.get("project").run(s, { hero: "h", recipe: "make-bar", qty: 1 });
  const project = s.engine.projects[0].id;
  commands.get("work").run(s, { hero: "h", project, hours: 2 });
  assert.throws(() =>
    commands.get("work").run(s, { hero: "h", project, hours: 2 }),
  );
  const bar = s.company.inventory.find((x) => x.item_id === "bar");
  commands
    .get("transfer")
    .run(s, { hero: "h", stack: bar.id, to: "i", qty: 1 });
  assert.equal(
    s.company.inventory.find((x) => x.item_id === "bar").owner,
    "member:i",
  );
}
{
  const source = migrate({ company: { members: [{ id: "hero", name: "Кузнец" }], inventory: [], day: 1 } });
  const e = economy(source);
  e.items.push({ id: "ore", name: "Руда" }, { id: "sword", name: "Тайный меч", stackable: false, hidden: true });
  const master = { role: "master", nick: "gm" }, player = { role: "player", heroes: ["hero"] };
  const args = { item: "ore", hero: "", qty: 2 };
  const grant = (state, payload, key, actor = master) => applyCommand(state, actor, "grantCatalogItem", payload, key);
  const bank = grant(source, args, "bank");
  assert.equal(bank.company.inventory[0].qty, 2);
  assert.equal(bank.company.inventory[0].owner, "");
  assert.equal(source.company.inventory.length, 0);
  assert.throws(() => grant(bank, args, "bank"), /уже применена/);
  assert.throws(() => grant(bank, { ...args, hero: "hero" }, "player", player), /Недостаточно прав/);
  assert.throws(() => grant(bank, { ...args, hero: "unknown" }, "wrong-hero"), /Герой не найден/);
  assert.throws(() => grant(bank, { ...args, qty: 0 }, "wrong-qty"), /вне диапазона/);
  assert.throws(() => grant(bank, { ...args, item: "unknown" }, "wrong-item"), /Не найдена запись/);
  assert.equal(grant(bank, args, "restock").company.inventory[0].qty, 4);
  const personal = grant(bank, { item: "sword", hero: "hero", qty: 2 }, "swords");
  const swords = personal.company.inventory.filter((stack) => stack.item_id === "sword");
  assert.equal(swords.length, 2);
  assert(swords.every((stack) => stack.hidden && stack.owner === "member:hero" && stack.qty === 1));
  assert.equal(personal.journal[0].hidden, true);
}
