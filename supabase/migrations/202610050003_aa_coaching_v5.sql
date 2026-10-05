begin;
alter table public.profiles add column if not exists checkin_day smallint check (checkin_day between 1 and 7);
alter table public.check_ins add column if not exists kind text not null default 'message' check (kind in ('message','weekly'));
alter table public.check_ins add column if not exists questionnaire_version integer;
alter table public.check_ins add column if not exists answers jsonb;
alter table public.check_ins add column if not exists week_start date;
alter table public.check_ins add column if not exists due_date date;
alter table public.check_ins add column if not exists submitted_late boolean;
create unique index if not exists aa_weekly_once on public.check_ins(client_id,week_start) where kind='weekly';

create or replace function public.aa_set_checkin_day(target_client uuid, weekday integer)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.is_aa_assigned_client(target_client) then raise exception 'Accès coach non autorisé.'; end if;
 if weekday is null or weekday not between 1 and 7 then raise exception 'Choisis un jour de lundi à dimanche.'; end if;
 update public.profiles set checkin_day=weekday where id=target_client;
end;
$$;
create or replace function public.aa_submit_weekly_check_in(response_answers jsonb, form_version integer default 1)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
 user_id uuid := auth.uid(); scheduled_day integer; today date := (now() at time zone 'Europe/Brussels')::date;
 monday date; deadline date; response_id uuid; key text; cleaned jsonb := '{}'::jsonb;
 required_keys text[] := array['full_name','attitude_details','wins','challenges','diet','improvements','sleep','performance','wellbeing','support','coaching_feedback','coach_help','next_week','summary'];
 scale_keys text[] := array['attitude','energy','mood','hunger','stress','fatigue'];
 all_keys text[] := array['email','full_name','attitude','attitude_details','wins','challenges','diet','improvements','energy','energy_details','mood','mood_details','hunger','hunger_details','stress','stress_details','fatigue','sleep','performance','recovery','wellbeing','support','coaching_feedback','coach_help','next_week','summary'];
begin
 if user_id is null or not exists(select 1 from public.profiles where id=user_id and role='client') then raise exception 'Connecte-toi avec ton compte client.'; end if;
 select checkin_day into scheduled_day from public.profiles where id=user_id;
 if scheduled_day is null then raise exception 'Ton coach doit choisir ton jour de check-in.'; end if;
 if form_version is distinct from 1 or jsonb_typeof(response_answers) is distinct from 'object' or octet_length(response_answers::text)>120000 then raise exception 'Questionnaire invalide ou trop volumineux.'; end if;
 foreach key in array required_keys loop
  if jsonb_typeof(response_answers->key) is distinct from 'string' or char_length(trim(coalesce(response_answers->>key,''))) not between 1 and 4000 then raise exception 'Réponse obligatoire manquante : %',key; end if;
 end loop;
 foreach key in array scale_keys loop
  if jsonb_typeof(response_answers->key) is distinct from 'number' then raise exception 'Choisis une note de 1 à 10 : %',key; end if;
  if (response_answers->>key)::numeric not between 1 and 10 or (response_answers->>key)::numeric <> trunc((response_answers->>key)::numeric) then raise exception 'Note invalide : %',key; end if;
 end loop;
 foreach key in array all_keys loop
  if key=any(scale_keys) then cleaned:=cleaned||jsonb_build_object(key,response_answers->key);
  else
   if response_answers ? key and jsonb_typeof(response_answers->key) is distinct from 'string' then raise exception 'Réponse invalide : %',key; end if;
   if char_length(coalesce(response_answers->>key,''))>4000 then raise exception 'Réponse trop longue : %',key; end if;
   cleaned:=cleaned||jsonb_build_object(key,trim(coalesce(response_answers->>key,'')));
  end if;
 end loop;
 cleaned:=cleaned||jsonb_build_object('email',(select email from auth.users where id=user_id));
 monday:=today-(extract(isodow from today)::integer-1);deadline:=monday+scheduled_day-1;
 insert into public.check_ins(client_id,body,kind,questionnaire_version,answers,week_start,due_date,submitted_late)
 values(user_id,'Check-in hebdomadaire — semaine du '||monday::text,'weekly',1,cleaned,monday,deadline,today>deadline)
 returning id into response_id;
 return response_id;
exception when unique_violation then raise exception 'Ton check-in de cette semaine a déjà été envoyé.';
end;
$$;
revoke all on function public.aa_set_checkin_day(uuid,integer) from public,anon;
revoke all on function public.aa_submit_weekly_check_in(jsonb,integer) from public,anon;
grant execute on function public.aa_set_checkin_day(uuid,integer) to authenticated;
grant execute on function public.aa_submit_weekly_check_in(jsonb,integer) to authenticated;

