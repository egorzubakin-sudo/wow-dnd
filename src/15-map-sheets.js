let activeSheet = overviewMap, sheetHistory = [], mapDraft = null;
let mapDraftDrag = null;
let mapPrefsKey = "", mapPrefs = {};
const mapLayers = {
  regions: "Границы регионов", settlements: "Поселения", forts: "Крепости", ports: "Порты",
  places: "Достопримечательности", routes: "Маршруты", quests: "Задания", resources: "Ресурсы",
  danger: "Опасные территории", secrets: "Скрытые отметки мастера",
};
function mapPreferences() {
  const key = "atlas-map:" + (sharedGame?.campaign || "local") + ":" + (actor?.nick || "") + ":" + activeSheet;
  if (key !== mapPrefsKey) {
    mapPrefsKey = key;
    mapPrefs = {};
    try { mapPrefs = JSON.parse(localStorage.getItem(key)) || {}; } catch {}
  }
  return [key, mapPrefs];
}
function saveMapPreferences(changes) {
  const [key, prefs] = mapPreferences();
  mapPrefs = {...prefs, ...changes};
  try { localStorage.setItem(key, JSON.stringify(mapPrefs)); } catch {}
}
function rememberMapView() {
  if (view) saveMapPreferences({view});
}
function restoreMapView() {
  const saved = mapPreferences()[1].view;
  if (saved && [saved.x,saved.y,saved.w,saved.h].every(Number.isFinite) && saved.w > 0 && saved.h > 0) {
    view = saved;
    return;
  }
  const sheet = currentSheet(), {w,h} = dims(), zoom = sheet.zoom || 1;
  view = {x:(sheet.x ?? .5)*w-w/zoom/2, y:(sheet.y ?? .5)*h-h/zoom/2, w:w/zoom, h:h/zoom};
}
function currentSheet() {
  const {maps} = mapData(S);
  return maps.find((row) => row.id === activeSheet) || maps[0];
}
function currentMapImage() {
  const sheet = currentSheet();
  return sheet.id === overviewMap ? S.map : sheet.image
    ? {src:sheet.image,w:sheet.width,h:sheet.height,name:sheet.filename} : null;
}
function availableMaps() {
  const {maps} = mapData(S);
  if (sharedGame && !sharedGame.mapLayout()) return maps.filter((map) => map.id === overviewMap);
  return player ? publicSheets(maps) : openSheets(maps);
}
function adjustActiveSheet() {
  if (availableMaps().some((row) => row.id === activeSheet)) return;
  activeSheet = overviewMap;
  selected = null;
  view = null;
  mapDraft = null;
}
function switchMapSheet(id, remember = true) {
  if (!availableMaps().some((row) => row.id === id)) return;
  if (id !== activeSheet) {
    rememberMapView();
    if (remember) sheetHistory.push(activeSheet);
    cancelMapGesture(false);
    activeSheet = id;
    mapDraft = null;
    mapDraftDrag = null;
    tool = "select";
    routeStart = null;
    selected = null;
    view = null;
  }
  switchTab("map");
}
function previousMapSheet() {
  const ids = new Set(availableMaps().map((row) => row.id));
  while (sheetHistory.length) {
    const id = sheetHistory.pop();
    if (ids.has(id) && id !== activeSheet) return switchMapSheet(id, false);
  }
}
function placedNode(id, sheet = activeSheet) {
  return mapEntry(mapData(S).mapPlacements, "node_id", id, sheet);
}
function drawnRoute(id, sheet = activeSheet) {
  return mapEntry(mapData(S).routeGeometries, "route_id", id, sheet);
}
function layerOn(layer) {
  const setting = mapPreferences()[1].layers?.[layer];
  return setting ?? !["resources", "danger"].includes(layer);
}
function mapLayerOptions() {
  const layers = Object.entries(mapLayers).filter(([key]) => key !== "secrets" || !player);
  form("Слои и подписи карты", layers.map(([key,label]) => check(label, "mapLayer-"+key, layerOn(key))).join("") +
    pick("Подписи по умолчанию", "mapLabels", [["always","Всегда"],["hover","При наведении или выборе"],["never","Скрывать"]],
      mapPreferences()[1].labels || (S.settings.showLabels ? "always" : "never")), () => {
    saveMapPreferences({layers:Object.fromEntries(layers.map(([key]) => [key,$("mapLayer-"+key).checked])), labels:val("mapLabels")});
    drawMap();
  });
}
function markerLayer(place) {
  if (place.type === "port") return "ports";
  if (place.type === "fort") return "forts";
  if (["city","village","camp"].includes(place.type)) return "settlements";
  return "places";
}
function visiblePlacement(place, point) {
  return !!point && visibleNode(place) && (player ? !point.hidden && !place.hidden : layerOn("secrets") || !point.hidden && !place.hidden && place.visibility !== "hidden");
}
function mapMarkerLabels(point) {
  return point.labels || mapPreferences()[1].labels || (S.settings.showLabels ? "always" : "never");
}
function focusMapPlace(id) {
  const place = node(id);
  if (!place || !visibleNode(place)) return;
  const maps = availableMaps();
  const ids = [activeSheet, ...maps.map((m) => m.id)];
  const sheet = ids.find((key) => maps.some((m) => m.id === key) && visiblePlacement(place, placedNode(id,key)));
  if (!sheet) return toast("У места пока нет доступной отметки");
  closeModal();
  if (sheet !== activeSheet) switchMapSheet(sheet);
  const position = placedNode(id), {w,h} = dims();
  if (!view) restoreMapView();
  view.x = position.x*w-view.w/2;
  view.y = position.y*h-view.h/2;
  selected = {type:"node",id};
  rememberMapView();
  switchTab("map");
}
function searchMapPlaces() {
  openModal("Найти место", input("Название", "mapPlaceQuery", "search") + '<div id="mapPlaceResults" class="stack"></div>');
  const draw = () => {
    const query = val("mapPlaceQuery").trim().toLowerCase();
    const maps = availableMaps();
    const rows = S.nodes.filter((n) => visibleNode(n) && (!player || !n.hidden) && String(n.name).toLowerCase().includes(query));
    $("mapPlaceResults").replaceChildren(...rows.slice(0,50).map((n) => {
      const names = maps.filter((map) => visiblePlacement(n,placedNode(n.id,map.id))).map((map) => map.name);
      const control = button(n.name + " · " + (names.join(", ") || "Без отметки"), () => focusMapPlace(n.id));
      control.disabled = !names.length;
      return control;
    }));
    if (!rows.length) $("mapPlaceResults").textContent = "Места не найдены.";
  };
  $("mapPlaceQuery").oninput = draw;
  draw();
}
function mapNavigation() {
  const maps = availableMaps();
  const chain = mapAncestry(maps, activeSheet);
  return '<div class="map-navigation"><div class="actions">' +
    (sheetHistory.length ? visualAction("Предыдущая карта", "previousMapSheet()") : "") +
    visualAction("Найти место", "searchMapPlaces()") +
    (S.company.location ? visualAction("Где находится компания", "focusMapPlace(" + jsid(S.company.location) + ")") : "") + '</div>' +
    (maps.length > 1 ? pick("Карта", "atlasSheetPicker", maps.map((map) => [map.id,
      mapAncestry(maps,map.id).map((m) => m.name).join(" › ")]), activeSheet) : "") +
    (chain.length > 1 ? '<nav class="actions" aria-label="Родительские карты">' +
      chain.map((map) => map.id === activeSheet ? '<strong>' + esc(map.name) + '</strong>' :
        visualAction(map.name, "switchMapSheet(" + jsid(map.id) + ")", "ghost")).join("") + '</nav>' : "") + '</div>';
}
function mapSheetForm(id) {
  if (!canEditMap()) return;
  const e = mapData(S), sheet = e.maps.find((map) => map.id === id);
  const root = id === overviewMap;
  const parents = e.maps.filter((map) => (!map.archived || map.id === sheetParent(sheet || {id:""})) &&
    !mapAncestry(e.maps,map.id).some((ancestor) => ancestor.id === id));
  commandForm(sheet ? "Настройки карты" : "Новая карта",
    input("Название", "sheetName", "text", sheet?.name || "", 'required maxlength="120"') +
    area("Описание", "sheetDesc", sheet?.desc || "") +
    pick("Тип и детализация", "sheetKind", Object.entries(mapKinds), sheet?.kind || "region") +
    (root ? "" : pick("Родительская карта", "sheetParent", pairs(parents), sheet?.parent_id || activeSheet) +
      pick("Связанный регион", "sheetRegion", [["","Без связи"], ...pairs(e.regions || [])],sheet?.region_id || "") +
      pick("Связанное место", "sheetNode", [["","Без связи"], ...pairs(S.nodes)],sheet?.node_id || "") +
      check("Показывать игрокам", "sheetShared", sheet?.shared === true) +
      check("В архиве", "sheetArchived", sheet?.archived === true)) +
    '<div class="cols">' + input("Начальный масштаб ×","sheetZoom","number",sheet?.zoom || 1,'min="1" max="20" step="0.1" required') +
    input("Центр X, %","sheetX","number",100*(sheet?.x ?? .5),'min="0" max="100" step="any" required') +
    input("Центр Y, %","sheetY","number",100*(sheet?.y ?? .5),'min="0" max="100" step="any" required') + '</div>',
    "atlasSheet", () => ({id:id || crypto.randomUUID(), name:val("sheetName"), desc:val("sheetDesc"), kind:val("sheetKind"),
      parent_id:$("sheetParent")?.value || "", node_id:$("sheetNode")?.value || "", region_id:$("sheetRegion")?.value || "",
      shared:!!$("sheetShared")?.checked, archived:!!$("sheetArchived")?.checked,
      zoom:num("sheetZoom"), x:num("sheetX")/100, y:num("sheetY")/100}));
}
function manageMapSheets() {
  if (!canEditMap()) return;
  if (sharedGame && !sharedGame.mapLayout()) return toast("Для связанных карт обновите игровой сервер Supabase");
  openModal("Карты Атласа", '<div class="actions" id="newMapSheet"></div><div class="stack" id="mapSheetList"></div>');
  $("newMapSheet").append(button("Создать карту", () => mapSheetForm()));
  for (const map of mapData(S).maps) {
    const row = document.createElement("div");
    row.className = "actions";
    row.append(mapAncestry(mapData(S).maps,map.id).map((m) => m.name).join(" › ") + (map.archived ? " · архив" : " "),
      button("Настройки", () => mapSheetForm(map.id)));
    if (map.id !== overviewMap)
      row.append(button("Удалить карту", async () => {
        if (!confirm("Удалить карту и её отметки? Места, маршруты и регионы останутся в базе.")) return;
        await execute("atlasRemoveSheet",{id:map.id});
        manageMapSheets();
      }));
    $("mapSheetList").append(row);
  }
}
async function loadMapSheetImage(file, id) {
  if (!file || !canEditMap()) return;
  requireThat(/^image\/(png|jpeg|webp|gif|bmp|avif)$/.test(file.type), "Выберите PNG, JPG, WEBP, GIF, BMP или AVIF");
  const src = await new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = src;
  await image.decode();
  if (!canEditMap()) return;
  if (mapData(S).mapPlacements.some((row) => row.map_id === id) &&
    !confirm("Заменить подложку? Отметки сохранят относительные координаты.")) return;
  await execute("atlasImage", {id,image:{src,w:image.naturalWidth,h:image.naturalHeight,name:file.name}});
  if (activeSheet === id) {
    resetView();
    rememberMapView();
    drawMap();
  }
  toast("Подложка сохранена");
}
function placeExistingOnMap(pos) {
  const rows = S.nodes.filter((place) => !placedNode(place.id));
  if (!rows.length) return toast("Все места уже размещены. Можно добавить новое место.");
  commandForm("Разместить существующее место",
    pick("Место из базы","mapPlaceId",pairs(rows),rows[0].id),
    "atlasPlacement", () => ({node_id:val("mapPlaceId"),map_id:activeSheet,...pos}), "Разместить");
}
function editPlacement(id) {
  const p = placedNode(id);
  if (!canEditMap() || !p) return;
  commandForm("Отметка на этой карте",
    input("Размер иконки, %","pointScale","number",p.scale || 100,'min="50" max="200" required') +
    pick("Подпись", "pointLabels", [["","Как на карте"],["always","Всегда"],["hover","При наведении или выборе"],["never","Скрывать"]], p.labels || "") +
    pick("Дочерняя карта", "pointChild", [["","Без ссылки"],...pairs(availableMaps().filter((m) => sheetParent(m) === activeSheet))],p.child_id || "") +
    check("Скрыть отметку от игроков","pointHidden",p.hidden), "atlasPlacement",
    () => ({node_id:id,map_id:p.map_id,x:p.x,y:p.y,
      display:{scale:num("pointScale"),labels:val("pointLabels"),hidden:$("pointHidden").checked,child_id:val("pointChild")}}));
}
function editPlaceRegion(id) {
  const place = node(id);
  if (!canEditMap() || !place) return;
  commandForm("Регион места", pick("Определение региона","mapPlaceRegion",
    [["","Автоматически по границе"],...pairs(S.engine.regions)],place.regionId || ""),
    "atlasPlaceRegion", () => ({id,region:val("mapPlaceRegion")}));
}
function removeMapPlacement(id) {
  if (!canEditMap() || !confirm("Убрать только отметку и связанные линии с этой карты? Само место останется в базе.")) return;
  selected = null;
  return execute("atlasPlacement",{node_id:id,map_id:activeSheet,remove:true}).catch((error) => toast(error.message));
}
function showExistingMapRoute() {
  const paths = S.routes.filter((r) => !drawnRoute(r.id) && placedNode(r.a) && placedNode(r.b));
  if (!paths.length) return toast("Нет маршрутов для добавления. Сначала разместите оба конца маршрута.");
  commandForm("Показать существующий маршрут",pick("Маршрут","mapRouteId",paths.map((r) => [r.id,routeLabel(r)]),paths[0].id),
    "atlasGeometry", () => ({route_id:val("mapRouteId"),map_id:activeSheet,points:[]}), "Показать маршрут");
}
function linkedMapActions(kind, id) {
  const rows = availableMaps();
  const link = kind === "node" && placedNode(id)?.child_id;
  return rows.filter((map) => map.id !== activeSheet && (map.id === link || map[kind+"_id"] === id))
    .map((map) => visualAction("Открыть карту «"+map.name+"»","switchMapSheet("+jsid(map.id)+")")).join("");
}
