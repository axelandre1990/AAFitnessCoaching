# AAFitnessCoaching V5.1

Application web progressive, en français et conçue d’abord pour mobile. Les V2 et V3 fournissent une authentification e-mail, les espaces client et coach, les invitations, les check-ins et retours, les programmes par client et le suivi de mesures. V4 ajoute au coach un constructeur de plans alimentaires structurés, une recherche alimentaire et des totaux calculés par repas. V5 ajoute le constructeur d’entraînement, les séries réalisées et le questionnaire hebdomadaire avec un jour choisi par le coach. L’application utilise Supabase Auth et Postgres avec Row Level Security ; l’interface ne remplace jamais les contrôles d’accès de la base.

## Aperçu local

Depuis le dossier `outputs/aa-coaching-v1` :

```sh
python3 -m http.server 4173
```

Ouvre `http://localhost:4173`. L’installation PWA fonctionne sur localhost ou en HTTPS. Le statut social Google/Apple/Facebook reste désactivé comme demandé.

## Activer les données dans Supabase

Le code du navigateur n’embarque que la clé publique `publishable`. Ne place jamais de clé `service_role` dans les fichiers `scripts/` ni dans la page web.

1. Dans le projet Supabase `kdoaxcocookckfwocscu`, ouvre **SQL Editor** et exécute les migrations dans l’ordre : `202610040001_aa_coaching_v2.sql`, `202610050001_aa_coaching_v3.sql`, puis `202610050002_aa_coaching_v4_nutrition.sql` et `202610050003_aa_coaching_v5.sql`. V2 crée les profils, les affectations, les check-ins, les réponses et leurs politiques RLS. V3 ajoute les programmes et mesures privés. V4 augmente la limite de taille du plan nutrition pour stocker les repas et aliments structurés.
2. Dans **Authentication → Sign In / Providers**, désactive l’inscription publique (**Allow new users to sign up**). Les nouveaux clients doivent passer par l’invitation du coach. Pour le premier compte coach, invite ton adresse depuis **Authentication → Users** (ou utilise ton compte AA existant), puis confirme-la. Dans SQL Editor, remplace `TON_EMAIL` par cette adresse et exécute ce SQL pour attribuer le rôle coach au propriétaire :

   ```sql
   update public.profiles p
   set role = 'coach'
   from auth.users u
   where u.id = p.id
     and lower(u.email) = lower('TON_EMAIL');
   ```

   Déconnecte-toi puis reconnecte-toi pour ouvrir l’espace coach.
3. La fonction d’invitation est déployée sur Supabase. Son secret serveur `AA_APP_URL` doit cibler l’adresse publique. Pour la republier depuis la racine du dossier après installation et connexion à la CLI Supabase :

   ```sh
   supabase login
   supabase secrets set AA_APP_URL="https://axelandre1990.github.io/AAFitnessCoaching/" --project-ref kdoaxcocookckfwocscu
   supabase functions deploy invite-client --project-ref kdoaxcocookckfwocscu
   ```

   La fonction utilise `SUPABASE_SERVICE_ROLE_KEY` côté serveur uniquement. Elle refuse toute personne qui n’a pas le rôle coach.
4. Dans **Authentication → URL Configuration**, ajoute l’origine utilisée à la liste des URL de redirection, pour les confirmations, invitations et réinitialisations de mot de passe.
5. Le serveur de messagerie intégré de Supabase est limité et n’est pas destiné à une utilisation client soutenue. Configure un SMTP personnalisé avant d’inviter des clients réels.

Si la migration ou la fonction n’est pas encore installée, l’application affiche un message de configuration et ne présente pas les faux check-ins comme sauvegardés.

## Parcours

