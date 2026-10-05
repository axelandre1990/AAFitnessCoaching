begin;
create schema if not exists aa_private;
revoke all on schema aa_private from public,anon;
grant usage on schema aa_private to authenticated;
create table public.client_tracking_settings(
 client_id uuid primary key references public.profiles(id) on delete cascade,
 enabled_metrics text[] not null default array['weight_kg','waist_cm','notes'],
 macro_tracking boolean not null default false, photos_enabled boolean not null default true,
 revision integer not null default 1, updated_at timestamptz not null default now(),
 check(enabled_metrics <@ array['weight_kg','waist_cm','steps','sleep_hours','recovery','energy','digestion','stress','hunger','water_l','salt_g','resting_hr','fasting_glucose','blood_pressure','menstruation','notes']::text[])
);
create table public.daily_tracking_entries(
 client_id uuid not null references public.profiles(id) on delete cascade, recorded_on date not null,
 metrics jsonb not null, revision integer not null default 1, updated_at timestamptz not null default now(), primary key(client_id,recorded_on)
);
create table public.progress_photo_sets(
 id uuid primary key, client_id uuid not null references public.profiles(id) on delete cascade,
 photographed_on date not null, paths text[] not null, notes text not null default '' check(length(notes)<=1000), created_at timestamptz not null default now()
);
create index aa_photo_client_date on public.progress_photo_sets(client_id,photographed_on desc);
alter table public.client_tracking_settings enable row level security;
alter table public.daily_tracking_entries enable row level security;
alter table public.progress_photo_sets enable row level security;
create policy tracking_settings_read on public.client_tracking_settings for select to authenticated using(client_id=(select auth.uid()) or public.is_aa_assigned_client(client_id));
create policy daily_read on public.daily_tracking_entries for select to authenticated using(client_id=(select auth.uid()) or public.is_aa_assigned_client(client_id));
create policy photos_read on public.progress_photo_sets for select to authenticated using(client_id=(select auth.uid()) or public.is_aa_assigned_client(client_id));
revoke all on public.client_tracking_settings,public.daily_tracking_entries,public.progress_photo_sets from anon,authenticated;
grant select on public.client_tracking_settings,public.daily_tracking_entries,public.progress_photo_sets to authenticated;
create function aa_private.save_tracking_settings(target_client uuid, options text[], macros boolean, photos boolean, expected_revision integer)
returns public.client_tracking_settings language plpgsql security definer set search_path='' as $$
declare old public.client_tracking_settings; result public.client_tracking_settings;
begin
 if not public.is_aa_assigned_client(target_client) then raise exception 'Accès coach non autorisé.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_client::text,0));
 select * into old from public.client_tracking_settings where client_id=target_client;
 if coalesce(old.revision,0) is distinct from expected_revision then raise exception 'Options modifiées dans un autre onglet. Recharge la page.'; end if;
 if options is null or macros is null or photos is null then raise exception 'Options invalides.'; end if;
 insert into public.client_tracking_settings(client_id,enabled_metrics,macro_tracking,photos_enabled) values(target_client,options,macros,photos)
 on conflict(client_id) do update set enabled_metrics=excluded.enabled_metrics,macro_tracking=excluded.macro_tracking,photos_enabled=excluded.photos_enabled,revision=client_tracking_settings.revision+1,updated_at=now() returning * into result;
 return result;
end $$;
create function public.aa_save_tracking_settings(target_client uuid, options text[], macros boolean, photos boolean, expected_revision integer)
returns public.client_tracking_settings language sql security invoker set search_path='' as $$ select aa_private.save_tracking_settings(target_client,options,macros,photos,expected_revision); $$;
create function aa_private.save_daily(day date, values_json jsonb, expected_revision integer, settings_revision integer)
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
   when 'recovery','energy','digestion','stress','hunger' then lo:=1;hi:=10;whole:=true;
   else null;
  end case;
  if n<lo or n>hi or (whole and n<>trunc(n)) then raise exception 'Valeur hors limites : %',k; end if;
 end loop;
 if (values_json->>'bp_systolic' is null) <> (values_json->>'bp_diastolic' is null) then raise exception 'Renseigne les deux pressions.'; end if;
 if values_json->>'fasting_glucose' is not null and values_json->>'glucose_unit' is null then raise exception 'Choisis une unité.'; end if;
 if values_json->>'protein_g' is not null or values_json->>'carbs_g' is not null or values_json->>'fat_g' is not null then
  if values_json->>'protein_g' is null or values_json->>'carbs_g' is null or values_json->>'fat_g' is null then raise exception 'Renseigne les trois macros.'; end if;
  cleaned:=cleaned||jsonb_build_object('calories',round((values_json->>'protein_g')::numeric*4+(values_json->>'carbs_g')::numeric*4+(values_json->>'fat_g')::numeric*9,2));
 elsif coalesce(settings.macro_tracking,false) then cleaned:=cleaned||jsonb_build_object('calories',null); end if;
 if not exists(select 1 from jsonb_each(values_json) e where e.key<>'glucose_unit' and e.value<>'null'::jsonb and e.value<>'""'::jsonb) then raise exception 'Renseigne au moins une information.'; end if;
 select * into old from public.daily_tracking_entries where client_id=uid and recorded_on=day;
 if coalesce(old.revision,0) is distinct from expected_revision then raise exception 'Suivi modifié dans un autre onglet. Recharge cette date.'; end if;
 insert into public.daily_tracking_entries(client_id,recorded_on,metrics) values(uid,day,cleaned)
 on conflict(client_id,recorded_on) do update set metrics=daily_tracking_entries.metrics||cleaned,revision=daily_tracking_entries.revision+1,updated_at=now() returning * into result;
 return result;
