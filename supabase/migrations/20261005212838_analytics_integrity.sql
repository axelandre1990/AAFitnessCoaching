begin;
create or replace function aa_private.validate_measurement_row() returns trigger language plpgsql security invoker set search_path='' as $$
declare k text;v jsonb;conf jsonb;
begin
 if new.recorded_on>(now() at time zone 'Europe/Brussels')::date or new.recorded_on<(now() at time zone 'Europe/Brussels')::date-730 then raise exception 'Date de mesure invalide.';end if;
 select settings into conf from public.coaching_analysis_settings where client_id=new.client_id;
 for k,v in select * from jsonb_each(new.measurements) loop
 if k!~'^site[1-9]$' or jsonb_typeof(v)<>'number' or (v::text)::numeric<1 or (v::text)::numeric>300 then raise exception 'Mensuration invalide.';end if;
 if not coalesce((conf->'sites'->k->>'enabled')::boolean,false) then
 if tg_op='UPDATE' then if new.client_id=old.client_id and new.recorded_on=old.recorded_on and old.measurements->k=v then continue;end if;end if;
 raise exception 'Site de mensuration désactivé.';
 end if;
 end loop;
 if tg_op='UPDATE' then
 for k,v in select * from jsonb_each(old.measurements) loop
 if not coalesce((conf->'sites'->k->>'enabled')::boolean,false) and (new.measurements->k is distinct from v) then raise exception 'Conserve les anciennes mensurations désactivées.';end if;
 end loop;end if;
 if new.measurements='{}'::jsonb then raise exception 'Renseigne au moins une mensuration.';end if;
 return new;
end $$;
create function aa_private.validate_analysis_settings() returns trigger language plpgsql security invoker set search_path='' as $$
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
 end loop;return new;
end $$;
create function aa_private.validate_roadmap() returns trigger language plpgsql security invoker set search_path='' as $$
declare k text;t text;v jsonb;m jsonb;
begin
 for t in select unnest(array['training','rest']) loop
 m:=new.prescription->t;if m is null then continue;end if;if jsonb_typeof(m)<>'object' then raise exception 'Macros invalides.';end if;
 for k,v in select * from jsonb_each(m) loop
 if k not in ('protein_g','carbs_g','fat_g','fiber_g') or (v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or (v::text)::numeric<0 or (v::text)::numeric>2000)) then raise exception 'Macro invalide.';end if;
 end loop;
 if (m->>'protein_g' is null) is distinct from (m->>'carbs_g' is null) or (m->>'protein_g' is null) is distinct from (m->>'fat_g' is null) then raise exception 'Renseigne les trois macros.';end if;
 end loop;
 for k,v in select * from jsonb_each(new.prescription) loop
 if k in ('steps_goal','sleep_goal') and v<>'null'::jsonb then
 if jsonb_typeof(v)<>'number' or (v::text)::numeric<0 or (v::text)::numeric>(case when k='steps_goal' then 100000 else 24 end) then raise exception 'Objectif invalide.';end if;end if;
 end loop;return new;
end $$;
revoke all on function aa_private.validate_analysis_settings(),aa_private.validate_roadmap() from public,anon;
grant execute on function aa_private.validate_analysis_settings(),aa_private.validate_roadmap() to authenticated;
create trigger aa_validate_analysis_settings before insert or update on public.coaching_analysis_settings for each row execute function aa_private.validate_analysis_settings();
create trigger aa_validate_roadmap before insert or update on public.coaching_roadmap for each row execute function aa_private.validate_roadmap();
commit;
