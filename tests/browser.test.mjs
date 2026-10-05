import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require('/Users/axelandre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const {chromium}=playwright;
const root=path.resolve(new URL('..',import.meta.url).pathname);
const scripts=existsSync(path.join(root,'scripts'))?'/scripts':'',styles=existsSync(path.join(root,'styles'))?'/styles':'';
let server,browser,base;
before(async()=>{
 server=createServer(async(req,res)=>{try{
  if(req.url==='/harness'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<html><head><link rel="stylesheet" href="${styles}/tokens.css"><link rel="stylesheet" href="${styles}/app.css"></head><body><main style="max-width:900px;margin:auto;padding:20px"><form id="weekly"></form><div id="builder"></div><div id="client"></div><div id="history"></div><div id="nutrition"></div></main><script type="module">import * as model from '${scripts}/coaching-model.js';import * as weekly from '${scripts}/weekly-checkin.js';import * as training from '${scripts}/training.js';import * as nutrition from '${scripts}/nutrition-builder.js';window.modules={model,weekly,training,nutrition};window.ready=true;</script></body></html>`);return;}
  const rel=decodeURIComponent(req.url.split('?')[0]);const file=path.resolve(root,'.'+rel);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const data=await readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css':'text/html');res.end(data);
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
async function page(){const p=await browser.newPage({viewport:{width:390,height:844}});await p.goto(base+'/harness');await p.waitForFunction(()=>window.ready);return p;}
test('weekly client can answer all 26 questions and sees validation before sending',async()=>{
 const p=await page();await p.evaluate(()=>{window.editor=modules.weekly.mountWeeklyCheckIn(document.querySelector('#weekly'),{email:'client@example.com',fullName:'Client test',checkinDay:1});});
 assert.equal(await p.locator('#weekly [name]').count(),26);
 assert.match(await p.locator('#weekly').innerText(),/au plus tard à minuit/);
 const error=await p.evaluate(()=>{try{editor.serialize();return '';}catch(e){return e.message;}});assert.match(error,/obligatoires/);
 await p.evaluate(()=>{for(const q of modules.model.QUESTIONS){const input=document.querySelector(`[name="${q.id}"]`);if(q.required && !['email','full_name'].includes(q.id))input.value=q.type==='scale'?'5':'Ma réponse de cette semaine';}});
 const answers=await p.evaluate(()=>editor.serialize());assert.equal(answers.stress,5);assert.equal(answers.email,'client@example.com');
 await p.evaluate(()=>modules.weekly.mountWeeklyCheckIn(document.querySelector('#weekly'),{email:'client@example.com',fullName:'Client test',checkinDay:1,checkIns:[{kind:'weekly',week_start:modules.model.weeklyWindow(1).weekStart,created_at:new Date().toISOString()}]}));
 assert.equal(await p.locator('#checkin-submit').count(),0);assert.match(await p.locator('#weekly').innerText(),/Envoyé le/);await p.close();
});
test('coach composes a program and client records actual kg and reps separately from the target',async()=>{
 const p=await page();await p.evaluate(async()=>window.builder=await modules.training.mountTrainingBuilder(document.querySelector('#builder')));
 await p.locator('.training-library summary').click();await p.getByRole('searchbox',{name:'Rechercher un exercice'}).fill('1-Arm DB Row');await p.locator('.exercise-result').first().click();
 await p.getByLabel('Charge cible (kg)',{exact:true}).fill('42.5');
 const plan=await p.evaluate(()=>JSON.parse(builder.serialize()));assert.equal(plan.days[0].exercises[0].targetLoadKg,42.5);assert.equal(plan.days[0].exercises[0].sets,3);
 await p.evaluate(plan=>{document.querySelector('#builder').replaceChildren();modules.training.renderClientTraining(document.querySelector('#client'),JSON.stringify(plan),{onSubmit:async(day,logs)=>window.savedLogs={day,logs}});},plan);
 await p.locator('.client-session summary').click();await p.getByRole('button',{name:'Enregistrer cette séance'}).click();assert.match(await p.locator('.workout-form .inline-message').innerText(),/au moins une série/);
 await p.locator('.workout-set input[type=checkbox]').first().check();await p.locator('.workout-set').first().getByLabel('Répétitions',{exact:true}).fill('9');await p.locator('.workout-set').first().getByLabel('Charge (kg)',{exact:true}).fill('40');await p.getByRole('button',{name:'Enregistrer cette séance'}).click();
 await p.waitForFunction(()=>window.savedLogs);const result=await p.evaluate(()=>window.savedLogs);assert.equal(result.logs[0].load_kg,40);assert.equal(result.logs[0].reps,9);assert.equal(plan.days[0].exercises[0].targetLoadKg,42.5);
 assert.equal(await p.getByRole('button',{name:'Séance enregistrée',exact:true}).isDisabled(),true);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await p.screenshot({path:'/private/tmp/aa-training-mobile.png',fullPage:true});await p.close();
});
test('V4 nutrition uses the selected food to calculate and serialize the actual portion',async()=>{
 const p=await page();await p.evaluate(async()=>window.nutritionEditor=await modules.nutrition.mountNutritionBuilder(document.querySelector('#nutrition')));
 await p.locator('.nutrition-meal').first().getByRole('searchbox').fill('Poulet poitrine chair maigre');await p.locator('.nutrition-search__result').first().waitFor();await p.locator('.nutrition-search__result').first().click();await p.locator('.nutrition-meal').first().getByLabel('Quantité (g)',{exact:true}).fill('150');await p.locator('.nutrition-meal').first().getByRole('button',{name:'Ajouter l’aliment'}).click();
 const plan=await p.evaluate(()=>JSON.parse(nutritionEditor.serialize()));const item=plan.meals[0].items[0];assert.equal(item.grams,150);
 assert.match(await p.locator('.nutrition-meal__totals').first().innerText(),new RegExp(`${Math.round(item.per100g.kcal*1.5)} kcal`));
 await p.locator('.nutrition-item').first().getByRole('spinbutton').fill('250');assert.match(await p.locator('.nutrition-meal__totals').first().innerText(),new RegExp(`${Math.round(item.per100g.kcal*2.5)} kcal`));await p.close();
});

function supabaseStub(role) {
 return `const user={id:'11111111-1111-4111-a111-111111111111',email:'fixture@example.invalid'};
 const client={id:'22222222-2222-4222-a222-222222222222',full_name:'Client de test',checkin_day:2};
 const records=[];let savedPlan=null;
 export const supabase={auth:{getSession:async()=>({data:{session:{user}}}),getUser:async()=>({data:{user}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})},
 from(table){let many=false;const q={select(){return q},eq(){return q},in(){many=true;return q},order(){return q},limit(){return q},upsert(value){savedPlan=value;window.savedPlan=value;return q},
 maybeSingle:async()=>({data:table==='profiles'?{id:user.id,role:'${role}',full_name:'Profil de test',checkin_day:2}:savedPlan,error:null}),single:async()=>({data:savedPlan,error:null}),
 then(resolve,reject){let data=table==='coach_clients'?[{client_id:client.id}]:table==='profiles'?(many?[client]:[]):table==='check_ins'?records:[];return Promise.resolve({data,error:null}).then(resolve,reject)}};return q},
 rpc:async(name,payload)=>{window.rpcCalls=window.rpcCalls||[];window.rpcCalls.push({name,payload});if(name==='aa_submit_weekly_check_in'){records.push({id:'weekly-fixture',kind:'weekly',body:'Questionnaire',answers:payload.response_answers,week_start:new Intl.DateTimeFormat('en-CA').format(new Date()),created_at:new Date().toISOString(),status:'pending'});}return {data:'fixture-result',error:null}},functions:{invoke:async()=>({data:{message:'Test'},error:null})}};`;
}
test('signed-in coach can load both editors, choose the check-in day and save a structured program',async()=>{
 const p=await browser.newPage({viewport:{width:1200,height:900},serviceWorkers:'block'});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/supabase.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:supabaseStub('coach')}));await p.goto(base+'/index.html');
 await p.locator('.client-row').click();await p.locator('#training-builder .training-library').waitFor();assert.equal(await p.locator('#nutrition-builder .nutrition-meal').count(),6);
 assert.equal(await p.locator('#checkin-schedule-form select').inputValue(),'2');await p.locator('#checkin-schedule-form select').selectOption('3');await p.getByRole('button',{name:'Enregistrer le jour de check-in'}).click();
 await p.waitForFunction(()=>window.rpcCalls?.length);const rpc=await p.evaluate(()=>window.rpcCalls[0]);assert.equal(rpc.name,'aa_set_checkin_day');assert.equal(rpc.payload.weekday,3);
 await p.locator('.training-library summary').click();await p.getByRole('searchbox',{name:'Rechercher un exercice'}).fill('1-Arm DB Row');await p.locator('.exercise-result').first().click();
 await p.getByRole('button',{name:'Enregistrer le programme',exact:true}).click();await p.waitForFunction(()=>window.savedPlan);const saved=await p.evaluate(()=>window.savedPlan);assert.equal(JSON.parse(saved.training_plan).schema,'aa-training-plan');assert.equal(JSON.parse(saved.nutrition_plan).schema,'aa-nutrition-plan');assert.deepEqual(errors,[]);await p.close();
});
test('signed-in client loads the complete weekly form in the existing dashboard',async()=>{
 const p=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/supabase.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:supabaseStub('client')}));await p.goto(base+'/index.html');await p.locator('#checkin-form [name=full_name]').waitFor();
 assert.equal(await p.locator('#checkin-form [name]').count(),26);assert.match(await p.locator('#checkin-form .weekly-status').innerText(),/Mardi/);assert.equal(await p.locator('#checkin-form [name=email]').inputValue(),'fixture@example.invalid');assert.deepEqual(errors,[]);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await p.screenshot({path:'/private/tmp/aa-checkin-mobile.png',fullPage:true});await p.close();
});
