{
  const achievement = { id: "first", unique: true, grants: [] };
  const campaign = { company: { name: "Компания", day: 1, members: [] }, portal: { achievements: [achievement] } };
  assert(!achievementGrantAllowed(achievement, "company"));
  assert(!achievementGrantAllowed(achievement, "npc:n1"));
  assert(achievementGrantAllowed(achievement, "hero:h1"));
  achievement.grants.push({ recipient: "hero:h1" });
  grant(campaign, { type: "achievement", achievement: "first" }, "");
  assert(!achievementGrantAllowed(achievement, "hero:h2"));
  assert(!invalidUniqueGrants(achievement));
  assert.equal(achievement.grants.length, 1);
  achievement.unique = false;
  grant(campaign, { type: "achievement", achievement: "first" }, "");
  assert.equal(achievement.grants.length, 2);
  assert(invalidUniqueGrants(achievement));
  assert.throws(() => validateBackup({ ...campaign, version: 1,
    portal: { achievements: [{ ...achievement, unique: true }] },
  }), /только одному герою/);
}
