import { QUESTIONS, WEEKDAYS, CHECKIN_NOTE, validateAnswers, weeklyWindow } from './coaching-model.js?v=20';
const node=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
export function mountWeeklyCheckIn(form, {email,fullName,checkinDay,checkIns=[]}) {
  const window=weeklyWindow(checkinDay);
  const sent=checkIns.find(c=>c.kind==='weekly' && c.week_start===window.weekStart);
  form.replaceChildren();
  form.append(node('p','schedule-note',CHECKIN_NOTE));
  const status=node('p','weekly-status');
  if(!window.dueDate) {status.textContent='Ton coach doit choisir ton jour de check-in avant ton premier envoi.';form.append(status);return null;}
  const date=new Intl.DateTimeFormat('fr-BE',{day:'numeric',month:'long',year:'numeric'}).format(new Date(window.dueDate+'T12:00:00Z'));
  status.textContent=`Check-in de cette semaine : ${WEEKDAYS[checkinDay-1]} ${date} · au plus tard à minuit, heure de Bruxelles.`;
  if(sent) status.textContent+=` Envoyé le ${new Intl.DateTimeFormat('fr-BE',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Brussels'}).format(new Date(sent.created_at))}. Retrouve tes réponses et le retour du coach dans l’historique.`;
  else if(window.late) status.textContent+=' La date prévue est passée : tu peux encore l’envoyer, il sera signalé comme remis en retard.';
  form.append(status);
  if(sent) return null;
  form.append(node('p','card-copy','Les questions marquées * sont obligatoires. Ton questionnaire reste affiché si l’envoi échoue.'));
  const groups=[['Ton bilan',0,8],['Énergie et ressentis',8,17],['Entraînement et récupération',17,20],['Bien-être et coaching',20,24],['La semaine prochaine',24,26]];
  for(const [label,start,end] of groups) {
    const section=node('details','weekly-section');section.open=start===0;
    section.append(node('summary','',label));
    for(const [index,q] of QUESTIONS.entries()) {
      if(index<start||index>=end) continue;
      const block=node('label','auth-field weekly-question');
      block.append(node('span','weekly-question__label',`${index+1}. ${q.label}${q.required?' *':''}`));
      if(q.hint) block.append(node('span','weekly-question__hint',q.hint));
      let input;
      if(q.type==='scale') {
        input=node('select');input.append(new Option('Choisir une note',''));
        for(let i=1;i<=10;i++) input.append(new Option(String(i),String(i)));
        block.append(node('span','scale-legend',`1 : ${q.low} · 10 : ${q.high}`));
      } else {
        input=node(q.type==='text'?'textarea':'input');
        if(q.type==='text') input.rows=3;else input.type=q.type==='email'?'email':'text';
        input.maxLength=4000;
      }
      input.name=q.id;input.required=q.required;
      if(q.id==='email') {input.value=email||'';input.readOnly=true;}
      if(q.id==='full_name') input.value=fullName||'';
      const error=node('span','question-error');error.id=`weekly-error-${q.id}`;
      input.setAttribute('aria-describedby',error.id);
      block.append(input,error);section.append(block);
    }
    form.append(section);
  }
  const message=node('p','inline-message');message.id='checkin-message';message.setAttribute('role','status');
  const submit=node('button','auth-primary dashboard-submit','Envoyer mon check-in hebdomadaire');submit.id='checkin-submit';submit.type='submit';
  form.append(message,submit);
  return { serialize() {
    const answers=Object.fromEntries(new FormData(form));
    const errors=validateAnswers(answers);
    for(const q of QUESTIONS) {
      const error=form.querySelector(`#weekly-error-${q.id}`);
      const problem=errors.find(e=>e.id===q.id);
      error.textContent=problem?.message||'';
      form.elements[q.id].setAttribute('aria-invalid',String(Boolean(problem)));
      if(problem) error.closest('details').open=true;
    }
    if(errors.length) {form.elements[errors[0].id].focus();throw new Error('Complète les réponses obligatoires et vérifie les notes avant d’envoyer.');}
    for(const q of QUESTIONS) answers[q.id]=q.type==='scale'?Number(answers[q.id]):String(answers[q.id]||'').trim();
    return answers;
  }};
}
export function renderWeeklyAnswers(target, checkIn) {
  target.append(node('p','card-copy',`Check-in prévu le ${checkIn.due_date||'—'}${checkIn.submitted_late?' · remis en retard':' · remis dans les délais'}`));
  const scores=node('div','checkin-scores');
  for(const q of QUESTIONS.filter(q=>q.type==='scale')) scores.append(node('span','status-pill',`${q.id==='attitude'?'Attitude':q.id==='energy'?'Énergie':q.id==='mood'?'Humeur':q.id==='hunger'?'Faim':q.id==='stress'?'Stress':'Fatigue'} ${checkIn.answers?.[q.id]??'—'}/10`));
  target.append(scores);
  const details=node('details','weekly-answers');details.append(node('summary','','Lire toutes les réponses'));
  for(const q of QUESTIONS) {
    const row=node('div','weekly-answer');row.append(node('h4','',q.label),node('p','',String(checkIn.answers?.[q.id]??'Non renseigné')));details.append(row);
  }
  target.append(details);
}
