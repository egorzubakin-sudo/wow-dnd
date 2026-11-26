function bagPage() {
  const hero = chosen(),
    p = profile(S, hero),
    bag = S.company.inventory.filter(
      (x) => x.owner === "member:" + hero && (!player || !x.hidden),
    );
  openModal(
    "Сумки · " + memberName(heroOf(S, hero)),
    "<p>" +
      esc(p.wallet) +
      ' зм</p><div class="actions" id="bagTools"></div><section id="bagRows" class="bag-grid"></section>',
  );
  $("bagTools").append(
    button("Сетка / список", () => $("bagRows").classList.toggle("bag-grid")),
  );
  if (!player)
    $("bagTools").append(
      button("Перевести из казны", () =>
        commandForm(
          "Перевод между казной и кошельком",
          input("Зм (отрицательное — в казну)", "amt", "number", 1),
          "gold",
          () => ({ hero, amount: num("amt") }),
        ),
      ),
    );
  for (const x of bag) {
    const b = button((x.icon || "◆") + " " + x.name + " × " + x.qty, () =>
      commandForm(
        "Передача или разделение",
        pick(
          "Получатель",
          "to",
          [
            ["", "Компания"],
            ...S.company.members
              .filter((m) => !player || !m.hidden)
              .map((m) => [
                m.id,
                m.id === hero ? "Разделить стопку" : memberName(m),
              ]),
          ],
          "",
        ) +
          input(
            "Количество",
            "qty",
            "number",
            1,
            'min="1" max="' + x.qty + '"',
          ),
        "transfer",
        () => ({ hero, stack: x.id, to: val("to"), qty: num("qty") }),
      ),
    );
    b.title = x.desc || x.name;
    $("bagRows").append(b);
  }
  if (!bag.length) $("bagRows").textContent = "Сумки пусты";
}
function recipeBook() {
  openCraftTab("recipes");
}
actions.push((a, { hero }) => {
  if (tab === "bank" && hero && owned(actor, hero))
    a.append(button("Сумки", bagPage));
});