end $$;
create function public.aa_save_daily(day date, values_json jsonb, expected_revision integer, settings_revision integer)
returns public.daily_tracking_entries language sql security invoker set search_path='' as $$ select aa_private.save_daily(day,values_json,expected_revision,settings_revision); $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('aa-progress-photos','aa-progress-photos',false,3145728,array['image/jpeg']);
create policy aa_photo_upload on storage.objects for insert to authenticated with check(
 bucket_id='aa-progress-photos' and (storage.foldername(name))[1]=(select auth.uid())::text
 and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(front|side|back|extra_[1-3])\.jpg$'
 and exists(select 1 from public.profiles where id=(select auth.uid()) and role='client')
 and coalesce((select photos_enabled from public.client_tracking_settings where client_id=(select auth.uid())),true)
);
create policy aa_photo_view on storage.objects for select to authenticated using(bucket_id='aa-progress-photos' and (
 ((storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.profiles where id=(select auth.uid()) and role='client'))
 or exists(select 1 from public.progress_photo_sets p where name=any(p.paths) and public.is_aa_assigned_client(p.client_id))
));
create policy aa_photo_cleanup on storage.objects for delete to authenticated using(bucket_id='aa-progress-photos' and (storage.foldername(name))[1]=(select auth.uid())::text and not exists(select 1 from public.progress_photo_sets p where name=any(p.paths)));
create function aa_private.commit_photos(set_id uuid, day date, extra_count integer, photo_notes text)
returns public.progress_photo_sets language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); p text[]; result public.progress_photo_sets; i integer;
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='client') then raise exception 'Accès client requis.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select * into result from public.progress_photo_sets where id=set_id;
 if found then if result.client_id<>uid then raise exception 'Identifiant indisponible.'; end if;return result;end if;
 if not coalesce((select photos_enabled from public.client_tracking_settings where client_id=uid),true) then raise exception 'Suivi photo désactivé.'; end if;
 if set_id is null or day is null or day>(now() at time zone 'Europe/Brussels')::date or day<(now() at time zone 'Europe/Brussels')::date-730 or extra_count is null or extra_count not between 0 and 3 then raise exception 'Photos invalides.'; end if;
 p:=array[uid||'/'||set_id||'/front.jpg',uid||'/'||set_id||'/side.jpg',uid||'/'||set_id||'/back.jpg'];
 for i in 1..extra_count loop p:=p|| (uid||'/'||set_id||'/extra_'||i||'.jpg');end loop;
 if (select count(*) from storage.objects where bucket_id='aa-progress-photos' and name=any(p) and metadata->>'mimetype'='image/jpeg')<>cardinality(p) then raise exception 'Les trois poses face, profil et dos sont obligatoires.';end if;
 insert into public.progress_photo_sets(id,client_id,photographed_on,paths,notes) values(set_id,uid,day,p,coalesce(photo_notes,'')) returning * into result;return result;
end $$;
create function public.aa_commit_photos(set_id uuid, day date, extra_count integer, photo_notes text)
returns public.progress_photo_sets language sql security invoker set search_path='' as $$select aa_private.commit_photos(set_id,day,extra_count,photo_notes);$$;
revoke all on function aa_private.save_tracking_settings(uuid,text[],boolean,boolean,integer),aa_private.save_daily(date,jsonb,integer,integer),aa_private.commit_photos(uuid,date,integer,text) from public,anon;
grant execute on function aa_private.save_tracking_settings(uuid,text[],boolean,boolean,integer),aa_private.save_daily(date,jsonb,integer,integer),aa_private.commit_photos(uuid,date,integer,text) to authenticated;
revoke all on function public.aa_save_tracking_settings(uuid,text[],boolean,boolean,integer),public.aa_save_daily(date,jsonb,integer,integer),public.aa_commit_photos(uuid,date,integer,text) from public,anon;
grant execute on function public.aa_save_tracking_settings(uuid,text[],boolean,boolean,integer),public.aa_save_daily(date,jsonb,integer,integer),public.aa_commit_photos(uuid,date,integer,text) to authenticated;
commit;
