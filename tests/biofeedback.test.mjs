import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
const root=new URL('..',import.meta.url);
const scripts=existsSync(new URL('scripts/',root))?'scripts/':'';
const {METRICS,validateMetrics,metricLabel}=await import(new URL(scripts+'tracking-model.js',root));
const {TRAINING_GUIDE}=await import(new URL(scripts+'training-guide.js',root));
test('three optional biofeedback slots validate integer 1–10 and custom labels',()=>{
 const settings={enabled_metrics:['biofeedback1','biofeedback2','biofeedback3']};
 assert.equal(METRICS.filter(m=>m[0].startsWith('biofeedback')).length,3);
 assert.deepEqual(validateMetrics({biofeedback1:1,biofeedback2:10,biofeedback3:null},settings),{biofeedback1:1,biofeedback2:10,biofeedback3:null});
 for(const value of [0,11,5.5,'5',NaN])assert.throws(()=>validateMetrics({biofeedback1:value},settings));
 assert.throws(()=>validateMetrics({biofeedback1:5},{enabled_metrics:[]}));
 assert.equal(metricLabel({},'biofeedback1'),'Suivi personnalisé 1');
 assert.equal(metricLabel({biofeedback_labels:{biofeedback2:'  Courbatures  '}},'biofeedback2'),'Courbatures');
 assert.equal(metricLabel({biofeedback_labels:{biofeedback3:'x'.repeat(100)}},'biofeedback3').length,80);
 assert.equal(metricLabel({biofeedback_labels:{biofeedback1:42}},'biofeedback1'),'Suivi personnalisé 1');
 assert.equal(metricLabel({biofeedback_labels:['Mobilité']},'biofeedback1'),'Mobilité');
 assert.ok(TRAINING_GUIDE.some(([heading])=>heading.includes('partielles')));
});
test('custom labels render as text in client form, history and coach options',async()=>{
 const require=createRequire(import.meta.url);let playwright;try{playwright=require('playwright');}catch{playwright=require('/Users/axelandre/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
 const tracking=(await readFile(new URL(scripts+'tracking.js',root),'utf8')).replace(/import \{supabase\} from ['"]\.\/supabase\.js(?:\?[^'"]*)?['"];?/,"const supabase=window.testSupabase;");
 const model=await readFile(new URL(scripts+'tracking-model.js',root),'utf8');const guide=await readFile(new URL(scripts+'training-guide.js',root),'utf8');
 const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url.includes('.js')?'application/javascript':'text/html');res.end(req.url.startsWith('/'+scripts+'tracking.js')?tracking:req.url.startsWith('/'+scripts+'tracking-model.js')?model:req.url.startsWith('/'+scripts+'training-guide.js')?guide:'<div id="client"></div><div id="coach"></div><div id="guide"></div>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await playwright.chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(prefix=>{window.trackingModulePrefix=prefix;},'/'+scripts);
  await page.evaluate(async()=>{
   const settings={enabled_metrics:['weight_kg','biofeedback1','biofeedback2','biofeedback3'],macro_tracking:false,photos_enabled:true,revision:1};
   const row={recorded_on:'2026-10-06',metrics:{weight_kg:75,biofeedback1:7,biofeedback2:6},revision:1};
   window.testSupabase={from(table){let single=false;const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},maybeSingle(){single=true;return q;},then(resolve){resolve({error:null,data:table==='client_tracking_settings'?settings:table==='coaching_analysis_settings'?{settings:{biofeedback_labels:{biofeedback1:'<img src=x onerror=alert(1)>',biofeedback2:'Courbatures'}}}:single?row:[row]});}};return q;},rpc:async()=>({error:null,data:settings})};
   const module=await import(window.trackingModulePrefix+'tracking.js');await module.mountTracking(document.querySelector('#client'),'synthetic-client');await module.mountTracking(document.querySelector('#coach'),'synthetic-client',{coach:true});
   const guide=await import(window.trackingModulePrefix+'training-guide.js');guide.renderTrainingGuide(document.querySelector('#guide'));
  });
  assert.equal(await page.locator('img').count(),0);assert.match(await page.locator('#client').innerText(),/<img src=x onerror=alert\(1\)>/);
  assert.match(await page.locator('#coach').innerText(),/Courbatures/);assert.match(await page.locator('#client .progress-entry').innerText(),/Courbatures : 6/);
  assert.equal(await page.locator('#client input[name=biofeedback1]').getAttribute('min'),'1');assert.equal(await page.locator('#client input[name=biofeedback1]').getAttribute('max'),'10');assert.equal(await page.locator('#client input[name=biofeedback1]').getAttribute('step'),'1');
  assert.equal(await page.locator('#coach input[name=biofeedback3]').count(),1);assert.equal(await page.locator('#client input[name=weight_kg]').count(),1);
  assert.match(await page.locator('#guide').innerText(),/Échauffement/);assert.match(await page.locator('#guide').innerText(),/31X0/);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
