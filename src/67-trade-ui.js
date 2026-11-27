function goldText(value) {
  return Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " зм";
}
function openTradeRecipe(id) {
  const r = S.engine.recipes.find((x) => x.id === id);
  if (!r) return;
  craftProfession = r.profession_id;
  craftRecipe = id;
  craftQuery = craftQuality = craftFilter = "";
  openCraftTab("recipes");
}
function tradeView(root, hero) {
  const rows = localMarket(S, actor), stay = currentStay(S), canAct = hero && owned(actor, hero);
  const wallet = hero ? profile(S, hero).wallet : null;
  const place = stay && locLabel(stay.location);
  const offers = rows.map((row) => {
    const item = S.engine.items.find((x) => x.id === row.item_id), factionRecord = faction(row.faction_id);
    if (!item || (player && item.hidden)) return "";
    let prices, reason;
    try { prices = tradePrices(S, row); } catch (error) { reason = error.message; }
    const have = hero ? tradeStock(S, item.id, "member:" + hero).reduce((sum, x) => sum + x.qty, 0) : 0;
    const controls = prices && canAct
      ? availableTradeButton("Купить", "buy", item.id, row.stock && wallet >= prices.buy) +
        availableTradeButton("Продать", "sell", item.id, row.demand && prices.sell > 0 && row.budget >= prices.sell && have)
      : "";
    return '<article class="kit-panel trade-offer"><div class="kit-row">' + itemIcon(item) +
      '<div class="kit-grow"><h3>' + esc(item.name) + '</h3><small>' +
      esc(factionRecord && visibleFaction(factionRecord) ? factionRecord.name : "Местный торговец") + '</small></div></div>' +
      '<div class="trade-stats"><span>В продаже <b>' + esc(row.stock) + '</b></span><span>Спрос <b>' + esc(row.demand) +
      '</b></span><span>В сумках <b>' + esc(have) + '</b></span><span>Бюджет скупки <b>' + esc(goldText(row.budget)) + '</b></span></div>' +
      (prices ? '<p class="muted">' + esc("Цена покупки " + goldText(prices.buy) + " · скупка " + goldText(prices.sell) +
        (prices.bonus ? " · поправка за репутацию " + Math.round(prices.bonus * 100) + "%" : "")) + '</p>' :
        '<p class="muted">' + esc(reason) + '</p>') +
      '<div class="actions">' + controls + '</div></article>';
  }).join("");
  const recipes = S.engine.recipes.filter((r) => r.trade_product && !S.engine.items.find((x) => x.id === r.item_id)?.hidden);
  root.innerHTML = `<div class="trade-layout"><section>
    ${kitSubhead("Местный рынок", place || "")}
    <div class="trade-offers">${offers || emptyScene(stay
      ? "На этой стоянке нет доступных торговцев."
      : "Рынок открывается на стоянке в месте с настроенным ассортиментом.", !player ? visualAction("Настроить рынок", "catalogRecords('markets')") : "")}</div>
    </section><aside>
      <section class="kit-panel trade-wallet"><div class="eyebrow">Личный кошелёк</div>
        <h3>${wallet == null ? "Выберите героя" : esc(goldText(wallet))}</h3>
        ${canAct && wallet > 0 ? visualAction("Внести золото в казну", "donateTradeGold()", "primary") : ""}
        <p class="muted">Казна компании · ${esc(goldText(S.company.gold))}</p>
        ${!player && stay && node(stay.location)?.type === "city" ? visualAction("Арендовать мастерскую", "rentalForm()") : ""}
      </section>
      <section class="trade-production">${kitSubhead("Торговое производство")}
      <div class="kit-panel kit-feed">${recipes.map((r) => kitHomeRow(r.name,
        timeLabel(r.hours) + (r.service ? " · " + r.service + ", ступень " + r.facility_rank : ""),
        "craft", "openTradeRecipe(" + jsid(r.id) + ")")).join("") ||
        emptyScene("Торговых рецептов пока нет.", !player ? visualAction("Добавить рецепты", "workshop('tradeRecipes')") : "")}</div></section>
    </aside></div>`;
}
function availableTradeButton(label, side, id, available) {
  return '<button type="button" ' + (available ? "" : "disabled ") +
    'onclick="tradeDealForm(' + jsid(id) + ',' + jsid(side) + ')">' + label + '</button>';
}
function tradeDealForm(id, side) {
  const hero = chosen(), row = localMarket(S, actor).find((x) => x.item_id === id);
  if (!row || !hero || !owned(actor, hero)) return;
  const item = byId(S.engine.items, id), unit = tradePrices(S, row)[side];
  const buy = side === "buy", have = tradeStock(S, id, "member:" + hero).reduce((sum, x) => sum + x.qty, 0);
  const balance = buy ? profile(S, hero).wallet : row.budget;
  const limit = Math.min(1000, buy ? row.stock : Math.min(have, row.demand), Math.floor((balance + 1e-8) / unit));
  if (!unit || limit < 1) return;
  const label = buy ? "Купить" : "Продать";
  commandForm(label + " · " + item.name,
    '<p>За единицу · ' + esc(goldText(unit)) + '</p>' +
    input("Количество", "tradeQty", "number", 1, 'required min="1" max="' + limit + '" step="1"') +
    '<p id="tradeTotal" role="status"></p>',
    "tradeDeal", () => ({ hero, item: id, side, unit, qty: num("tradeQty") }), label,
  );
  const showTotal = () => { $("tradeTotal").textContent = "Итого · " + goldText(num("tradeQty") * unit); };
  showTotal();
  $("tradeQty").oninput = showTotal;
}
function donateTradeGold() {
  const hero = chosen(), wallet = hero && profile(S, hero).wallet;
  if (!hero || !wallet || !owned(actor, hero)) return;
  commandForm("Взнос в казну",
    input("Золото", "donation", "number", wallet, 'required min="0.01" step="0.01" max="' + wallet + '"'),
    "tradeDonation", () => ({ hero, amount: num("donation") }), "Внести золото",
  );
}
function facilityUpgradeForm(service) {
  if (player) return;
  const tier = campTier(S, service) + 1;
  commandForm(service + " · ступень " + tier,
    '<p>Казна · ' + esc(goldText(S.company.gold)) + '</p>' +
    input("Стоимость, зм", "upgradeCost", "number", facilityPrices(S, service)["tier" + tier + "_gp"], 'required min="0" step="0.01"'),
    "facilityTier", () => ({ service, tier, cost: num("upgradeCost") }), "Купить оборудование",
  );
}
function rentalForm() {
  if (player) return;
  commandForm("Аренда мастерской на стоянку",
    pick("Сооружение", "rentalService", productionServices.map((service) => [service, service]), productionServices[0]) +
    pick("Ступень", "rentalTier", [[1, "1"], [2, "2"], [3, "3"]], 1) +
    input("Стоимость, зм", "rentalCost", "number", "", 'required min="0" step="0.01"') +
    '<p class="muted">Расход из казны. Аренда действует до завершения или переноса этой стоянки.</p>',
    "facilityRental", () => ({ service: val("rentalService"), tier: num("rentalTier"), cost: num("rentalCost") }), "Арендовать",
  );
  const price = () => { $("rentalCost").value = rentalPrice(S, val("rentalService"), num("rentalTier")) ?? ""; };
  $("rentalService").onchange = $("rentalTier").onchange = price;
  price();
}
function craftTempoForm() {
  if (player) return;
  const choices = S.engine.recipes.filter((r) => craftTempoHours(S, r) < r.hours);
  commandForm("Недельный профиль ремесла",
    '<p>Выберите рецепты для сокращения времени. Начатые проекты сохраняют прежний расчёт.</p>' +
    (choices.length ? '<div id="tempoRecipes">' + choices.map((r, i) =>
      check(r.name + " · " + timeLabel(r.hours) + " → " + timeLabel(craftTempoHours(S, r)), "tempo" + i, false)).join("") + '</div>' :
      '<p>Нет рецептов, для которых профиль сокращает время.</p>'),
    "craftTempo", () => ({ ids: choices.filter((_, i) => $("tempo" + i).checked).map((r) => r.id) }),
    "Применить к выбранным",
  );
  if (!choices.length) $("engineForm").querySelector("[type=submit]").disabled = true;
}
function editDelivery(id) {
  if (player) return;
  const q = id ? S.contracts.find((row) => row.id === id) : {};
  if (!q || q.rewardReceipt || q.status === "done") return;
  const items = S.engine.items.filter((item) => item.trade_product && !item.hidden);
  const visibleLocations = pairs(S.nodes);
  const seller = q.giver || "";
  let rewards = structuredClone(q.rewards || [{ type: "gold", amount: 10 }]);
  let goods = (q.goods || [{ item_id: items[0]?.id, quantity: 1 }]).map((row) => ({ ...row }));
  if (!items.length || !visibleLocations.length) {
    openModal("Новая поставка", emptyScene("Добавьте торговый товар и место доставки в Мастерской.",
      visualAction("Справочники", "workshop('tradeGoods')")));
    return;
  }
  commandForm(q.title || "Новая поставка",
    input("Название", "deliveryTitle", "text", q.title || "", "required") +
    area("Описание", "deliveryDesc", q.desc || "") +
    pick("Место доставки", "deliveryLocation", visibleLocations, q.location || "") +
    input("Получатель товаров", "deliveryConsignee", "text", q.consignee || "", "required") +
    pick("Связанный NPC", "deliveryNPC", [["", "Не выбран"], ...pairs(S.portal.people)], seller) +
    '<div class="cols">' + input("Год срока", "deliveryYear", "number", q.due_year || S.company.year, 'required min="1"') +
      input("День срока", "deliveryDay", "number", q.due_day || S.company.day, 'required min="1"') + '</div>' +
    pick("Источник товаров", "deliveryStock", [["personal", "Личные сумки исполнителя"], ["shared", "Общий банк по разрешению"]], q.stock_source || "personal") +
    pick("Получатель награды", "deliveryRecipient", [["company", "Компания"], ["hero", "Исполнитель"]], q.reward_recipient || "company") +
    '<div id="deliveryGoods"></div><div class="actions" id="deliveryControls"></div>' +
    '<h3>Награды</h3><div id="deliveryRewards"></div><div class="actions" id="deliveryRewardControls"></div>' +
    check("Скрыть от игроков", "deliveryHidden", !!q.hidden),
    "deliveryContract", () => ({
      id, title: val("deliveryTitle").trim(), desc: val("deliveryDesc"), consignee: val("deliveryConsignee").trim(),
      location: val("deliveryLocation"), giver: val("deliveryNPC"), due_year: num("deliveryYear"), due_day: num("deliveryDay"),
      stock_source: val("deliveryStock"), reward_recipient: val("deliveryRecipient"), goods: readGoods(),
      rewards: readDeliveryRewards(), hidden: $("deliveryHidden").checked,
    }), "Сохранить поставку",
  );
  function readGoods() {
    return goods.map((_, i) => ({ item_id: val("deliveryItem" + i), quantity: num("deliveryQty" + i) }));
  }
  function drawGoods() {
    const panel = $("deliveryGoods");
    panel.innerHTML = "";
    goods.forEach((row, i) => {
      const line = document.createElement("div");
      line.className = "row trade-editor-row";
      line.innerHTML = pick("Товар " + (i + 1), "deliveryItem" + i, pairs(items), row.item_id) +
        input("Количество", "deliveryQty" + i, "number", row.quantity, 'required min="1" step="1"');
      const remove = button("Убрать", () => { goods = readGoods().filter((_, index) => index !== i); drawGoods(); });
      remove.type = "button";
      remove.disabled = goods.length === 1;
      line.append(remove);
      panel.append(line);
    });
  }
  const add = button("Добавить товар", () => {
    if (goods.length >= 30) return;
    goods = [...readGoods(), { item_id: items[0].id, quantity: 1 }];
    drawGoods();
  });
  add.type = "button";
  $("deliveryControls").append(add);
  drawGoods();
  function readDeliveryRewards() {
    return rewards.map((row, i) => {
      const type = val("deliveryRewardType" + i);
      return type === "item" ? { type, item_id: $("deliveryRewardTarget" + i)?.value || "", quantity: num("deliveryRewardAmount" + i) } :
        { type, amount: num("deliveryRewardAmount" + i), ...(type === "rep" ? { faction: $("deliveryRewardTarget" + i)?.value || "" } : {}) };
    });
  }
  function drawRewards() {
    const panel = $("deliveryRewards");
    panel.innerHTML = "";
    rewards.forEach((row, i) => {
      const line = document.createElement("div"), type = row.type;
      line.className = "row trade-editor-row";
      line.innerHTML = pick("Тип награды", "deliveryRewardType" + i,
        [["gold", "Золото"], ["item", "Предмет"], ["rep", "Репутация"]], type) +
        (type === "item" ? pick("Предмет", "deliveryRewardTarget" + i, pairs(S.engine.items), row.item_id) :
          type === "rep" ? pick("Фракция", "deliveryRewardTarget" + i, pairs(S.factions), row.faction) : "") +
        input(type === "rep" ? "Очки" : type === "item" ? "Количество" : "Золото, зм", "deliveryRewardAmount" + i,
          "number", type === "item" ? row.quantity || row.qty || 1 : row.amount ?? 0,
          type === "gold" ? 'required min="0" step="0.01"' : type === "item" ? 'required min="1" step="1"' : 'required step="1"');
      const remove = button("Убрать награду", () => {
        rewards = readDeliveryRewards().filter((_, index) => index !== i);
        drawRewards();
      });
      remove.type = "button";
      remove.disabled = rewards.length === 1;
      line.append(remove);
      panel.append(line);
      $("deliveryRewardType" + i).onchange = (event) => {
        rewards = readDeliveryRewards();
        rewards[i] = { type: event.target.value, amount: 0 };
        drawRewards();
      };
    });
  }
  const addReward = button("Добавить награду", () => {
    if (rewards.length >= 30) return;
    rewards = [...readDeliveryRewards(), { type: "gold", amount: 0 }];
    drawRewards();
  });
  addReward.type = "button";
  $("deliveryRewardControls").append(addReward);
  drawRewards();
}
function deliveryDetail(q) {
  const quote = deliveryQuote(S, actor, chosen(), q);
  return '<section class="trade-delivery"><h3>Условия поставки</h3><p>' +
    esc(q.consignee + " · до дня " + q.due_day + ", " + q.due_year + "-й год") + '</p><p>' +
    esc((q.stock_source === "shared" ? "Поставка из общего банка" : "Поставка из личных сумок") +
      " · награда " + (q.reward_recipient === "hero" ? "исполнителю" : "компании")) +
    '</p><ul>' + quote.goods.map((row) => '<li>' +
      esc((S.engine.items.find((item) => item.id === row.item_id)?.name || row.item_id) + " × " + row.quantity +
        (!q.rewardReceipt ? " (" + row.have + " доступно)" : "")) + '</li>').join("") + '</ul>' +
    (q.rewardReceipt ? '<p>Поставка завершена.</p>' : quote.reasons.length ?
      '<p class="muted">' + esc(quote.reasons.join(" · ")) + '</p>' : '') + '</section>';
}
function confirmDelivery(id) {
  const q = S.contracts.find((row) => row.id === id), hero = chosen();
  if (!q || q.type !== "delivery" || !hero) return;
  commandForm(q.title, deliveryDetail(q), "deliverGoods", () => ({ id, hero }), "Доставить товары");
}

