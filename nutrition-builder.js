const FORMAT = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 1 });
const MEAL_COUNT = 6;
const SOURCE_RANK = { AA_CUSTOM: 0, CIQUAL_2025: 1, USDA_FOUNDATION_2026: 2, USDA_FNDDS_2021_2023: 3, USDA_SR_LEGACY_2018: 4 };
let catalogPromise;
const MACRO_KEYS = ["protein_g", "carbs_g", "fat_g"];
const hasValue = value => value !== null && value !== undefined && value !== "";

export function macroCalories(macros = {}) {
  const values = MACRO_KEYS.map(key => hasValue(macros[key]) ? Number(macros[key]) : 0);
  if (values.some(value => !Number.isFinite(value) || value < 0)) return null;
  return Number((values[0] * 4 + values[1] * 4 + values[2] * 9).toFixed(2));
}

function node(tag, className = "", text = "") {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== "") result.textContent = text;
  return result;
}

function field(labelText, name, type = "number", step = "1") {
  const label = node("label", "auth-field nutrition-target", labelText);
  const input = document.createElement("input");
  input.name = name;
  input.type = type;
  input.inputMode = type === "number" ? "decimal" : undefined;
  input.min = "0";
  if (type === "number") input.step = step;
  input.placeholder = "—";
  label.append(input);
  return label;
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim();
}

function nutrientsFor(food, grams) {
  const scale = Number.isFinite(Number(grams)) ? Math.max(0, Number(grams)) / 100 : 0;
  const base = food.per100g || {};
  const nutrients = {
    protein_g: Number(base.protein_g || 0) * scale,
    carbs_g: Number(base.carbs_g || 0) * scale,
    fat_g: Number(base.fat_g || 0) * scale,
    fiber_g: base.fiber_g == null ? null : Number(base.fiber_g) * scale
  };
  return { ...nutrients, kcal: macroCalories(nutrients) ?? 0 };
}

function addNutrients(total, contribution) {
  for (const key of ["kcal", "protein_g", "carbs_g", "fat_g"]) total[key] += contribution[key] || 0;
  if (contribution.fiber_g != null) {
    total.fiber_g += contribution.fiber_g;
    total.fiber_count += 1;
  } else total.fiber_missing = true;
}

function emptyTotals() {
  return { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, fiber_count: 0, fiber_missing: false };
}

export function dailyTotals(meals = []) {
  const totals = emptyTotals();
  for (const meal of meals) for (const item of meal.items || []) addNutrients(totals, nutrientsFor(item, item.grams));
  totals.kcal = macroCalories(totals) ?? 0;
  return totals;
}

function renderComparison(container, targets, meals) {
  const actual = dailyTotals(meals);
  const columns = [["kcal", "Calories (kcal)", 1], ["protein_g", "Protéines (g)", 1], ["carbs_g", "Glucides (g)", 1], ["fat_g", "Lipides (g)", 1], ["fiber_g", "Fibres (g)", 1]];
  const table = node("table", "nutrition-comparison__table");
  table.append(node("caption", "", "Comparaison journalière"));
  const head = node("thead"), header = node("tr");
  header.append(node("th", "", "Repères"));
  for (const [, label] of columns) { const th = node("th", "", label); th.scope = "col"; header.append(th); }
  head.append(header); table.append(head);
  const body = node("tbody");
  for (const [type, label] of [["theory", "Théorique"], ["actual", "Plan actuel"], ["delta", "Écart"]]) {
    const row = node("tr", `nutrition-comparison__${type}`), heading = node("th", "", label); heading.scope = "row"; row.append(heading);
    for (const [key, , precision] of columns) {
      const goal = hasValue(targets[key]) && Number.isFinite(Number(targets[key])) ? Number(targets[key]) : null;
      let value = type === "theory" ? goal : type === "actual" ? actual[key] : goal === null ? null : actual[key] - goal;
      if (key === "fiber_g" && type !== "theory" && actual.fiber_missing && (!actual.fiber_count || type === "delta")) value = null;
      const cell = node("td"); cell.dataset.metric = key; cell.dataset.value = value === null ? "" : String(value);
      let rounded = value === null ? null : Number(value.toFixed(precision));
      if (type === "delta" && rounded !== null) rounded = Number((Number(actual[key].toFixed(precision)) - Number(goal.toFixed(precision))).toFixed(precision));
      cell.textContent = rounded === null ? "—" : `${type === "delta" && rounded > 0 ? "+" : ""}${FORMAT.format(rounded === 0 ? 0 : rounded)}`;
      if (key === "fiber_g" && type === "actual" && actual.fiber_missing && actual.fiber_count) cell.textContent += " (partiel)";
      if (type === "delta") cell.dataset.state = rounded === null ? "unset" : rounded === 0 ? "match" : rounded > 0 ? "over" : "under";
      row.append(cell);
    }
    body.append(row);
  }
  table.append(body);
  container.replaceChildren(table, node("p", "nutrition-comparison__note", "Écart = plan actuel − objectif, sur les valeurs affichées. Calories du plan calculées avec 4 × protéines + 4 × glucides + 9 × lipides. Les fibres ne participent pas à ce calcul ; leurs données manquantes sont signalées."));
}

