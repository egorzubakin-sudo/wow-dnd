{
  const start = migrate({ company: { day: 1, year: 27 }, settings: {},
    nodes: [{ id: "a", x: .2, y: .4 }], factions: [{ id: "guild", name: "Гильдия", charter: "Старая грамота" }],
  });
  const master = { role: "master", nick: "gm" };
  const observer = { role: "observer", nick: "guest" };
  const move = { id: "a", x: .7, y: .8 };
  assert.throws(() => applyCommand(start, observer, "mapMove", move, "move"), /прав/);
  assert.throws(() => applyCommand(start, master, "mapMove", { ...move, x: 3 }, "move"), /координаты/);
  assert.throws(() => applyCommand({ ...start, settings: { mapLocked: true } }, master, "mapMove", move, "move"), /заперто/);
  const next = applyCommand(start, master, "mapMove", move, "move");
  assert.equal(start.nodes[0].x, .2);
  assert.equal(next.nodes[0].x, .7);
  assert.throws(() => applyCommand(next, master, "mapMove", move, "move"), /уже применена/);
  const charter = { faction: "guild", text: "Право прохода\nЛьготная цена" };
  const awarded = applyCommand(next, master, "issueCharter", charter, "award");
  assert.equal(awarded.factions[0].charter, "Старая грамота\nПраво прохода\nЛьготная цена");
  assert.throws(() => applyCommand(awarded, master, "issueCharter", charter, "other"), /уже выдана/);
  assert.equal(awarded.journal[0].kind, "faction");
  const contract = { id: "survey", title: "Разведка", status: "active" };
  const finished = applyCommand({ ...awarded, contracts: [contract] }, master, "finishContract", {
    id: contract.id, rows: [{ type: "charter", faction: "guild", text: "Пропуск в порт" }],
  }, "contract");
  assert.equal(finished.factions[0].charter, awarded.factions[0].charter + "\nПропуск в порт");
  assert.equal(finished.contracts[0].rewardReceipt.rewards[0].type, "charter");
}