function equipmentDetails(stack, catalog) {
  const baseId = stack?.base_item_id || catalog?.base_item_id;
  const base = baseId && S.engine.items.find((item) => item.id === baseId);
  const rules = stack?.rules || catalog?.rules || base?.rules;
  const source = stack?.source || catalog?.source;
  const ids = stack?.craft_properties || catalog?.craft_properties || [];
  const traits = stack?.craftedTraits || ids.map((id) => S.engine.craftProperties?.find((row) => row.id === id)).filter(Boolean);
  if (!rules && !traits.length) return "";
  return '<section><h3>' + (base ? "Книжная основа · " + esc(base.name) : "Характеристики предмета") +
    '</h3>' + (rules ? '<dl class="equipment-rules">' +
      Object.entries(rules).map(([key, value]) => '<div><dt>' + esc(key) + '</dt><dd>' +
        esc(typeof value === "object" ? JSON.stringify(value) : value) + '</dd></div>').join("") +
      '</dl>' : "") + '<small>' + esc([sourceLabel(source), base && sourceLabel(base.source)].filter(Boolean).join(" · ")) + '</small>' +
    (traits.length ? '<h3>Ремесленные свойства</h3>' + traits.map((trait) =>
      '<h4>' + esc(trait.name) + '</h4><p>' + esc([propertyKinds[trait.kind], trait.trigger,
        trait.action, trait.effect, trait.limits, trait.uses && trait.uses + " · " + trait.recovery, sourceLabel(trait.source)]
        .filter(Boolean).join(" · ")) + '</p>').join("") : "") + '</section>';
}
