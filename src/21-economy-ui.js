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
      ' зм</p><div class="actions" id="bagTools"></div><section id="bagRows" class="personal-bags"></section>',
  );
  $("bagTools").append(
    button("В хранилище", () => {
      closeModal();
      switchTab("bank");
    }),
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
  $("bagRows").innerHTML = bag.length
    ? slotGrid(bag)
    : emptyScene("Сумки пусты");
}
function bagTransfer(stackId) {
  const x = S.company.inventory.find((item) => item.id === stackId),
    hero = x?.owner?.slice(7);
  if (
    !x?.owner?.startsWith("member:") ||
    !owned(actor, hero) ||
    !canSeeStack(x)
  )
    return;
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
    ) + input("Количество", "qty", "number", 1, 'min="1" max="' + x.qty + '"'),
    "transfer",
    () => ({ hero, stack: stackId, to: val("to"), qty: num("qty") }),
  );
}
function recipeBook() {
  openCraftTab("recipes");
}
