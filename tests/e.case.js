{
  const csv = csvWrite([{ name: 'Медь; "жила"\nДуротар' }], ["name"]);
  assert.equal(csvRead(csv)[0].name, 'Медь; "жила"\nДуротар');
  assert.throws(() => csvRead("id;id\n1;2"));
  const s = migrate({
    company: { inventory: [], members: [] },
    nodes: [],
    routes: [],
    factions: [],
    contracts: [],
    portal: {},
  });
  adventure(s);
  const ok = planImport(s, demoPack, "new");
  assert.equal(ok.count.errors, 0, ok.issues.join());
  assert.equal(s.engine.regions.length, 0);
  const err = planImport(ok.next, { items: [] }, "replace");
  assert(err.count.errors > 0);
  assert.throws(() =>
    rowFrom("items", {
      id: "bad",
      name: "A",
      category: "?",
      quality: "rare",
      value_gp: 0,
    }),
  );
}
