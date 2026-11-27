// Validate incoming saves before the legacy normalizer has a chance to repair them.
function validateBackup(raw) {
  inspectJSON(raw);
  requireThat(
    raw && raw.version === 1 && raw.company,
    "Неизвестный формат резервной копии",
  );
  for (const k of ["accounts", "password", "hash", "salt", "secrets"])
    requireThat(
      !Object.hasOwn(raw, k),
      "Файл содержит поля локальной авторизации",
    );
  function unique(list, label) {
    if (list == null) return;
    requireThat(Array.isArray(list), "Ожидался список: " + label);
    const seen = new Set();
    for (const x of list) {
      requireThat(
        validId(x?.id) && !seen.has(x.id),
        "Некорректный или повторный ID: " + label,
      );
      seen.add(x.id);
    }
  }
  for (const k of ["nodes", "routes", "factions", "contracts"])
    unique(raw[k], k);
  for (const k of ["members", "staff", "inventory"]) unique(raw.company[k], k);
  requireThat(
    Number.isFinite(Number(raw.company.gold ?? 0)) &&
      Number(raw.company.gold ?? 0) >= 0,
    "Отрицательная казна",
  );
  for (const x of raw.company.inventory || [])
    if (x.qty != null) integer(Number(x.qty));
  for (const c of raw.contracts || [])
    if (c.status)
      requireThat(
        [
          "available",
          "active",
          "done",
          "failed",
          "locked",
          "cancelled",
          "paused",
          "draft",
        ].includes(c.status) || /^[a-z_-]+$/.test(c.status),
        "Недопустимый статус задания",
      );
  for (const npc of raw.portal?.people || [])
    if (npc.participation) validateParticipation(npc.participation);
  if (!raw.engine) return;
  const e = raw.engine;
  requireThat(
    e.schemaVersion === 1 && Array.isArray(e.receipts),
    "Неизвестная схема кампании",
  );
  for (const k of [
    "items",
    "regions",
    "professions",
    "recipes",
    "ingredients",
    "loot",
    "projects",
    "stays",
    "solutions",
    "rewards",
    "sessions",
    "markets",
    "facilities",
    "craftProperties",
    "campUpgrades",
    "localServices",
    "contentPackages",
    "companionRequests",
  ])
    unique(e[k], k);
  for (const h of Object.values(e.profiles || {})) {
    integer(h.level, 1, 20);
    requireThat(
      typeof h.wallet === "number" &&
        Number.isFinite(h.wallet) &&
        h.wallet >= 0,
      "Неверный баланс кошелька",
    );
    for (const k of Object.keys(stats)) integer(h.stats[k], 1, 30);
    for (const k of ["tools", "recipes", "professions"])
      requireThat(
        Array.isArray(h[k]) && h[k].every((v) => typeof v === "string"),
        "Недопустимый профиль",
      );
  }
  for (const p of e.projects || [])
    requireThat(
      Number.isFinite(p.left) &&
        p.left >= 0 &&
        p.left <= p.work &&
        ["active", "done", "cancelled", "failed"].includes(p.status),
      "Неверный остаток проекта",
    );
  requireThat(
    (e.stays || []).filter((t) => !t.closed).length <= 1,
    "Две активные стоянки",
  );
  for (const t of e.stays || []) {
    integer(t.hours, 1, 24);
    integer(t.days, 1, 3650);
    for (const v of Object.values(t.spent))
      requireThat(
        Number.isFinite(v) && v >= 0 && v <= t.hours * t.days,
        "Превышен бюджет стоянки",
      );
  }
  validateTradeCatalog(raw);
  for (const [service, tier] of Object.entries(e.facilityTiers || {})) {
    requireThat(productionServices.includes(service), "Неизвестное сооружение");
    integer(tier, 2, 3);
  }
  for (const stay of e.stays || []) {
    for (const [service, rental] of Object.entries(stay.rentals || {})) {
      requireThat(productionServices.includes(service) && rental.node_id === stay.location &&
        raw.nodes.some((node) => node.id === rental.node_id && node.type === "city"), "Неверная аренда");
      integer(rental.tier, 1, 3);
      tradeMoney(rental.cost);
    }
  }
  const packageKeys = new Set();
  for (const pack of e.contentPackages || []) {
    contentMetadata(pack);
    requireThat(Array.isArray(pack.records), "Неверный реестр контента");
    for (const row of pack.records) {
      requireThat(Object.hasOwn(tables, row.table) && validId(row.id), "Неверная запись реестра контента");
      const key = catalogIdentity(row.table, row.id);
      requireThat(!packageKeys.has(key), "Запись указана в нескольких пакетах");
      packageKeys.add(key);
    }
  }
  checkPackageGraph(e.contentPackages || []);
  const receipts = new Set();
  for (const r of e.receipts) {
    requireThat(
      typeof r.key === "string" && !receipts.has(r.key),
      "Дубликат операции в журнале",
    );
    receipts.add(r.key);
  }
}
const normalizeEngine = normalize;
normalize = function (raw) {
  validateBackup(raw);
  return normalizeEngine(raw);
};
