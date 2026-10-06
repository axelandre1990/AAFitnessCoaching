const DAY=86400000;
export function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
export function shiftDate(date,days){if(!validDate(date))throw Error('Choisis une date de début valide.');return new Date(new Date(date+'T00:00:00Z').getTime()+days*DAY).toISOString().slice(0,10);}
export function emptyAnnualPlan(startDate){return {start_date:startDate,title:'Mon parcours sur 52 semaines',goal:'',phases:[]};}
const TEXT=['title','purpose','strategy','milestones','training_focus','activity_focus','events','notes'];
const METRICS={protein_g:1000,carbs_g:2000,fat_g:1000,fiber_g:200,calories:15000};
function amount(value,max){if(value==null||value==='')return null;const n=Number(value);if(!Number.isFinite(n)||n<0||n>max)throw Error('Un objectif est hors limites.');return n;}
export function normalizeAnnualPlan(input){
 if(!input||!validDate(input.start_date))throw Error('Choisis une date de début valide.');
 const plan={start_date:input.start_date,title:String(input.title||'Mon parcours sur 52 semaines').trim().slice(0,160),goal:String(input.goal||'').trim().slice(0,2000),phases:[]};
 if(!Array.isArray(input.phases)||input.phases.length>52)throw Error('La roadmap peut contenir jusqu’à 52 phases.');
 const ids=new Set();for(const source of input.phases){const p={id:String(source.id||'')};if(!p.id||ids.has(p.id))throw Error('Chaque phase doit avoir un identifiant unique.');ids.add(p.id);
 p.start_week=Number(source.start_week);p.end_week=Number(source.end_week);if(!Number.isInteger(p.start_week)||!Number.isInteger(p.end_week)||p.start_week<1||p.end_week>52||p.end_week<p.start_week)throw Error('Chaque phase doit couvrir des semaines entre 1 et 52.');
 for(const key of TEXT)p[key]=String(source[key]||'').trim().slice(0,key==='title'?160:2000);if(!p.title)throw Error('Donne un nom à chaque phase.');
 p.targets={};for(const type of ['training','rest']){const values={};for(const[key,max]of Object.entries(METRICS)){const v=amount(source.targets?.[type]?.[key],max);if(v!==null)values[key]=v;}if(Object.keys(values).length)p.targets[type]=values;}
 for(const[key,max]of [['standard_calories',15000],['high_calories',15000],['low_calories',15000],['steps_goal',100000],['sleep_goal',24]]){const v=amount(source.targets?.[key],max);if(v!==null)p.targets[key]=v;}p.targets.cardio=String(source.targets?.cardio||'').trim().slice(0,2000);plan.phases.push(p);}
 plan.phases.sort((a,b)=>a.start_week-b.start_week);for(let i=1;i<plan.phases.length;i++)if(plan.phases[i].start_week<=plan.phases[i-1].end_week)throw Error('Deux phases ne peuvent pas couvrir la même semaine.');return plan;
}
export function annualWeeks(input,today){const plan=normalizeAnnualPlan(input);return Array.from({length:52},(_,i)=>{const start=shiftDate(plan.start_date,i*7),end=shiftDate(start,6);return {number:i+1,start,end,phase:plan.phases.find(p=>p.start_week<=i+1&&p.end_week>=i+1)||null,status:today<start?'upcoming':today>end?'past':'current'};});}
export function annualMonths(input,today){const weeks=annualWeeks(input,today),start=new Date(input.start_date+'T00:00:00Z'),day=start.getUTCDate(),year=start.getUTCFullYear(),month=start.getUTCMonth();const boundary=i=>{const last=new Date(Date.UTC(year,month+i+1,0)).getUTCDate();return new Date(Date.UTC(year,month+i,Math.min(day,last))).toISOString().slice(0,10);};return Array.from({length:12},(_,i)=>{const from=boundary(i),to=i===11?weeks.at(-1).end:shiftDate(boundary(i+1),-1);const selected=weeks.filter(w=>w.start<=to&&w.end>=from);return {number:i+1,start:from,end:to,weeks:selected,phases:[...new Map(selected.filter(w=>w.phase).map(w=>[w.phase.id,w.phase])).values()]};});}
