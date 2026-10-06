begin;
create table public.coaching_annual_roadmaps(
 client_id uuid primary key references public.profiles(id) on delete cascade,
 plan jsonb not null check(jsonb_typeof(plan)='object' and octet_length(plan::text)<=1048576),
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default now()
);
alter table public.coaching_annual_roadmaps enable row level security;
create policy annual_read on public.coaching_annual_roadmaps for select to authenticated using(client_id=(select auth.uid()) or public.is_aa_assigned_client(client_id));
create policy annual_insert on public.coaching_annual_roadmaps for insert to authenticated with check(public.is_aa_assigned_client(client_id));
create policy annual_update on public.coaching_annual_roadmaps for update to authenticated using(public.is_aa_assigned_client(client_id)) with check(public.is_aa_assigned_client(client_id));
revoke all on public.coaching_annual_roadmaps from anon,authenticated;
grant select,insert on public.coaching_annual_roadmaps to authenticated;
grant update(plan,revision,updated_at) on public.coaching_annual_roadmaps to authenticated;
create function aa_private.validate_annual_roadmap() returns trigger language plpgsql security invoker set search_path='' as $$
declare p jsonb;t jsonb;v jsonb;k text;typ text;lo integer;hi integer;maxvalue numeric;ids text[]:=array[]::text[];
begin
 if tg_op='UPDATE' then
 if new.client_id<>old.client_id or new.revision<>old.revision+1 then raise exception 'Révision invalide. Recharge la fiche.';end if;
 elsif new.revision<>1 then raise exception 'Révision initiale invalide.';end if;
 if jsonb_typeof(new.plan->'start_date') is distinct from 'string' or (new.plan->>'start_date')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Date de début invalide.';end if;
 if to_char((new.plan->>'start_date')::date,'YYYY-MM-DD')<>new.plan->>'start_date' then raise exception 'Date de début invalide.';end if;
 if jsonb_typeof(new.plan->'title') is distinct from 'string' or length(trim(new.plan->>'title')) not between 1 and 160 or length(coalesce(new.plan->>'goal',''))>2000 then raise exception 'Titre ou objectif invalide.';end if;
 if jsonb_typeof(new.plan->'phases') is distinct from 'array' then raise exception 'Phases invalides.';end if;
 if jsonb_array_length(new.plan->'phases')>52 then raise exception '52 phases maximum.';end if;
 for p in select value from jsonb_array_elements(new.plan->'phases') loop
 if jsonb_typeof(p)<>'object' or jsonb_typeof(p->'id') is distinct from 'string' or length(p->>'id') not between 1 and 160 or (p->>'id')=any(ids) then raise exception 'Identifiant de phase invalide.';end if;ids:=ids||array[p->>'id'];
 if jsonb_typeof(p->'start_week') is distinct from 'number' or jsonb_typeof(p->'end_week') is distinct from 'number' or (p->>'start_week')::numeric<>trunc((p->>'start_week')::numeric) or (p->>'end_week')::numeric<>trunc((p->>'end_week')::numeric) then raise exception 'Numéros de semaine invalides.';end if;
 lo:=(p->>'start_week')::integer;hi:=(p->>'end_week')::integer;if lo<1 or hi>52 or hi<lo then raise exception 'Semaines hors limites.';end if;
 for k,v in select * from jsonb_each(p) loop
 if k in ('title','purpose','strategy','milestones','training_focus','activity_focus','events','notes') then
 if jsonb_typeof(v)<>'string' or length(v#>>'{}')>(case when k='title' then 160 else 2000 end) then raise exception 'Texte de phase invalide.';end if;end if;
 end loop;if coalesce(trim(p->>'title'),'')='' then raise exception 'Nom de phase manquant.';end if;
 if p ? 'targets' then
 t:=p->'targets';if jsonb_typeof(t)<>'object' then raise exception 'Objectifs invalides.';end if;
 for typ in select unnest(array['training','rest']) loop
 if not t ? typ then continue;end if;if jsonb_typeof(t->typ)<>'object' then raise exception 'Macros invalides.';end if;
 for k,v in select * from jsonb_each(t->typ) loop
 maxvalue:=case k when 'protein_g' then 1000 when 'carbs_g' then 2000 when 'fat_g' then 1000 when 'fiber_g' then 200 when 'calories' then 15000 else null end;
 if maxvalue is null or jsonb_typeof(v)<>'number' or (v::text)::numeric<0 or (v::text)::numeric>maxvalue then raise exception 'Objectif hors limites.';end if;
 end loop;end loop;
 for k,v in select * from jsonb_each(t) loop
 if k in ('steps_goal','sleep_goal','standard_calories','high_calories','low_calories') then
 maxvalue:=case when k='steps_goal' then 100000 when k='sleep_goal' then 24 else 15000 end;
 if jsonb_typeof(v)<>'number' or (v::text)::numeric<0 or (v::text)::numeric>maxvalue then raise exception 'Objectif hors limites.';end if;
 elsif k='cardio' then if jsonb_typeof(v)<>'string' or length(v#>>'{}')>2000 then raise exception 'Consigne cardio invalide.';end if;end if;
 end loop;end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(new.plan->'phases') a cross join jsonb_array_elements(new.plan->'phases') b where a->>'id'<>b->>'id' and (a->>'start_week')::integer<=(b->>'end_week')::integer and (b->>'start_week')::integer<=(a->>'end_week')::integer) then raise exception 'Deux phases se chevauchent.';end if;
 new.updated_at:=now();return new;
end $$;
revoke all on function aa_private.validate_annual_roadmap() from public,anon;
grant execute on function aa_private.validate_annual_roadmap() to authenticated;
create trigger aa_validate_annual before insert or update on public.coaching_annual_roadmaps for each row execute function aa_private.validate_annual_roadmap();

alter table public.client_tracking_settings drop constraint client_tracking_settings_enabled_metrics_check;
alter table public.client_tracking_settings add constraint client_tracking_settings_enabled_metrics_check check(enabled_metrics <@ array['weight_kg','waist_cm','steps','sleep_hours','recovery','energy','digestion','stress','hunger','water_l','salt_g','resting_hr','fasting_glucose','blood_pressure','menstruation','notes','biofeedback1','biofeedback2','biofeedback3']::text[]);
alter table public.client_day_types drop constraint client_day_types_day_type_check;
alter table public.client_day_types add constraint client_day_types_day_type_check check(day_type in ('training','rest','standard','high','low'));
create or replace function aa_private.save_daily(day date, values_json jsonb, expected_revision integer, settings_revision integer)
returns public.daily_tracking_entries language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); settings public.client_tracking_settings; old public.daily_tracking_entries; result public.daily_tracking_entries;
 allowed text[]; k text; v jsonb; n numeric; lo numeric; hi numeric; whole boolean; cleaned jsonb:=values_json;
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='client') then raise exception 'Connecte-toi avec ton compte client.'; end if;
 if day is null or day > (now() at time zone 'Europe/Brussels')::date or day < (now() at time zone 'Europe/Brussels')::date-730 then raise exception 'Date invalide.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select * into settings from public.client_tracking_settings where client_id=uid;
 if coalesce(settings.revision,0) is distinct from settings_revision then raise exception 'Ton coach a modifié les options. Recharge la page.'; end if;
 allowed:=coalesce(settings.enabled_metrics,array['weight_kg','waist_cm','notes']);
 if 'blood_pressure'=any(allowed) then allowed:=allowed||array['bp_systolic','bp_diastolic']; end if;
 if 'fasting_glucose'=any(allowed) then allowed:=allowed||array['glucose_unit']; end if;
 if coalesce(settings.macro_tracking,false) then allowed:=allowed||array['protein_g','carbs_g','fat_g','fiber_g']; end if;
 if jsonb_typeof(values_json) is distinct from 'object' or octet_length(values_json::text)>10000 then raise exception 'Suivi invalide.'; end if;
 for k,v in select * from jsonb_each(values_json) loop
  if not k=any(allowed) or k='blood_pressure' then raise exception 'Suivi désactivé : %',k; end if;
  if v='null'::jsonb then continue; end if;
  if k='notes' then
   if jsonb_typeof(v)<>'string' or length(values_json->>k)>2000 then raise exception 'Note invalide.'; end if; continue;
  elsif k='menstruation' then
   if values_json->>k not in ('yes','no') then raise exception 'Menstruations invalides.'; end if; continue;
  elsif k='glucose_unit' then
   if values_json->>k not in ('mg_dl','mmol_l') then raise exception 'Unité invalide.'; end if; continue;
  end if;
  if jsonb_typeof(v)<>'number' then raise exception 'Valeur numérique requise : %',k; end if;
  n:=(values_json->>k)::numeric;lo:=0;hi:=2000;whole:=false;
  case k
   when 'weight_kg' then lo:=20;hi:=400; when 'waist_cm' then lo:=30;hi:=250;
   when 'steps' then hi:=100000;whole:=true; when 'sleep_hours' then hi:=24;
   when 'water_l' then hi:=20; when 'salt_g' then hi:=100;
   when 'resting_hr' then hi:=300;whole:=true; when 'fasting_glucose' then hi:=1000;
   when 'bp_systolic','bp_diastolic' then hi:=350;whole:=true;
   when 'recovery','energy','digestion','stress','hunger','biofeedback1','biofeedback2','biofeedback3' then lo:=1;hi:=10;whole:=true;
   else null;
  end case;
  if n<lo or n>hi or (whole and n<>trunc(n)) then raise exception 'Valeur hors limites : %',k; end if;
 end loop;
 if (values_json->>'bp_systolic' is null) <> (values_json->>'bp_diastolic' is null) then raise exception 'Renseigne les deux pressions.'; end if;
 if values_json->>'fasting_glucose' is not null and values_json->>'glucose_unit' is null then raise exception 'Choisis une unité.'; end if;
 if values_json->>'protein_g' is not null or values_json->>'carbs_g' is not null or values_json->>'fat_g' is not null then
  if values_json->>'protein_g' is null or values_json->>'carbs_g' is null or values_json->>'fat_g' is null then raise exception 'Renseigne les trois macros.'; end if;
  cleaned:=cleaned||jsonb_build_object('calories',round((values_json->>'protein_g')::numeric*4+(values_json->>'carbs_g')::numeric*4+(values_json->>'fat_g')::numeric*9,2));
 elsif coalesce(settings.macro_tracking,false) and values_json ?| array['protein_g','carbs_g','fat_g'] then cleaned:=cleaned||jsonb_build_object('calories',null); end if;
 if not exists(select 1 from jsonb_each(values_json) e where e.key<>'glucose_unit' and e.value<>'null'::jsonb and e.value<>'""'::jsonb) then raise exception 'Renseigne au moins une information.'; end if;
 select * into old from public.daily_tracking_entries where client_id=uid and recorded_on=day;
 if coalesce(old.revision,0) is distinct from expected_revision then raise exception 'Suivi modifié dans un autre onglet. Recharge cette date.'; end if;
 insert into public.daily_tracking_entries(client_id,recorded_on,metrics) values(uid,day,cleaned)
 on conflict(client_id,recorded_on) do update set metrics=daily_tracking_entries.metrics||cleaned,revision=daily_tracking_entries.revision+1,updated_at=now() returning * into result;
 return result;
