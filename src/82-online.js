const atlasCloud = {
  url: "https://grllbjrsygszfqnllnsa.supabase.co",
  key: "sb_publishable_LtACXe2yBGtQ8JHIHVu0Aw_sWrMb2ir",
  bucket: "atlas-campaign-media",
};

function onlineLink() {
  return '<a class="button" href="?online=1">Открыть онлайн-кампанию</a>';
}

function atlasOnlineMode() {
  const mode = new URLSearchParams(location.search).get("online");
  return mode === "1" || (mode === null && (location.hostname === "www.atlas-shhatered-world.ru" ||
    (location.hostname === "egorzubakin-sudo.github.io" && location.pathname.startsWith("/wow-dnd/"))));
}

async function bootOnline() {
  const gate = $("gate");
  gate.innerHTML = '<h2>Warcraft: Век Авантюристов</h2><p>Подключение к онлайн-кампании…</p><a href="index.html?online=0">Локальная версия</a>';
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "assets/vendor/supabase-2.119.2.js";
      script.onload = resolve;
      script.onerror = () => reject(Error("Не удалось загрузить клиент Supabase"));
      document.head.append(script);
    });
    const client = globalThis.supabase.createClient(atlasCloud.url, atlasCloud.key, {
      auth: { storageKey: "atlas-supabase-auth-v1", persistSession: true, autoRefreshToken: true },
    });
    await onlineWorkspace(client);
  } catch (err) {
    gate.querySelector("p").textContent = err.message;
  }
}

