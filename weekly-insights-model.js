const KEYS=['protein_g','carbs_g','fat_g'];
const numeric=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
export function macroSplit(macros){const grams=KEYS.map(k=>numeric(macros?.[k]));if(grams.some(v=>v===null))return {energy:null,percentages:null};const energies=grams.map((v,i)=>v*(i===2?9:4)),energy=energies.reduce((a,b)=>a+b,0);return {energy,percentages:energy>0?Object.fromEntries(KEYS.map((k,i)=>[k,energies[i]/energy*100])):null};}
export function weeklyInsights(summary,prescription={}){
 const values=kind=>Object.fromEntries(KEYS.map(k=>[k,numeric(summary?.[kind]?.[k]?.value)]));
 const actual=macroSplit(values('metrics')),target=macroSplit(values('goals'));
 const weight=numeric(summary?.metrics?.weight_kg?.value),protein=numeric(summary?.metrics?.protein_g?.value);
 return {actual,target,counts:Object.fromEntries(KEYS.map(k=>[k,summary?.metrics?.[k]?.count||0])),targetCounts:Object.fromEntries(KEYS.map(k=>[k,summary?.goals?.[k]?.count||0])),sourceCalories:numeric(summary?.metrics?.calories?.value),sourceCaloriesCount:summary?.metrics?.calories?.count||0,weight,weightCount:summary?.metrics?.weight_kg?.count||0,proteinPerKg:protein!==null&&weight!==null&&weight>0?protein/weight:null,mode:prescription?.mode||'legacy',standard:macroSplit(prescription?.standard),high:macroSplit(prescription?.high),low:macroSplit(prescription?.low),training:macroSplit(prescription?.training),rest:macroSplit(prescription?.rest),coachGrade:typeof prescription?.coach_grade==='string'?prescription.coach_grade.trim():''};
}
