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