async function onlineWorkspace(client) {
  const root = $("main"), gate = $("gate"), bucket = client.storage.from(atlasCloud.bucket);
  const roles = { master: "Мастер", captain: "Капитан", player: "Игрок", observer: "Наблюдатель" };
  let session, channel, campaign, membership, campaigns = [], heroes = [], subscribed = "",
    scene = "", generation = 0, imageUrls = [], busy = false, gameAvailable = false;
  const unwrap = async (request) => {
    const { data, error } = await request;
    if (error) throw Error(error.message);
    return data;
  };
  const rpc = (name, args) => unwrap(client.rpc(name, { p_campaign: campaign.id, ...args }));
  const flash = (text) => {
    const el = $("onlineStatus") || $("onlineError");
    if (el) el.textContent = text;
  };
  function clearPreviews() {
    for (const url of imageUrls) URL.revokeObjectURL(url);
    imageUrls = [];
  }
  async function stopUpdates() {
    const previous = channel;
    channel = null;
    subscribed = "";
    if (previous) await client.removeChannel(previous);
  }
  function showGate(reason = "") {
    if (sharedGame) sharedGame.leave();
    sharedGame = null;
    actor = null;
    player = true;
    generation++;
    clearPreviews();
    document.body.classList.add("locked");
    root.replaceChildren();
    $("nav").replaceChildren();
    gate.innerHTML = '<h2>Warcraft: Век Авантюристов</h2><p>Вход в онлайн-кампанию</p>' +
      '<form id="onlineLogin">' + input("Электронная почта", "onlineEmail", "email", "", 'required autocomplete="username"') +
      input("Пароль", "onlinePass", "password", "", 'required autocomplete="current-password"') +
      '<button class="primary">Войти</button><p role="alert" id="onlineError"></p></form>' +
      '<p>Аккаунты создаёт мастер кампании.</p><a href="index.html?online=0">Открыть локальную версию</a>';
    flash(reason);
    $("onlineLogin").onsubmit = async (event) => {
      event.preventDefault();
      const submit = event.submitter;
      submit.disabled = true;
      try {
        const data = await unwrap(client.auth.signInWithPassword({ email: val("onlineEmail"), password: val("onlinePass") }));
        session = data.session;
        await openCampaign();
      } catch (error) {
        flash(error.message);
      } finally {
        submit.disabled = false;
      }
    };
  }
  function render() {
    generation++;
    clearPreviews();
    document.body.classList.remove("locked");
    document.body.classList.add("atlas-kit-active");
    $("kitTop").hidden = false;
    const operations = $("atlasOperations");
    if (operations) $("modeBtn").parentElement.append(operations);
    $("kitTop").innerHTML = '<div class="kit-brand">' + uiIcon("map") +
      '<span><strong>Warcraft: Век Авантюристов</strong><small>Онлайн-кампания</small></span></div>' +
      '<div class="kit-topmeta"><button id="onlineSignOut" type="button">Выйти</button></div>';
    $("nav").hidden = true;
    root.innerHTML = '<div class="atlas-kit online-workspace"><header class="kit-sectionhead"><div><h2>' +
      esc(campaign?.name || "Кампании") + '</h2>' +
      (membership ? '<p>' + esc(membership.nickname + " · " + roles[membership.role]) + '</p>' : "") +
      '</div><a href="index.html?online=0">Локальная версия</a></header><p id="onlineStatus" role="status"></p>' +
      (!campaign ? '<section class="kit-panel"><p>Этот аккаунт ещё не добавлен в кампанию. Передайте мастеру свой ID.</p><code>' +
        esc(session.user.id) + '</code><div class="actions"><button id="onlineRefresh">Проверить доступ</button></div></section>' :
        (campaigns.length > 1 ? pick("Кампания", "onlineCampaign", campaigns.map((row) => [row.id,row.name]), campaign.id) : "") +
        '<section class="kit-panel"><div class="kit-subhead"><h3>Кампания</h3><small id="onlineRevision">Версия ' +
        esc(campaign.revision) + '</small></div>' +
        (campaign.revision ? '<p>Откройте общую кампанию или перейдите к настройкам.</p>' :
          '<p>Кампания ещё пуста. Мастер может загрузить сохранение Атласа.</p>') +
        (campaign.revision ? '<div class="actions"><button class="primary" id="onlinePlay">Открыть Атлас</button></div>' : "") +
        '<div class="actions"><button id="onlineRefresh">Обновить</button><button id="onlineWorld">Открыть карту</button>' +
        '<button id="onlineHeroes">Герои</button>' +
        (membership.role === "master" ? '<button id="onlineAccounts">Аккаунты и герои</button><button id="onlineData">Импорт и экспорт</button>' : "") +
        '</div></section><section id="onlineScene" class="kit-panel" hidden></section>') + '</div>';
    $("onlineSignOut").onclick = () => run(async () => {
      await unwrap(client.auth.signOut());
      session = null;
      await stopUpdates();
      showGate();
    });
    $("onlineRefresh").onclick = () => run(() => openCampaign(campaign?.id));
    if (!campaign) return;
    if ($("onlineCampaign")) $("onlineCampaign").onchange = (e) => run(() => openCampaign(e.target.value));
    if ($("onlinePlay")) $("onlinePlay").onclick = () => run(enterGame);
    $("onlineWorld").onclick = () => run(showWorld);
    $("onlineHeroes").onclick = () => run(showHeroes);
    if ($("onlineAccounts")) $("onlineAccounts").onclick = () => run(showAccounts);
    if ($("onlineData")) $("onlineData").onclick = () => run(showData);
  }
  async function run(work) {
    if (busy) return;
    busy = true;
    flash("");
    try {
      await work();
    } catch (error) {
      flash(error.message);
    } finally {
      busy = false;
    }
  }
  async function openCampaign(preferred, autoPlay = true) {
    if (!session) return showGate();
    const memberships = await unwrap(client.from("atlas_members")
      .select("campaign_id,nickname,role").eq("user_id",session.user.id));
    campaigns = memberships.length ? await unwrap(client.from("atlas_campaigns")
      .select("id,name,revision").in("id",memberships.map((row) => row.campaign_id)).order("name")) : [];
    campaign = campaigns.find((row) => row.id === preferred) || campaigns[0];
    membership = memberships.find((row) => row.campaign_id === campaign?.id);
    heroes = [];
    scene = "";
    render();
    if (!campaign) return stopUpdates();
    if (subscribed !== campaign.id) {
    await stopUpdates();
    subscribed = campaign.id;
    const id = subscribed;
    channel = client.channel("atlas-revision-" + id)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "atlas_campaigns", filter: "id=eq." + id }, ({ new: row }) => {
        if (campaign?.id !== id || row.revision <= campaign.revision) return;
        campaign = { ...campaign, revision: row.revision, name: row.name };
        if (sharedGame) return sharedGame.changed(row.revision);
        if ($("onlineRevision")) $("onlineRevision").textContent = "Версия " + row.revision;
        const refreshScene = scene === "world" ? showWorld : scene === "heroes" ? showHeroes : null;
        if (refreshScene) {
          generation++;
          clearPreviews();
          $("onlineScene").replaceChildren();
          scene = "";
          if (!busy) void run(refreshScene);
        }
        flash("Кампания обновилась");
      }).subscribe();
    }
    if (autoPlay && campaign.revision) {
      try {
        await enterGame();
      } catch {
        flash("Игровой сервер недоступен. Можно открыть просмотр и настройки кампании.");
      }
    }
  }
  async function enterGame() {
    const result = await client.functions.invoke("atlas-play",{body:{action:"state",campaign:campaign.id}});
    if (result.error) throw Error("Игровой сервер недоступен");
    if (!result.data?.document || !result.data.actor) throw Error("Сначала импортируйте кампанию");
    gameAvailable = true;
    sharedGame = createSharedGame(client,campaign.id,result.data,async (mode)=>{
      await openCampaign(campaign.id,false);
      if (mode === "accounts" && membership?.role === "master") await showAccounts();
      if (mode === "data" && membership?.role === "master") await showData();
    });
    sharedGame.enter();
  }
  function panel(name, html) {
    generation++;
    clearPreviews();
    scene = name;
    const element = $("onlineScene");
    element.hidden = false;
    element.innerHTML = html;
    return element;
  }
  async function loadImage(path, place) {
    const version = generation;
    const data = await unwrap(bucket.download(path));
    if (version !== generation || !place.isConnected) return;
    const url = URL.createObjectURL(data);
    imageUrls.push(url);
    if (place instanceof SVGElement) place.setAttribute("href", url);
    else place.src = url;
  }
  async function showWorld() {
    const world = await unwrap(client.from("atlas_world").select("nodes,routes,map_path,map_width,map_height")
      .eq("campaign_id",campaign.id).maybeSingle());
    if (!world) return panel("world", "<p>Мастер пока не открыл карту для просмотра.</p>");
    const width = 1000, height = world.map_width ? width * world.map_height / world.map_width : 650;
    const points = new Map(world.nodes.map((node) => [node.id, { ...node, x: node.x * width, y: node.y * height }]));
    const el = panel("world", '<h3>Карта Азерота</h3><svg class="online-map" viewBox="0 0 ' + width + ' ' + height +
      '" role="img" aria-label="Общая карта кампании"><image id="onlineMapImage" width="' + width + '" height="' + height + '"/>' +
      world.routes.map(({a,b}) => {
        const start = points.get(a), end = points.get(b);
        return start && end ? '<line x1="' + start.x + '" y1="' + start.y + '" x2="' + end.x +
          '" y2="' + end.y + '" stroke="#d7ba81" stroke-width="2" />' : "";
      }).join("") +
      [...points.values()].map((p) => '<g transform="translate(' + p.x + ' ' + p.y +
        ')"><circle r="8" fill="#edce90"/><text y="24" text-anchor="middle" fill="#fff0cf">' +
        esc(p.name) + '</text></g>').join("") + '</svg>');
    if (world.map_path) await loadImage(world.map_path, el.querySelector("#onlineMapImage"));
  }
  async function getHeroes() {
    heroes = await unwrap(client.from("atlas_heroes").select("hero_id,name,portrait_path")
      .eq("campaign_id",campaign.id).order("name"));
    return heroes;
  }
  async function showHeroes() {
    const rows = await getHeroes(), el = panel("heroes", '<h3>Герои</h3>' +
      (rows.length ? '<div class="company-roster">' + rows.map((hero, index) =>
        '<button class="company-member-open" data-online-hero="' + index + '">' + esc(hero.name) + '</button>').join("") + '</div>' :
        '<p>Доступных героев пока нет.</p>'));
    for (const button of el.querySelectorAll("[data-online-hero]")) button.onclick = () => run(async () => {
      const hero = rows[Number(button.dataset.onlineHero)];
      const profile = panel("heroes", '<h3>' + esc(hero.name) + '</h3>' +
        (hero.portrait_path ? '<img id="onlinePortrait" class="kit-avatar" alt="">' : "") +
        '<p><button id="onlineHeroBack">К списку героев</button></p>');
      profile.querySelector("#onlineHeroBack").onclick = () => run(showHeroes);
      if (hero.portrait_path) await loadImage(hero.portrait_path, profile.querySelector("#onlinePortrait"));
    });
  }
  async function showAccounts(selected) {
    const [users, links] = await Promise.all([
      unwrap(client.from("atlas_members").select("user_id,nickname,role"+(gameAvailable?",travel":"")).eq("campaign_id",campaign.id).order("nickname")),
      unwrap(client.from("atlas_hero_links").select("user_id,hero_id").eq("campaign_id",campaign.id)),
      getHeroes(),
    ]);
    const member = users.find((row) => row.user_id === selected);
    const assigned = new Set(links.filter((row) => row.user_id === selected).map((row) => row.hero_id));
    const el = panel("accounts", '<h3>Аккаунты и герои</h3><div id="onlineMemberList" class="actions">' +
      users.map((u, index) => '<button data-online-member="' + index + '">' + esc(u.nickname + " · " + roles[u.role]) +
        '</button>').join("") + '<button id="onlineNewMember">Добавить аккаунт</button></div>' +
      '<form id="onlineMemberForm"><p>Создайте пользователя в Supabase Auth и скопируйте его UID.</p>' +
      input("UID пользователя Auth", "onlineMemberId", "text", member?.user_id || "", 'required pattern="[a-fA-F0-9-]{36}"') +
      input("Никнейм", "onlineNickname", "text", member?.nickname || "", 'required maxlength="50"') +
      pick("Роль", "onlineRole", Object.entries(roles), member?.role || "player") +
      (gameAvailable ? check("Разрешить капитану вести отряд","onlineTravel",member?.travel || false) : "") +
      '<div id="onlineHeroLinks"><h4>Привязать героев</h4>' +
      heroes.map((hero, i) => check(hero.name,"onlineAssign" + i,assigned.has(hero.hero_id))).join("") +
      '</div><button class="primary">Сохранить профиль</button></form>');
    for (const button of el.querySelectorAll("[data-online-member]"))
      button.onclick = () => run(() => showAccounts(users[Number(button.dataset.onlineMember)].user_id));
    $("onlineNewMember").onclick = () => run(() => showAccounts());
    const sync = () => { $("onlineHeroLinks").hidden = val("onlineRole") === "observer"; };
    $("onlineRole").onchange = sync;
    sync();
    $("onlineMemberForm").onsubmit = (event) => {
      event.preventDefault();
      return run(async () => {
        const id = val("onlineMemberId").trim(), role = val("onlineRole");
        await rpc("atlas_manage_member", { p_user: id, p_nickname: val("onlineNickname"), p_role: role,
          p_heroes: role === "observer" ? [] : heroes.filter((_, i) => $("onlineAssign" + i).checked).map((row) => row.hero_id) });
        if (gameAvailable && role === "captain") await rpc("atlas_set_captain_travel",{p_user:id,p_travel:$("onlineTravel").checked});
        if (id === session.user.id) await openCampaign(campaign.id,false);
        await showAccounts(id);
        flash("Профиль сохранён");
      });
    };
  }
  async function showData() {
    const stages = await rpc("atlas_manage_uploads", { p_abandon: false });
    panel("data", '<h3>Импорт и экспорт</h3><form id="onlineImport">' +
      '<div class="field"><label for="onlineBackupFile">Сохранение Атласа JSON</label><input id="onlineBackupFile" type="file" accept=".json,application/json" required></div>' +
      check("Открыть участникам схему известных мест и маршрутов", "onlineShareWorld", false) +
      check("Открыть подложку общей карты и личные портреты владельцам героев", "onlineShareImages", false) +
      '<p class="muted">Выбирайте только подложку без скрытых отметок. Новый импорт заменяет облачное сохранение.</p>' +
      '<div class="actions"><button class="primary" type="submit">Импортировать кампанию</button>' +
      '<button type="button" id="onlineExport">Скачать JSON кампании</button></div></form>' +
      (stages.length ? '<div class="actions"><button id="onlineCleanup">Очистить незавершённые и прежние загрузки</button></div>' : ""));
    $("onlineImport").onsubmit = (event) => {
      event.preventDefault();
      return run(async () => {
        const file = $("onlineBackupFile").files[0];
        if (!file || !window.confirm("Заменить облачное сохранение кампании?")) return;
        const shareWorld = $("onlineShareWorld").checked, shareImages = $("onlineShareImages").checked;
        const revision = campaign.revision;
        const { document, images } = await splitOnlineBackup(JSON.parse(await file.text()));
        const id = await rpc("atlas_begin_import", { p_revision: revision });
        const prefix = campaign.id + "/" + id + "/";
        let count = 0;
        for (const [name, blob] of images) {
          flash("Загрузка изображений " + ++count + " / " + images.size);
          await unwrap(bucket.upload(prefix + name, blob, { upsert: false, contentType: blob.type }));
        }
        campaign.revision = await rpc("atlas_finish_import", { p_import: id, p_document: document,
          p_share_world: shareWorld, p_share_images: shareImages });
        await openCampaign(campaign.id,false);
        await showData();
        flash("Кампания импортирована");
      });
    };
    $("onlineExport").onclick = () => run(async () => {
      const saved = await rpc("atlas_export_campaign");
      requireThat(saved, "Сначала импортируйте кампанию");
      const restored = await joinOnlineBackup(saved.document, async (name) => {
        const blob = await unwrap(bucket.download(saved.prefix + name));
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(new Blob([blob], { type: "image/" + name.split(".").at(-1) }));
        });
      });
      const url = URL.createObjectURL(new Blob([JSON.stringify(restored,null,2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "Atlas_cloud_campaign.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      flash("Резервная копия скачана");
    });
    if ($("onlineCleanup")) $("onlineCleanup").onclick = () => run(async () => {
      if (!window.confirm("Отменить незавершённые загрузки и удалить изображения прежних версий?")) return;
      const drafts = await rpc("atlas_manage_uploads", { p_abandon: true });
      for (const draft of drafts) {
        const prefix = campaign.id + "/" + draft.id;
        let rows;
        do {
          rows = await unwrap(bucket.list(prefix, { limit: 100 }));
          if (rows.length) await unwrap(bucket.remove(rows.map((row) => prefix + "/" + row.name)));
        } while (rows.length === 100);
      }
      await showData();
      flash("Старые загрузки очищены");
    });
  }
  showGate();
  client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") setTimeout(() => {
      session = null;
      void stopUpdates();
      showGate();
    }, 0);
  });
  const auth = await unwrap(client.auth.getSession());
  session = auth.session;
  if (session) await run(openCampaign);
}