end $$;
create or replace function aa_private.import_daily(target_client uuid, day date, values_json jsonb)
returns public.daily_tracking_entries language plpgsql security definer set search_path='' as $$
declare uid uuid:=target_client; settings public.client_tracking_settings; old public.daily_tracking_entries; result public.daily_tracking_entries;
 allowed text[]; k text; v jsonb; n numeric; lo numeric; hi numeric; whole boolean; cleaned jsonb:=values_json;
begin
 if auth.uid() is null or not public.is_aa_assigned_client(target_client) then raise exception 'Import coach non autorisé.'; end if;
 if day is null or day > (now() at time zone 'Europe/Brussels')::date or day < (now() at time zone 'Europe/Brussels')::date-730 then raise exception 'Date invalide.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select * into settings from public.client_tracking_settings where client_id=uid;
 allowed:=array['weight_kg','waist_cm','steps','sleep_hours','recovery','energy','digestion','stress','hunger','water_l','salt_g','resting_hr','fasting_glucose','glucose_unit','bp_systolic','bp_diastolic','menstruation','notes','protein_g','carbs_g','fat_g','fiber_g','biofeedback1','biofeedback2','biofeedback3'];
 if jsonb_typeof(values_json) is distinct from 'object' or octet_length(values_json::text)>10000 then raise exception 'Suivi invalide.'; end if;
 for k,v in select * from jsonb_each(values_json) loop
  if not k=any(allowed) or k='blood_pressure' then raise exception 'Suivi désactivé : %',k; end if;
  if v='null'::jsonb then continue; end if;
  if k='notes' then
   if jsonb_typeof(v)<>'string' or length(values_json->>k)>2000 then raise exception 'Note invalide.'; end if; continue;
  elsif k='menstruation' then
   if values_json->>k not in ('yes','no') then raise exception 'Menstruations invalides.'; end if; continue;
  elsif k='glucose_unit' then
   if values_json->>k not in ('mg_dl','mmol_l') then raise exception 'Unité invalide.'; end if; continue;
  end if;
  if jsonb_typeof(v)<>'number' then raise exception 'Valeur numérique requise : %',k; end if;
  n:=(values_json->>k)::numeric;lo:=0;hi:=2000;whole:=false;
  case k
   when 'weight_kg' then lo:=20;hi:=400; when 'waist_cm' then lo:=30;hi:=250;
   when 'steps' then hi:=100000;whole:=true; when 'sleep_hours' then hi:=24;
   when 'water_l' then hi:=20; when 'salt_g' then hi:=100;
   when 'resting_hr' then hi:=300;whole:=true; when 'fasting_glucose' then hi:=1000;
   when 'bp_systolic','bp_diastolic' then hi:=350;whole:=true;
   when 'recovery','energy','digestion','stress','hunger','biofeedback1','biofeedback2','biofeedback3' then lo:=1;hi:=10;whole:=true;
   else null;
  end case;
  if n<lo or n>hi or (whole and n<>trunc(n)) then raise exception 'Valeur hors limites : %',k; end if;
 end loop;
 if (values_json->>'bp_systolic' is null) <> (values_json->>'bp_diastolic' is null) then raise exception 'Renseigne les deux pressions.'; end if;
 if values_json->>'fasting_glucose' is not null and values_json->>'glucose_unit' is null then raise exception 'Choisis une unité.'; end if;
 if values_json->>'protein_g' is not null or values_json->>'carbs_g' is not null or values_json->>'fat_g' is not null then
  if values_json->>'protein_g' is null or values_json->>'carbs_g' is null or values_json->>'fat_g' is null then raise exception 'Renseigne les trois macros.'; end if;
  cleaned:=cleaned||jsonb_build_object('calories',round((values_json->>'protein_g')::numeric*4+(values_json->>'carbs_g')::numeric*4+(values_json->>'fat_g')::numeric*9,2));
 elsif coalesce(settings.macro_tracking,false) and values_json ?| array['protein_g','carbs_g','fat_g'] then cleaned:=cleaned||jsonb_build_object('calories',null); end if;
 if not exists(select 1 from jsonb_each(values_json) e where e.key<>'glucose_unit' and e.value<>'null'::jsonb and e.value<>'""'::jsonb) then raise exception 'Renseigne au moins une information.'; end if;
 select * into old from public.daily_tracking_entries where client_id=uid and recorded_on=day;
 if old.client_id is not null then return old; end if;
 insert into public.daily_tracking_entries(client_id,recorded_on,metrics) values(uid,day,cleaned)
 returning * into result;
 return result;
