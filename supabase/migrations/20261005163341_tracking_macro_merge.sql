begin;
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
 if coalesce(old.revision,0) is distinct from expected_revision then raise exception 'Suivi modifié dans un autre onglet. Recharge cette date.'; end if;
 insert into public.daily_tracking_entries(client_id,recorded_on,metrics) values(uid,day,cleaned)
 on conflict(client_id,recorded_on) do update set metrics=daily_tracking_entries.metrics||cleaned,revision=daily_tracking_entries.revision+1,updated_at=now() returning * into result;
 return result;
end $$;
commit;
