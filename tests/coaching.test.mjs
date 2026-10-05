import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const sourceRoot=new URL('..',import.meta.url);
const modules=existsSync(new URL('scripts/coaching-model.js',sourceRoot))?'scripts/':'';
const { QUESTIONS, validateAnswers, weeklyWindow, parseTrainingPlan, validateTrainingPlan, validateWorkout } = await import(new URL(modules+'coaching-model.js',sourceRoot));

test('weekly form preserves 26 questions and required versus optional responses', () => {
  assert.equal(QUESTIONS.length, 26);
  const values = Object.fromEntries(QUESTIONS.filter(q=>q.required).map(q=>[q.id,q.type==='scale'?5:q.id==='email'?'client@example.com':'Réponse']));
  assert.deepEqual(validateAnswers(values), []);
  values.stress = 11;
  assert.ok(validateAnswers(values).some(e=>e.id==='stress'));
  values.stress = '';
  assert.ok(validateAnswers(values).some(e=>e.id==='stress'));
});
test('weekly dates use Brussels time around midnight and on Sunday', () => {
  assert.deepEqual(weeklyWindow(1, new Date('2026-10-04T22:01:00Z')), {weekStart:'2026-10-05',dueDate:'2026-10-05',today:'2026-10-05',late:false});
  assert.equal(weeklyWindow(7,new Date('2026-10-04T20:00:00Z')).dueDate,'2026-10-04');
  assert.equal(weeklyWindow(2,new Date('2026-10-08T10:00:00Z')).late,true);
  assert.equal(weeklyWindow(null).dueDate,null);
});
test('legacy training remains text and a structured plan retains exercise IDs', () => {
  assert.equal(parseTrainingPlan('Squat 3 × 8').legacy,'Squat 3 × 8');
  const p={schema:'aa-training-plan',version:1,name:'Plan',mode:'weekly',days:[{id:'day1',name:'Jambes',exercises:[{id:'row1',exerciseId:'squat',name:'Squat',sets:3,repsMin:8,repsMax:10,restSeconds:120,targetLoadKg:60}]}]};
  assert.deepEqual(validateTrainingPlan(p),[]);
  assert.equal(parseTrainingPlan(JSON.stringify(p)).plan.days[0].exercises[0].id,'row1');
  p.days[0].exercises[0].repsMax=5;
  assert.ok(validateTrainingPlan(p).length);
});
test('workout records require valid reps, accept bodyweight and reject duplicate sets', () => {
  const logs=[{item_id:'row1',set_index:1,reps:8,load_kg:null}];
  assert.deepEqual(validateWorkout(logs),[]);
  assert.ok(validateWorkout([...logs,...logs]).length);
  assert.ok(validateWorkout([{...logs[0],load_kg:-10}]).length);
  assert.ok(validateWorkout([{...logs[0],reps:''}]).length);
  assert.deepEqual(validateWorkout([{...logs[0],load_kg:22.5}]),[]);
});

test('exercise library preserves all 327 distinct sources with stable IDs', async()=>{
  const {readFile}=await import('node:fs/promises');
  const catalog=JSON.parse(await readFile(new URL('../data/exercise-catalog.json',import.meta.url),'utf8'));
  assert.equal(catalog.count,327);assert.equal(catalog.exercises.length,327);
  assert.equal(new Set(catalog.exercises.map(e=>e.id)).size,327);
  for(const exercise of catalog.exercises){assert.ok(exercise.name && exercise.muscle);assert.ok(Array.isArray(exercise.equipment));}
});
test('the deployed service worker only precaches files that are present',async()=>{
  const {readFile,stat}=await import('node:fs/promises');
  const deployed=modules?new URL('../../aa-fitness-coaching-pages/',import.meta.url):sourceRoot;
  const source=await readFile(new URL('service-worker.js',deployed),'utf8');
  const list=source.match(/const APP_SHELL = (\[[\s\S]*?\]);/)[1];
  for(const entry of JSON.parse(list)) assert.ok(await stat(new URL(entry,deployed)));
});
