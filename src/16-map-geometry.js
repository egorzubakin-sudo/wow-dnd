function routeCoordinates(r, points, w, h) {
  return [mapNodePosition(node(r.a),w,h), ...points.map(([x,y]) => ({x:x*w,y:y*h})), mapNodePosition(node(r.b),w,h)];
}
function bentMapPath(points, smooth) {
  const xy = ({x,y}) => x+" "+y;
  const middle = (a,b) => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  let path = "M"+xy(points[0]);
  if (!smooth) return path + points.slice(1).map((p) => "L"+xy(p)).join("");
  for (let i=1; i<points.length-1; i++) {
    const entry = middle(points[i-1],points[i]), exit = middle(points[i],points[i+1]);
    path += "L"+xy(entry)+"Q"+xy(points[i])+" "+xy(exit);
  }
  return path+"L"+xy(points.at(-1));
}
function startRoadShape(id) {
  if (!canEditMap() || !drawnRoute(id)) return;
  const row = drawnRoute(id);
  startMapDraft({isRoute:true,id,points:structuredClone(row.points),style:row.style || "line",hidden:row.hidden});
}
function chooseRegionBoundary() {
  if (!canEditMap()) return;
  const rows = S.engine.regions;
  if (!rows.length) return regionForm([],{},true);
  openModal("Граница региона", pick("Регион","regionToDraw",pairs(rows),rows[0].id) + '<div class="actions" id="regionBoundaryTools"></div>');
  $("regionBoundaryTools").append(button("Нарисовать или изменить", () => {
    const id = val("regionToDraw");
    closeModal();
    startRegionShape(id);
  }), button("Создать регион", () => regionForm([],{},true)));
}
function startRegionShape(id) {
  if (!canEditMap()) return;
  const boundary = mapEntry(mapData(S).regionBoundaries,"region_id",id,activeSheet);
  startMapDraft({isRoute:false,id,points:structuredClone(boundary?.points || []),hidden:boundary?.hidden ?? true});
}
function startMapDraft(draft) {
  setTool("select");
  mapDraft = {...draft,map:activeSheet,index:-1,original:JSON.stringify(mapDraftEntry(draft))};
  mapDraftDrag = null;
  renderMap();
}
function mapDraftEntry(draft) {
  return draft.isRoute ? drawnRoute(draft.id) :
    mapEntry(mapData(S).regionBoundaries,"region_id",draft.id,activeSheet);
}
function cancelMapDraft() {
  mapDraft = null;
  mapDraftDrag = null;
  renderMap();
}
function mapDraftTools() {
  if (!mapDraft) return "";
  const {isRoute,style,hidden} = mapDraft;
  return '<div class="map-draft-tools"><div class="actions">' +
    visualAction("Сохранить форму","saveMapDraft()","primary") + visualAction("Отмена формы","cancelMapDraft()") +
    visualAction("Удалить выбранную точку","removeDraftPoint()") +
    visualAction(isRoute ? "Выпрямить" : "Начать заново","resetMapDraft()") +
    (!isRoute && mapEntry(mapData(S).regionBoundaries,"region_id",mapDraft.id,activeSheet) ?
      visualAction("Удалить границу","removeMapRepresentation('region',"+jsid(mapDraft.id)+")","danger") : "") + '</div>' +
    (isRoute ? pick("Линия","mapRouteStyle",[["line","Ломаная"],["smooth","Плавная"]],style) : "") +
    check("Скрыть от игроков","mapDraftHidden",hidden) + '</div>';
}
function resetMapDraft() {
  mapDraft.points = [];
  mapDraft.index = -1;
  if (mapDraft.isRoute) mapDraft.style = "line";
  if ($("mapRouteStyle")) $("mapRouteStyle").value = mapDraft.style;
  drawMap();
}
function removeDraftPoint() {
  if (!mapDraft || mapDraft.index < 0) return toast("Выберите точку на карте");
  mapDraft.points.splice(mapDraft.index,1);
  mapDraft.index = -1;
  drawMap();
}
async function saveMapDraft() {
  if (!mapDraft || !canEditMap()) return;
  const draft = mapDraft;
  if (draft.original !== JSON.stringify(mapDraftEntry(draft)))
    return toast("Форма уже изменилась. Откройте редактор заново");
  const fields = {map_id:draft.map,points:draft.points,hidden:draft.hidden};
  mapDraft = null;
  try {
    if (draft.isRoute) await execute("atlasGeometry",{...fields,route_id:draft.id,style:draft.style});
    else await execute("atlasBoundary",{...fields,region_id:draft.id});
  } catch (error) {
    if (draft.map === activeSheet) mapDraft = draft;
    renderMap();
    toast(error.message);
  }
}
async function removeMapRepresentation(kind,id) {
  if (!canEditMap() || !confirm("Убрать это представление с текущей карты?")) return;
  const isRoute = kind === "route";
  try {
    await execute(isRoute ? "atlasGeometry" : "atlasBoundary",
      {map_id:activeSheet,[isRoute ? "route_id" : "region_id"]:id,remove:true});
    if (mapDraft) cancelMapDraft();
  } catch (error) {
    toast(error.message);
  }
}
function mapRegionsMarkup(w,h,scale) {
  return mapData(S).regionBoundaries.filter((row) => row.map_id === activeSheet &&
    (player ? !row.hidden : layerOn("secrets") || !row.hidden))
    .map((row) => {
      const region = S.engine.regions.find((r) => r.id === row.region_id);
      if (!region || (player && region.hidden) || mapDraft && !mapDraft.isRoute && mapDraft.id === region.id) return "";
      const points = row.points.map(([x,y]) => (x*w)+","+(y*h)).join(" ");
      const [x,y] = row.points.reduce(([x,y],[u,v]) => [x+u*w/row.points.length,y+v*h/row.points.length],[0,0]);
      const danger = layerOn("danger") && region.danger;
      const loot = layerOn("resources") && S.engine.loot?.some((r) => r.region_id === region.id && !r.hidden);
      const label = (layerOn("regions") ? region.name : "") + (danger ? " ⚠" : "") + (loot ? " ✦" : "");
      return (layerOn("regions") || danger ?
        '<polygon points="'+points+'" fill="'+(danger ? "#bc593a44" : "#cea25330")+'" stroke="'+(danger ? "#cd8162" : "#d2ad67")+
        '" stroke-width="'+scale+'" pointer-events="none"/>' : "") +
        (label ? '<text data-map-region="'+esc(region.id)+'" transform="translate('+x+' '+y+') scale('+scale+
          ')" text-anchor="middle" class="map-region-label" role="button" tabindex="0"><title>'+
          esc([region.name,danger,loot ? "Есть ресурсы" : ""].filter(Boolean).join(" · "))+'</title>'+esc(label)+'</text>' : "");
    }).join("");
}
function mapDraftMarkup(w,h,scale) {
  if (!mapDraft) return "";
  const points = mapDraft.points.map(([x,y]) => (x*w)+","+(y*h));
  return (!mapDraft.isRoute ?
    '<polygon points="'+points.join(" ")+'" stroke="#ffe39a" stroke-width="'+2*scale+'" fill="#ffd47538" pointer-events="none"/>' : "") +
    points.map((pos,i) => '<g data-bend="'+i+'" role="button" tabindex="0" aria-label="Точка '+(i+1)+
      '" transform="translate('+pos.replace(","," ")+') scale('+scale+')"><circle r="15" fill="transparent"/>'+
      '<circle r="7" fill="'+(mapDraft.index === i ? "#fff1ae" : "#c7924e")+'" stroke="#1d2018" stroke-width="2"/></g>').join("");
}
function addDraftPoint(point) {
  if (mapDraft.points.length >= 256) return toast("Достигнут предел точек");
  let index = mapDraft.points.length;
  if (mapDraft.isRoute && index) {
    const {w,h} = dims(), path = routeCoordinates(route(mapDraft.id),mapDraft.points,w,h);
    let distance = Infinity;
    for (let i=0; i<path.length-1; i++) {
      const a = path[i], b = path[i+1], dx=b.x-a.x, dy=b.y-a.y;
      const t = clamp(((point.x*w-a.x)*dx+(point.y*h-a.y)*dy)/(dx*dx+dy*dy || 1),0,1);
      const d = Math.hypot(point.x*w-a.x-t*dx,point.y*h-a.y-t*dy);
      if (d < distance) { distance=d; index=i; }
    }
  }
  mapDraft.points.splice(index,0,[point.x,point.y]);
  mapDraft.index=index;
}
function bindMapDraft(svg) {
  const capture = (fn) => (e) => {
    if (!mapDraft) return;
    e.stopImmediatePropagation();
    fn(e);
  };
  const bend = (el) => {
    const id = el.closest("[data-bend]")?.dataset.bend;
    return id == null ? -1 : Number(id);
  };
  svg.addEventListener("pointerdown",capture((e) => {
    if (e.button !== 0 || !canEditMap() || mapDraftDrag) return;
    const index = bend(e.target);
    mapDraftDrag = {id:e.pointerId,index,x:e.clientX,y:e.clientY,original:mapDraft.points[index]};
    if (index >= 0) mapDraft.index = index;
    svg.setPointerCapture(e.pointerId);
  }),true);
  svg.addEventListener("pointermove",capture((e) => {
    const drag = mapDraftDrag, p = mapPoint(e);
    if (!drag || drag.id !== e.pointerId || drag.index < 0 || !p) return;
    mapDraft.points[drag.index]=[p.x,p.y];
    drawMap();
  }),true);
  svg.addEventListener("pointerup",capture((e) => {
    const drag = mapDraftDrag;
    if (!drag || drag.id !== e.pointerId) return;
    mapDraftDrag = null;
    const p = mapPoint(e);
    if (drag.index < 0 && p && Math.hypot(e.clientX-drag.x,e.clientY-drag.y) < 6) addDraftPoint(p);
    drawMap();
  }),true);
  for (const type of ["pointercancel","lostpointercapture"]) svg.addEventListener(type,capture((e) => {
    const drag = mapDraftDrag;
    if (!drag || drag.id !== e.pointerId) return;
    mapDraftDrag = null;
    if (drag.index >= 0) mapDraft.points[drag.index]=drag.original;
    drawMap();
  }),true);
  svg.addEventListener("contextmenu",capture((e) => e.preventDefault()),true);
  svg.addEventListener("keydown",capture((e) => {
    const i = bend(e.target);
    if (i < 0 || !["Enter"," ","Delete","Backspace"].includes(e.key)) return;
    e.preventDefault();
    mapDraft.index = i;
    if (e.key === "Delete" || e.key === "Backspace") removeDraftPoint();
    else drawMap();
    svg.querySelector('[data-bend="'+i+'"]')?.focus();
  }),true);
}
function renderMapRegion(id) {
  const region = S.engine.regions.find((r) => r.id === id);
  if (!region || player && region.hidden) return;
  const places = S.nodes.filter((n) => visiblePlacement(n,placedNode(n.id)) && regionAt(S,n)?.id === id);
  $("sidebar").innerHTML = '<div class="side-inner"><section class="section"><h2>'+esc(region.name)+'</h2>'+
    (region.description ? '<p>'+esc(region.description)+'</p>' : "") +
    '<div class="actions">'+linkedMapActions("region",id)+
    (canEditMap() ? visualAction("Изменить границу","startRegionShape("+jsid(id)+")") : "")+'</div>'+
    '<h3>Места на этой карте</h3>'+ (places.length ? places.map((p) =>
      visualAction(p.name,"focusMapPlace("+jsid(p.id)+")")).join("") : '<p>Пока нет мест в этом регионе.</p>')+'</section></div>';
}
