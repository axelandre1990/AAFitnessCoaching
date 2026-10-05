export const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const CHECKIN_NOTE = 'Le jour de ton check-in, remets ton questionnaire au plus tard à minuit (heure de Bruxelles), afin que ton coach puisse te répondre le lendemain.';
const text = (id,label,required=true,hint='') => ({id,label,required,type:'text',hint});
const scale = (id,label,low,high,hint='') => ({id,label,required:true,type:'scale',low,high,hint});
export const QUESTIONS = [
  {id:'email',label:'Adresse e-mail',required:true,type:'email'},
  {id:'full_name',label:'Prénom & Nom',required:true,type:'short'},
  scale('attitude','Ton attitude cette semaine a-t-elle été le reflet de tes objectifs ?','Absolument pas','Tout était parfait'),
  text('attitude_details',"Peux-tu expliciter pourquoi tu t’es donné cette note ?"),
  text('wins','VICTOIRES — Quelles sont tes 3 plus grandes victoires cette semaine ? Dis-moi pourquoi cette semaine a été TOP !'),
  text('challenges','Quels sont les défis que tu as rencontrés cette semaine qui ont impacté ton implication ?'),
  text('diet','Ta diète a-t-elle bien été respectée ?',true,'As-tu mangé tous tes repas ? Y a-t-il eu des craquages ? Si oui, lesquels ? Des restos ? Si oui, respect des calories ou suppression de repas ?'),
  text('improvements','CONSTRUIRE — Comment aurais-tu pu améliorer cette semaine ou comment pourrais-tu t’améliorer pour la semaine prochaine ?'),
  scale('energy','Sur une échelle de 1 à 10, évalue ton niveau d’ÉNERGIE cette semaine, en particulier pendant tes séances d’entraînement.','Peu','Beaucoup'),
  text('energy_details','Ajoute toute information ou détail supplémentaire concernant ton niveau d’ÉNERGIE cette semaine.',false),
  scale('mood','Sur une échelle de 1 à 10, évalue ton HUMEUR/ÉMOTION cette semaine.','Mauvaise humeur, émotionnel, négatif','Bien, heureux, positif'),
  text('mood_details','Ajoute toute information ou détail supplémentaire concernant ton HUMEUR/ÉMOTION cette semaine.',false),
  scale('hunger','Sur une échelle de 1 à 10, évalue ton niveau de FAIM cette semaine.','Pas faim','Super faim'),
  text('hunger_details','Ajoute toute information ou détail supplémentaire concernant ton niveau de FAIM cette semaine.',false),
  scale('stress','Sur une échelle de 1 à 10, évalue ton niveau de STRESS cette semaine.','Stress faible','Stress fort','Une note faible indique un stress FAIBLE (généralement considéré comme bon). Une note élevée indique un stress FORT. Il s’agit essentiellement de l’inverse des autres notes.'),
  text('stress_details','Ajoute toute information ou détail supplémentaire concernant ton niveau de STRESS cette semaine.',false),
  scale('fatigue','Sur une échelle de 1 à 10, évalue ton niveau de FATIGUE cette semaine.','Pas fatigué','Très fatigué'),
  text('sleep','Partage-moi des informations ou des détails concernant la quantité et la qualité de ton SOMMEIL cette semaine.'),
  text('performance','PERFORMANCE — Quelles ont été tes performances d’entraînement cette semaine ? As-tu réalisé de nouvelles performances, ou as-tu remarqué un plateau, etc. ?',true,'À répondre si tu suis un plan d’entraînement. La force, la performance, le pump, la surcharge progressive, la motivation et l’accumulation de fatigue sont des notes à inclure. Sinon, indique « Pas de plan d’entraînement ». '),
  text('recovery','Décris-moi la qualité de ta RÉCUPÉRATION/COURBATURES cette semaine.',false,'As-tu suffisamment récupéré avant de reprendre l’entraînement de chaque partie du corps ? Quelles sont celles qui prennent plus de temps à récupérer ? As-tu le sentiment qu’un volume est trop élevé pour une partie du corps ?'),
  text('wellbeing','BIEN-ÊTRE — S’est-il passé quelque chose cette semaine qui ne figure pas dans ton tableur et qui pourrait avoir un effet sur toi, ton entraînement ou le suivi de tes progrès ?'),
  text('support','SOUTIEN/ENVIRONNEMENT — Les personnes qui t’entourent facilitent-elles ou compliquent-elles le processus ? Te soutiennent-elles ?'),
  text('coaching_feedback','APPRÉCIATION COACHING — Prends quelques minutes pour me faire un retour honnête et détaillé.',true,'Si tu devais décrire ton expérience avec mon coaching à quelqu’un, que dirais-tu ? Qu’est-ce qui t’a le plus marqué ou apporté concrètement ? Quels résultats ou changements (physiques, mentaux, santé, habitudes…) as-tu observés depuis le début ? Ton retour m’aide à améliorer le coaching et peut être partagé pour inspirer d’autres personnes.'),
  text('coach_help','COACHING — De quelle manière puis-je personnellement t’aider à rester sur la bonne voie ou à améliorer encore davantage la semaine à venir ?',true,'Y a-t-il quelque chose qui pourrait t’aider à mieux adhérer au plan ou des modifications à apporter ?'),
  text('next_week','SEMAINE PROCHAINE — Y a-t-il quelque chose à venir qui affectera tes progrès ?'),
  text('summary','RÉSUMÉ/QUESTIONS — Si tu devais conclure cette semaine, que dirais-tu ? As-tu des questions à me poser ou des choses à rajouter ?')
];
export function validateAnswers(answers) {
  return QUESTIONS.flatMap(q => {
    const value=answers[q.id];
    if(q.required && (value==null || String(value).trim()==='')) return [{id:q.id,message:'Cette réponse est obligatoire.'}];
    if(value==null || String(value).trim()==='') return [];
    if(q.type==='scale' && (!Number.isInteger(Number(value)) || Number(value)<1 || Number(value)>10)) return [{id:q.id,message:'Choisis une note de 1 à 10.'}];
    if(q.type==='email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return [{id:q.id,message:'Renseigne une adresse e-mail valide.'}];
    if(String(value).length>4000) return [{id:q.id,message:'4000 caractères maximum par réponse.'}];
    return [];
  });
}
export function weeklyWindow(day, now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value=key=>parts.find(p=>p.type===key).value;
  const today=`${value('year')}-${value('month')}-${value('day')}`;
  const date=new Date(today+'T12:00:00Z');
  const weekday=date.getUTCDay()||7;
  date.setUTCDate(date.getUTCDate()-weekday+1);
  const weekStart=date.toISOString().slice(0,10);
  if(!Number.isInteger(Number(day)) || Number(day)<1 || Number(day)>7) return {weekStart,dueDate:null,today,late:false};
  date.setUTCDate(date.getUTCDate()+Number(day)-1);
  const dueDate=date.toISOString().slice(0,10);
  return {weekStart,dueDate,today,late:today>dueDate};
}
export function parseTrainingPlan(value) {
  try { const plan=JSON.parse(value); if(plan?.schema==='aa-training-plan' && plan.version===1 && Array.isArray(plan.days)) return {plan,legacy:''}; } catch {}
  return {plan:null,legacy:String(value||'')};
}
export function validateTrainingPlan(plan) {
  const errors=[];
  if(!plan || plan.schema!=='aa-training-plan' || plan.version!==1) return ['Format de programme invalide.'];
  if(!Array.isArray(plan.days)||plan.days.length<1||plan.days.length>14) return ['Ajoute entre 1 et 14 séances.'];
  if(plan.mode==='weekly' && plan.days.length>7) errors.push('Une semaine fixe contient au maximum 7 jours.');
  const ids=new Set();
  for(const day of plan.days) {
    if(!day.id||ids.has(day.id)||!String(day.name||'').trim()) errors.push('Chaque séance doit avoir un nom et un identifiant unique.');
    ids.add(day.id);
    if(!Array.isArray(day.exercises)||day.exercises.length>20) {errors.push('20 exercices maximum par séance.');continue;}
    const rows=new Set();
    for(const ex of day.exercises) {
      if(!ex.id||rows.has(ex.id)||!ex.exerciseId||!ex.name) errors.push('Exercice invalide ou dupliqué.');
      rows.add(ex.id);
      if(!Number.isInteger(Number(ex.sets))||ex.sets<1||ex.sets>12) errors.push(`${ex.name} : indique 1 à 12 séries.`);
      if(!Number.isInteger(Number(ex.repsMin))||!Number.isInteger(Number(ex.repsMax))||ex.repsMin<1||ex.repsMax>200||Number(ex.repsMin)>Number(ex.repsMax)) errors.push(`${ex.name} : vérifie la plage de répétitions.`);
      if(!Number.isFinite(Number(ex.restSeconds))||ex.restSeconds<0||ex.restSeconds>1800) errors.push(`${ex.name} : vérifie le repos.`);
      if(ex.targetLoadKg!==null && ex.targetLoadKg!=='' && (!Number.isFinite(Number(ex.targetLoadKg))||ex.targetLoadKg<0||ex.targetLoadKg>1000)) errors.push(`${ex.name} : vérifie la charge cible.`);
      if(ex.rir!==null && ex.rir!=='' && ex.rir!==undefined && (!Number.isFinite(Number(ex.rir))||ex.rir<0||ex.rir>10)) errors.push(`${ex.name} : RIR de 0 à 10.`);
    }
  }
  return errors;
}
export function validateWorkout(logs) {
  if(!Array.isArray(logs)||!logs.length) return ['Coche au moins une série réalisée.'];
  const errors=[],seen=new Set();
  for(const row of logs) {
    const key=`${row.item_id}:${row.set_index}`;
    if(!row.item_id || seen.has(key)) errors.push('Série invalide ou dupliquée.');
    seen.add(key);
    if(!Number.isInteger(Number(row.set_index))||row.set_index<1||row.set_index>12) errors.push('Numéro de série invalide.');
    if(String(row.reps??'').trim()===''||!Number.isInteger(Number(row.reps))||row.reps<1||row.reps>200) errors.push('Indique 1 à 200 répétitions pour chaque série réalisée.');
    if(row.load_kg!==null && row.load_kg!=='' && (!Number.isFinite(Number(row.load_kg))||row.load_kg<0||row.load_kg>1000)) errors.push('Indique une charge de 0 à 1000 kg, ou laisse vide pour le poids du corps.');
  }
  return errors;
}
