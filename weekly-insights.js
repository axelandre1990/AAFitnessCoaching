import {n,fmt,table} from './analysis-ui.js?v=25';
import {weeklyInsights} from './weekly-insights-model.js?v=25';
export function renderWeeklyInsights(target,weekSummary,prescription){
 const data=weeklyInsights(weekSummary,prescription),box=n('div','','weekly-insights');target.append(box);box.append(n('h4','Répartition des macros et repères de la semaine'));
 const labels={protein_g:'Protéines',carbs_g:'Glucides',fat_g:'Lipides'},percent=(split,key)=>split.percentages?fmt(split.percentages[key])+' %':'—';
 const prescribed=data.mode==='standard'?[['standard','Objectif standard']]:data.mode==='highLow'?[['high','Objectif jour haut'],['low','Objectif jour bas']]:[];
 // Historical training/rest targets keep their original labels when they exist.
 for(const[key,label]of [['training','Ancien objectif entraînement'],['rest','Ancien objectif repos']])if(prescription?.[key])prescribed.push([key,label]);
 table(box,['Macro','Part des apports (jours)','Part des objectifs moyens (jours)',...prescribed.map(([,label])=>label)],Object.entries(labels).map(([k,l])=>[l,`${percent(data.actual,k)} (${data.counts[k]}/7)`,`${percent(data.target,k)} (${data.targetCounts[k]}/7)`,...prescribed.map(([key])=>percent(data[key],k))]),'Parts énergétiques des macronutriments');
 box.append(n('p',`Calories issues des moyennes de macros (4/4/9) : ${fmt(data.actual.energy)} kcal. Calories moyennes enregistrées : ${fmt(data.sourceCalories)} kcal (${data.sourceCaloriesCount}/7 jours).`));
 box.append(n('p','Les parts correspondent à 4 kcal/g de protéines et glucides, et 9 kcal/g de lipides. Chaque moyenne utilise ses propres jours renseignés ; des nombres de jours différents peuvent influencer cette répartition. Une donnée manquante ou un total nul ne produit pas de pourcentage.','card-copy'));
 box.append(n('p',`Protéines : ${fmt(data.proteinPerKg)} g/kg · moyenne de protéines (${data.counts.protein_g}/7 jours) ÷ poids moyen ${fmt(data.weight)} kg (${data.weightCount}/7 jours).`));
 if(data.coachGrade)box.append(n('p',`Appréciation du coach : ${data.coachGrade}`));return box;
}
