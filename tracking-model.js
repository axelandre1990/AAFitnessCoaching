export const METRICS = [
 ['weight_kg','Poids','kg',20,400,.1],['waist_cm','Tour de taille','cm',30,250,.1],['steps','Pas','pas',0,100000,1],['sleep_hours','Sommeil','h',0,24,.1],
 ...['recovery:Récupération','energy:Énergie','digestion:Digestion','stress:Stress','hunger:Faim'].map(s=>{const [k,l]=s.split(':');return [k,l,'/10',1,10,1];}),
 ...[1,2,3].map(index=>[`biofeedback${index}`,`Suivi personnalisé ${index}`,'/10',1,10,1]),
 ['water_l','Eau','L',0,20,.1],['salt_g','Sel','g',0,100,.1],['resting_hr','Fréquence cardiaque au repos','bpm',0,300,1],['fasting_glucose','Glycémie à jeun','',0,1000,.1],['blood_pressure','Pression artérielle','mmHg'],['menstruation','Menstruations',''],['notes','Notes','']
];
export const DEFAULT_SETTINGS={enabled_metrics:['weight_kg','waist_cm','notes'],macro_tracking:false,photos_enabled:true,revision:0};
export function todayBrussels(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function consumedCalories(m){return ['protein_g','carbs_g','fat_g'].every(k=>typeof m[k]==='number'&&Number.isFinite(m[k])&&m[k]>=0)?Math.round((m.protein_g*4+m.carbs_g*4+m.fat_g*9)*100)/100:null;}
export function validateMetrics(m,settings){
 const allowed=new Set(settings.enabled_metrics.flatMap(k=>k==='blood_pressure'?['bp_systolic','bp_diastolic']:k==='fasting_glucose'?['fasting_glucose','glucose_unit']:[k]));
 if(settings.macro_tracking)['protein_g','carbs_g','fat_g','fiber_g'].forEach(k=>allowed.add(k));
 for(const [k,v] of Object.entries(m)){if(!allowed.has(k))throw Error('Ce suivi n’est pas activé par ton coach.');if(v===null)continue;
 if(k==='notes'){if(typeof v!=='string'||v.length>2000)throw Error('Note trop longue.');continue;}
 if(k==='glucose_unit'){if(!['mg_dl','mmol_l'].includes(v))throw Error('Unité invalide.');continue;}
 if(k==='menstruation'){if(!['yes','no'].includes(v))throw Error('Choisis oui ou non.');continue;}
 const metric=METRICS.find(x=>x[0]===k);const min=metric?.[3]??0,max=metric?.[4]??(k.startsWith('bp_')?350:2000),step=metric?.[5]??(k.startsWith('bp_')?1:.1);
 if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(step===1&&!Number.isInteger(v)))throw Error('Valeur invalide : '+k);
 }
 if((m.bp_systolic!=null)!==(m.bp_diastolic!=null))throw Error('Renseigne les deux valeurs de pression artérielle.');
 if(m.fasting_glucose!=null&&!m.glucose_unit)throw Error('Choisis l’unité de glycémie.');
 if(['protein_g','carbs_g','fat_g'].some(k=>m[k]!=null)&&consumedCalories(m)===null)throw Error('Renseigne protéines, glucides et lipides, y compris zéro.');
 if(!Object.entries(m).some(([k,v])=>k!=='glucose_unit'&&v!==null&&v!==''))throw Error('Renseigne au moins une information.');return m;
}

export function metricLabel(settings, key) {
 const fallback=METRICS.find(metric=>metric[0]===key)?.[1]||key;
 if(!/^biofeedback[123]$/.test(key))return fallback;
 const labels=settings?.biofeedback_labels;
 const raw=Array.isArray(labels)?labels[Number(key.slice(-1))-1]:labels?.[key];
 return typeof raw==='string' && raw.trim()?raw.trim().slice(0,80):fallback;
}
