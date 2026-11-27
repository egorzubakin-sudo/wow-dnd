function visualMenu(label, controls) {
  if (!controls) return "";
  return (
    '<details class="visual-menu" data-context-menu><summary aria-label="' +
    esc(label) +
    '" title="' +
    esc(label) +
    '">⋯</summary><div class="visual-menu-panel">' +
    controls +
    "</div></details>"
  );
}
function visualAction(label, action, style = "") {
  return (
    '<button type="button" class="' +
    style +
    '" onclick="' +
    action +
    '">' +
    esc(label) +
    "</button>"
  );
}
function sectionArt(image, shape, icon, extra = "", fallbackUrl = "") {
  const url = safeImage(image) || fallbackUrl;
  return (
    '<div class="section-art art-' +
    shape +
    " " +
    extra +
    (url ? " has-art" : "") +
    '">' +
    (url
      ? '<img src="' + esc(url) + '" alt="" loading="lazy">'
      : '<span aria-hidden="true">' + esc(icon) + "</span>") +
    "</div>"
  );
}
function emptyScene(message, action = "") {
  return (
    '<div class="scene-empty"><p>' + esc(message) + "</p>" + action + "</div>"
  );
}
function sectionHeader(title, description, actions = "", key = tab) {
  const image = key === "camp" ? "" : S.settings.visual?.covers?.[key];
  return (
    '<header class="section-cover kit-sectionhead kit-portal-head">' +
    (safeImage(image) ? sectionArt(image, "cover", "") : "") +
    '<div class="section-cover-copy"><div class="eyebrow">Атлас · ' +
    (NAV_BANDS[0][1].some(([id]) => id === key) ? "Мир" : "Кампания") +
    '</div><h2>' +
    esc(title) +
    "</h2>" +
    (description ? "<p>" + esc(description) + "</p>" : "") +
    '</div><div class="section-cover-actions">' +
    actions +
    (!player
      ? visualMenu(
          "Оформление раздела",
          visualAction(
            "Изменить обложку",
            "editSectionCover(" + jsid(key) + ")",
          ),
        )
      : "") +
    "</div></header>"
  );
}
function editSectionCover(key) {
  if (player) return;
  const old = S.settings.visual?.covers?.[key];
  editVisualImages(
    "Обложка раздела",
    [{ key: "cover", label: "Широкая обложка", image: old }],
    (images) => {
      const visual = (S.settings.visual ??= {});
      (visual.covers ??= {})[key] = images.cover;
    },
  );
}
function editVisualImages(title, fields, update) {
  if (player) return;
  form(
    title,
    fields
      .map(
        ({ key, label, image }) =>
          input(label, key, "file", "", "accept=image/*") +
          (safeImage(image)
            ? check("Убрать изображение", key + "Remove", false)
            : ""),
      )
      .join(""),
    async () => {
      const values = await Promise.all(
        fields.map(async ({ key, image }) => [
          key,
          $(key).files[0]
            ? await readImage($(key).files[0])
            : $(key + "Remove")?.checked
              ? ""
              : image || "",
        ]),
      );
      update(Object.fromEntries(values));
      commit();
    },
  );
}
function portalMenu(k, x) {
  if (player) return "";
  const args = jsid(k) + "," + jsid(x.id);
  const iconCategory = { people: "skills", achievements: "achievements", mail: "navigation" }[k];
  return visualMenu(
    "Действия с записью",
    visualAction("Изменить", "editPortal(" + args + ")") +
      (iconCategory ? visualAction("Выбрать иконку", "pickPortalIcon(" + args + "," + jsid(iconCategory) + ")") : "") +
      visualAction("Дублировать", "uxDuplicate(" + args + ")") +
      visualAction("В архив", "uxArchive(" + args + ")", "danger") +
      (k === "achievements"
        ? visualAction("Вручить", "awardAchievement(" + jsid(x.id) + ")")
        : ""),
  );
}
function portalMeta(x) {
  const f = faction(x.faction);
  return [
    x.category,
    x.source,
    locLabel(x.location),
    f && visibleFaction(f) ? f.name : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
function excerpt(text, limit = 155) {
  return text?.length > limit
    ? text.slice(0, limit).trimEnd() + "…"
    : text || "";
}
document.addEventListener(
  "toggle",
  (event) => {
    if (!event.target.matches?.("[data-context-menu][open]")) return;
    document.querySelectorAll("[data-context-menu][open]").forEach((menu) => {
      if (menu !== event.target) menu.open = false;
    });
  },
  true,
);
document.addEventListener("click", (event) => {
  document.querySelectorAll("[data-context-menu][open]").forEach((menu) => {
    if (!menu.contains(event.target)) menu.open = false;
  });
});
