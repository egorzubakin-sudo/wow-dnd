const overviewMap = "overview";
const mapKinds = { world: "Мир", continent: "Континент", region: "Регион", local: "Поселение или территория" };
const mapTables = ["maps", "mapPlacements", "routeGeometries", "regionBoundaries"];
const mapCommands = new Set(["atlasSheet", "atlasImage", "atlasRemoveSheet", "atlasPlacement", "atlasGeometry", "atlasBoundary", "atlasPlaceRegion"]);

function mapData(s) {
  const e = s.engine ??= { schemaVersion: 1, receipts: [] };
  e.maps ??= [{ id: overviewMap, name: "Карта Азерота", kind: "world" }];
  e.mapPlacements ??= (s.nodes || []).map(({id, x, y}) => ({id, map_id: overviewMap, node_id: id, x, y}));
  e.routeGeometries ??= (s.routes || []).map(({id}) => ({id, map_id: overviewMap, route_id: id, points: []}));
  e.regionBoundaries ??= (e.regions || []).filter((r) => r.points?.length >= 3).map((r) =>
    ({id: r.id, map_id: overviewMap, region_id: r.id, points: r.points, hidden: true}));
  return e;
}
function sheetParent(sheet) {
  return sheet.id === overviewMap ? "" : sheet.parent_id || overviewMap;
}
function mapAncestry(sheets, id) {
  const chain = [], seen = new Set();
  while (id && !seen.has(id)) {
    const row = sheets.find((m) => m.id === id);
    if (!row) break;
    chain.unshift(row);
    seen.add(id);
    id = sheetParent(row);
  }
  return chain;
}
function openSheets(sheets) {
  return sheets.filter((sheet) => mapAncestry(sheets, sheet.id).every((row) => !row.archived));
}
function publicSheets(sheets) {
  return openSheets(sheets).filter((sheet) => mapAncestry(sheets, sheet.id).every((row) =>
    row.id === overviewMap || row.shared === true));
}
function normalizedPoint(x, y) {
  return [x, y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1);
}
function validateMapPoints(points, min) {
  requireThat(Array.isArray(points) && points.length >= min && points.length <= 256 &&
    points.every((p) => Array.isArray(p) && p.length === 2 && normalizedPoint(...p)), "Некорректные координаты точек карты");
  if (min === 3) {
    const area = points.reduce((sum, [x, y], i) => {
      const [u, v] = points[(i + 1) % points.length];
      return sum + x * v - y * u;
    }, 0);
    requireThat(Math.abs(area) > 1e-10, "Граница должна охватывать область");
  }
}
function mapEntry(rows, key, id, map) {
  return rows.find((row) => row.map_id === map && row[key] === id);
}
function validateCartography(s) {
  if (!mapTables.some((key) => s.engine?.[key] != null)) return;
  const {maps, mapPlacements, routeGeometries, regionBoundaries} = s.engine;
  const {nodes = [], routes = []} = s;
  const regions = s.engine.regions || [];
  const has = (rows, id) => rows.some((row) => row.id === id);
  requireThat(maps?.some((m) => m.id === overviewMap), "Нет обзорной карты");
  const ids = new Set();
  for (const sheet of maps) {
    requireThat(validId(sheet.id) && !ids.has(sheet.id), "Дублирующийся или некорректный ID карты");
    ids.add(sheet.id);
    requireThat(typeof sheet.name === "string" && sheet.name.trim() && Object.hasOwn(mapKinds, sheet.kind),
      "Укажите название и тип карты");
    requireThat(sheet.id !== overviewMap || !sheet.parent_id && !sheet.archived && !sheet.image, "Некорректная обзорная карта");
    requireThat(mapAncestry(maps, sheet.id)[0]?.id === overviewMap, "Цикл или неизвестная родительская карта");
    requireThat(!sheet.node_id || has(nodes, sheet.node_id), "Не найдена локация карты");
    requireThat(!sheet.region_id || has(regions, sheet.region_id), "Не найден регион карты");
    requireThat((sheet.x == null && sheet.y == null) || normalizedPoint(sheet.x, sheet.y), "Некорректный центр карты");
    requireThat(sheet.zoom == null || Number.isFinite(sheet.zoom) && sheet.zoom >= 1 && sheet.zoom <= 20,
      "Масштаб карты должен быть от 1 до 20");
    if (sheet.image) requireThat(typeof sheet.image === "string" &&
      (/^data:image\/(png|jpeg|webp|gif|bmp|avif);base64,[A-Za-z0-9+/=\s]+$/i.test(sheet.image) ||
       /^atlas-storage:v1:[a-f0-9]{64}\.(png|jpeg|webp|gif|bmp|avif)$/.test(sheet.image)) &&
      sheet.width > 0 && sheet.height > 0 && Number.isFinite(sheet.width) && Number.isFinite(sheet.height),
      "Некорректная подложка карты");
  }
  function links(rows, key, targets, check) {
    const pairs = new Set();
    for (const row of rows || []) {
      const pair = JSON.stringify([row.map_id, row[key]]);
      requireThat(!pairs.has(pair) && has(maps, row.map_id) && has(targets, row[key]),
        "Дублирующаяся или отсутствующая связь карты");
      pairs.add(pair);
      requireThat(row.hidden == null || typeof row.hidden === "boolean", "Некорректная видимость на карте");
      check(row);
    }
  }
  links(mapPlacements, "node_id", nodes, (row) => {
    requireThat(normalizedPoint(row.x, row.y), "Некорректные координаты");
    requireThat(row.scale == null || Number.isFinite(row.scale) && row.scale >= 50 && row.scale <= 200, "Масштаб отметки от 50% до 200%");
    requireThat(!row.labels || ["always", "hover", "never"].includes(row.labels), "Неизвестный режим подписи");
    requireThat(!row.child_id || maps.some((m) => m.id === row.child_id && sheetParent(m) === row.map_id),
      "Выберите дочернюю карту этого уровня");
  });
  links(routeGeometries, "route_id", routes, (row) => {
    validateMapPoints(row.points, 0);
    requireThat(!row.style || ["line", "smooth"].includes(row.style), "Неизвестная форма маршрута");
    const path = byId(routes, row.route_id);
    requireThat([path.a, path.b].every((id) => mapEntry(mapPlacements || [], "node_id", id, row.map_id)),
      "Сначала разместите оба конца маршрута");
  });
  links(regionBoundaries, "region_id", regions, (row) => validateMapPoints(row.points, 3));
}
function putMapEntry(rows, key, id, map, changes) {
  const previous = mapEntry(rows, key, id, map);
  if (changes === null) {
    if (previous) rows.splice(rows.indexOf(previous), 1);
  } else if (previous) Object.assign(previous, changes);
  else rows.push({ ...changes, id: crypto.randomUUID(), [key]: id, map_id: map });
}
function placeOnMap(s, p) {
  const e = mapData(s), place = byId(s.nodes, p.node_id);
  byId(e.maps, p.map_id);
  if (p.remove) {
    putMapEntry(e.mapPlacements, "node_id", place.id, p.map_id, null);
    const adjoining = new Set(s.routes.filter((r) => r.a === place.id || r.b === place.id).map((r) => r.id));
    e.routeGeometries = e.routeGeometries.filter((r) => r.map_id !== p.map_id || !adjoining.has(r.route_id));
    return;
  }
  requireThat(normalizedPoint(p.x, p.y), "Некорректные координаты");
  const display = p.display ? Object.fromEntries(["scale", "labels", "hidden", "child_id"].map((key) => [key, p.display[key]])) : {};
  putMapEntry(e.mapPlacements, "node_id", place.id, p.map_id, {x: p.x, y: p.y, ...display});
  if (p.map_id === overviewMap) Object.assign(place, {x:p.x, y:p.y});
}
registerAtlas("atlasSheet", (s, p) => {
  const {maps} = mapData(s), old = maps.find((row) => row.id === p.id);
  const fields = { name: p.name.trim(), desc: p.desc, kind: p.kind, shared: !!p.shared, x:p.x, y:p.y, zoom:p.zoom };
  if (p.id !== overviewMap) Object.assign(fields, {parent_id:p.parent_id, node_id:p.node_id, region_id:p.region_id, archived:!!p.archived});
  if (old) Object.assign(old, fields);
  else maps.push({ id:p.id, ...fields });
});
registerAtlas("atlasImage", (s, p) => {
  const sheet = byId(mapData(s).maps, p.id);
  if (p.id === overviewMap) s.map = p.image;
  else Object.assign(sheet, {image:p.image.src, width:p.image.w, height:p.image.h, filename:p.image.name});
});
registerAtlas("atlasRemoveSheet", (s, p) => {
  const e = mapData(s);
  byId(e.maps, p.id);
  requireThat(p.id !== overviewMap, "Обзорную карту нельзя удалить");
  requireThat(!e.maps.some((row) => sheetParent(row) === p.id) && !e.mapPlacements.some((row) => row.child_id === p.id),
    "Сначала перенесите дочерние карты и уберите ссылки с отметок");
  e.maps = e.maps.filter((row) => row.id !== p.id);
  for (const key of mapTables.slice(1)) e[key] = e[key].filter((row) => row.map_id !== p.id);
});
registerAtlas("atlasPlacement", placeOnMap);
registerAtlas("atlasGeometry", (s, p) => {
  putMapEntry(mapData(s).routeGeometries, "route_id", p.route_id, p.map_id, p.remove ? null :
    {points:p.points, style:p.style, hidden:!!p.hidden});
});
registerAtlas("atlasBoundary", (s, p) => {
  const e = mapData(s), region = byId(e.regions, p.region_id);
  putMapEntry(e.regionBoundaries, "region_id", p.region_id, p.map_id, p.remove ? null :
    {points:p.points, hidden:!!p.hidden});
  if (p.map_id === overviewMap) region.points = p.remove ? [] : p.points;
});
registerAtlas("atlasPlaceRegion", (s, p) => {
  if (p.region) byId(s.engine.regions, p.region);
  byId(s.nodes, p.id).regionId = p.region;
});
function registerAtlas(name, run) {
  register(name, "master", (s, payload) => {
    requireMapUnlocked(s);
    run(s, payload);
    validateCartography(s);
  });
}

