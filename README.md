# AA Fitness Coaching V3

Application web progressive, en français et conçue d’abord pour mobile. Les V2 et V3 fournissent une authentification e-mail, les espaces client et coach, les invitations, les check-ins et retours, des repères nutrition et entraînement par client, ainsi que le suivi du poids et du tour de taille. L’application utilise Supabase Auth et Postgres avec Row Level Security ; l’interface ne remplace jamais les contrôles d’accès de la base.

## Aperçu local

Depuis le dossier `outputs/aa-coaching-v1` :

```sh
python3 -m http.server 4173
```

Ouvre `http://localhost:4173`. L’installation PWA fonctionne sur localhost ou en HTTPS. Le statut social Google/Apple/Facebook reste désactivé comme demandé.

## Activer les données dans Supabase

Le code du navigateur n’embarque que la clé publique `publishable`. Ne place jamais de clé `service_role` dans les fichiers `scripts/` ni dans la page web.

1. Dans le projet Supabase `kdoaxcocookckfwocscu`, ouvre **SQL Editor** et exécute les migrations dans l’ordre : `202610040001_aa_coaching_v2.sql`, puis `202610050001_aa_coaching_v3.sql`. V2 crée les profils, les affectations, les check-ins, les réponses et leurs politiques RLS. V3 ajoute les programmes nutrition/entraînement et les mesures privées du client, également protégés par RLS.
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
- Le client peut envoyer un check-in texte et retrouver l’historique ainsi que les réponses du coach.
- Le coach peut inviter ou rattacher un compte, consulter les check-ins des clients affectés et répondre à chacun. La réponse et le passage au statut « répondu » sont enregistrés dans une seule transaction.
- Le coach peut enregistrer des repères nutrition et un programme d’entraînement en texte pour chaque client ; le client les retrouve dans son espace.
- Le client peut saisir son poids, son tour de taille et une note facultative. Le client et son coach peuvent consulter les 24 dernières mesures.
- Une session sans profil ou rôle valide reste bloquée. Le service worker ne met en cache que les fichiers statiques de l’application, jamais les données client.

Les programmes nutrition et entraînement sont des repères écrits par le coach ; V3 n’inclut pas encore de journal alimentaire, de bibliothèque d’exercices ni de calcul automatique.

## Ce qui reste pour V4

Graphiques de progression, photos, messagerie temps réel, notifications push et fournisseurs sociaux restent à ajouter.