function sourceNote(className) {
  const note = node("p", className, "Sources des aliments : base AA ; Anses. 2025. Table de composition nutritionnelle des aliments Ciqual 2025 ; USDA Agricultural Research Service, FoodData Central. Valeurs ramenées à 100 g ; les aliments USDA sont affichés dans leur langue source.");
  const ciqual = node("a", "nutrition-source-link", "Ciqual 2025");
  ciqual.href = "https://doi.org/10.57745/RDMHWY";
  ciqual.target = "_blank";
  ciqual.rel = "noopener noreferrer";
  const usda = node("a", "nutrition-source-link", "USDA FoodData Central");
  usda.href = "https://fdc.nal.usda.gov/";
  usda.target = "_blank";
  usda.rel = "noopener noreferrer";
  note.append(document.createTextNode(" Références : "), ciqual, document.createTextNode(" et "), usda, document.createTextNode("."));
  return note;
}

function totalsLabel(totals) {
  const fiber = totals.fiber_count ? `${FORMAT.format(totals.fiber_g)} g fibres` : "fibres n.d.";
  return `${Math.round(macroCalories(totals) ?? 0)} kcal · P ${FORMAT.format(totals.protein_g)} g · G ${FORMAT.format(totals.carbs_g)} g · L ${FORMAT.format(totals.fat_g)} g · ${fiber}${totals.fiber_missing && totals.fiber_count ? " (partiel)" : ""}`;
}

async function loadCatalog() {
  if (!catalogPromise) {
    const scriptPath = new URL(import.meta.url).pathname;
    const catalogPath = scriptPath.includes("/scripts/") ? "../data/food-catalog.json" : "./data/food-catalog.json";
    catalogPromise = fetch(new URL(catalogPath, import.meta.url)).then((response) => {
      if (!response.ok) throw new Error("Le catalogue alimentaire ne peut pas être chargé.");
      return response.json();
    }).then((payload) => payload.foods || []);
  }
  return catalogPromise;
}

function parsePlan(value) {
  if (!value) return { structured: null, legacy: "" };
  try {
    const parsed = JSON.parse(value);
    if (parsed?.schema === "aa-nutrition-plan" && Array.isArray(parsed.meals)) return { structured: parsed, legacy: "" };
  } catch { /* Existing V3 plans are plain text. */ }
  return { structured: null, legacy: String(value) };
}

function searchFoods(foods, query) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return foods.map((food) => {
    const name = normalize(food.name);
    const category = normalize(food.category);
    const text = `${name} ${category}`;
    if (!terms.every((term) => text.includes(term))) return null;
    const rank = SOURCE_RANK[food.source] ?? 9;
    const exact = name === terms.join(" ") ? -10 : 0;
    const starts = name.startsWith(terms[0]) ? -2 : 0;
    return { food, score: rank + exact + starts };
  }).filter(Boolean).sort((a, b) => a.score - b.score || a.food.name.localeCompare(b.food.name, "fr")).slice(0, 10).map((entry) => entry.food);
}

function createDefaultMeals(existing = []) {
  return Array.from({ length: MEAL_COUNT }, (_, index) => {
    const meal = existing[index] || {};
    return {
      name: meal.name || `Repas ${index + 1}`,
      notes: meal.notes || "",
      items: (meal.items || []).map((item) => ({ ...item, grams: Number(item.grams) || 0 })),
      selectedFood: null
    };
  });
}

