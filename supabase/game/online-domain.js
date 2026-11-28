function projectFields(row, fields) {
  return Object.fromEntries(fields.split(" ").filter((key) => Object.hasOwn(row || {}, key))
    .map((key) => [key, row[key]]));
}
function publicRows(rows) {
  return (rows || []).filter((row) => !row.hidden && !row.archived);
}
function containsId(rows, id) {
  return (rows || []).some((row) => row.id === id);
}
const publicItem = "id name item_id owner qty desc icon iconId category quality value_gp unit profession_id stackable original base_item_id craft_slots magic_slots craft_properties trade_product fragmentOrigin";
const publicRecipe = "id name profession_id item_id quantity hours rank gold basic service facility_rank tempo_class trade_product tools locations description acquisition equipment";
const publicConditions = "race class level skill recipe profession item faction rep npc achievement quest";
const publicEntry = "id title body category source location faction day year group rewardTitle points closed unique attitude promises";
function recipePreview(row) {
  return { ...projectFields(row, publicRecipe),
    ...(row.experiment ? { experiment: projectFields(row.experiment, "skill tool") } : {}),
    ...(row.properties ? { properties: {} } : {}),
  };
}

function gameView(state, access) {
  const a = access.actor;
  if (a.role === "master") return state;
  const e = state.engine, c = state.company, mine = new Set(a.role === "observer" ? [] : a.heroes);
  const members = c.members.filter((row) => !row.hidden || mine.has(row.id));
  const crew = new Set(members.map((row) => row.id));
  const canSeePlace = (row) => row.visibility === "known" && !row.hidden;
  const nodes = state.nodes.filter(canSeePlace);
  const locations = new Set(nodes.map((row) => row.id));
  const routes = publicRows(state.routes).filter((row) => row.visibility === "known" && locations.has(row.a) && locations.has(row.b));
  const factions = publicRows(state.factions);
  const factionIds = new Set(factions.map((row) => row.id));
  const inventory = publicRows(c.inventory).filter((row) => !row.owner || row.owner.startsWith("member:") && mine.has(row.owner.slice(7)));
  const itemIds = new Set(inventory.map((row) => row.item_id));
  const items = (e.items || []).filter((row) => !row.archived && (!row.hidden || itemIds.has(row.id)));
  const visibleItem = new Set(items.map((row) => row.id));
  const recipes = publicRows(e.recipes).filter((row) => visibleItem.has(row.item_id));
  const contracts = publicRows(state.contracts).filter((row) => !row.location || locations.has(row.location));
  const questIds = new Set(contracts.map((row) => row.id));
  const rewardVisible = (row) => !row.secret && (!row.item_id || visibleItem.has(row.item_id)) &&
    (!row.faction || factionIds.has(row.faction));
  const rewardFields = "type amount item_id qty quantity faction name category quality owner text";
  const ownProfile = (row) => ({
    ...projectFields(row, "race class level stats skills tools professions recipes professionsLimited bonus proficiency wallet trained failedRelics"),
    contacts: (row.contacts || []).filter((id) => containsId(publicRows(state.portal?.people), id)),
  });
  const portal = {};
  for (const key of ["news", "rumors", "mail", "codex", "chronicle", "people", "achievements"]) {
    portal[key] = publicRows(state.portal?.[key]).filter((row) =>
      !["news", "rumors", "mail"].includes(key) ||
      (row.year || 27) < c.year || (row.year || 27) === c.year && (row.day || 1) <= c.day,
    ).flatMap((row) => {
      if (key === "achievements") {
        const grants = (row.grants || []).filter((g) => g.recipient === "company" ||
          g.recipient?.startsWith("hero:") && mine.has(g.recipient.slice(5)));
        if (row.secret && !row.closed && !grants.length) return [];
        return [{ ...projectFields(row, row.closed ? "id title closed points category" : publicEntry),
          grants: grants.map((grant) => projectFields(grant, "recipient name date")) }];
      }
      const view = projectFields(row, publicEntry);
      if (key === "people" && row.participation) {
        const p = row.participation;
        view.participation = {
          companion: p.companion ? projectFields(p.companion, "state role location joined circumstances goals questIds") : null,
          specialist: p.specialist ? projectFields(p.specialist, "role legacyStaff") : null,
          actions: publicRows(p.actions).map((x) => ({
            ...projectFields(x, "id name description kind target phase location gold hours states"),
            conditions: projectFields(x.conditions, publicConditions),
          })),
        };
      }
      return [view];
    });
  }
  const activeStay = currentStay(state);
  const t = locations.has(activeStay?.location) ? activeStay : null;
  const stay = t ? {
    ...projectFields(t, "id name location region days hours start services description limits early showDC"),
    spent: Object.fromEntries(Object.entries(t.spent || {}).filter(([id]) => mine.has(id))),
    history: (t.history || []).filter((row) => mine.has(row.hero)).slice(-160)
      .map((row) => projectFields(row, "hero hours activity item_id qty day result")),
    plans: (t.plans || []).filter((row) => mine.has(row.hero)).map((row) => projectFields(row, "id hero activity hours done")),
    carcasses: publicRows(t.carcasses).map((row) => projectFields(row, "id name kind used" + (t.showDC === false ? "" : " cr"))),
  } : null;
  const j = state.journey;
  const journey = j && access.share_map && containsId(routes, j.routeId) ? {
    ...projectFields(j, "routeId from to routeName start days risk guide guideDie guideSides cost rolls outcome guideCheck"),
    events: Array.from({ length: 6 }, (_, i) => i + 1 === j.outcome ? j.events?.[i] || "" : ""),
  } : null;
  const mapPath = access.map_path;
  const map = mapPath && access.prefix + state.map?.src?.slice(atlasStorageReference.length) === mapPath
    ? projectFields(state.map, "src w h name") : null;
  return {
    version: 1, map, journey,
    nodes: nodes.map((row) => ({ ...projectFields(row, "id name type regionId visibility desc faction"),
      x: access.share_map ? row.x : 0, y: access.share_map ? row.y : 0 })),
    routes: access.share_map ? routes.map((row) => projectFields(row, "id name a b kind min max risk status visibility cost desc")) : [],
    factions: factions.map((row) => projectFields(row, "id name leader color icon iconId desc repPoints rep charter region")),
    diplomacy: publicRows(state.diplomacy).filter((row) => factionIds.has(row.a) && factionIds.has(row.b))
      .map((row) => projectFields(row, "id a b state desc day year")),
    journal: publicRows(state.journal).filter((row) => row.kind !== "achievement").slice(0,150)
      .map((row) => projectFields(row, row.kind === "contract" ? "id kind title day year" : "id kind title text day year")),
    worldBook: publicRows(state.worldBook?.chapters).length ? {
      ...projectFields(state.worldBook, "title subtitle year author"),
      chapters: publicRows(state.worldBook.chapters).map((row) => ({ ...projectFields(row, "uxid title text"), image: "" })),
    } : undefined,
    settings: { achievementBookInstalled: true },
    portal,
    contracts: contracts.map((row) => ({
      ...projectFields(row, "id type title desc objectives employer giver faction location status reward rewardRevealed hours region_id repeat period consignee due_day due_year stock_source reward_recipient"),
      conditions: projectFields(row.conditions, publicConditions),
      goods: (row.goods || []).filter((g) => visibleItem.has(g.item_id)).map((g) => projectFields(g, "item_id quantity")),
      rewards: (row.rewards || []).filter((x) => (!row.rewardHidden || row.rewardRevealed) && rewardVisible(x)).map((x) => projectFields(x, rewardFields)),
      ...(row.rewardRevealed && row.rewardSecret ? { rewardSecret: row.rewardSecret } : {}),
      ...(row.rewardReceipt ? { rewardReceipt: {
        ...projectFields(row.rewardReceipt, "day year"),
        rewards: (row.rewardReceipt.rewards || []).filter((x) => row.rewardRevealed || rewardVisible(x))
          .map((x) => projectFields(x, rewardFields)),
      } } : {}),
    })),
    company: {
      ...projectFields(c, "name day year gold notes development talents"),
      location: locations.has(c.location) ? c.location : "",
      members: members.map((row) => {
        const hero = projectFields(row, "id name role bio active race class faction factionRank mod");
        if (mine.has(row.id) && access.portraits?.[row.id] === access.prefix + row.image?.slice(atlasStorageReference.length))
          hero.image = row.image;
        return hero;
      }),
      staff: publicRows(c.staff).map((row) => projectFields(row, "id name role desc")),
      inventory: inventory.map((row) => ({
        ...projectFields(row, publicItem),
        ...(row.properties ? {properties: projectFields(row.properties, "otherAttuned")} : {}),
      })),
    },
    engine: {
      schemaVersion: 1, receipts: [], phase: e.phase,
      regions: publicRows(e.regions).filter((row) => row.id === t?.region || nodes.some((place) => place.regionId === row.id))
        .map((row) => ({...projectFields(row, "id name continent biome description tier levels danger"), dc: t?.showDC === false ? 10 : row.dc})),
      stays: stay ? [stay] : [],
      profiles: Object.fromEntries(Object.entries(e.profiles || {}).filter(([id]) => mine.has(id)).map(([id,value]) => [id,ownProfile(value)])),
      rolls: (e.rolls || []).filter((row) => mine.has(row.hero)).slice(0,100)
        .map((row) => projectFields(row, "hero label natural raw mod total success showDC" + (row.showDC === false ? "" : " dc"))),
      professions: publicRows(e.professions).map((row) => projectFields(row, "id name kind description summary special tools skill icon iconId")),
      items: items.map((row) => projectFields(row, publicItem)),
      recipes: recipes.map(recipePreview),
      ingredients: publicRows(e.ingredients).filter((row) => containsId(recipes,row.recipe_id) && visibleItem.has(row.item_id))
        .map((row) => projectFields(row, "id recipe_id item_id quantity")),
      loot: publicRows(e.loot).filter((row) => row.region_id === t?.region && visibleItem.has(row.item_id)).map((row) => ({
        ...projectFields(row, "id region_id profession_id item_id hours attempts skill required_tool_id"),
        stock: row.stock === 0 ? 0 : 1, weight: 1, min_quantity: 1, max_quantity: 1, min_margin: 0,
        ...(t.showDC !== false ? { dc: row.dc } : {}),
      })),
      gathering: (e.gathering || []).map((row) => projectFields(row, "common_gp rare_gp dc")),
      solutions: publicRows(e.solutions).filter((row) => questIds.has(row.quest_id))
        .map((row) => projectFields(row, "id quest_id name skill stat tool encounter")),
      completions: (e.completions || []).filter((row) => mine.has(row.hero)).slice(-150)
        .map((row) => projectFields(row, "hero quest option stay day result")),
      projects: (e.projects || []).filter((row) => mine.has(row.hero)).slice(-100).map((row) => ({
        ...projectFields(row, "id hero name cost qty left work status"),
        recipe: recipePreview(row.recipe),
        reserve: (row.reserve || []).map((x) => projectFields(x,"item qty")),
        contributors: (row.contributors || []).filter((x) => crew.has(x.hero)).map((x) => projectFields(x, "hero hours")),
      })),
      markets: publicRows(e.markets).filter((row) => row.node_id === t?.location && visibleItem.has(row.item_id)
        && (!row.faction_id || factionIds.has(row.faction_id)))
        .map((row) => projectFields(row, "id node_id item_id faction_id stock demand budget buy_factor sell_factor rep_bonuses")),
      localServices: publicRows(e.localServices).filter((row) => row.node_id === t?.location)
        .map((row) => projectFields(row, "id node_id service profession_id fee hours tier")),
      craftProperties: publicRows(e.craftProperties).map((row) => projectFields(row, "id name kind trigger action effect limits uses recovery")),
      facilities: publicRows(e.facilities).map((row) => projectFields(row, "id service tier2_gp tier3_gp rent1_gp rent2_gp rent3_gp")),
      facilityTiers: e.facilityTiers,
      campEffects: Object.fromEntries(Object.entries(e.campEffects || {}).map(([id,value]) =>
        [id,projectFields(value,"service profession recipes bonus advantage discount speed wage productivity")])),
      campUpgrades: publicRows(e.campUpgrades).map((row) => projectFields(row, "id service profession recipes bonus advantage discount speed wage productivity")),
      companionRequests: (e.companionRequests || []).filter((row) => mine.has(row.hero)).map((row) =>
        projectFields(row,"id npc action hero title message response gold hours day year status")),
      ...projectFields(e, "categories captainBank requireTrainer refund"),
      sharedHeroes: (e.sharedHeroes || []).filter((id) => mine.has(id)),
    },
  };
}