function pruneMapReferences(s) {
  const e = mapData(s), ids = new Set(s.nodes.map((n) => n.id)), routes = new Set(s.routes.map((r) => r.id));
  e.mapPlacements = e.mapPlacements.filter((row) => ids.has(row.node_id));
  e.routeGeometries = e.routeGeometries.filter((row) => routes.has(row.route_id));
  for (const map of e.maps)
    if (map.node_id && !ids.has(map.node_id)) delete map.node_id;
}
function reconcileMapImport(previous, next, pack) {
  const e = next.engine;
  const oldNodes = new Map(previous.nodes.map((n) => [n.id,n]));
  const oldRoutes = new Set(previous.routes.map((r) => r.id));
  const oldRegions = new Map((previous.engine.regions || []).map((r) => [r.id,r]));
  if (pack.nodes && !pack.mapPlacements) for (const row of next.nodes) {
    const old = oldNodes.get(row.id), placement = mapEntry(e.mapPlacements,"node_id",row.id,overviewMap);
    if (!old || placement && (old.x !== row.x || old.y !== row.y)) {
      if (placement) Object.assign(placement,{x:row.x,y:row.y});
      else e.mapPlacements.push({id:row.id,node_id:row.id,map_id:overviewMap,x:row.x,y:row.y});
    }
  }
  if (pack.routes && !pack.routeGeometries) for (const row of next.routes) {
    if (!oldRoutes.has(row.id) && [row.a,row.b].every((id) => mapEntry(e.mapPlacements,"node_id",id,overviewMap)))
      e.routeGeometries.push({id:row.id,route_id:row.id,map_id:overviewMap,points:[]});
  }
  if (pack.regions && !pack.regionBoundaries) for (const region of next.engine.regions) {
    const old = oldRegions.get(region.id);
    if (region.points?.length >= 3 && JSON.stringify(old?.points) !== JSON.stringify(region.points)) {
      const boundary = mapEntry(e.regionBoundaries,"region_id",region.id,overviewMap);
      if (boundary) boundary.points = region.points;
      else e.regionBoundaries.push({id:region.id,region_id:region.id,map_id:overviewMap,points:region.points,hidden:true});
    }
  }
  for (const row of e.mapPlacements) {
    if (row.map_id !== overviewMap) continue;
    const node = next.nodes.find((n) => n.id === row.node_id);
    if (node) Object.assign(node,{x:row.x,y:row.y});
  }
}