export async function mountNutritionBuilder(container, savedValue = "") {
  container.replaceChildren(node("p", "empty-state", "Chargement du catalogue alimentaire…"));
  const parsed = parsePlan(savedValue);
  const saved = parsed.structured || {};
  const state = {
    targets: { kcal: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "", ...(saved.targets || {}) },
    meals: createDefaultMeals(saved.meals),
    notes: saved.notes || parsed.legacy || ""
  };
  let foods;
  try {
    foods = await loadCatalog();
  } catch (error) {
    container.replaceChildren(node("p", "inline-message inline-message--error", `${error.message} Recharge la page ou vérifie que le fichier de catalogue est publié.`));
    return null;
  }

  const targetsHeading = node("p", "card-kicker", "OBJECTIFS THÉORIQUES JOURNALIERS");
  const targets = node("div", "nutrition-targets");
  let macrosChanged = false;
  const preserveLegacyCalories = hasValue(saved.targets?.kcal) && !MACRO_KEYS.every(key => hasValue(saved.targets?.[key]));
  const comparison = node("div", "nutrition-comparison");
  comparison.setAttribute("role", "region"); comparison.setAttribute("aria-label", "Comparaison des objectifs et du plan alimentaire"); comparison.tabIndex = 0;
  const formulaNote = node("p", "nutrition-calorie-note");
  const targetFields = [
    ["Calories théoriques (kcal)", "kcal", "0.1"],
    ["Protéines (g)", "protein_g", "0.1"],
    ["Glucides (g)", "carbs_g", "0.1"],
    ["Lipides (g)", "fat_g", "0.1"],
    ["Fibres (g)", "fiber_g", "0.1"]
  ];
  for (const [label, key, step] of targetFields) {
    const fieldNode = field(label, key, "number", step);
    fieldNode.querySelector("input").value = state.targets[key] ?? "";
    if (key === "kcal") {
      fieldNode.querySelector("input").readOnly = true;
      fieldNode.querySelector("input").placeholder = "Calcul automatique";
    } else fieldNode.querySelector("input").addEventListener("input", (event) => {
      state.targets[key] = event.currentTarget.value;
      if (MACRO_KEYS.includes(key)) macrosChanged = true;
      refreshDaily();
    });
    targets.append(fieldNode);
  }
  const refreshDaily = () => {
    const keepLegacy = preserveLegacyCalories && !macrosChanged;
    const anyMacro = MACRO_KEYS.some(key => hasValue(state.targets[key]));
    state.targets.kcal = keepLegacy ? saved.targets.kcal : anyMacro ? macroCalories(state.targets) : null;
    targets.querySelector('input[name="kcal"]').value = state.targets.kcal ?? "";
    formulaNote.textContent = keepLegacy
      ? "Objectif calorique antérieur conservé. Dès que tu modifies les macros, les calories sont recalculées automatiquement avec la formule 4 / 4 / 9."
      : "Calories automatiques : 4 kcal/g de protéines + 4 kcal/g de glucides + 9 kcal/g de lipides. Renseigne les macros ci-dessus ; le total se calcule tout seul.";
    renderComparison(comparison, state.targets, state.meals);
  };

  const notesLabel = node("label", "auth-field", "Consignes, préférences et suppléments");
  const notesInput = node("textarea");
  notesInput.name = "nutrition_notes";
  notesInput.rows = 3;
  notesInput.maxLength = 6000;
  notesInput.placeholder = "Repères, préférences, allergies, suppléments…";
  notesInput.value = state.notes;
  notesInput.addEventListener("input", (event) => { state.notes = event.currentTarget.value; });
  notesLabel.append(notesInput);

  const mealsWrap = node("div", "nutrition-meals");
  const renderedMeals = [];
  const refreshMeal = (index) => {
    const meal = state.meals[index];
    const mealEl = renderedMeals[index];
    if (!mealEl) return;
    const total = emptyTotals();
    for (const item of meal.items) addNutrients(total, nutrientsFor(item, item.grams));
    mealEl.querySelector(".nutrition-meal__totals").textContent = totalsLabel(total);
    const itemList = mealEl.querySelector(".nutrition-items");
    itemList.replaceChildren();
    for (const [itemIndex, item] of meal.items.entries()) {
      const row = node("div", "nutrition-item");
      row.dataset.itemIndex = String(itemIndex);
      const name = node("span", "nutrition-item__name", item.name);
      const amountLabel = node("label", "nutrition-item__amount", "g");
      const amount = document.createElement("input");
      amount.type = "number";
      amount.min = "0";
      amount.step = "1";
      amount.inputMode = "decimal";
      amount.value = String(item.grams);
      amount.setAttribute("aria-label", `Quantité de ${item.name} en grammes`);
      amount.addEventListener("input", (event) => {
        item.grams = Math.max(0, Number(event.currentTarget.value) || 0);
        const line = nutrientsFor(item, item.grams);
        row.querySelector(".nutrition-item__macros").textContent = `${Math.round(line.kcal)} kcal · P ${FORMAT.format(line.protein_g)} · G ${FORMAT.format(line.carbs_g)} · L ${FORMAT.format(line.fat_g)}`;
        mealEl.querySelector(".nutrition-meal__totals").textContent = totalsLabel(meal.items.reduce((sum, current) => {
          addNutrients(sum, nutrientsFor(current, current.grams)); return sum;
        }, emptyTotals()));
        refreshDaily();
      });
      amountLabel.append(amount);
      const line = nutrientsFor(item, item.grams);
      const macros = node("span", "nutrition-item__macros", `${Math.round(line.kcal)} kcal · P ${FORMAT.format(line.protein_g)} · G ${FORMAT.format(line.carbs_g)} · L ${FORMAT.format(line.fat_g)}`);
      const remove = node("button", "nutrition-item__remove", "Retirer");
      remove.type = "button";
      remove.dataset.removeItem = "true";
      row.append(name, amountLabel, macros, remove);
      itemList.append(row);
    }
    refreshDaily();
  };

  for (const [index, meal] of state.meals.entries()) {
    const section = node("section", "nutrition-meal");
    section.dataset.mealIndex = String(index);
    const heading = node("div", "nutrition-meal__heading");
    const nameLabel = node("label", "auth-field", `Repas ${index + 1}`);
    const nameInput = document.createElement("input");
    nameInput.value = meal.name;
    nameInput.maxLength = 80;
    nameInput.addEventListener("input", (event) => { meal.name = event.currentTarget.value; });
    nameLabel.append(nameInput);
    heading.append(nameLabel);

    const searchLabel = node("label", "auth-field nutrition-search", "Rechercher un aliment");
    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.autocomplete = "off";
    searchInput.placeholder = "Ex. skyr, riz, poulet…";
    searchInput.setAttribute("aria-label", `Rechercher un aliment pour ${meal.name}`);
    const resultBox = node("div", "nutrition-search__results");
    searchLabel.append(searchInput);
    const selected = node("p", "nutrition-search__selected", "Aucun aliment sélectionné");
    const addRow = node("div", "nutrition-add-row");
    const gramsLabel = node("label", "auth-field", "Quantité (g)");
    const gramsInput = document.createElement("input");
    gramsInput.type = "number";
    gramsInput.min = "1";
    gramsInput.max = "5000";
    gramsInput.step = "1";
    gramsInput.value = "100";
    gramsInput.inputMode = "decimal";
    gramsLabel.append(gramsInput);
    const addButton = node("button", "auth-secondary nutrition-add", "Ajouter l’aliment");
    addButton.type = "button";
    addButton.dataset.addFood = "true";
    addRow.append(gramsLabel, addButton);

    const items = node("div", "nutrition-items");
    const total = node("p", "nutrition-meal__totals", "0 kcal · P 0 g · G 0 g · L 0 g · fibres n.d.");
    const notesLabel = node("label", "auth-field nutrition-meal__notes", "Note du repas (facultatif)");
    const mealNote = document.createElement("input");
    mealNote.value = meal.notes;
    mealNote.maxLength = 300;
    mealNote.placeholder = "Horaire, consigne ou variante";
    mealNote.addEventListener("input", (event) => { meal.notes = event.currentTarget.value; });
    notesLabel.append(mealNote);
    section.append(heading, searchLabel, resultBox, selected, addRow, items, total, notesLabel);
    mealsWrap.append(section);
    renderedMeals.push(section);

    let searchTimer;
    searchInput.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        resultBox.replaceChildren();
        for (const food of searchFoods(foods, searchInput.value)) {
          const result = node("button", "nutrition-search__result");
          result.type = "button";
          result.dataset.foodId = food.id;
          const resultName = node("strong", "", food.name);
          const source = node("span", "nutrition-search__source", `${food.category || food.source} · ${food.source.replaceAll("_", " ")}`);
          result.append(resultName, source);
          resultBox.append(result);
        }
        if (searchInput.value.trim() && !resultBox.childElementCount) resultBox.append(node("p", "empty-state", "Aucun aliment trouvé."));
      }, 120);
    });
    section._selectedFood = null;
    section._selected = selected;
    section._grams = gramsInput;
    refreshMeal(index);
  }

  refreshDaily();
  container.replaceChildren(targetsHeading, targets, formulaNote, comparison, sourceNote("nutrition-source-note"), notesLabel, node("p", "card-kicker nutrition-meals__title", "COMPOSITION DES REPAS"), mealsWrap);
  container.onclick = (event) => {
    const section = event.target.closest(".nutrition-meal");
    if (!section) return;
    const index = Number(section.dataset.mealIndex);
    const meal = state.meals[index];
    const selectedResult = event.target.closest("[data-food-id]");
    if (selectedResult) {
      const selectedFood = foods.find((food) => food.id === selectedResult.dataset.foodId);
      section._selectedFood = selectedFood || null;
      section._selected.textContent = selectedFood ? `${selectedFood.name} · ${selectedFood.source.replaceAll("_", " ")}` : "Aucun aliment sélectionné";
      section.querySelector(".nutrition-search__results").replaceChildren();
      return;
    }
    if (event.target.closest("[data-add-food]")) {
      const food = section._selectedFood;
      const grams = Number(section._grams.value);
      if (!food || !Number.isFinite(grams) || grams <= 0) return;
      meal.items.push({ foodId: food.id, name: food.name, source: food.source, grams, per100g: { ...food.per100g } });
      section._selectedFood = null;
      section._selected.textContent = "Aucun aliment sélectionné";
      section.querySelector("input[type=search]").value = "";
      refreshMeal(index);
      return;
    }
    if (event.target.closest("[data-remove-item]")) {
      const row = event.target.closest(".nutrition-item");
      meal.items.splice(Number(row.dataset.itemIndex), 1);
      refreshMeal(index);
    }
  };

  return {
    serialize() {
      for (const [key, value] of Object.entries(state.targets)) {
        if (hasValue(value) && (!Number.isFinite(Number(value)) || Number(value) < 0)) throw new Error(`Vérifie l’objectif ${targetFields.find(field => field[1] === key)?.[0] || key} : indique un nombre positif ou zéro.`);
      }
      refreshDaily();
      return JSON.stringify({
        schema: "aa-nutrition-plan",
        version: 1,
        targets: Object.fromEntries(Object.entries(state.targets).map(([key, value]) => [key, !hasValue(value) ? null : Number(value)])),
        notes: state.notes.trim(),
        meals: state.meals.map((meal) => ({
          name: meal.name.trim() || "Repas",
          notes: meal.notes.trim(),
          items: meal.items.map((item) => ({ foodId: item.foodId, name: item.name, source: item.source, grams: Number(item.grams), per100g: item.per100g }))
        }))
      });
    }
  };
}

