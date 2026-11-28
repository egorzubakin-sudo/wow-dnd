let actor = null,
  accounts = [],
  busy = false,
  activeHero = "",
  previewActor = null, previewReadOnly = false;
const onRender = [];
let sharedGame = null;
function accountStore(mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("accounts", mode),
      req = fn(tx.objectStore("accounts"));
    tx.oncomplete = () => resolve(req.result);
    tx.onabort = () => reject(tx.error);
  });
}
async function passwordKey(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          iterations: 210000,
          salt: new Uint8Array(salt),
        },
        key,
        256,
      ),
    ),
  );
}
function input(label, name, type = "text", value = "", extra = "") {
  return field(label, name, value, type, extra);
}
const accountSessionKey = "atlas-remembered-account";
async function sessionDigest(token) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))).join(",");
}
function replaceAccount(account) {
  accounts = accounts.map((a) => a.nick === account.nick ? account : a);
  if (actor?.nick === account.nick) actor = account;
}
async function rememberAccount(account) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const updated = { ...account, session: {
    digest: await sessionDigest(token),
    expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
  } };
  await accountStore("readwrite", (s) => s.put(updated));
  replaceAccount(updated);
  localStorage.setItem(accountSessionKey, JSON.stringify({ token, nick: account.nick }));
  return updated;
}
async function rememberedAccount() {
  try {
    const remembered = JSON.parse(localStorage.getItem(accountSessionKey));
    const account = accounts.find((a) => a.nick === remembered?.nick);
    if (account?.session?.expires > Date.now() && typeof remembered.token === "string" &&
        account.session.digest === await sessionDigest(remembered.token)) return account;
  } catch {
    // A missing or invalid saved session returns to the standard login form.
  }
  localStorage.removeItem(accountSessionKey);
  return null;
}
function activateAccount(account) {
  actor = account;
  player = account.role !== "master";
  activeHero = "";
  tab = player && heroRows().length ? "hero" : "home";
  document.body.classList.remove("locked");
  applyUiScale();
  render();
  $("gate").replaceChildren();
}
function gate() {
  document.body.classList.add("locked");
  closeModal();
  const first = !accounts.length;
  $("gate").innerHTML =
    '<h2>Warcraft: Век Авантюристов</h2><form id="authForm">' +
    input("Никнейм", "nick", "text", "", 'required autocomplete="username"') +
    input("Пароль", "pass", "password", "", 'required minlength="8"') +
    check("Запомнить вход на этом устройстве на 30 дней", "rememberAccount", false) +
    '<button class="primary">' +
    (first ? "Создать аккаунт мастера" : "Войти") +
    '</button><p id="authError" role="alert"></p></form><small>Локальный вход на этом устройстве. Имеющий доступ к файлам браузера может прочитать кампанию.</small>' +
    '<p><a href="start.html" target="_blank" rel="noopener">Скачать сборку и открыть страницу запуска</a></p>' + onlineLink();
  $("authForm").onsubmit = async (e) => {
    e.preventDefault();
    const b = e.submitter;
    b.disabled = true;
    try {
      const nick = val("nick").trim().toLowerCase(),
        pass = val("pass");
      if (first) await makeAccount(nick, pass, nick, "master", []);
      const a = accounts.find((a) => a.nick === nick);
      requireThat(
        a &&
          JSON.stringify(await passwordKey(pass, a.salt)) ===
            JSON.stringify(a.hash),
        "Неверный никнейм или пароль",
      );
      activateAccount($("rememberAccount").checked ? await rememberAccount(a) : a);
    } catch (err) {
      $("authError").textContent = err.message;
      b.disabled = false;
    }
  };
}
async function makeAccount(nick, pass, name, role, heroes, travel = false) {
  requireThat(
    nick.trim() &&
      pass.length >= 8 &&
      ["master", "player", "captain", "observer"].includes(role),
    "Проверьте никнейм, роль и пароль (от 8 символов)",
  );
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)));
  const a = {
    nick: nick.trim().toLowerCase(),
    name,
    role,
    heroes,
    travel,
    salt,
    hash: await passwordKey(pass, salt),
  };
  await accountStore("readwrite", (store) => store.add(a));
  accounts.push(a);
}
function form(title, body, fn, label = "Сохранить") {
  openModal(
    title,
    '<form class="engine-form" id="engineForm">' +
      body +
      controls(label) +
      '<p role="alert" id="engineError"></p></form>',
  );
  $("engineForm").onsubmit = async (e) => {
    e.preventDefault();
    const b = e.submitter;
    b.disabled = true;
    try {
      await fn();
      if (b.isConnected) closeModal();
    } catch (err) {
      if ($("engineError")) $("engineError").textContent = err.message;
      else toast(err.message);
    } finally {
      b.disabled = false;
    }
  };
}
function button(label, fn) {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = () => {
    try {
      Promise.resolve(fn()).catch((e) => toast(e.message));
    } catch (e) {
      toast(e.message);
    }
  };
  return b;
}
async function logout() {
  const account = actor;
  const remembered = localStorage.getItem(accountSessionKey);
  localStorage.removeItem(accountSessionKey);
  actor = null;
  previewActor = null;
  previewReadOnly = false;
  player = true;
  selected = null;
  uxPopupQueue = [];
  uxDismissPopup();
  gate();
  if (remembered && account?.session) {
    const updated = { ...account };
    delete updated.session;
    await accountStore("readwrite", (s) => s.put(updated));
    replaceAccount(updated);
  }
}
function accountMenu() {
  if (previewReadOnly) {
    openModal("Просмотр от лица героя", '<div class="actions" id="accountActions"></div>');
    $("accountActions").append(button("Вернуться к мастеру", returnFromHeroView));
    return;
  }
  const master = actor.role === "master";
  openModal(
    "Профиль · " + actor.name,
    kitHeroSelect(chosen(), "accountHero") + '<div class="actions" id="accountActions"></div>',
  );
  $("accountHero")?.addEventListener("change", (event) => {
    activeHero = event.target.value;
    render();
  });
  const box = $("accountActions");
  box.append(
    button("Выйти", logout),
    button("Сменить пароль", () =>
      form(
        "Смена пароля",
        input("Текущий пароль", "old", "password") +
          input(
            "Новый пароль",
            "newpass",
            "password",
            "",
            'minlength="8" required',
          ),
        async () => {
          requireThat(
            JSON.stringify(await passwordKey(val("old"), actor.salt)) ===
              JSON.stringify(actor.hash),
            "Неверный пароль",
          );
          const salt = Array.from(crypto.getRandomValues(new Uint8Array(16))),
            updated = {
              ...actor,
              salt,
              hash: await passwordKey(val("newpass"), salt),
            };
          delete updated.session;
          localStorage.removeItem(accountSessionKey);
          await accountStore("readwrite", (s) => s.put(updated));
          accounts = accounts.map((a) =>
            a.nick === updated.nick ? updated : a,
          );
          actor = updated;
        },
      ),
    ),
  );
  if (master) box.append(button("Аккаунты и герои", manageUsers));
}
function createUserDialog() {
  if (player) return;
  form(
    "Новый пользователь",
    input("Никнейм", "nn", "text", "", "required") +
      input("Имя", "dn") +
      input("Пароль", "pw", "password", "", 'minlength="8" required') +
      selectField(
        "Роль",
        "role",
        [
          ["player", "Игрок"],
          ["captain", "Капитан"],
          ["observer", "Наблюдатель"],
          ["master", "Мастер"],
        ],
        "player",
      ) +
      S.company.members
        .map((m, i) => check(memberName(m), "hero" + i, false))
        .join("") +
      check("Разрешить капитану путешествия", "travelGrant", false),
    () =>
      makeAccount(
        val("nn"),
        val("pw"),
        val("dn") || val("nn"),
        val("role"),
        S.company.members
          .filter((_, i) => $("hero" + i).checked)
          .map((m) => m.id),
        $("travelGrant").checked,
      ),
  );
}
const baseRender = render;
render = function () {
  baseRender();
  if (!actor) return;
  $("modeBtn").textContent = actor.name + " · профиль";
  $("modeBtn").onclick = accountMenu;
  for (const draw of onRender) draw();
};
async function execute(name, payload, key = crypto.randomUUID()) {
  requireThat(!previewReadOnly, "Просмотр от лица героя");
  requireThat(!busy, "Сохранение выполняется");
  busy = true;
  document.body.inert = true;
  try {
    if (sharedGame) return await sharedGame.command(name, payload, key);
    const next = applyCommand(S, actor, name, payload, key);
    clearTimeout(saveTimer);
    await dbPut(next, name === "contentImport" ? S : null);
    S = next;
    commit();
  } finally {
    busy = false;
    document.body.inert = false;
    if (sharedGame) sharedGame.changed(0);
  }
}
const oldNormalize = normalize;
normalize = (raw) => migrate(oldNormalize(raw));
async function readPrevious() {
  const old = await new Promise((resolve, reject) => {
    const r = indexedDB.open("shattered-atlas-v1");
    r.onupgradeneeded = () => r.result.createObjectStore("atlas");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    if (old.objectStoreNames.contains("atlas")) {
      const v = await new Promise((ok, fail) => {
        const r = old.transaction("atlas").objectStore("atlas").get("campaign");
        r.onsuccess = () => ok(r.result);
        r.onerror = () => fail(r.error);
      });
      if (v) return v;
    }
  } finally {
    old.close();
  }
  const json = localStorage.getItem("shattered-atlas-v1");
  return json ? JSON.parse(json) : null;
}
async function boot() {
  try {
    requireThat(
      globalThis.crypto?.subtle && navigator.locks,
      "Для Web Crypto и блокировки вкладок откройте Атлас через localhost.",
    );
    await navigator.locks.request(
      "shattered-atlas-writer",
      { ifAvailable: true },
      async (lock) => {
        requireThat(
          lock,
          "Кампания открыта в другой вкладке. Закройте её и обновите страницу.",
        );
        db = await openDB();
        const raw = (await dbGet()) || (await readPrevious());
        S = raw ? normalize(raw) : migrate(fresh());
        portalData();
        adventure(S);
        await dbPut(S);
        uxLast = uxSnapshot();
        accounts = await accountStore("readonly", (s) => s.getAll());
        const remembered = await rememberedAccount();
        if (remembered) activateAccount(remembered);
        else gate();
        await new Promise(() => {});
      },
    );
  } catch (e) {
    const gate = $("gate");
    gate.textContent = e.message;
    if (location.protocol === "file:") {
      const help = document.createElement("p");
      help.innerHTML = '<a href="start.html">Как запустить Атлас через localhost</a>';
      gate.append(help);
    }
  }
}