- Le coach invite un nouveau client ou rattache un compte existant. Le client suit le lien reçu par e-mail pour créer son mot de passe et activer son compte, comme le parcours de première connexion de PrepMaster.
- Un client invité reçoit un lien e-mail d’activation, choisit son mot de passe, puis retrouve son espace après connexion.
- Le client peut envoyer son questionnaire hebdomadaire et retrouver l’historique ainsi que les réponses du coach.
- Le coach peut inviter ou rattacher un compte, consulter les check-ins des clients affectés et répondre à chacun. La réponse et le passage au statut « répondu » sont enregistrés dans une seule transaction.
- Le coach peut enregistrer des plans nutrition et entraînement structurés pour chaque client ; le client les retrouve dans son espace.
- Le client peut saisir son poids, son tour de taille et une note facultative. Le client et son coach peuvent consulter les 24 dernières mesures.
- Le coach peut définir des objectifs journaliers, composer jusqu’à six repas depuis le catalogue, régler les quantités en grammes et consulter les totaux calories/macros. Les clients voient le plan et ses aliments depuis leur espace.
- Le catalogue contient les aliments existants exploitables, Ciqual 2025 et plusieurs jeux génériques USDA. Les sources, versions et attributions sont listées dans `data/FOOD-DATA-SOURCES.md`.
- Une session sans profil ou rôle valide reste bloquée. Le service worker ne met en cache que les fichiers statiques de l’application, jamais les données client.

Le constructeur nutrition permet de composer des plans alimentaires. V5 ajoute l’éditeur de séances et le relevé des charges réalisées.

## À prévoir ensuite

Photos, graphiques de progression, messagerie temps réel, notifications push et fournisseurs sociaux restent à ajouter.


## V5 — entraînement et check-in hebdomadaire

Le coach choisit le jour de check-in sur chaque fiche client. Le questionnaire contient les 26 questions du PDF fourni, avec les échelles et obligations correspondantes. La date de remise est calculée en heure de Bruxelles : au plus tard à minuit le jour prévu, pour un retour le lendemain. Un envoi par semaine ; les remises tardives sont acceptées et signalées. Les anciens check-ins restent consultables.

Le coach compose des séances à partir des 327 exercices fournis, avec séries, répétitions min/max, repos, charge cible, RIR, tempo et consignes. Le client enregistre les séries réalisées, répétitions et kg. Les séances sont enregistrées atomiquement via RPC et un identifiant de requête évite les doubles envois. Le client et le coach affecté voient les 20 dernières séances. Les liens vers images/animations et vidéos restent ceux du fichier source ; certains médias sont absents ou peuvent exiger une permission Drive.

Les RPC imposent le rôle client pour l’envoi et l’affectation coach pour le réglage du jour. Les historiques d’entraînement ont des politiques RLS de lecture client/coach et aucun accès anonyme. Les plans texte V3 restent lisibles et leurs consignes sont conservées lors de conversion.

### Tests

`node --test tests/*.test.mjs` depuis le dossier source. Les tests de données et de modèles utilisent Node natif ; les tests navigateur utilisent Playwright et Chromium du runtime Codex installé. Le navigateur charge un serveur local et n’envoie aucune donnée client à Supabase. Les vérifications SQL de sécurité sont transactionnelles et terminent par ROLLBACK.

Notifications et rappels automatiques, graphiques de charges, méthodes avancées de séries et nouvelle bibliothèque GIF restent des évolutions.


## V5.1 — objectifs macros et comparaison du plan

Le coach saisit les protéines, glucides et lipides théoriques. Les calories sont en lecture seule et calculées automatiquement : 4 × protéines + 4 × glucides + 9 × lipides. Une comparaison journalière affiche les objectifs théoriques, le plan actuel (ensemble des six repas) et leurs écarts. L’ajout ou retrait d’un aliment, les portions et les objectifs actualisent immédiatement le tableau. Les calories affichées pour les portions et le plan suivent également 4 / 4 / 9 ; les valeurs énergétiques d’origine restent conservées dans les données alimentaires. Les objectifs calorifiques antérieurs avec macros incomplètes sont conservés jusqu’à la modification des macros.

La bibliothèque entraînement propose aussi une liste déroulante de sélection. La recherche, les filtres muscle/matériel et l’ouverture de la bibliothèque sont conservés pendant l’ajout successif d’exercices. Aucune nouvelle migration Supabase n’est nécessaire pour cette version : les calories calculées sont sauvegardées dans le champ de plan existant.

Ouvrir la version actualisée : https://axelandre1990.github.io/AAFitnessCoaching/?v=18 . Un onglet resté ouvert sur une ancienne version doit être actualisé pour charger les nouveaux écrans.
