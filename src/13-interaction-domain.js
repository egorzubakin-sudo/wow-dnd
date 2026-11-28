function requireMapUnlocked(s) {
  requireThat(!s.settings?.mapLocked, "Редактирование карты заперто");
}
register("mapMove", "master", (s, p) => {
  requireMapUnlocked(s);
  const place = byId(s.nodes, p.id);
  requireThat([p.x, p.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1), "Некорректные координаты");
  if (s.engine.mapPlacements) placeOnMap(s, { node_id: place.id, map_id: overviewMap, x: p.x, y: p.y });
  else Object.assign(place, { x: p.x, y: p.y });
});
register("mapIcon", "master", (s, p) => {
  requireMapUnlocked(s);
  const place = byId(s.nodes, p.id);
  requireThat(!p.iconId || /^[\w-]+:[\w.-]+$/.test(p.iconId), "Некорректная иконка");
  requireThat(!p.image || /^data:image\/(png|jpeg|webp|gif|bmp|avif);base64,[A-Za-z0-9+/=]+$/i.test(p.image), "Некорректное изображение");
  place.iconId = p.iconId || "";
  place.markerImage = p.image || "";
});

function issueCharter(s, factionId, text) {
  const faction = byId(s.factions, factionId);
  requireThat(typeof text === "string" && text.trim() && text.length <= 20000, "Укажите текст грамоты");
  const document = text.trim().replace(/\r\n/g, "\n");
  const previous = faction.charter || "";
  if (("\n" + previous + "\n").includes("\n" + document + "\n")) return false;
  faction.charter = [previous, document].filter(Boolean).join("\n");
  return true;
}

register("issueCharter", "master", (s, p) => {
  requireThat(issueCharter(s, p.faction, p.text), "Такая грамота уже выдана");
  const faction = byId(s.factions, p.faction);
  (s.journal ??= []).unshift({
    id: crypto.randomUUID(), day: s.company.day, year: s.company.year, kind: "faction",
    title: "Грамота: " + faction.name, text: p.text.trim(), hidden: !!faction.hidden,
  });
});
