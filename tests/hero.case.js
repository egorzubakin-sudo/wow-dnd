{
  const source = migrate({
    company: { day: 1, members: [{ id: "existing" }], inventory: [] },
  });
  const player = { role: "player", nick: "p", heroes: ["existing"] };
  const data = structuredClone(profile(source, "existing"));
  data.professions = ["mining", "smithing", "alchemy"];
  assert.throws(
    () =>
      applyCommand(
        source,
        player,
        "profile",
        { hero: "existing", value: data },
        "over",
      ),
    /двух/,
  );
  source.engine.profiles.existing.professions = [...data.professions];
  const legacy = applyCommand(
    source,
    player,
    "profile",
    { hero: "existing", value: data },
    "legacy",
  );
  assert.equal(profile(legacy, "existing").professions.length, 3);
  data.professions = ["mining", "smithing"];
  data.tools = ["Инструменты каменщика"];
  const next = applyCommand(
    legacy,
    player,
    "profile",
    { hero: "existing", value: data },
    "limit",
  );
  assert.equal(
    eligibleProfession(next, profile(next, "existing"), "mining"),
    true,
  );
  assert.equal(
    eligibleProfession(next, profile(next, "existing"), "fishing"),
    false,
  );
  assert.throws(
    () =>
      applyCommand(
        next,
        player,
        "profile",
        { hero: "other", value: data },
        "unauthorized",
      ),
    /прав/,
  );
  assert.throws(
    () =>
      applyCommand(
        next,
        player,
        "profile",
        { hero: "existing", value: data, create: true },
        "duplicate",
      ),
    /мастер/,
  );
}