function initializeGame(document) {
  const state = migrate(structuredClone(document));
  state.settings ??= {};
  state.company.inventory ??= [];
  state.company.talents ??= {};
  state.portal ??= {};
  state.journal ??= [];
  state.contracts ??= [];
  adventure(state);
  tradeState(state);
  return state;
}
const heroCommands = new Set("profile roll rest schedule resolvePlan transfer withdraw merge gather project craft work cancelProject train disenchant enchant assemble quest tradeDeal tradeDonation deliverGoods companionRequest".split(" "));
function authorizeGameCommand(state, access, name, args) {
  const a = access.actor;
  if (a.role === "master") return;
  requireThat(["player","captain"].includes(a.role), "Действие недоступно");
  if (["travelStart","travelRoll","travelGuide"].includes(name)) {
    requireThat(a.role === "captain" && a.travel && access.share_map, "Нет права вести отряд");
    if (name !== "travelStart") {
      const r = state.routes.find((row) => row.id === state.journey?.routeId);
      requireThat(r?.visibility === "known" && !r.hidden && [r.a,r.b].every((id) =>
        state.nodes.some((node) => node.id === id && node.visibility === "known" && !node.hidden)), "Переход недоступен");
    }
    return;
  }
  requireThat(heroCommands.has(name) && owned(a, args.hero), "Действие недоступно");
  const assertVisible = (rows, id) => requireThat(publicRows(rows).some((row) => row.id === id), "Действие недоступно");
  if (args.stack) assertVisible(state.company.inventory,args.stack);
  if (args.to) requireThat(state.company.members.some((row) => row.id === args.to && !row.hidden), "Получатель недоступен");
  if (args.recipe) {
    assertVisible(state.engine.recipes,args.recipe);
    const recipe=byId(state.engine.recipes,args.recipe);
    if (recipe.item_id) assertVisible(state.engine.items,recipe.item_id);
  }
  if (args.resource) assertVisible(state.engine.items,args.resource);
  if (args.fragment) assertVisible(state.engine.items,args.fragment);
  if (args.profession) assertVisible(state.engine.professions,args.profession);
  if (args.carcass) assertVisible(currentStay(state)?.carcasses,args.carcass);
  if (args.project) requireThat(owned(a,byId(state.engine.projects,args.project).hero), "Проект недоступен");
  if (name === "quest") assertVisible(state.contracts,args.quest);
  if (name === "deliverGoods") assertVisible(state.contracts,args.id);
  if (["rest","gather","craft","project","work","schedule","resolvePlan","disenchant","train","enchant","assemble","quest"].includes(name)) {
    const t = currentStay(state);
    requireThat(t && !state.nodes.find((row) => row.id === t.location)?.hidden &&
      state.nodes.find((row) => row.id === t.location)?.visibility === "known", "Стоянка недоступна");
  }
}
function mutateGame(access, name, args, key) {
  const state = initializeGame(access.document);
  inspectJSON(args);
  requireThat(args && !Array.isArray(args) && typeof args === "object", "Некорректные параметры");
  authorizeGameCommand(state,access,name,args);
  if (name === "masterSave") {
    requireThat(access.actor.role === "master", "Действие недоступно");
    requireThat(JSON.stringify(args.document?.engine?.receipts) === JSON.stringify(state.engine.receipts),
      "Редактор не может изменять журнал игровых операций");
    return initializeGame(args.document);
  }
  const next = applyCommand(state,access.actor,name,args,key);
  const counters = {
    contract:next.contracts.filter((row)=>row.status==="done").length,
    arrival:next.journal.filter((row)=>row.kind==="travel"&&row.title?.startsWith("Прибытие:")).length,
    staff:companySpecialists(next).length,
    charter:next.factions.filter((row)=>row.charter).length,
    talent:Object.values(next.company.talents).filter(Boolean).length,
  };
  for (const row of next.portal.achievements || []) {
    if (row.auto && counters[row.auto] >= (row.target || 1))
      grant(next,{type:"achievement",achievement:row.id});
  }
  return next;
}
