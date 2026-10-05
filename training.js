import { parseTrainingPlan, validateTrainingPlan, validateWorkout } from './coaching-model.js?v=18';
const node=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
const uid=()=>crypto.randomUUID();
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function field(label,value,change,{type='text',min,max,step='1'}={}) {
  const wrap=node('label','auth-field',label),input=node('input');input.type=type;input.value=value??'';
  if(type==='number') {input.inputMode='decimal';input.step=step;}
  if(min!=null)input.min=min;if(max!=null)input.max=max;
  input.addEventListener('input',()=>change(input.value));wrap.append(input);return wrap;
}
function link(url,label) {try{const u=new URL(url);if(u.protocol!=='https:')return null;const a=node('a','exercise-media',label);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return null;}}
let catalogPromise;
async function catalog(){if(!catalogPromise){const rel=new URL(import.meta.url).pathname.includes('/scripts/')?'../data/exercise-catalog.json':'./data/exercise-catalog.json';catalogPromise=fetch(new URL(rel,import.meta.url)).then(r=>{if(!r.ok)throw Error('Impossible de charger la bibliothèque d’exercices.');return r.json();}).then(d=>d.exercises).catch(e=>{catalogPromise=null;throw e;});}return catalogPromise;}
export async function mountTrainingBuilder(container,value='') {
  container.replaceChildren(node('p','empty-state','Chargement de la bibliothèque d’exercices…'));
  const {plan,legacy}=parseTrainingPlan(value);
  const state=plan?structuredClone(plan):{schema:'aa-training-plan',version:1,name:'Mon programme',mode:'weekly',notes:legacy,days:[{id:uid(),name:'Séance 1',exercises:[]}]};
  let exercises;
  try{exercises=await catalog();}catch(e){container.replaceChildren(node('p','inline-message inline-message--error',e.message));return null;}
  let current=state.days[0]?.id;
  let libraryOpen=false;
  const libraryFilters={query:'',muscle:'',equipment:''};
  function render() {
    container.replaceChildren(node('h4','training-title','Programme d’entraînement'));
    const settings=node('div','training-settings');
    settings.append(field('Nom du programme',state.name,v=>state.name=v));
    const modeWrap=node('label','auth-field','Organisation'),mode=node('select');
    mode.append(new Option('Semaine fixe','weekly'),new Option('Rotation de séances','rotation'));mode.value=state.mode;
    mode.onchange=()=>state.mode=mode.value;modeWrap.append(mode);settings.append(modeWrap);
    container.append(settings,field('Consignes générales',state.notes,v=>state.notes=v));
    const tabs=node('div','training-days');
    for(const day of state.days){const b=node('button',day.id===current?'auth-primary':'auth-secondary',day.name);b.type='button';b.onclick=()=>{current=day.id;render();};tabs.append(b);}
    const plus=node('button','auth-secondary','+ Ajouter une séance');plus.type='button';plus.onclick=()=>{if(state.days.length>=14)return;const d={id:uid(),name:`Séance ${state.days.length+1}`,exercises:[]};state.days.push(d);current=d.id;render();};tabs.append(plus);container.append(tabs);
    const day=state.days.find(d=>d.id===current)||state.days[0];if(!day)return;
    container.append(field('Nom de la séance',day.name,v=>{day.name=v;tabs.querySelectorAll('button')[state.days.indexOf(day)].textContent=v;}));
    const removeDay=node('button','text-action','Supprimer cette séance');removeDay.type='button';removeDay.disabled=state.days.length<2;removeDay.onclick=()=>{state.days=state.days.filter(d=>d.id!==day.id);current=state.days[0].id;render();};container.append(removeDay);
    const addExercise=ex=>{if(day.exercises.length>=20)return;day.exercises.push({id:uid(),exerciseId:ex.id,name:ex.name,muscle:ex.muscle,equipment:ex.equipment,image:ex.image,video:ex.video,sets:3,repsMin:8,repsMax:10,restSeconds:120,targetLoadKg:null,rir:null,tempo:'',notes:''});libraryOpen=true;render();};
    const library=node('details','training-library');library.open=libraryOpen;library.ontoggle=()=>{libraryOpen=library.open;};library.append(node('summary','',`Bibliothèque · ${exercises.length} exercices`));
    const filters=node('div','training-settings');const search=node('input');search.type='search';search.placeholder='Rechercher un exercice';search.setAttribute('aria-label','Rechercher un exercice');
    const muscle=node('select');muscle.setAttribute('aria-label','Filtrer par muscle');muscle.append(new Option('Tous les muscles',''));for(const m of [...new Set(exercises.map(e=>e.muscle))].sort())muscle.append(new Option(m,m));
    const equipment=node('select');equipment.setAttribute('aria-label','Filtrer par matériel');equipment.append(new Option('Tout le matériel',''));for(const m of [...new Set(exercises.flatMap(e=>e.equipment))].sort())equipment.append(new Option(m,m));
    search.value=libraryFilters.query;muscle.value=libraryFilters.muscle;equipment.value=libraryFilters.equipment;
    filters.append(search,muscle,equipment);const exerciseChoice=node('label','auth-field','Choisir un exercice');const exerciseSelect=node('select');exerciseSelect.setAttribute('aria-label','Choisir un exercice');exerciseSelect.disabled=day.exercises.length>=20;exerciseChoice.append(exerciseSelect);
    const results=node('div','exercise-results');library.append(filters,exerciseChoice,results);container.append(library);
    const refresh=()=>{libraryFilters.query=search.value;libraryFilters.muscle=muscle.value;libraryFilters.equipment=equipment.value;results.replaceChildren();const terms=norm(search.value).split(/\s+/).filter(Boolean);const matches=exercises.filter(e=>(!muscle.value||e.muscle===muscle.value)&&(!equipment.value||e.equipment.includes(equipment.value))&&terms.every(t=>norm(e.name+' '+e.muscle+' '+e.equipment.join(' ')).includes(t)));
      exerciseSelect.replaceChildren(new Option(`Sélectionner un exercice (${matches.length})`,''));for(const ex of matches)exerciseSelect.append(new Option(ex.name,ex.id));
      for(const ex of matches.slice(0,30)){const b=node('button','exercise-result');b.type='button';b.append(node('strong','',ex.name),node('span','',`${ex.muscle} · ${ex.equipment.join(', ')||'Matériel non renseigné'}`));b.disabled=day.exercises.length>=20;b.onclick=()=>addExercise(ex);results.append(b);}if(!matches.length)results.append(node('p','empty-state','Aucun exercice trouvé.'));};
    search.oninput=refresh;muscle.onchange=refresh;equipment.onchange=refresh;exerciseSelect.onchange=()=>{const ex=exercises.find(e=>e.id===exerciseSelect.value);if(ex)addExercise(ex);};refresh();
    const rows=node('div','training-exercises');container.append(rows);
    if(!day.exercises.length) rows.append(node('p','empty-state','Ouvre la bibliothèque pour ajouter les exercices de cette séance.'));
    for(const [index,ex] of day.exercises.entries()) {
      const card=node('section','training-exercise');card.append(node('h4','',`${index+1}. ${ex.name}`),node('p','card-copy',ex.muscle||''));
      const media=node('div','exercise-media-row');for(const [url,label]of[[ex.image,'Voir l’image / animation'],[ex.video,'Voir la vidéo']]){const a=link(url,label);if(a)media.append(a);}card.append(media);
      const controls=node('div','exercise-fields');
      for(const [key,label,min,max,step]of[['sets','Séries',1,12,'1'],['repsMin','Répétitions min.',1,200,'1'],['repsMax','Répétitions max.',1,200,'1'],['restSeconds','Repos (secondes)',0,1800,'1'],['targetLoadKg','Charge cible (kg)',0,1000,'0.01'],['rir','RIR cible (facultatif)',0,10,'1']]) controls.append(field(label,ex[key],v=>ex[key]=v===''?null:Number(v),{type:'number',min,max,step}));
      controls.append(field('Tempo (facultatif)',ex.tempo,v=>ex.tempo=v));card.append(controls,field('Consignes de l’exercice',ex.notes,v=>ex.notes=v));
      const actions=node('div','exercise-actions');for(const [label,delta] of [['↑ Monter',-1],['↓ Descendre',1]]){const b=node('button','text-action',label);b.type='button';b.disabled=index+delta<0||index+delta>=day.exercises.length;b.onclick=()=>{[day.exercises[index],day.exercises[index+delta]]=[day.exercises[index+delta],day.exercises[index]];render();};actions.append(b);}const del=node('button','text-action','Retirer');del.type='button';del.onclick=()=>{day.exercises.splice(index,1);render();};actions.append(del);card.append(actions);rows.append(card);
    }
  }
  render();return {serialize(){const errors=validateTrainingPlan(state);if(errors.length)throw Error(errors[0]);return JSON.stringify(state);}};
}
export function renderTrainingHistory(target,sessions=[]) {
  target.replaceChildren(node('h4','','Historique des séances'));
  if(!sessions.length){target.append(node('p','empty-state','Les séances enregistrées apparaîtront ici.'));return;}
  for(const session of sessions){const details=node('details','training-history');details.append(node('summary','',`${session.performed_on} · ${session.session_name} · ${(session.training_sets||[]).length} séries réalisées`));
    for(const set of session.training_sets||[])details.append(node('p','',`${set.exercise_name} · série ${set.set_index} · ${set.reps} répétitions · ${set.load_kg==null?'poids du corps / charge non renseignée':`${set.load_kg} kg`}`));
    if(session.notes)details.append(node('p','',session.notes));target.append(details);}
}
export function renderClientTraining(target,value,{history=[],onSubmit}={}) {
  target.replaceChildren();const {plan,legacy}=parseTrainingPlan(value);
  if(!plan){target.append(node('p','',legacy||'Ton coach n’a pas encore ajouté de programme d’entraînement.'));return;}
  target.append(node('h4','',plan.name),node('p','card-copy',plan.mode==='rotation'?'Enchaîne les séances dans l’ordre de la rotation.':'Tes séances de la semaine.'));if(plan.notes)target.append(node('p','',plan.notes));
  for(const day of plan.days){const details=node('details','client-session');details.append(node('summary','',`${day.name} · ${day.exercises.length} exercices`));
    if(!day.exercises.length){details.append(node('p','empty-state','Repos ou séance à compléter par le coach.'));target.append(details);continue;}
    const form=node('form','workout-form');const requestId=uid();
    const inputs=[];
    for(const ex of day.exercises){const section=node('section','training-exercise');section.append(node('h4','',ex.name),node('p','card-copy',`${ex.sets} séries · ${ex.repsMin}–${ex.repsMax} répétitions · repos ${ex.restSeconds} s${ex.targetLoadKg!=null?` · cible ${ex.targetLoadKg} kg`:''}${ex.rir!=null?` · RIR ${ex.rir}`:''}${ex.tempo?` · tempo ${ex.tempo}`:''}`));
      const media=node('div','exercise-media-row');for(const [url,label] of [[ex.image,'Image / animation'],[ex.video,'Vidéo']]){const a=link(url,label);if(a)media.append(a);}section.append(media);if(ex.notes)section.append(node('p','',ex.notes));
      const previous=history.flatMap(s=>[...(s.training_sets||[])].reverse().map(set=>({...set,date:s.performed_on}))).find(s=>s.exercise_id===ex.exerciseId);if(previous)section.append(node('p','last-performance',`Dernière série enregistrée (${previous.date}) : ${previous.reps} répétitions${previous.load_kg==null?'':` à ${previous.load_kg} kg`}`));
      section.append(node('p','card-copy','Coche les séries réalisées et indique tes répétitions. Laisse la charge vide pour un exercice au poids du corps.'));
      for(let i=1;i<=Number(ex.sets);i++){const row=node('div','workout-set');const done=node('label','set-done',`Série ${i}`),check=node('input');check.type='checkbox';check.setAttribute('aria-label',`${ex.name} série ${i} réalisée`);done.append(check);
        const reps=field('Répétitions','',()=>{},{type:'number',min:1,max:200}),load=field('Charge (kg)','',()=>{},{type:'number',min:0,max:1000,step:'0.01'});row.append(done,reps,load);section.append(row);inputs.push({ex,index:i,check,reps:reps.querySelector('input'),load:load.querySelector('input')});}
      form.append(section);
    }
    const notes=field('Note de séance (facultatif)','',()=>{});notes.querySelector('input').maxLength=2000;
    const message=node('p','inline-message');message.setAttribute('role','status');const save=node('button','auth-primary','Enregistrer cette séance');save.type='submit';form.append(notes,message,save);
    form.onsubmit=async event=>{event.preventDefault();const logs=inputs.filter(i=>i.check.checked).map(i=>({item_id:i.ex.id,set_index:i.index,reps:i.reps.value===''?'':Number(i.reps.value),load_kg:i.load.value===''?null:Number(i.load.value)}));const errors=validateWorkout(logs);if(errors.length){message.className='inline-message inline-message--error';message.textContent=errors[0];return;}save.disabled=true;message.textContent='Enregistrement…';try{await onSubmit(day.id,logs,notes.querySelector('input').value,requestId);message.className='inline-message inline-message--success';message.textContent='Séance enregistrée. Ton coach peut consulter tes charges et répétitions.';save.textContent='Séance enregistrée';for(const i of form.querySelectorAll('input'))i.disabled=true;}catch(e){message.className='inline-message inline-message--error';message.textContent=e.message;save.disabled=false;}};
    details.append(form);target.append(details);
  }
}