end $$;

create or replace function aa_private.validate_analysis_settings() returns trigger language plpgsql security invoker set search_path='' as $$
declare k text;v jsonb;
begin
 if new.settings ? 'sites' then
 if jsonb_typeof(new.settings->'sites')<>'object' then raise exception 'Sites invalides.';end if;
 for k,v in select * from jsonb_each(new.settings->'sites') loop
 if k!~'^site[1-9]$' or jsonb_typeof(v)<>'object' or jsonb_typeof(v->'enabled') is distinct from 'boolean' or jsonb_typeof(v->'label') is distinct from 'string' or length(trim(v->>'label')) not between 1 and 80 then raise exception 'Site invalide.';end if;
 end loop;end if;
 for k,v in select * from jsonb_each(new.settings) loop
 if k in ('steps_goal','sleep_goal') and v<>'null'::jsonb then
 if jsonb_typeof(v)<>'number' or (v::text)::numeric<0 or (v::text)::numeric>(case when k='steps_goal' then 100000 else 24 end) then raise exception 'Objectif invalide.';end if;end if;
 end loop;
 if new.settings ? 'biofeedback_labels' then
 if jsonb_typeof(new.settings->'biofeedback_labels')<>'object' then raise exception 'Libellés invalides.';end if;
 for k,v in select * from jsonb_each(new.settings->'biofeedback_labels') loop
 if k not in ('biofeedback1','biofeedback2','biofeedback3') or jsonb_typeof(v)<>'string' or length(v#>>'{}')>80 then raise exception 'Libellé invalide.';end if;
 end loop;end if;
 if new.settings ? 'measurement_cadence_days' then
 v:=new.settings->'measurement_cadence_days';if jsonb_typeof(v)<>'number' or (v::text)::numeric not between 1 and 90 or (v::text)::numeric<>trunc((v::text)::numeric) then raise exception 'Intervalle de mensurations invalide.';end if;end if;
 return new;
end $$;
create or replace function aa_private.validate_roadmap() returns trigger language plpgsql security invoker set search_path='' as $$
declare k text;t text;v jsonb;m jsonb;
begin
 for t in select unnest(array['training','rest','standard','high','low']) loop
 m:=new.prescription->t;if m is null then continue;end if;if jsonb_typeof(m)<>'object' then raise exception 'Macros invalides.';end if;
 for k,v in select * from jsonb_each(m) loop
 if k not in ('protein_g','carbs_g','fat_g','fiber_g') or (v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or (v::text)::numeric<0 or (v::text)::numeric>2000)) then raise exception 'Macro invalide.';end if;
 end loop;
 if (m->>'protein_g' is null) is distinct from (m->>'carbs_g' is null) or (m->>'protein_g' is null) is distinct from (m->>'fat_g' is null) then raise exception 'Renseigne les trois macros.';end if;
 end loop;
 for k,v in select * from jsonb_each(new.prescription) loop
 if k in ('steps_goal','sleep_goal') and v<>'null'::jsonb then
 if jsonb_typeof(v)<>'number' or (v::text)::numeric<0 or (v::text)::numeric>(case when k='steps_goal' then 100000 else 24 end) then raise exception 'Objectif invalide.';end if;end if;
 end loop;
 if new.prescription ? 'mode' and new.prescription->>'mode' not in ('standard','highLow') then raise exception 'Mode de diète invalide.';end if;
 if new.prescription ? 'coach_grade' and (jsonb_typeof(new.prescription->'coach_grade')<>'string' or length(new.prescription->>'coach_grade')>80) then raise exception 'Appréciation invalide.';end if;
 return new;
end $$;
commit;
