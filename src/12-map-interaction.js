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
  const value = Number(localStorage.getItem("atlas-marker-size"));
  return [80, 100, 125, 150].includes(value) ? value : 100;
}
function mapOptions() {
  form("Масштаб маркеров", pick("Размер маркеров", "mapMarkerScale",
    [80, 100, 125, 150].map((size) => [size, size + "%"]), mapMarkerScale()), () => {
    localStorage.setItem("atlas-marker-size", val("mapMarkerScale"));
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
    [a.engine?.regions, b.engine?.regions]].some(([left, right]) => JSON.stringify(left) !== JSON.stringify(right));
}
function canUndoMap() {
  const previous = uxUndo.at(-1)?.data;
  return canEditMap() && !!previous && mapGeometryChanged(S, previous);
}
function undoMap() {
  if (!canUndoMap()) return;
  const previousView = view, previousSelection = selected;
  uxRestore();
  view = previousView;
  if (previousSelection && (previousSelection.type === "node" ? node(previousSelection.id) : route(previousSelection.id)))
    selected = previousSelection;
  drawMap();
  renderSidebar();
}
function renderMap() {
  if (!view) resetView();
  cancelMapGesture(false);
  const edit = canEditMap();
  const tools = kitLink("Настроить маркеры", "mapOptions()", "map") +
    visualAction(S.settings.showLabels ? "Скрыть подписи" : "Показать подписи", "toggleLabels()") +
    visualAction(S.settings.showQuests === false ? "Показать задания" : "Скрыть задания", "toggleQuestMarkers()") +
    (edit ? visualAction("Запереть редактирование", "setMapLock(true)") +
      visualAction("Загрузить карту", "$('mapFile').click()") +
      (!S.nodes.length ? visualAction("Пример", "loadDemo()") : "") +
      visualAction("Создать регион", "regionForm()") + visualAction("Нарисовать границу", "drawRegion()") +
      (S.engine.regions.length ? visualAction("Изменить регион", "editRegionList()") : "") : "");
  $("main").innerHTML = `<div class="map-layout interaction-map">
    ${sectionHeader("Карта Азерота", "", canTravel() && !S.journey && !currentStay(S) && S.company.location
      ? kitLink("Отправиться в путь", "choosePartyRoute()", "map", "primary") : "")}
    <section class="map-main">
      <div class="toolbar map-tools" id="engineActions">
        ${edit ? '<button class="primary" id="mapAdd" onclick="setTool(tool===\'node\'?\'select\':\'node\')">Добавить место</button>' +
          '<button id="mapRoute" onclick="setTool(tool===\'route\'?\'select\':\'route\')">Соединить места</button>' +
          '<button id="mapUndo" onclick="undoMap()" ' + (canUndoMap() ? "" : 'disabled title="Последнее действие не изменяло карту"') + '>Отменить</button>' : ""}
        ${!player && !edit ? visualAction("Разрешить редактирование", "setMapLock(false)") : ""}
        ${visualMenu("Настройки карты", tools)}
      </div>
      <div class="mapframe" id="mapframe"><svg id="mapsvg" xmlns="http://www.w3.org/2000/svg" aria-label="Интерактивная карта мира"></svg>
        <div class="zoom"><button onclick="zoomBy(1.25)" aria-label="Приблизить">+</button>
        <button onclick="zoomBy(1/1.25)" aria-label="Отдалить">−</button>
        <button onclick="resetView();drawMap()" aria-label="Вся карта">⌂</button></div>
        <div class="map-context" id="mapContext" hidden></div>
      </div><p class="map-status" id="maphint" role="status"></p>
    </section><aside class="sidebar" id="sidebar" aria-label="Инспектор карты"></aside></div>`;
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
  if (tool === "node") return "Выберите точку для нового места";
  if (tool === "route") return routeStart ? "Выберите второе место · " + nameOf(routeStart) : "Выберите первое место";
  return "Перетащите маркер или его соединитель. Правый клик или долгое нажатие открывают меню.";
}
function mapNodePosition(node, w, h) {
  const p = mapGesture?.position && mapGesture.node === node.id ? mapGesture.position : node;
  return { x: p.x * w, y: p.y * h };
}
function mapPath(r, siblings, w, h) {
  const [a, b] = [r.a, r.b].sort().map((id) => mapNodePosition(node(id), w, h));
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
  const index = siblings.indexOf(r), spacing = index - (siblings.length - 1) / 2;
  const offset = spacing * Math.min(85, length * .52);
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
      stroke-dasharray="${dash ? dash.split(" ").map((v) => n(v) * scale).join(" ") : ""}" stroke-linecap="round" pointer-events="none"/>
    ${S.settings.showLabels ? `<g transform="translate(${geo.x} ${geo.y}) scale(${scale})" pointer-events="none"><rect x="-25" y="-8" width="50" height="16" rx="4" fill="#17231f"/>
    <text y="4" text-anchor="middle" fill="${color}" font-size="10">${route.min === route.max ? route.min : route.min + "–" + route.max} д.</text></g>` : ""}</g>`;
}
function mapMarkerDrawing(a, w, h, scale) {
  const p = mapNodePosition(a, w, h), active = selected?.type === "node" && selected.id === a.id;
  const origin = routeStart === a.id, local = a.id === S.company.location;
  const rumor = player && a.visibility === "rumor";
  const coord = scale * mapMarkerScale() / 100;
  const color = safeColor(player && faction(a.faction)?.hidden ? "#a79668" : faction(a.faction)?.color);
  const base = iconPath(mapTypeIcons[a.type] || mapTypeIcons.other);
  const image = rumor ? "" : safeImage(a.markerImage) || iconPath(a.iconId) || base;
  return `<g class="node-hit${active ? " selected" : ""}" data-node="${esc(a.id)}" role="button" tabindex="0"
    aria-label="${esc(a.name)}" transform="translate(${p.x} ${p.y}) scale(${coord})">
    ${local ? '<circle r="23" fill="none" stroke="#fff0b7" stroke-width="2" stroke-dasharray="4 3"/>' : ""}
    <rect x="-18" y="-18" width="36" height="36" rx="8" fill="#121d16" stroke="${active || origin ? "#ffe0a1" : color}" stroke-width="${active || origin ? 3 : 2}" ${a.visibility === "rumor" ? 'stroke-dasharray="4 2"' : ""}/>
    <text x="0" y="5" font-size="16" fill="#fff0cf" text-anchor="middle" pointer-events="none">${esc(rumor ? "?" : type(a.type)[1])}</text>
    ${image ? `<image class="map-marker-image" href="${esc(image)}" data-icon-fallback="${esc(base)}" x="-14" y="-14" width="28" height="28" pointer-events="none"/>` : ""}
    ${questMapMarks(a, 1)}
    ${canEditMap() && active && tool !== "node" ? `<g data-connect="${esc(a.id)}" class="map-connector" role="button" tabindex="0" aria-label="Соединить с другим местом" transform="translate(27 16)">
      <circle r="13" fill="transparent"/><circle r="8" fill="#e0bc75" stroke="#171f16" stroke-width="1.5"/>
      <path d="M-3 0H3M0 -3V3" stroke="#192015" stroke-width="1.7" pointer-events="none"/></g>` : ""}
    ${S.settings.showLabels ? `<text class="map-label" style="stroke-width:3px" y="${local ? 37 : 31}" text-anchor="middle" font-size="13" pointer-events="none">${esc(a.name)}${!player && a.visibility === "hidden" ? " · скрыто" : ""}</text>` : ""}
  </g>`;
}
function drawMap() {
  const svg = $("mapsvg");
  if (!svg) return;
  const { w, h } = dims();
  svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  const scale = 1 / (Math.abs(svg.getScreenCTM()?.a) || 1);
  const routes = S.routes.filter(visibleRoute);
  const groups = new Map();
  for (const r of routes) {
    const key = pairKey(r.a, r.b);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const start = routeStart && node(routeStart);
  const p = start && mapNodePosition(start, w, h);
  const preview = p && mapPreview ? `<path class="map-route-preview" d="M${p.x} ${p.y} L${mapPreview.x} ${mapPreview.y}"
    stroke="#fbe2a0" stroke-width="${3 * scale}" stroke-dasharray="${6 * scale} ${5 * scale}" fill="none" pointer-events="none"/>` : "";
  const background = S.map ? `<image href="${esc(mapHref())}" width="${w}" height="${h}" preserveAspectRatio="none" pointer-events="none"/>`
    : `<defs><pattern id="mapGrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#a4b59b" stroke-opacity=".18"/></pattern></defs>
      <rect width="${w}" height="${h}" fill="#253932"/><rect width="${w}" height="${h}" fill="url(#mapGrid)"/>
      ${!S.nodes.length ? `<text x="${w / 2}" y="${h / 2}" fill="#a4b59b" text-anchor="middle" font-size="24">КАРТА АЗЕРОТА</text>` : ""}`;
  svg.innerHTML = background + routes.map((r) => mapRouteDrawing(r, groups.get(pairKey(r.a, r.b)), w, h, scale)).join("") +
    preview + S.nodes.filter(visibleNode).map((a) => mapMarkerDrawing(a, w, h, scale)).join("");
  $("maphint").textContent = mapHint();
  $("mapAdd")?.setAttribute("aria-pressed", String(tool === "node"));
  $("mapRoute")?.setAttribute("aria-pressed", String(tool === "route"));
}
function mapPoint(event) {
  const { w, h } = dims(), p = worldPoint(event);
  if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) return null;
  return { x: p.x / w, y: p.y / h };
}
function startMapRoute(id) {
  if (!canEditMap() || !node(id)) return;
  setTool("route");
  routeStart = id;
  selectItem("node", id);
}
function completeMapRoute(id) {
  const origin = routeStart;
  if (!canEditMap() || !origin || origin === id || !node(id)) return;
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
    visualAction("Удалить маршрут", "closeMapContext();deleteRoute(" + jsid(path) + ")", "danger") :
    point ? visualAction("Создать место здесь", "addMapContextPlace()", "primary") : "" : "";
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
  else if (tool === "node" && canEditMap()) {
    const point = mapPoint(event);
    if (point) editNode(null, point);
  } else {
    selected = null;
    drawMap();
    renderSidebar();
  }
}
function bindMap() {
  const svg = $("mapsvg");
  const target = (el, key) => el?.closest("[data-" + key + "]")?.dataset[key];
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
    mapGesture = { svg, pointer: e.pointerId, place, path, connect, move, node: place,
      pan: e.button === 1 || !place && !path && tool !== "node",
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
      const p = worldPoint(e), { w, h } = dims(), place = node(gesture.move);
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
      const place = node(gesture.move);
      if (place.x === gesture.position.x && place.y === gesture.position.y) return drawMap();
      selected = { type: "node", id: gesture.move };
      execute("mapMove", { id: gesture.move, ...gesture.position }).catch((err) => {
        drawMap();
        toast(err.message);
      });
    } else if (!gesture.moved && e.button === 0) mapPick(gesture.place, gesture.path, e);
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
  if (mapGesture) cancelMapGesture();
  else if (!$("mapContext")?.hidden) closeMapContext();
  else if (tool !== "select") setTool("select");
});
