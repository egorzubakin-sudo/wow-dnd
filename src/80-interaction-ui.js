function charterDialog(id = "") {
  if (player) return;
  const choices = S.factions.map((f) => [f.id, f.name]);
  if (!choices.length) return toast("Сначала создайте фракцию");
  form("Выдать грамоту", pick("Фракция", "charterFaction", [["", "Выберите фракцию"], ...choices], id) +
    area("Текст грамоты и привилегии", "charterText", ""), async () => {
    await execute("issueCharter", { faction: val("charterFaction"), text: val("charterText") });
    toast("Грамота выдана");
  }, "Выдать грамоту");
}
function viewCharter(id) {
  const f = faction(id);
  if (!f || !visibleFaction(f) || !f.charter) return;
  openModal("Грамоты · " + f.name, '<article class="reader"><p class="record-body">' +
    esc(f.charter) + '</p></article>');
}
function charterCollection(rows) {
  return '<div class="company-charters">' + rows.map((f) =>
    kitHomeRow(f.name, "Открыть документ", "contracts", "viewCharter(" + jsid(f.id) + ")"),
  ).join("") + (!rows.length ? '<p class="muted">У компании пока нет грамот.</p>' : "") + '</div>';
}
