const contentFormat = "atlas-content";
function versionParts(version) {
  requireThat(typeof version === "string" && /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(version), "Версия пакета указывается как X.Y.Z");
  return version.split(".").map(Number);
}
function compareContentVersions(a, b) {
  const right = versionParts(b);
  return versionParts(a).map((x, i) => x - right[i]).find(Boolean) || 0;
}
function contentMetadata(pack) {
  requireThat(pack.format === contentFormat && pack.schemaVersion === 1 && validId(pack.id), "Нужен пакет atlas-content со схемой 1 и постоянным ID");
  versionParts(pack.version);
  for (const key of ["name", "author", "description"])
    requireThat(typeof pack[key] === "string" && pack[key].trim() && pack[key].length <= 3000, "Заполните " + key);
  requireThat(Array.isArray(pack.sources) && pack.sources.length && Array.isArray(pack.dependencies), "Нужны источники и список зависимостей");
  for (const source of pack.sources) catalogSource(source);
  const dependencies = new Set();
  for (const dep of pack.dependencies) {
    requireThat(validId(dep?.id) && dep.id !== pack.id && !dependencies.has(dep.id), "Неверная или повторная зависимость");
    dependencies.add(dep.id);
    versionParts(dep.minVersion);
  }
  return Object.fromEntries(["format", "schemaVersion", "id", "name", "description", "version", "author", "sources", "dependencies"].map((key) => [key, pack[key]]));
}
function catalogIdentity(table, id) {
  return tables[table][1] + " / " + id;
}
function preserveRuntimeFields(table, old, incoming, resetMarket = false) {
  const path = tables[table][1];
  const runtime = {
    nodes: ["visibility"],
    routes: ["status"],
    factions: ["repPoints", "charter"],
    "portal.people": ["attitude", "promises", "history", "relations", "dossier", "firstMeeting", "participation", "archived"],
    "portal.achievements": ["earned", "earnedDate", "grants", "archived"],
    contracts: ["type", "status", "rewardReceipt", "rewardRevealed", "archived"],
  };
  const blocked = [...(runtime[path] || [])];
  if (path === "engine.items" && old.original) blocked.push("original");
  if (path === "portal.mail") blocked.push("read");
  if (table === "markets" && !resetMarket) blocked.push("stock", "demand", "budget");
  if (path === "contracts" && old.rewardReceipt) blocked.push("rewards", "goods", "stock_source", "reward_recipient");
  if (path === "portal.news") blocked.push("archived");
  for (const key of blocked) delete incoming[key];
}
function contentDefinition(table, row) {
  const path = tables[table][1];
  const stateFields = {
    contracts: ["status", "rewardReceipt", "rewardRevealed", "archived"],
    "portal.people": ["history", "archived"],
    "portal.achievements": ["earned", "earnedDate", "grants", "archived"],
    "portal.news": ["archived"], "portal.mail": ["read"],
  };
  const copy = { ...row };
  for (const key of stateFields[path] || []) delete copy[key];
  if (copy.extra && typeof copy.extra === "object") {
    copy.extra = { ...copy.extra };
    for (const key of stateFields[path] || []) delete copy.extra[key];
  }
  return copy;
}
function checkPackageGraph(packages) {
  const active = new Map(packages.filter((row) => !row.archived).map((row) => [row.id, row]));
  const checked = new Set(), visiting = new Set();
  function check(record) {
    if (checked.has(record.id)) return;
    requireThat(!visiting.has(record.id), "Цикл зависимостей пакетов");
    visiting.add(record.id);
    for (const dep of record.dependencies) {
      const target = active.get(dep.id);
      requireThat(target && compareContentVersions(target.version, dep.minVersion) >= 0, "Не хватает зависимости " + dep.id + " ≥ " + dep.minVersion);
      check(target);
    }
    visiting.delete(record.id);
    checked.add(record.id);
  }
  for (const record of active.values()) check(record);
}
function contentPlan(s, pack, options = {}) {
  inspectJSON(pack);
  const metadata = contentMetadata(pack);
  const registry = s.engine.contentPackages || [], previous = registry.find((x) => x.id === pack.id);
  requireThat(!previous || compareContentVersions(pack.version, previous.version) > 0, "Пакет этой или более новой версии уже установлен");
  requireThat(pack.tables && typeof pack.tables === "object" && !Array.isArray(pack.tables) &&
    Object.keys(pack.tables).length, "Нужны справочники пакета");
  const issues = [], changes = [], included = new Map();
  const owner = new Map(registry.flatMap((entry) => entry.records.map((record) =>
    [catalogIdentity(record.table, record.id), entry.id])));
  const data = structuredClone(pack.tables), lookup = structuredClone(s);
  for (const [table, rows] of Object.entries(data)) {
    requireThat(Object.hasOwn(tables, table) && Array.isArray(rows), "Неизвестный справочник " + table);
    const exists = new Set(records(lookup, table).map((row) => row.id));
    data[table] = rows.map((row) => row && typeof row === "object" ? contentDefinition(table, row) : row);
    for (const row of data[table]) {
      if (!validId(row?.id)) {
        issues.push(table + " · нужен постоянный ID");
        continue;
      }
      const key = catalogIdentity(table, row.id), currentOwner = owner.get(key);
      const conflict = included.has(key) || (currentOwner && currentOwner !== pack.id) ||
        (exists.has(row.id) && currentOwner !== pack.id);
      if (conflict) issues.push(key + " · запись уже принадлежит " + (currentOwner || "другому справочнику"));
      changes.push({ table, id: row.id, change: conflict ? "conflict" : exists.has(row.id) ? "update" : "new" });
      included.set(key, { table, id: row.id });
    }
  }
  requireThat(included.size, "Пакет пуст");
  const combined = new Map((previous?.records || []).map((row) => [catalogIdentity(row.table, row.id), row]));
  for (const [key, row] of included) combined.set(key, row);
  const entry = { ...metadata, records: [...combined.values()] };
  const packages = [...registry.filter((x) => x.id !== pack.id), entry];
  checkPackageGraph(packages);
  const declared = new Set(pack.dependencies.map((dep) => dep.id));
  for (const [table, rows] of Object.entries(data)) {
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const fields = columns(table).filter((field) => field.type.startsWith("@"));
      const refs = fields.map((field) => [field.type.slice(1), row[field.name]]);
      for (const id of row.locations || []) refs.push(["nodes", id]);
      for (const id of row.craft_properties || []) refs.push(["craftProperties", id]);
      for (const line of Array.isArray(row.goods) ? row.goods : []) refs.push(["items", line.item_id]);
      for (const [target, id] of refs) {
        const other = id && owner.get(catalogIdentity(target, id));
        if (other && other !== pack.id && !declared.has(other))
          issues.push(table + " " + row.id + " · нужна явная зависимость " + other);
      }
    }
  }
  const plan = planImport(s, data, "update", options);
  plan.issues.push(...issues);
  plan.count.errors += issues.length;
  plan.changes = changes;
  plan.next.engine.contentPackages = packages;
  return plan;
}
function exportContentPack(s, id) {
  const { records: members, ...pack } = byId(s.engine.contentPackages || [], id);
  delete pack.archived;
  pack.tables = {};
  for (const ref of members) {
    const row = records(s, ref.table).find((x) => x.id === ref.id);
    if (row) (pack.tables[ref.table] ??= []).push(contentDefinition(ref.table, row));
  }
  return pack;
}
register("contentImport", "master", (s, p) => {
  const plan = contentPlan(s, p.pack, { resetMarket: p.resetMarket === true });
  requireThat(!plan.count.errors, plan.issues.join("\n"));
  Object.assign(s, plan.next);
});
register("contentArchive", "master", (s, p) => {
  const pack = byId(s.engine.contentPackages || [], p.id);
  requireThat(!pack.archived, "Пакет уже архивирован");
  pack.archived = true;
  checkPackageGraph(s.engine.contentPackages);
});
