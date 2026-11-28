// The local game stays mounted in the same shell. Only its storage and command boundary change.
const localGameMap = renderMap;
const localGameAccounts = manageUsers;
const localGameCreateUser = createUserDialog;
const localGameAccountMenu = accountMenu;
const localGameExport = exportData;
const localGameMapStart = beginJourney;
const localGameTravelRoll = applyRoll;
const localGameGuideCheck = guideCheck;
const localGameManualRoll = manualRoll;
const localGameEventRoll = rollJourney;

function remoteMediaRef(value) {
  return typeof value === "string" && value.startsWith(atlasStorageReference) &&
    atlasMediaName.test(value.slice(atlasStorageReference.length));
}
function storedImage(value) {
  return sharedGame && remoteMediaRef(value) ? value : safeImage(value);
}
function remoteImageURL(value) {
  return sharedGame && remoteMediaRef(value) ? sharedGame.image(value) : "";
}
renderMap = function () {
  if (sharedGame && player && !sharedGame.shareMap()) {
    $("main").innerHTML = '<div class="atlas-kit">' + sectionHeader("Карта Азерота", "") +
      '<section class="kit-panel">Мастер пока не открыл карту для просмотра.</section></div>';
    return;
  }
  localGameMap();
};
manageUsers = function () {
  if (sharedGame) return sharedGame.settings("accounts");
  return localGameAccounts();
};
createUserDialog = function () {
  if (sharedGame) return sharedGame.settings("accounts");
  return localGameCreateUser();
};
accountMenu = function () {
  if (!sharedGame || previewReadOnly) return localGameAccountMenu();
  openModal("Онлайн-профиль · " + actor.name, '<div class="actions" id="onlineProfileActions"></div>');
  $("onlineProfileActions").append(
    button("Обновить кампанию", () => sharedGame.changed(Infinity)),
    button("Настройки онлайн-кампании", () => sharedGame.settings("")),
  );
  if (sharedGame.hasRecovery()) $("onlineProfileActions").append(button("Скачать несохранённую правку", sharedGame.downloadRecovery));
  if (actor.role === "master") $("onlineProfileActions").append(
    button("Аккаунты и герои", () => sharedGame.settings("accounts")),
  );
};
exportData = function () {
  if (sharedGame) return sharedGame.settings("data");
  return localGameExport();
};

beginJourney = function (id) {
  if (!sharedGame) return localGameMapStart(id);
  if (!canTravel() || S.journey || currentStay(S)) return;
  const r = route(id);
  if (!r || !visibleRoute(r)) return;
  const values = [["random","Определить жребием"],["","Без проводника"],
    ...companyHeroRows().filter((m) => m.active).map((m) => [m.id,memberName(m)])];
  if (!player) values.push(["physical","Ввести физический жребий"]);
  form("Подготовка к путешествию", '<p>' + esc(routeLabel(r)) + ' · ' + esc(duration(r)) + '</p>' +
    selectField("Проводник","sharedGuide",values,"random") +
    (!player ? input("Жребий на физическом кубике","sharedGuideDie","number",1) +
      input("Стоимость для компании, зм","sharedTravelCost","number",r.cost || 0,'min="0" step="0.01"') : ""),
    () => execute("travelStart", { route:id, guide:val("sharedGuide"), guideDie:Number($("sharedGuideDie")?.value),
      cost:Number($("sharedTravelCost")?.value || 0) }), "Отправиться в путь");
};
guideCheck = function () {
  if (!sharedGame) return localGameGuideCheck();
  execute("travelGuide",{}).catch((error)=>toast(error.message));
};
applyRoll = function (values) {
  if (!sharedGame) return localGameTravelRoll(values);
  execute("travelRoll",{values}).catch((error)=>toast(error.message));
};
rollJourney = function () {
  if (!sharedGame) return localGameEventRoll();
  execute("travelRoll",{}).catch((error)=>toast(error.message));
};
manualRoll = function () {
  if (sharedGame && player) return toast("Физический результат вводит мастер");
  return localGameManualRoll();
};

