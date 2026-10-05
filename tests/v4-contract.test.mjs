import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hasFolders=existsSync(path.join(root,"scripts"));
const pages = hasFolders ? path.resolve(root, "../aa-fitness-coaching-pages") : root;

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

test("food catalog declares and contains its full unique food count", async () => {
  const catalog = await readJson(path.join(root, "data/food-catalog.json"));
  assert.equal(catalog.count, catalog.foods.length);
  assert.ok(catalog.foods.length > 15000);
  assert.equal(new Set(catalog.foods.map((food) => food.id)).size, catalog.foods.length);
});

test("every food has usable per-100 g energy and macro values", async () => {
  const { foods } = await readJson(path.join(root, "data/food-catalog.json"));
  const acceptedSources = new Set(["AA_CUSTOM", "CIQUAL_2025", "USDA_FOUNDATION_2026", "USDA_FNDDS_2021_2023", "USDA_SR_LEGACY_2018"]);
  for (const food of foods) {
    assert.ok(food.id && food.name, `food id/name missing: ${JSON.stringify(food)}`);
    assert.ok(acceptedSources.has(food.source), `unknown source for ${food.id}`);
    assert.ok(food.per100g && typeof food.per100g === "object", `per100g missing for ${food.id}`);
    for (const field of ["kcal", "protein_g", "carbs_g", "fat_g"]) {
      assert.ok(Number.isFinite(food.per100g[field]) && food.per100g[field] >= 0, `${field} invalid for ${food.id}`);
    }
    assert.ok(food.per100g.fiber_g == null || (Number.isFinite(food.per100g.fiber_g) && food.per100g.fiber_g >= 0), `fiber invalid for ${food.id}`);
  }
});

test("coach and client views both connect to the V4 nutrition module", async () => {
  const [dashboard, html] = await Promise.all([
    readFile(path.join(root, hasFolders ? "scripts/dashboard.js" : "dashboard.js"), "utf8"),
    readFile(path.join(root, "index.html"), "utf8")
  ]);
  assert.match(dashboard, /mountNutritionBuilder/);
  assert.match(dashboard, /renderClientNutrition/);
  assert.match(dashboard, /nutritionBuilder\.serialize\(\)/);
  assert.match(html, /id="nutrition-builder"/);
});

test("published Pages files match source and include the nutrition catalog", async () => {
  for (const file of ["index.html", "app.css", "main.js", "auth.js", "install.js", "supabase.js", "data.js", "dashboard.js", "nutrition-builder.js", "training.js", "weekly-checkin.js", "coaching-model.js", "service-worker.js"]) {
    const [source, deployed] = await Promise.all([
      readFile(path.join(root, hasFolders && !["index.html","service-worker.js"].includes(file) ? `${file.endsWith('.css')?'styles':'scripts'}/${file}` : file), "utf8"),
      readFile(path.join(pages, file), "utf8")
    ]);
    if (file === "index.html") {
      assert.match(deployed, /main\.js\?v=17/);
      assert.match(deployed, /id="nutrition-builder"/);
    } else if (file === "service-worker.js") {
      assert.match(deployed, /aa-fitness-coaching-shell-v5/);
    } else {
      assert.equal(deployed, source, `${file} differs between source and Pages output`);
    }
  }
  const [sourceCatalog, deployedCatalog] = await Promise.all([
    readFile(path.join(root, "data/food-catalog.json"), "utf8"),
    readFile(path.join(pages, "data/food-catalog.json"), "utf8")
  ]);
  assert.equal(deployedCatalog, sourceCatalog);
});

