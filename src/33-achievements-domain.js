function invalidUniqueGrants(achievement) {
  const grants = achievement.grants || [];
  return !Array.isArray(grants) || grants.length > 1 || grants.some((g) => !g?.recipient?.startsWith?.("hero:"));
}

function achievementGrantAllowed(achievement, recipient) {
  const grants = achievement.grants || [];
  return !achievement.archived &&
    !grants.some((g) => g.recipient === recipient) &&
    (!achievement.unique || (recipient.startsWith("hero:") && !grants.length && !achievement.earned));
}