function createSharedGame(client, campaign, initial, openSettings) {
  let current = initial, pendingRevision = initial.revision, saveDraft = null, writing = null, reading = false;
  let pendingRender = false, exited = false, recovery = null, previousPackage = null, mapUndo = null;
  const urls = new Map();
  const bucket = client.storage.from(atlasCloud.bucket);
  const handle = async (body) => {
    const result = await client.functions.invoke("atlas-play",{body:{campaign,...body}});
    if (result.error) {
      const reason = await result.error.context?.json?.().catch(()=>null);
      throw Error(reason?.error || "Игровой сервер недоступен");
    }
    return result.data;
  };
  function redraw() {
    if (!exited && !$("modalwrap").classList.contains("open")) render();
    else pendingRender = true;
  }
  function display(value, reset=false) {
    const { actor: nextActor, document, revision, prefix } = value;
    if (!document || !nextActor || revision < current.revision) return;
    if (prefix !== current.prefix) {
      for (const url of urls.values()) if (url) URL.revokeObjectURL(url);
      urls.clear();
      activeSheet = overviewMap;
      view = null;
    }
    current = value;
    S = nextActor.role === "master" ? normalize(document) : normalizeEngine(document);
    if (reset || activeHero && !S.company.members.some((row) => row.id === activeHero)) activeHero = "";
    if (!previewReadOnly || reset) {
      actor = nextActor;
      player = actor.role !== "master";
    }
    if (reset) {
      sheetHistory = [];
      activeSheet = overviewMap;
      mapDraft = null;
      tab = player && actor.heroes.length ? "hero" : "home";
      previewActor = null;
      previewReadOnly = false;
      selected = null;
      view = null;
      uxUndo = [];
      uxRedo = [];
      documentBodyOpen();
    }
    uxLast = uxSnapshot();
    if (tab === "workshop" && player) tab = "home";
    render();
  }
  function documentBodyOpen() {
    $("gate").replaceChildren();
    document.body.classList.remove("locked");
    applyUiScale();
  }
  async function refresh() {
    if (exited || writing || reading || busy || $("modalwrap").classList.contains("open") ||
      pendingRevision <= current.revision) return;
    reading = true;
    try {
      const value = await handle({action:"state"});
      if (!exited) display(value);
    } catch(error) {
      if (!exited) toast(error.message);
    } finally {
      reading = false;
    }
  }
  const closing = new MutationObserver(() => {
    if ($("modalwrap").classList.contains("open")) return;
    if (pendingRender) {
      pendingRender = false;
      redraw();
    }
    void refresh();
  });
  closing.observe($("modalwrap"),{attributes:true,attributeFilter:["class"]});
  async function command(name,payload,key=crypto.randomUUID()) {
    if (writing) await writing;
    let request = crypto.randomUUID();
    const beforeImport = name === "contentImport" && actor.role === "master" ?
      { document: structuredClone(S), prefix: current.prefix } : null;
    const importTables = name === "import" ? payload.pack : name === "contentImport" ? payload.pack?.tables : null;
    const drawing = mapCommands.has(name) || name === "mapMove";
    const previousMap = drawing ? current.document : null;
    const mapEdit = mapCommands.has(name) || name === "mapMove" && current.document.engine?.mapPlacements ||
      importTables && [...mapTables,"nodes","routes","regions"].some((table) => Object.hasOwn(importTables,table));
    if ((!current.mapLayout && mapCommands.has(name) && !(name === "atlasImage" && payload.id === overviewMap)) ||
        (!current.mapLayout && importTables && mapTables.some((table) => Object.hasOwn(importTables,table))))
      throw Error("Для редактора связанных карт обновите игровой сервер Supabase");
    if (name === "atlasUndo") {
      requireThat(canUndoMapEdit(), "После этой правки кампания уже изменилась");
      name = "masterSave";
      request = key;
      payload = {document:mapUndo.document};
    } else if (name === "grantCatalogItem" || mapEdit) {
      requireThat(actor.role === "master" && !previewReadOnly, "Недостаточно прав");
      // Administrative edits use the existing revision-checked master endpoint.
      const document = structuredClone(current.document);
      commands.get(name).run(document, payload, actor);
      name = "masterSave";
      payload = { document };
      request = key;
    }
    const value = await handle({action:"command",request,revision:current.revision,name,payload,key});
    if (exited) return;
    if (!value.conflict && previousMap && mapEdit) mapUndo = {document:previousMap,revision:value.revision};
    display(value);
    if (value.conflict) throw Error("Другой участник уже изменил кампанию. Данные обновлены, повторите действие.");
    if (beforeImport) previousPackage = beforeImport;
    toast("Сохранено в общей кампании");
  }
  function canUndoMapEdit() {
    return actor.role === "master" && !previewReadOnly && !writing && !S.settings.mapLocked && mapUndo?.revision === current.revision;
  }
  function save(state) {
    if (exited || actor.role !== "master" || previewReadOnly) return;
    saveDraft = structuredClone(state);
    if (writing) return;
    writing = (async ()=>{
      while (saveDraft && !exited) {
        const draft = saveDraft;
        saveDraft = null;
        const key = crypto.randomUUID();
        try {
          const value = await handle({action:"command",request:key,revision:current.revision,name:"masterSave",payload:{document:draft},key});
          if (exited) return;
          if (value.conflict) {
            recovery = { document:saveDraft || draft,prefix:current.prefix };
            saveDraft = null;
            display(value);
            toast("Кампания обновилась. Последнюю правку можно скачать из профиля.");
            return;
          }
          current = value;
          if (!saveDraft) display(value);
        } catch (error) {
          recovery = { document:saveDraft || draft,prefix:current.prefix };
          saveDraft = null;
          toast(error.message + " · Правку можно скачать из профиля");
        }
      }
    })().finally(()=>{
      writing = null;
      void refresh();
    });
  }
  const imageFailed = (ref) => urls.get(ref) === false;
  function image(ref, retry = false) {
    if (retry && imageFailed(ref)) urls.delete(ref);
    if (urls.has(ref)) return urls.get(ref) || "";
    const prefix = current.prefix;
    if (!prefix) return "";
    urls.set(ref,null);
    void (async () => {
      let url = false;
      try {
        const sheet = current.actor.role !== "master" && current.document.engine?.maps?.find((row) => row.image === ref);
        const result = sheet
          ? {data:await handle({action:"mapImage",sheet:sheet.id})}
          : await bucket.download(prefix+ref.slice(atlasStorageReference.length));
        if (result.data && !result.error && !exited && current.prefix === prefix) {
          const image = sheet ? new Blob([result.data],{type:"image/"+ref.split(".").at(-1)}) : result.data;
          url = URL.createObjectURL(image);
        }
      } catch {}
      if (exited || current.prefix !== prefix) return;
      urls.set(ref,url);
      redraw();
    })();
    return "";
  }
  function leave() {
    exited = true;
    closing.disconnect();
    for (const url of urls.values()) if (url) URL.revokeObjectURL(url);
    urls.clear();
    closeModal();
    previewActor = null;
    previewReadOnly = false;
  }
  async function downloadBackup(record,name) {
    if (!record || actor.role !== "master") return toast("Резерв пока отсутствует");
    const value=await joinOnlineBackup(record.document,async(file)=>{
      const {data,error}=await bucket.download(record.prefix+file);
      if (error) throw Error("Не удалось скачать изображение из резерва");
      return new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(reader.result);
        reader.onerror=reject;
        reader.readAsDataURL(new Blob([data],{type:"image/"+file.split(".").at(-1)}));
      });
    });
    downloadText(name,JSON.stringify(value,null,2));
  }
  async function settings(mode) {
    if (writing) await writing;
    leave();
    sharedGame = null;
    await openSettings(mode);
  }
  return {
    campaign, enter:()=>display(initial,true), command, save, image, imageFailed, settings, leave,
    hasRecovery:()=>!!recovery && actor.role === "master",
    pendingSave:()=>!!writing,
    downloadRecovery:()=>downloadBackup(recovery,"atlas-unsaved-online.json"),
    downloadPackageBackup:()=>downloadBackup(previousPackage,"atlas-before-package.json"),
    shareMap:()=>current.shareMap,
    mapLayout:()=>current.mapLayout === true, canUndoMapEdit,
    changed:(revision)=>{
      pendingRevision = Math.max(pendingRevision,revision === Infinity ? current.revision+1 : revision);
      if ($("modalwrap").classList.contains("open") && revision===Infinity) closeModal();
      void refresh();
    },
  };
}
