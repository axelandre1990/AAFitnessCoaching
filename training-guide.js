export const TRAINING_GUIDE = [
 ['Échauffement et séries de travail', 'Avant un nouveau mouvement ou groupe musculaire, augmente progressivement la charge sur des séries de préparation. Ces séries servent à préparer le geste ; elles ne remplacent pas les séries de travail indiquées dans ton programme.'],
 ['Séries et répétitions', 'Les séries sont les efforts à réaliser ; les répétitions sont les mouvements dans chaque série. Une plage comme 8–12 permet de progresser dans cette plage, puis d’ajuster la charge selon les consignes du coach. Note les performances réellement réalisées.'],
 ['RIR : répétitions en réserve', 'Le RIR estime combien de répétitions propres il te resterait avant de ne plus pouvoir en effectuer une autre. RIR 2 signifie environ deux répétitions restantes. Respecte la cible indiquée pour chaque série.'],
 ['Tempo et repos', 'Les quatre repères du tempo décrivent la descente, la pause en position étirée, la montée, puis la pause en position contractée. Par exemple, 31X0 signifie 3 secondes de descente, 1 seconde de pause, une montée sans durée imposée, puis aucune pause finale. Respecte le repos prévu et conserve une technique et une amplitude comparables entre les séances.'],
 ['Répétitions partielles', 'Une répétition partielle utilise seulement une portion du mouvement. Les partielles en position allongée travaillent la portion où le muscle reste étiré. Applique cette technique uniquement lorsqu’elle figure dans les consignes du coach, avec l’amplitude demandée.'],
 ['Techniques indiquées par le coach', 'Un superset enchaîne les exercices indiqués avant le repos. Un dropset réduit la charge pour poursuivre l’effort. Une série de type back-off utilise une charge réduite après une série plus lourde. Pour ces techniques et les myo-reps, suis les consignes de séries, de charge et de repos propres à ton programme.']
];

export function renderTrainingGuide(target) {
 const section=document.createElement('section');section.className='training-guide';
 for(const [heading,copy] of TRAINING_GUIDE){const title=document.createElement('h4'),paragraph=document.createElement('p');title.textContent=heading;paragraph.textContent=copy;section.append(title,paragraph);}
 target.replaceChildren(section);
}