alter table public.client_plans drop constraint if exists client_plans_training_plan_check;
alter table public.client_plans add constraint client_plans_training_plan_check check(char_length(training_plan)<=100000);
grant insert(updated_at) on public.client_plans to authenticated;
create table if not exists public.training_sessions(
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null,
 plan_day_id text not null,
 session_name text not null,
 plan_snapshot jsonb not null,
 performed_on date not null default (now() at time zone 'Europe/Brussels')::date,
 notes text not null default '' check(char_length(notes)<=2000),
 created_at timestamptz not null default now(),
 unique(client_id,request_id)
);
create table if not exists public.training_sets(
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.training_sessions(id) on delete cascade,
 exercise_item_id text not null,exercise_id text not null,exercise_name text not null,
 exercise_order integer not null,
 set_index integer not null check(set_index between 1 and 12),
 reps integer not null check(reps between 1 and 200),
 load_kg numeric(7,2) check(load_kg between 0 and 1000),
 unique(session_id,exercise_item_id,set_index)
);
create index if not exists aa_training_client_date on public.training_sessions(client_id,created_at desc);
create index if not exists aa_training_sets_session on public.training_sets(session_id);
alter table public.training_sessions enable row level security;
alter table public.training_sets enable row level security;
drop policy if exists aa_training_sessions_read on public.training_sessions;
create policy aa_training_sessions_read on public.training_sessions for select to authenticated using(client_id=auth.uid() or public.is_aa_assigned_client(client_id));
drop policy if exists aa_training_sets_read on public.training_sets;
create policy aa_training_sets_read on public.training_sets for select to authenticated using(exists(select 1 from public.training_sessions s where s.id=session_id and (s.client_id=auth.uid() or public.is_aa_assigned_client(s.client_id))));
revoke all on public.training_sessions,public.training_sets from anon,authenticated;
grant select on public.training_sessions,public.training_sets to authenticated;
grant all on public.training_sessions,public.training_sets to service_role;

create or replace function public.aa_submit_training_session(day_id text, completed_sets jsonb, session_notes text, client_request_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare user_id uuid:=auth.uid(); plan jsonb; day jsonb; log jsonb; exercise jsonb; session_id uuid; position integer; set_no integer; repetitions integer; weight numeric;
begin
 if user_id is null or not exists(select 1 from public.profiles where id=user_id and role='client') then raise exception 'Connecte-toi avec ton compte client.'; end if;
 if client_request_id is null then raise exception 'Identifiant de séance manquant.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(user_id::text||client_request_id::text,0));
 select id into session_id from public.training_sessions where client_id=user_id and request_id=client_request_id;
 if session_id is not null then return session_id;end if;
 if jsonb_typeof(completed_sets) is distinct from 'array' or jsonb_array_length(completed_sets) not between 1 and 240 or char_length(coalesce(session_notes,''))>2000 then raise exception 'Séries ou note de séance invalides.'; end if;
 begin select training_plan::jsonb into plan from public.client_plans where client_id=user_id;exception when invalid_text_representation then raise exception 'Ton coach doit enregistrer un programme structuré.';end;
 if plan->>'schema' is distinct from 'aa-training-plan' or jsonb_typeof(plan->'days') is distinct from 'array' then raise exception 'Aucun programme structuré disponible.'; end if;
 select value into day from jsonb_array_elements(plan->'days') where value->>'id'=day_id limit 1;
 if day is null or jsonb_typeof(day->'exercises') is distinct from 'array' then raise exception 'Séance introuvable. Recharge ton programme.'; end if;
 insert into public.training_sessions(client_id,request_id,plan_day_id,session_name,plan_snapshot,notes)
 values(user_id,client_request_id,day_id,coalesce(day->>'name','Séance'),day,trim(coalesce(session_notes,''))) returning id into session_id;
 for log in select value from jsonb_array_elements(completed_sets) loop
  select value,ordinality::integer into exercise,position from jsonb_array_elements(day->'exercises') with ordinality where value->>'id'=log->>'item_id' limit 1;
  if exercise is null then raise exception 'Le programme a changé. Recharge-le avant de saisir cette séance.';end if;
  if jsonb_typeof(log->'set_index') is distinct from 'number' or jsonb_typeof(log->'reps') is distinct from 'number' then raise exception 'Répétitions ou série invalides.';end if;
  if (log->>'set_index')::numeric<>trunc((log->>'set_index')::numeric) or (log->>'reps')::numeric<>trunc((log->>'reps')::numeric) then raise exception 'Les répétitions et numéros de série doivent être des nombres entiers.';end if;
  set_no:=(log->>'set_index')::integer; repetitions:=(log->>'reps')::integer;
  if set_no not between 1 and least((exercise->>'sets')::integer,12) or repetitions not between 1 and 200 then raise exception 'Série ou répétitions hors limites.';end if;
  if log->'load_kg' is null or log->'load_kg'='null'::jsonb then weight:=null;
  else
   if jsonb_typeof(log->'load_kg') is distinct from 'number' then raise exception 'Charge invalide.';end if;
   weight:=(log->>'load_kg')::numeric;
   if weight not between 0 and 1000 then raise exception 'La charge doit être comprise entre 0 et 1000 kg.';end if;
  end if;
  insert into public.training_sets(session_id,exercise_item_id,exercise_id,exercise_name,exercise_order,set_index,reps,load_kg)
  values(session_id,exercise->>'id',exercise->>'exerciseId',exercise->>'name',position,set_no,repetitions,weight);
 end loop;
 return session_id;
end;
$$;
revoke all on function public.aa_submit_training_session(text,jsonb,text,uuid) from public,anon;
grant execute on function public.aa_submit_training_session(text,jsonb,text,uuid) to authenticated;
commit;
