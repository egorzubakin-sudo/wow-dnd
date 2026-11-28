const mapTypeIcons = {
  city: "places:Ironforge", fort: "places:Blackrock_01", village: "places:goldshire",
  camp: "places:Barrens_01", port: "places:HowlingFjord_03", pass: "places:DeadwindPass",
  dungeon: "places:HellfirePeninsula_01", ruin: "places:Azshara_01", forest: "places:ElwynnForest",
  battle: "places:BurningSteppes_01", shrine: "places:IsleOfQuelDanas", other: "misc:Map_01",
};
let mapGesture = null, mapPreview = null, mapMenuPoint = null;
function canEditMap() {
  return !player && actor?.role === "master" && !S.settings.mapLocked;
}
function mapMarkerScale() {
  const value = Number(mapPreferences()[1].scale ?? localStorage.getItem("atlas-marker-size"));
  return [80, 100, 125, 150].includes(value) ? value : 100;
}
function mapOptions() {
  form("Масштаб маркеров", pick("Размер маркеров", "mapMarkerScale",
    [80, 100, 125, 150].map((size) => [size, size + "%"]), mapMarkerScale()), () => {
    saveMapPreferences({scale:num("mapMarkerScale")});
    drawMap();
  });
}
function setMapLock(locked) {
  if (player || actor.role !== "master") return;
  cancelMapGesture();
  tool = "select";
  routeStart = null;
  S.settings.mapLocked = locked;
  uxLast = uxSnapshot();
  save();
  render();
}
function mapGeometryChanged(a, b) {
  return a.map?.src !== b.map?.src || [[a.nodes, b.nodes], [a.routes, b.routes],
    [a.engine?.regions, b.engine?.regions], ...mapTables.map((key) => [a.engine?.[key], b.engine?.[key]])].some(([left, right]) => JSON.stringify(left) !== JSON.stringify(right));
}
function canUndoMap() {
  const previous = uxUndo.at(-1)?.data;
  return canEditMap() && (sharedGame?.canUndoMapEdit() || !!previous && mapGeometryChanged(S, previous));
}
function undoMap() {
  if (!canUndoMap()) return;
  if (sharedGame?.canUndoMapEdit()) return execute("atlasUndo",{}).catch((error) => toast(error.message));
  const previousView = view, previousSelection = selected;
  uxRestore();
  view = previousView;
  if (previousSelection && (previousSelection.type === "node" ? node(previousSelection.id) : route(previousSelection.id)))
    selected = previousSelection;
  drawMap();
  renderSidebar();
}
function renderMap() {
  adjustActiveSheet();
  const edit = canEditMap();
  if (!edit || mapDraft?.isRoute && !drawnRoute(mapDraft.id)) mapDraft = null;
  if (!view) restoreMapView();
  cancelMapGesture(false);
  const tools = kitLink("Настроить маркеры", "mapOptions()", "map") +
    visualAction("Слои и подписи", "mapLayerOptions()") +
    visualAction(S.settings.showLabels ? "Скрыть подписи" : "Показать подписи", "toggleLabels()") +
    visualAction(S.settings.showQuests === false ? "Показать задания" : "Скрыть задания", "toggleQuestMarkers()") +
    (edit ? visualAction("Запереть редактирование", "setMapLock(true)") +
      visualAction("Загрузить карту", "$('mapFile').click()") +
      visualAction("Карты Атласа", "manageMapSheets()") +
      visualAction("Настройки этой карты", "mapSheetForm(" + jsid(activeSheet) + ")") +
      (!S.nodes.length && activeSheet === overviewMap ? visualAction("Пример", "loadDemo()") : "") +
      visualAction("Создать регион", "regionForm()") + visualAction("Нарисовать границу", "chooseRegionBoundary()") +
      (S.engine.regions.length ? visualAction("Изменить регион", "editRegionList()") : "") : "");
  $("main").innerHTML = `<div class="map-layout interaction-map">
    ${sectionHeader(currentSheet().name, currentSheet().desc || "", canTravel() && !S.journey && !currentStay(S) && S.company.location
      ? kitLink("Отправиться в путь", "choosePartyRoute()", "map", "primary") : "")}
    <section class="map-main">
      ${mapNavigation()}
      <div class="toolbar map-tools" id="engineActions">
        ${edit && !mapDraft ? '<button class="primary" id="mapAdd" onclick="setTool(tool===\'node\'?\'select\':\'node\')">Добавить место</button>' +
          '<button id="mapRoute" onclick="setTool(tool===\'route\'?\'select\':\'route\')">Соединить места</button>' +
          visualAction("Разместить место", "setTool(tool==='place'?'select':'place')") +
          visualAction("Показать маршрут", "showExistingMapRoute()") +
          '<button id="mapUndo" onclick="undoMap()" ' + (canUndoMap() ? "" : 'disabled title="Последнее действие не изменяло карту"') + '>Отменить</button>' : ""}
        ${!player && !edit ? visualAction("Разрешить редактирование", "setMapLock(false)") : ""}
        ${!mapDraft ? visualMenu("Настройки карты", tools) : ""}
      </div>
      ${mapDraftTools()}
      <div class="mapframe" id="mapframe"><svg id="mapsvg" xmlns="http://www.w3.org/2000/svg" aria-label="Интерактивная карта мира"></svg>
        <div class="zoom"><button onclick="zoomBy(1.25)" aria-label="Приблизить">+</button>
        <button onclick="zoomBy(1/1.25)" aria-label="Отдалить">−</button>
        <button onclick="resetView();rememberMapView();drawMap()" aria-label="Вся карта">⌂</button></div>
        <div class="map-context" id="mapContext" hidden></div>
      </div><p class="map-status" id="maphint" role="status"></p>
    </section><aside class="sidebar" id="sidebar" aria-label="Инспектор карты"></aside></div>`;
  if ($("atlasSheetPicker")) $("atlasSheetPicker").onchange = (e) => switchMapSheet(e.target.value);
  if ($("mapRouteStyle")) $("mapRouteStyle").onchange = (e) => { mapDraft.style = e.target.value; drawMap(); };
  if ($("mapDraftHidden")) $("mapDraftHidden").onchange = (e) => { mapDraft.hidden = e.target.checked; };
  drawMap();
  bindMap();
  renderSidebar();
}
function setTool(mode) {
  if (!canEditMap()) return;
  cancelMapGesture(false);
  tool = mode;
  routeStart = null;
  mapMenuPoint = null;
  if ($("mapContext")) $("mapContext").hidden = true;
  drawMap();
}
function mapHint() {
  if (!canEditMap()) return !player && S.settings.mapLocked ? "Редактирование карты заперто" : "Выберите место или маршрут";
  if (mapDraft) return mapDraft.isRoute
    ? "Коснитесь карты, чтобы добавить точку. Перетащите точку для изменения формы."
    : "Отметьте вершины границы по порядку. Места внутри области определятся автоматически.";
  if (tool === "node") return "Выберите точку для нового места";
  if (tool === "place") return "Выберите точку для отметки существующего места";
  if (tool === "route") return routeStart ? "Выберите второе место · " + nameOf(routeStart) : "Выберите первое место";
  return "Перетащите маркер или его соединитель. Правый клик или долгое нажатие открывают меню.";
}
function mapNodePosition(node, w, h) {
  const p = mapGesture?.position && mapGesture.node === node.id ? mapGesture.position : placedNode(node.id);
  return { x: p.x * w, y: p.y * h };
}
function mapPath(r, siblings, w, h) {
  const geometry = mapDraft?.isRoute && mapDraft.id === r.id ? mapDraft : drawnRoute(r.id);
  if (geometry.points.length) {
    const points = routeCoordinates(r,geometry.points,w,h);
    const middle = points[Math.floor(points.length/2)];
    return {path:bentMapPath(points,geometry.style === "smooth"), x:middle.x, y:middle.y};
  }
  const [a, b] = [r.a, r.b].sort().map((id) => mapNodePosition(node(id), w, h));
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
  const index = siblings.indexOf(r), spacing = index - (siblings.length - 1) / 2;
  const offset = geometry.style === "line" ? 0 : spacing * Math.min(85, length * .52);
  const cx = (a.x + b.x) / 2 - dy / length * offset;
  const cy = (a.y + b.y) / 2 + dx / length * offset;
  const t = clamp(.5 + spacing * .09, .24, .76), u = 1 - t;
  return { path: `M${a.x} ${a.y}Q${cx} ${cy} ${b.x} ${b.y}`,
    x: u*u*a.x + 2*u*t*cx + t*t*b.x, y: u*u*a.y + 2*u*t*cy + t*t*b.y };
}
function mapRouteDrawing(route, siblings, w, h, scale) {
  const geo = mapPath(route, siblings, w, h);
  const active = selected?.type === "route" && selected.id === route.id;
  const closed = route.status === "closed", k = kind(route.kind);
  const color = closed ? "#d47d71" : active ? "#fff0b7" : k[2];
  const dash = closed ? "4 5" : route.visibility === "rumor" ? "3 6" : k[3];
  return `<g class="route-hit" data-route="${esc(route.id)}" role="button" tabindex="0" aria-label="${esc(routeLabel(route))}">
    <path d="${geo.path}" fill="none" stroke="transparent" stroke-width="${20 * scale}"/>
    <path class="visibleline" d="${geo.path}" fill="none" stroke="${color}" stroke-width="${(active ? 4 : 2.6) * scale}"
      stroke-dasharray="${dash ? dash.split(" ").map((v) => n(v) * scale).join(" ") : ""}" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>
    ${S.settings.showLabels ? `<g transform="translate(${geo.x} ${geo.y}) scale(${scale})" pointer-events="none"><rect x="-25" y="-8" width="50" height="16" rx="4" fill="#17231f"/>
    <text y="4" text-anchor="middle" fill="${color}" font-size="10">${route.min === route.max ? route.min : route.min + "–" + route.max} д.</text></g>` : ""}</g>`;
}
function mapMarkerDrawing(a, w, h, scale) {
  const p = mapNodePosition(a, w, h), active = selected?.type === "node" && selected.id === a.id;
  const origin = routeStart === a.id, local = a.id === S.company.location;
  const rumor = player && a.visibility === "rumor";
  const placement = placedNode(a.id), labels = mapMarkerLabels(placement);
  const coord = scale * mapMarkerScale() * (placement.scale || 100) / 10000;
  const color = safeColor(player && faction(a.faction)?.hidden ? "#a79668" : faction(a.faction)?.color);
  const base = iconPath(mapTypeIcons[a.type] || mapTypeIcons.other);
  const image = rumor ? "" : safeImage(a.markerImage) || iconPath(a.iconId) || base;
  return `<g class="node-hit${active ? " selected" : ""}" data-node="${esc(a.id)}" role="button" tabindex="0"
    aria-label="${esc(a.name)}" transform="translate(${p.x} ${p.y}) scale(${coord})">
    ${local ? '<circle r="23" fill="none" stroke="#fff0b7" stroke-width="2" stroke-dasharray="4 3"/>' : ""}
    <rect x="-18" y="-18" width="36" height="36" rx="8" fill="#121d16" stroke="${active || origin ? "#ffe0a1" : color}" stroke-width="${active || origin ? 3 : 2}" ${a.visibility === "rumor" ? 'stroke-dasharray="4 2"' : ""}/>
    <text x="0" y="5" font-size="16" fill="#fff0cf" text-anchor="middle" pointer-events="none">${esc(rumor ? "?" : type(a.type)[1])}</text>
    ${image ? `<image class="map-marker-image" href="${esc(image)}" data-icon-fallback="${esc(base)}" x="-14" y="-14" width="28" height="28" pointer-events="none"/>` : ""}
    ${layerOn("quests") ? questMapMarks(a, 1) : ""}
    ${canEditMap() && active && tool !== "node" ? `<g data-connect="${esc(a.id)}" class="map-connector" role="button" tabindex="0" aria-label="Соединить с другим местом" transform="translate(27 16)">
      <circle r="13" fill="transparent"/><circle r="8" fill="#e0bc75" stroke="#171f16" stroke-width="1.5"/>
      <path d="M-3 0H3M0 -3V3" stroke="#192015" stroke-width="1.7" pointer-events="none"/></g>` : ""}
    ${labels !== "never" ? `<text class="map-label${labels === "hover" ? " map-hover-label" : ""}" style="stroke-width:3px" y="${local ? 37 : 31}" text-anchor="middle" font-size="13" pointer-events="none">${esc(a.name)}${!player && a.visibility === "hidden" ? " · скрыто" : ""}</text>` : ""}
  </g>`;
}
function drawMap() {
  const svg = $("mapsvg");
  if (!svg) return;
  const { w, h } = dims();
  svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  const scale = 1 / (Math.abs(svg.getScreenCTM()?.a) || 1);
  const placed = S.nodes.filter((place) => visiblePlacement(place,placedNode(place.id)));
  const places = placed.filter((place) => layerOn(markerLayer(place)) || selected?.type === "node" && selected.id === place.id);
  const visible = new Set(placed.map((place) => place.id));
  const routes = S.routes.filter((r) => {
    const geometry = drawnRoute(r.id);
    if (!geometry || !visibleRoute(r) || !visible.has(r.a) || !visible.has(r.b)) return false;
    return (mapDraft?.isRoute && mapDraft.id === r.id || layerOn("routes")) &&
      (player ? !geometry.hidden && !r.hidden : layerOn("secrets") || !geometry.hidden && !r.hidden && r.visibility !== "hidden");
  });
  const groups = new Map();
  for (const r of routes) {
    const key = pairKey(r.a, r.b);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const start = routeStart && visible.has(routeStart) && node(routeStart);
  const p = start && mapNodePosition(start, w, h);
  const preview = p && mapPreview ? `<path class="map-route-preview" d="M${p.x} ${p.y} L${mapPreview.x} ${mapPreview.y}"
    stroke="#fbe2a0" stroke-width="${3 * scale}" stroke-dasharray="${6 * scale} ${5 * scale}" fill="none" pointer-events="none"/>` : "";
  const href = mapHref();
  const background = href ? `<image href="${esc(href)}" width="${w}" height="${h}" preserveAspectRatio="none" pointer-events="none"/>`
    : `<defs><pattern id="mapGrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#a4b59b" stroke-opacity=".18"/></pattern></defs>
      <rect width="${w}" height="${h}" fill="#253932"/><rect width="${w}" height="${h}" fill="url(#mapGrid)"/>
      ${!places.length ? `<text x="${w / 2}" y="${h / 2}" fill="#a4b59b" text-anchor="middle" font-size="24">${esc(currentSheet().name)}</text>` : ""}`;
  svg.innerHTML = background + mapRegionsMarkup(w,h,scale) + routes.map((r) => mapRouteDrawing(r, groups.get(pairKey(r.a, r.b)), w, h, scale)).join("") +
    preview + places.map((a) => mapMarkerDrawing(a, w, h, scale)).join("") + mapDraftMarkup(w,h,scale);
  const hint = $("maphint"), ref = currentMapImage()?.src;
  hint.textContent = mapHint();
  if (!href && sharedGame && remoteMediaRef(ref)) {
    if (sharedGame.imageFailed(ref)) {
      hint.textContent = "Подложка не загрузилась. ";
      hint.append(button("Повторить загрузку карты", () => {
        sharedGame.image(ref, true);
        drawMap();
      }));
    } else {
      hint.textContent = "Загружаем подложку карты…";
    }
  }
  $("mapAdd")?.setAttribute("aria-pressed", String(tool === "node"));
  $("mapRoute")?.setAttribute("aria-pressed", String(tool === "route"));
}
function mapPoint(event) {
  const { w, h } = dims(), p = worldPoint(event);
  if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) return null;
  return { x: p.x / w, y: p.y / h };
}
function startMapRoute(id) {
  if (!canEditMap() || !placedNode(id)) return;
  setTool("route");
  routeStart = id;
  selectItem("node", id);
}
function completeMapRoute(id) {
  const origin = routeStart;
  if (!canEditMap() || !origin || origin === id || !placedNode(id)) return;
  setTool("select");
  editRoute(null, origin, id);
}
function closeMapContext() {
  if ($("mapContext")) $("mapContext").hidden = true;
  mapMenuPoint = null;
}
function addMapContextPlace() {
  const point = mapMenuPoint;
  closeMapContext();
  if (canEditMap() && point) editNode(null, point);
}
function mapNodeActions(id, context = false) {
  const args = jsid(id);
  const close = context ? "closeMapContext();" : "";
  return visualAction("Изменить место", close + "editNode(" + args + ")") +
    visualAction("Отметка на карте", close + "editPlacement(" + args + ")") +
    visualAction("Регион места", close + "editPlaceRegion(" + args + ")") +
    visualAction("Убрать отметку", close + "removeMapPlacement(" + args + ")") +
    visualAction("Иконка места", close + "pickMapIcon(" + args + ")") +
    visualAction("Соединить с другим местом", close + "startMapRoute(" + args + ")") +
    visualAction("Иллюстрация места", close + "editPlaceArt(" + args + ")") +
    visualAction("Удалить место", close + "deleteNode(" + args + ")", "danger");
}
function showMapContext(event, place, path) {
  const el = $("mapContext");
  const point = mapPoint(event);
  if (!el) return;
  if (place || path) selectItem(place ? "node" : "route", place || path);
  mapMenuPoint = point;
  const actions = canEditMap() ? place ? mapNodeActions(place, true) : path ?
    visualAction("Изменить маршрут", "closeMapContext();editRoute(" + jsid(path) + ")") +
    visualAction("Изменить форму дороги", "closeMapContext();startRoadShape(" + jsid(path) + ")") +
    visualAction("Убрать линию с карты", "closeMapContext();removeMapRepresentation('route'," + jsid(path) + ")") +
    visualAction("Удалить маршрут", "closeMapContext();deleteRoute(" + jsid(path) + ")", "danger") :
    point ? visualAction("Создать место здесь", "addMapContextPlace()", "primary") +
      visualAction("Разместить место из базы", "placeExistingOnMap(mapMenuPoint);closeMapContext()") : "" : "";
  if (!actions) return;
  el.innerHTML = actions;
  const rect = $("mapframe").getBoundingClientRect();
  el.hidden = false;
  el.style.left = clamp((event.clientX - rect.left) * $("mapframe").clientWidth / rect.width, 0,
    Math.max(0, $("mapframe").clientWidth - el.offsetWidth - 6)) + "px";
  el.style.top = clamp((event.clientY - rect.top) * $("mapframe").clientHeight / rect.height, 0,
    Math.max(0, $("mapframe").clientHeight - el.offsetHeight - 6)) + "px";
  el.querySelector("button")?.focus({ preventScroll: true });
}
function pickMapIcon(id) {
  const place = node(id);
  if (!canEditMap() || !place) return;
  openIconPicker({
    current: { iconId: place.iconId, image: place.markerImage, defaultId: mapTypeIcons[place.type] || mapTypeIcons.other },
    onSave: async ({ iconId, image }) => {
      if (canEditMap()) await execute("mapIcon", { id, iconId, image });
    },
  });
}
function cancelMapGesture(redraw = true) {
  const gesture = mapGesture;
  mapGesture = null;
  if (gesture) {
    clearTimeout(gesture.timer);
    if (gesture.pan) view = gesture.view;
    if (gesture.connect) routeStart = gesture.previousRoute;
    if (redraw && gesture.svg.hasPointerCapture(gesture.pointer))
      gesture.svg.releasePointerCapture(gesture.pointer);
  }
  mapPreview = null;
  if (redraw && $("mapsvg")) drawMap();
}
function mapPick(place, path, event) {
  if (place && canEditMap() && tool === "route") {
    if (!routeStart) startMapRoute(place);
    else if (routeStart === place) setTool("select");
    else completeMapRoute(place);
  } else if (place || path) selectItem(place ? "node" : "route", place || path);
  else if (["node","place"].includes(tool) && canEditMap()) {
    const point = mapPoint(event);
    if (point) (tool === "node" ? editNode(null,point) : placeExistingOnMap(point));
  } else {
    selected = null;
    drawMap();
    renderSidebar();
  }
}
function bindMap() {
  const svg = $("mapsvg");
  bindMapDraft(svg);
  const target = (el, key) => el?.closest("[data-" + key + "]")?.getAttribute("data-" + key);
  const observer = new ResizeObserver(() => {
    if (!svg.isConnected) return observer.disconnect();
    drawMap();
  });
  if (mapResizeObserver) mapResizeObserver.disconnect();
  mapResizeObserver = observer;
  observer.observe(svg);
  svg.addEventListener("error", (event) => {
    const image = event.target;
    if (!image.classList?.contains("map-marker-image")) return;
    const fallback = image.dataset.iconFallback;
    if (fallback && fallback !== image.getAttribute("href")) image.setAttribute("href", fallback);
    else image.remove();
  }, true);
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (!mapGesture) zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18, e);
  }, { passive: false });
  svg.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    cancelMapGesture(false);
    showMapContext(e, target(e.target, "node"), target(e.target, "route"));
  });
  svg.addEventListener("keydown", (e) => {
    if (!["Enter", " ", "ContextMenu"].includes(e.key) && !(e.shiftKey && e.key === "F10")) return;
    const connect = target(e.target, "connect"), place = target(e.target, "node"), path = target(e.target, "route");
    const region = target(e.target, "map-region");
    if (region && ["Enter"," "].includes(e.key)) {
      e.preventDefault();
      return selectItem("region",region);
    }
    if (!place && !path) return;
    e.preventDefault();
    if (e.key === "ContextMenu" || e.shiftKey && e.key === "F10") {
      const rect = e.target.getBoundingClientRect();
      showMapContext({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }, place, path);
    } else if (connect) startMapRoute(connect);
    else mapPick(place, path, e);
    if (!$("modalwrap").classList.contains("open") && $("mapContext").hidden)
      [...svg.querySelectorAll(place ? "[data-node]" : "[data-route]")].find((el) => (el.dataset.node || el.dataset.route) === (place || path))?.focus();
  });
  svg.addEventListener("pointerdown", (e) => {
    if (mapGesture || (e.button !== 0 && e.button !== 1)) return;
    closeMapContext();
    const place = target(e.target, "node"), path = target(e.target, "route");
    const connect = canEditMap() && e.button === 0 && target(e.target, "connect");
    const move = canEditMap() && e.button === 0 && tool === "select" && !connect ? place : "";
    const point = worldPoint(e);
    const region = target(e.target,"map-region");
    mapGesture = { svg, region, pointer: e.pointerId, place, path, connect, move, node: place,
      pan: e.button === 1 || !place && !path && !region && !["node","place"].includes(tool),
      x: e.clientX, y: e.clientY, point, view: { ...view }, previousRoute: routeStart, moved: false };
    if (e.pointerType === "touch" && canEditMap()) {
      mapGesture.timer = setTimeout(() => {
        mapGesture.long = true;
        showMapContext(e, place, path);
      }, 500);
    }
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", (e) => {
    const gesture = mapGesture;
    if (!gesture) {
      if (canEditMap() && tool === "route" && routeStart && e.pointerType !== "touch") {
        const marker = target(e.target, "node");
        const { w, h } = dims();
        mapPreview = marker ? mapNodePosition(node(marker), w, h) : worldPoint(e);
        drawMap();
      }
      return;
    }
    if (e.pointerId !== gesture.pointer || gesture.long) return;
    const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 5) return;
    gesture.moved = true;
    clearTimeout(gesture.timer);
    if (gesture.connect && canEditMap()) {
      routeStart = gesture.connect;
      const under = target(document.elementFromPoint(e.clientX, e.clientY), "node");
      const { w, h } = dims();
      mapPreview = under && under !== routeStart ? mapNodePosition(node(under), w, h) : worldPoint(e);
    } else if (gesture.move && canEditMap()) {
      const p = worldPoint(e), { w, h } = dims(), place = placedNode(gesture.move);
      gesture.position = { x: clamp(place.x + (p.x - gesture.point.x) / w, 0, 1),
        y: clamp(place.y + (p.y - gesture.point.y) / h, 0, 1) };
    } else if (gesture.pan) {
      const ctm = svg.getScreenCTM();
      view.x = gesture.view.x - dx / ctm.a;
      view.y = gesture.view.y - dy / ctm.d;
    }
    drawMap();
  });
  svg.addEventListener("pointerup", (e) => {
    const gesture = mapGesture;
    if (!gesture || e.pointerId !== gesture.pointer) return;
    clearTimeout(gesture.timer);
    mapGesture = null;
    mapPreview = null;
    if (gesture.long) return;
    if (gesture.connect) {
      if (!gesture.moved) return startMapRoute(gesture.connect);
      const destination = target(document.elementFromPoint(e.clientX, e.clientY), "node");
      if (destination && destination !== gesture.connect) return completeMapRoute(destination);
      routeStart = gesture.previousRoute;
      drawMap();
    } else if (gesture.position && canEditMap()) {
      const place = placedNode(gesture.move);
      if (place.x === gesture.position.x && place.y === gesture.position.y) return drawMap();
      selected = { type: "node", id: gesture.move };
      const command = activeSheet === overviewMap ? "mapMove" : "atlasPlacement";
      const payload = activeSheet === overviewMap ? {id:gesture.move,...gesture.position} :
        {node_id:gesture.move,map_id:activeSheet,...gesture.position};
      execute(command,payload).catch((err) => {
        drawMap();
        toast(err.message);
      });
    } else if (gesture.moved && gesture.pan) rememberMapView();
    else if (!gesture.moved && e.button === 0) {
      if (gesture.region && !["node","place"].includes(tool)) selectItem("region",gesture.region);
      else mapPick(gesture.place,gesture.path,e);
    }
  });
  const cancel = (e) => {
    if (mapGesture?.pointer === e.pointerId) cancelMapGesture();
  };
  svg.addEventListener("pointercancel", cancel);
  svg.addEventListener("lostpointercapture", cancel);
}
let mapResizeObserver = null;
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || tab !== "map" || $("modalwrap").classList.contains("open")) return;
  if (mapDraft) cancelMapDraft();
  else if (mapGesture) cancelMapGesture();
  else if (!$("mapContext")?.hidden) closeMapContext();
  else if (tool !== "select") setTool("select");
});
