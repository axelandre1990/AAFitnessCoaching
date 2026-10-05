begin;
create function aa_private.import_daily(target_client uuid, day date, values_json jsonb)
returns public.daily_tracking_entries language plpgsql security definer set search_path='' as $$
declare uid uuid:=target_client; settings public.client_tracking_settings; old public.daily_tracking_entries; result public.daily_tracking_entries;
 allowed text[]; k text; v jsonb; n numeric; lo numeric; hi numeric; whole boolean; cleaned jsonb:=values_json;
begin
 if auth.uid() is null or not public.is_aa_assigned_client(target_client) then raise exception 'Import coach non autorisé.'; end if;
 if day is null or day > (now() at time zone 'Europe/Brussels')::date or day < (now() at time zone 'Europe/Brussels')::date-730 then raise exception 'Date invalide.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select * into settings from public.client_tracking_settings where client_id=uid;
 allowed:=array['weight_kg','waist_cm','steps','sleep_hours','recovery','energy','digestion','stress','hunger','water_l','salt_g','resting_hr','fasting_glucose','glucose_unit','bp_systolic','bp_diastolic','menstruation','notes','protein_g','carbs_g','fat_g','fiber_g'];
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
 elsif coalesce(settings.macro_tracking,false) and values_json ?| array['protein_g','carbs_g','fat_g'] then cleaned:=cleaned||jsonb_build_object('calories',null); end if;
 if not exists(select 1 from jsonb_each(values_json) e where e.key<>'glucose_unit' and e.value<>'null'::jsonb and e.value<>'""'::jsonb) then raise exception 'Renseigne au moins une information.'; end if;
 select * into old from public.daily_tracking_entries where client_id=uid and recorded_on=day;
 if old.client_id is not null then return old; end if;
 insert into public.daily_tracking_entries(client_id,recorded_on,metrics) values(uid,day,cleaned)
 returning * into result;
 return result;
end $$;

create function public.aa_import_daily(target_client uuid, day date, values_json jsonb) returns public.daily_tracking_entries language sql security invoker set search_path='' as $$select aa_private.import_daily(target_client,day,values_json);$$;
revoke all on function aa_private.import_daily(uuid,date,jsonb),public.aa_import_daily(uuid,date,jsonb) from public,anon;
grant execute on function aa_private.import_daily(uuid,date,jsonb),public.aa_import_daily(uuid,date,jsonb) to authenticated;
create function aa_private.import_weekly(target_client uuid, submitted_on date, response_answers jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 user_id uuid := target_client; scheduled_day integer; today date := submitted_on;
 monday date; deadline date; response_id uuid; key text; cleaned jsonb := '{}'::jsonb;
 required_keys text[] := array['full_name','attitude_details','wins','challenges','diet','improvements','sleep','performance','wellbeing','support','coaching_feedback','coach_help','next_week','summary'];
 scale_keys text[] := array['attitude','energy','mood','hunger','stress','fatigue'];
 all_keys text[] := array['email','full_name','attitude','attitude_details','wins','challenges','diet','improvements','energy','energy_details','mood','mood_details','hunger','hunger_details','stress','stress_details','fatigue','sleep','performance','recovery','wellbeing','support','coaching_feedback','coach_help','next_week','summary'];
begin
 if auth.uid() is null or not public.is_aa_assigned_client(target_client) then raise exception 'Import coach non autorisé.'; end if;
 if submitted_on is null or submitted_on>(now() at time zone 'Europe/Brussels')::date or submitted_on<(now() at time zone 'Europe/Brussels')::date-730 then raise exception 'Date invalide.';end if;
 select checkin_day into scheduled_day from public.profiles where id=user_id;
 if scheduled_day is null then raise exception 'Ton coach doit choisir ton jour de check-in.'; end if;
 if jsonb_typeof(response_answers) is distinct from 'object' or octet_length(response_answers::text)>120000 then raise exception 'Questionnaire invalide ou trop volumineux.'; end if;
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
 perform pg_advisory_xact_lock(hashtextextended(user_id::text,0));
 select id into response_id from public.check_ins where client_id=user_id and kind='weekly' and week_start=monday;
 if response_id is not null then return response_id;end if;
 insert into public.check_ins(client_id,body,kind,questionnaire_version,answers,week_start,due_date,submitted_late,created_at)
 values(user_id,'Check-in importé — semaine du '||monday::text,'weekly',1,cleaned,monday,deadline,today>deadline,(submitted_on::text||'T12:00:00Z')::timestamptz)
 returning id into response_id;
 return response_id;
exception when unique_violation then raise exception 'Ton check-in de cette semaine a déjà été envoyé.';
end;
$$;

create function public.aa_import_weekly(target_client uuid,submitted_on date,response_answers jsonb) returns uuid language sql security invoker set search_path='' as $$select aa_private.import_weekly(target_client,submitted_on,response_answers);$$;
revoke all on function aa_private.import_weekly(uuid,date,jsonb),public.aa_import_weekly(uuid,date,jsonb) from public,anon;
grant execute on function aa_private.import_weekly(uuid,date,jsonb),public.aa_import_weekly(uuid,date,jsonb) to authenticated;
commit;
