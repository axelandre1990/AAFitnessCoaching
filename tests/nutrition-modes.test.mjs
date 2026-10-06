import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
const root=new URL('..',import.meta.url);
const scripts=existsSync(new URL('scripts/',root))?'scripts/':'';
const {resolveMacroTargets,normalizeNutritionModes,dailyTotals}=await import(new URL(scripts+'nutrition-builder.js',root));

test('explicit macro units and calorie conversion validate coach input',()=>{
 assert.deepEqual(resolveMacroTargets({mode:'grams',protein_g:100,carbs_g:200,fat_g:60}),{protein_g:100,carbs_g:200,fat_g:60,kcal:1740,fiber_g:24.36});
 const percent=resolveMacroTargets({mode:'percent',calorieTarget:2000,protein_percent:30,carbs_percent:50,fat_percent:20});
 assert.equal(percent.protein_g,150);assert.equal(percent.carbs_g,250);assert.equal(percent.kcal,2000);
 assert.equal(resolveMacroTargets({mode:'perKg',bodyweightKg:80,protein_perKg:2,fat_perKg:1,calorieTarget:2400}).carbs_g,260);
 assert.equal(resolveMacroTargets({mode:'perKg',bodyweightKg:80,protein_perKg:2,fat_perKg:1,carbsMethod:'ratio',carbs_perKg:3}).carbs_g,240);
 for(const input of [{mode:'percent',calorieTarget:2000,protein_percent:20,carbs_percent:20,fat_percent:20},{mode:'perKg',bodyweightKg:'',protein_perKg:2,fat_perKg:1,calorieTarget:2400},{mode:'perKg',bodyweightKg:80,protein_perKg:2,fat_perKg:1,calorieTarget:100},{mode:'grams',protein_g:-1,carbs_g:0,fat_g:0}])assert.throws(()=>resolveMacroTargets(input));
});
test('historical variant migration preserves original diets and makes STANDARD default',()=>{
 const plan={schema:'aa-nutrition-plan',meals:[],variants:{training:{meals:[],notes:'training'},rest:{meals:[],notes:'rest'},custom:{meals:[],notes:'custom'}},activeVariant:'training'};
 const state=normalizeNutritionModes(plan);assert.equal(state.mode,'standard');assert.equal(state.variants.standard.notes,'training');assert.equal(state.variants.custom.notes,'custom');assert.deepEqual(plan.variants,state.variants && {training:state.variants.training,rest:state.variants.rest,custom:state.variants.custom});
 assert.equal(normalizeNutritionModes({...plan,nutritionMode:'highLow'}).variants.low.notes,'rest');
 assert.equal(dailyTotals([{items:[{grams:50,per100g:{kcal:900,protein_g:10,carbs_g:20,fat_g:5}}]}]).kcal,450);
});
test('coach mode toggles preserve all diets; client exposes only one or two; setTargets stays compatible',async()=>{
 const require=createRequire(import.meta.url);let playwright;try{playwright=require('playwright');}catch{playwright=require('/Users/axelandre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
 const source=await readFile(new URL(scripts+'nutrition-builder.js',root));
 const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url.includes('.js')?'application/javascript':'text/html');res.end(req.url.includes('.js')?source:'<div id="coach"></div><div id="client"></div>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await playwright.chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(modulePath=>{window.nutritionModulePath=modulePath;},'/'+scripts+'nutrition-builder.js');
  await page.evaluate(async()=>{
   window.fetch=async()=>({ok:true,json:async()=>({foods:[]})});window.n=await import(window.nutritionModulePath);
   const diet=notes=>({schema:'aa-nutrition-plan',version:1,meals:[],targets:{protein_g:100,carbs_g:200,fat_g:60},notes});
   window.builder=await n.mountNutritionBuilder(document.querySelector('#coach'),JSON.stringify({...diet('original'),variants:{standard:diet('standard'),training:diet('historical'),custom:diet('archive')},activeVariant:'standard'}));
  });
  assert.equal(await page.locator('#coach details.nutrition-meal').count(),6);
  assert.equal(await page.locator('#coach details.nutrition-meal[open]').count(),1);
  assert.equal(await page.locator('#coach .nutrition-source-options').evaluate(element=>element.open),false);
  const firstMeal=page.locator('#coach .nutrition-meal').first();
  await firstMeal.getByLabel('Repas 1',{exact:true}).fill('Petit déjeuner');
  assert.match(await firstMeal.locator('summary').innerText(),/Petit déjeuner/);
  assert.equal(await page.getByLabel('Mode alimentaire',{exact:true}).inputValue(),'standard');
  assert.equal(await page.getByLabel('Diète à modifier',{exact:true}).isVisible(),false);
  await page.getByLabel('Mode alimentaire',{exact:true}).selectOption('highLow');await page.waitForFunction(()=>!document.querySelector('[aria-label="Mode alimentaire"]').disabled);
  assert.equal(await page.locator('[aria-label="Diète à modifier"] option').count(),2);
  await page.getByLabel('Consignes, préférences et suppléments',{exact:true}).fill('high retained');
  await page.getByLabel('Diète à modifier',{exact:true}).selectOption('low');await page.waitForFunction(()=>!document.querySelector('[aria-label="Mode alimentaire"]').disabled);
  await page.getByLabel('Consignes, préférences et suppléments',{exact:true}).fill('low retained');
  await page.getByLabel('Mode alimentaire',{exact:true}).selectOption('standard');await page.waitForFunction(()=>!document.querySelector('[aria-label="Mode alimentaire"]').disabled);
  const standard=await page.evaluate(()=>{builder.setTargets({protein_g:120,carbs_g:180,fat_g:50});const plan=JSON.parse(builder.serialize());n.renderClientNutrition(document.querySelector('#client'),JSON.stringify(plan));return plan;});
  assert.equal(standard.variants.high.notes,'high retained');assert.equal(standard.variants.low.notes,'low retained');assert.equal(standard.variants.custom.notes,'archive');assert.equal(standard.variants.training.notes,'historical');assert.equal(standard.targets.kcal,1650);
  assert.equal(await page.locator('#client select').count(),0);
  await page.getByLabel('Mode alimentaire',{exact:true}).selectOption('highLow');await page.waitForFunction(()=>!document.querySelector('[aria-label="Mode alimentaire"]').disabled);
  await page.evaluate(()=>n.renderClientNutrition(document.querySelector('#client'),builder.serialize()));assert.equal(await page.locator('#client select option').count(),2);
  await page.locator('#client select').selectOption('low');assert.match(await page.locator('#client').innerText(),/low retained/);
  await page.getByLabel('Saisie des objectifs macros',{exact:true}).selectOption('percent');
  for(const [name,value] of [['calorieTarget','2000'],['protein_percent','30'],['carbs_percent','50'],['fat_percent','20']])await page.locator(`#coach input[name="${name}"]`).fill(value);
  const target=await page.evaluate(()=>JSON.parse(builder.serialize()).targets);assert.equal(target.kcal,2000);assert.equal(target.protein_g,150);assert.equal(target.fiber_g,28);
  const populated=await page.evaluate(async()=>{
   const item={foodId:'synthetic',name:'Aliment de test',source:'AA_CUSTOM',grams:100,per100g:{kcal:123,protein_g:10,carbs_g:5,fat_g:2,fiber_g:1}};
   window.builder=await n.mountNutritionBuilder(document.querySelector('#coach'),JSON.stringify({schema:'aa-nutrition-plan',version:1,targets:{},meals:[{name:'Vide',items:[]},{name:'Repas rempli',items:[item]}]}));
   return [...document.querySelectorAll('#coach .nutrition-meal')].map(element=>element.open);
  });
  assert.deepEqual(populated,[false,true,false,false,false,false]);
  const activeMeal=page.locator('#coach .nutrition-meal[open]');
  assert.match(await activeMeal.locator('summary').innerText(),/123 kcal/);
  await activeMeal.getByLabel('Quantité de Aliment de test en grammes').fill('200');
  assert.match(await activeMeal.locator('summary').innerText(),/246 kcal/);
  await activeMeal.getByRole('button',{name:'Retirer',exact:true}).click();
  assert.match(await activeMeal.locator('summary').innerText(),/0 kcal/);
  await page.getByLabel('Saisie des objectifs macros',{exact:true}).selectOption('percent');
  for(const [name,value] of [['calorieTarget','2000'],['protein_percent','30'],['carbs_percent','50'],['fat_percent','20']])await page.locator(`#coach input[name="${name}"]`).fill(value);
  await page.locator('#coach input[name="fat_percent"]').fill('10');assert.match(await page.evaluate(()=>{try{builder.serialize();return '';}catch(e){return e.message;}}),/100/);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
