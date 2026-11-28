// Domain functions take a candidate campaign, never DOM elements.
const commands = new Map();
function requireThat(ok, message) {
  if (!ok) throw Error(message);
}
function integer(v, min = 0, max = 1000000000) {
  requireThat(
    Number.isSafeInteger(v) && v >= min && v <= max,
    "Число вне диапазона",
  );
  return v;
}
function migrate(s) {
  s.engine ??= { schemaVersion: 1, receipts: [] };
  requireThat(
    s.engine.schemaVersion === 1 && Array.isArray(s.engine.receipts),
    "Неизвестная схема движка",
  );
  return s;
}
function register(name, access, run) {
  commands.set(name, { access, run });
}
function owned(actor, h) {
  return (
    actor.role === "master" ||
    (["captain", "player"].includes(actor.role) && actor.heroes.includes(h))
  );
}
function applyCommand(source, actor, name, payload, key) {
  const cmd = commands.get(name);
  requireThat(actor && cmd, "Неизвестная команда");
  requireThat(
    actor.role === "master" ||
      (cmd.access === "hero" && owned(actor, payload.hero)) ||
      (cmd.access === "party" && actor.role === "captain" && actor.travel),
    "Недостаточно прав",
  );
  requireThat(
    key && !source.engine.receipts.some((r) => r.key === key),
    "Операция уже применена",
  );
  const next = structuredClone(source);
  if (payload.companion) applyCompanionContext(next, actor, name, payload);
  cmd.run(next, payload, actor);
  let event = name,
    recipient = payload.hero;
  if (name === "gather" && !currentStay(next).history.at(-1)?.item_id)
    event = "";
  if (name === "work" || name === "staffWork") {
    const project = byId(next.engine.projects, payload.project);
    if (project.status === "done") {
      event = "craft";
      recipient = project.hero;
    }
  }
  if (name === "craft" && next.engine.projects.at(-1)?.status !== "done")
    event = "";
  for (const a of next.portal?.achievements || []) {
    if (a.engineEvent === event && !a.archived)
      grant(
        next,
        { type: "achievement", achievement: a.id },
        a.scope === "company" ? "" : recipient,
      );
  }
  const receipt = {
    key,
    name,
    actor: actor.nick,
    hero: name === "resolveCompanionRequest" ?
      next.engine.companionRequests.find((row) => row.id === payload.id)?.hero : payload.hero,
    day: next.company.day,
    ...(payload.companion ? { companion: payload.companion } : {}),
  };
  if (
    payload.companion || [
      "resolveCompanionRequest",
      "gather",
      "quest",
      "project",
      "craft",
      "work",
      "staffWork",
      "enchant",
      "disenchant",
      "assemble",
      "closeStay",
      "transfer",
      "merge",
      "withdraw",
      "gold",
      "cancelProject",
      "finishContract",
      "tradeDeal",
      "tradeDonation",
      "facilityTier",
      "facilityRental",
      "deliverGoods",
      "session",
    ].includes(name)
  ) {
    const previous = new Map(
      (source.company.inventory || []).map((x) => [x.id, x]),
    );
    const current = new Map(
      (next.company.inventory || []).map((x) => [x.id, x]),
    );
    receipt.items = [];
    for (const id of new Set([...previous.keys(), ...current.keys()])) {
      const a = previous.get(id),
        b = current.get(id),
        change = (b?.qty || 0) - (a?.qty || 0);
      if (change)
        receipt.items.push({
          id,
          item_id: (b || a).item_id,
          owner: (b || a).owner,
          change,
        });
    }
    receipt.gold = Math.round(((next.company.gold || 0) - (source.company.gold || 0)) * 100) / 100;
    receipt.wallets = Object.entries(next.engine.profiles || {})
      .map(([hero, h]) => ({
        hero,
        change: Math.round((h.wallet - (source.engine.profiles?.[hero]?.wallet || 0)) * 100) / 100,
      }))
      .filter((w) => w.change);
    const t = currentStay(source);
    if (t) {
      const after = next.engine.stays.find((x) => x.id === t.id);
      receipt.time = Object.entries(after.spent)
        .map(([hero, value]) => ({
          hero,
          hours: roundedHours(value - (t.spent[hero] || 0)),
        }))
        .filter((x) => x.hours);
    }
  }
  if (name === "tradeDeal") {
    const row = localMarket(source, actor).find((market) => market.item_id === payload.item);
    receipt.market = { node: row.node_id, item: row.item_id, side: payload.side,
      quantity: payload.qty, unit: tradePrices(source, row)[payload.side] };
  }
  if (name === "facilityTier" || name === "facilityRental")
    receipt.facility = { service: payload.service, tier: payload.tier };
  if (name === "deliverGoods") receipt.contract = payload.id;
  if (name === "contentImport") receipt.package = { id: payload.pack.id, version: payload.pack.version };
  next.engine.receipts.push(receipt);
  return next;
}