export function renderClientNutrition(target, savedValue) {
  const parsed = parsePlan(savedValue);
  target.replaceChildren();
  if (!parsed.structured) {
    target.append(node("p", "", parsed.legacy || "Ton coach n’a pas encore ajouté de repères nutrition."));
    return;
  }
  const plan = parsed.structured;
  const targetList = [
    ["Calories", MACRO_KEYS.every(key => hasValue(plan.targets?.[key])) ? macroCalories(plan.targets) : plan.targets?.kcal, "kcal"],
    ["Protéines", plan.targets?.protein_g, "g"],
    ["Glucides", plan.targets?.carbs_g, "g"],
    ["Lipides", plan.targets?.fat_g, "g"],
    ["Fibres", plan.targets?.fiber_g, "g"]
  ].filter(([, value]) => value != null);
  if (targetList.length) {
    const targets = node("div", "client-nutrition-targets");
    for (const [label, value, unit] of targetList) targets.append(node("span", "client-nutrition-target", `${label} · ${FORMAT.format(value)} ${unit}`));
    target.append(targets);
  }
  if (plan.notes) target.append(node("p", "programme-copy__notes", plan.notes));
  if (plan.meals.some(meal => meal.items?.length)) target.append(node("p", "client-nutrition-daily", `Total du plan par jour (4 / 4 / 9) : ${totalsLabel(dailyTotals(plan.meals))}`));
  const meals = node("div", "client-nutrition-meals");
  let hasItems = false;
  for (const meal of plan.meals) {
    if (!meal.items?.length && !meal.notes) continue;
    hasItems = true;
    const section = node("section", "client-nutrition-meal");
    section.append(node("h4", "", meal.name));
    if (meal.notes) section.append(node("p", "", meal.notes));
    const list = node("ul");
    for (const item of meal.items || []) {
      const line = nutrientsFor(item, item.grams);
      list.append(node("li", "", `${item.name} · ${FORMAT.format(item.grams)} g · ${Math.round(line.kcal)} kcal · P ${FORMAT.format(line.protein_g)} g · G ${FORMAT.format(line.carbs_g)} g · L ${FORMAT.format(line.fat_g)} g`));
    }
    section.append(list);
    meals.append(section);
  }
  if (hasItems) target.append(meals);
  else if (!plan.notes && !targetList.length) target.append(node("p", "", "Le plan alimentaire est prêt à être complété par le coach."));
  target.append(sourceNote("nutrition-source-note nutrition-source-note--client"));
}
