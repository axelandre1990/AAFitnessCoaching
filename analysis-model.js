export const SITE_LABELS=['Poitrine','Bras gauche','Bras droit','Taille au nombril','Taille sous le nombril','Hanches','Cuisse gauche','Cuisse droite','Mollet'];
export const DEFAULT_ANALYSIS={calculator:{units:'metric',sex:'male',activity:1.55,method:'mifflin',protein_pct:30,carbs_pct:50,fat_pct:20,adjustment_pct:0},sleep_goal:null,steps_goal:null,sites:Object.fromEntries(SITE_LABELS.map((label,i)=>['site'+(i+1),{label,enabled:false}]))};
export const numberOrNull=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
export const energy=m=>['protein_g','carbs_g','fat_g'].every(k=>numberOrNull(m?.[k])!==null)?4*Number(m.protein_g)+4*Number(m.carbs_g)+9*Number(m.fat_g):null;
export function calculateMacros(input){
 const c={...DEFAULT_ANALYSIS.calculator,...input},age=numberOrNull(c.age),rawWeight=numberOrNull(c.weight),rawHeight=numberOrNull(c.height),bf=numberOrNull(c.body_fat);
 const kg=c.units==='imperial'?rawWeight*.45359237:rawWeight,cm=c.units==='imperial'?rawHeight*2.54:rawHeight;
 if(age===null||rawWeight===null||rawHeight===null||age<18||age>100||kg<20||kg>400||cm<100||cm>250)throw Error('Renseigne âge (18–100 ans), poids et taille valides.');
 if(!['male','female'].includes(c.sex)||!['metric','imperial'].includes(c.units))throw Error('Paramètres invalides.');
 if(bf!==null&&(bf<=0||bf>=75))throw Error('Masse grasse : entre 0 et 75 % exclus.');
 const activity=Number(c.activity);if(![1.375,1.4625,1.55,1.6375,1.725,1.9].includes(activity))throw Error('Choisis le niveau d’activité.');
 const mifflin=10*kg+6.25*cm-5*age+(c.sex==='male'?5:-161),lean=bf===null?null:kg*(1-bf/100),katch=lean===null?null:370+21.6*lean;
 const estimates={mifflin:mifflin*activity,katch:katch===null?null:katch*activity,average:katch===null?null:(mifflin+katch)*activity/2};
 if(!['mifflin','katch','average'].includes(c.method)||estimates[c.method]===null)throw Error('La méthode Katch ou moyenne nécessite une masse grasse renseignée.');
 const percentages=['protein_pct','carbs_pct','fat_pct'].map(k=>Number(c[k]));if(percentages.some(x=>!Number.isFinite(x)||x<0||x>100)||Math.abs(percentages.reduce((a,b)=>a+b,0)-100)>.001)throw Error('La répartition des macros doit totaliser 100 %.');
 const adjustment=Number(c.adjustment_pct);if(!Number.isFinite(adjustment)||adjustment< -50||adjustment>50)throw Error('Ajustement compris entre −50 et +50 %.');
 const kcal=estimates[c.method]*(1+adjustment/100),macros={protein_g:+(kcal*percentages[0]/400).toFixed(1),carbs_g:+(kcal*percentages[1]/400).toFixed(1),fat_g:+(kcal*percentages[2]/900).toFixed(1),fiber_g:+(kcal*.014).toFixed(1)};
 return {kg,cm,lean,mifflin,katch,estimates,maintenance:estimates[c.method],macros,kcal:energy(macros),poundsEstimates:[14,15,16].map(x=>kg/.45359237*x),relativeProtein:[kg*2.3,kg*3.1],relativeFat:kg*(c.sex==='male'?.45:.55)};
}
export function monday(date){const d=new Date(date+'T12:00:00Z');if(Number.isNaN(d.getTime()))throw Error('Date invalide.');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);}
export function addDays(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function mean(values){const xs=values.map(numberOrNull).filter(x=>x!==null);return {value:xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null,count:xs.length};}
export function effectivePrescription(roadmap,date){return [...roadmap].filter(r=>r.week_start<=date).sort((a,b)=>b.week_start.localeCompare(a.week_start))[0]?.prescription||null;}
export function weeklySummary(entries,roadmap=[],dayTypes=[],extraWeeks=[]){
 const keys=[...new Set(entries.flatMap(r=>Object.keys(r.metrics||{})))].filter(k=>!['notes','glucose_unit','menstruation'].includes(k));
 const weeks=new Map();for(const date of [...entries.map(r=>r.recorded_on),...extraWeeks])weeks.set(monday(date),[]);
 for(const r of entries)weeks.get(monday(r.recorded_on)).push(r);
 const result=[...weeks].sort(([a],[b])=>a.localeCompare(b)).map(([week,rows])=>{
 const metrics={};for(const key of keys)metrics[key]=mean(rows.map(r=>key==='fasting_glucose'&&r.metrics[key]!=null?(r.metrics.glucose_unit==='mmol_l'?r.metrics[key]*18.0182:r.metrics.glucose_unit==='mg_dl'?r.metrics[key]:null):r.metrics[key]));
 const goalKeys=['protein_g','carbs_g','fat_g','fiber_g','kcal','steps_goal','sleep_goal'];const goals={};
 for(const key of goalKeys){const vals=Array.from({length:7},(_,i)=>{const date=addDays(week,i),p=effectivePrescription(roadmap,date);if(!p)return null;if(key.endsWith('_goal'))return p[key];const type=p.mode==='standard'?'standard':dayTypes.find(d=>d.recorded_on===date)?.day_type;if(!type)return null;return key==='kcal'?energy(p[type]):p[type]?.[key];});goals[key]=mean(vals);}
 return {week,rows,days:rows.length,metrics,goals,glucoseUnit:'mg/dL',dayTypesCount:Array.from({length:7},(_,i)=>dayTypes.some(d=>d.recorded_on===addDays(week,i))).filter(Boolean).length};});
 for(let i=0;i<result.length;i++){const row=result[i],previous=result[i-1];const a=row.metrics.weight_kg?.value,b=previous?.metrics.weight_kg?.value;row.weightDelta=a!=null&&b!=null&&addDays(previous.week,7)===row.week?a-b:null;row.weightPct=row.weightDelta!==null&&b!==0?row.weightDelta/b*100:null;}
 return result;
}
export function trainingSeries(sessions,exerciseId,metric='load'){
 return [...sessions].sort((a,b)=>(a.performed_on||'').localeCompare(b.performed_on||'')||(a.created_at||'').localeCompare(b.created_at||'')).map(s=>{const sets=(s.training_sets||[]).filter(x=>x.exercise_id===exerciseId),loads=sets.map(x=>numberOrNull(x.load_kg)).filter(x=>x!==null);return {date:s.performed_on,value:!sets.length?null:metric==='volume'?sets.reduce((a,x)=>a+(numberOrNull(x.load_kg)||0)*(numberOrNull(x.reps)||0),0):metric==='reps'?Math.max(...sets.map(x=>numberOrNull(x.reps)||0)):loads.length?Math.max(...loads):null};}).filter(x=>x.value!==null);
}
