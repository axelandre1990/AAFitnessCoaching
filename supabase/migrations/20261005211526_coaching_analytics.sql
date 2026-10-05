begin;
create table public.coaching_analysis_settings(
 client_id uuid primary key references public.profiles(id) on delete cascade,
 settings jsonb not null check(jsonb_typeof(settings)='object' and octet_length(settings::text)<=16000),
 revision integer not null default 1, updated_at timestamptz not null default now()
);
create table public.coaching_roadmap(
 client_id uuid not null references public.profiles(id) on delete cascade, week_start date not null,
 prescription jsonb not null check(jsonb_typeof(prescription)='object' and octet_length(prescription::text)<=16000),
 revision integer not null default 1, updated_at timestamptz not null default now(),primary key(client_id,week_start),
 check(extract(isodow from week_start)=1)
);
create table public.client_measurements(
 client_id uuid not null references public.profiles(id) on delete cascade, recorded_on date not null,
 measurements jsonb not null check(jsonb_typeof(measurements)='object' and octet_length(measurements::text)<=3000),
 revision integer not null default 1, updated_at timestamptz not null default now(),primary key(client_id,recorded_on)
);
create table public.client_day_types(
 client_id uuid not null references public.profiles(id) on delete cascade,recorded_on date not null,
 day_type text not null check(day_type in ('training','rest')),primary key(client_id,recorded_on)
);
create table public.client_plan_versions(
 id uuid primary key default gen_random_uuid(),client_id uuid not null references public.profiles(id) on delete cascade,
 nutrition_plan text not null,training_plan text not null,saved_at timestamptz not null default now()
);
create index aa_plan_version_client_date on public.client_plan_versions(client_id,saved_at desc);
alter table public.coaching_analysis_settings enable row level security;
alter table public.coaching_roadmap enable row level security;
alter table public.client_measurements enable row level security;
alter table public.client_day_types enable row level security;
alter table public.client_plan_versions enable row level security;
create policy analysis_read on public.coaching_analysis_settings for select to authenticated using(client_id=(select auth.uid()) or public.is_aa_assigned_client(client_id));
create policy analysis_insert on public.coaching_analysis_settings for insert to authenticated with check(public.is_aa_assigned_client(client_id));
create policy analysis_update on public.coaching_analysis_settings for update to authenticated using(public.is_aa_assigned_client(client_id)) with check(public.is_aa_assigned_client(client_id));
create policy roadmap_read on public.coaching_roadmap for select to authenticated using(client_id=(select auth.uid()) or public.is_aa_assigned_client(client_id));
create policy roadmap_insert on public.coaching_roadmap for insert to authenticated with check(public.is_aa_assigned_client(client_id));
create policy roadmap_update on public.coaching_roadmap for update to authenticated using(public.is_aa_assigned_client(client_id)) with check(public.is_aa_assigned_client(client_id));
create policy measurements_read on public.client_measurements for select to authenticated using(client_id=(select auth.uid()) or public.is_aa_assigned_client(client_id));
create policy measurements_insert on public.client_measurements for insert to authenticated with check(client_id=(select auth.uid()) and exists(select 1 from public.profiles where id=auth.uid() and role='client'));
create policy measurements_update on public.client_measurements for update to authenticated using(client_id=(select auth.uid())) with check(client_id=(select auth.uid()));
create policy daytypes_read on public.client_day_types for select to authenticated using(client_id=(select auth.uid()) or public.is_aa_assigned_client(client_id));
create policy daytypes_insert on public.client_day_types for insert to authenticated with check(client_id=(select auth.uid()) and exists(select 1 from public.profiles where id=auth.uid() and role='client'));
create policy daytypes_update on public.client_day_types for update to authenticated using(client_id=(select auth.uid())) with check(client_id=(select auth.uid()));
create policy versions_read on public.client_plan_versions for select to authenticated using(client_id=(select auth.uid()) or public.is_aa_assigned_client(client_id));
create policy versions_insert on public.client_plan_versions for insert to authenticated with check(public.is_aa_assigned_client(client_id));
revoke all on public.coaching_analysis_settings,public.coaching_roadmap,public.client_measurements,public.client_day_types,public.client_plan_versions from anon,authenticated;
grant select,insert,update on public.coaching_analysis_settings,public.coaching_roadmap,public.client_measurements,public.client_day_types to authenticated;
grant select,insert on public.client_plan_versions to authenticated;
-- Invoker trigger: writes are subject to the same assigned-coach policies as the plan.
create function aa_private.snapshot_client_plan() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' or new.nutrition_plan is distinct from old.nutrition_plan or new.training_plan is distinct from old.training_plan then
 insert into public.client_plan_versions(client_id,nutrition_plan,training_plan) values(new.client_id,coalesce(new.nutrition_plan,''),coalesce(new.training_plan,''));
 end if;return new;
end $$;
revoke all on function aa_private.snapshot_client_plan() from public,anon;
grant execute on function aa_private.snapshot_client_plan() to authenticated;
create trigger aa_snapshot_plan after insert or update on public.client_plans for each row execute function aa_private.snapshot_client_plan();
-- Baseline only from the current app plan, never from the private Excel files.
insert into public.client_plan_versions(client_id,nutrition_plan,training_plan,saved_at) select client_id,coalesce(nutrition_plan,''),coalesce(training_plan,''),updated_at from public.client_plans;
create function aa_private.validate_measurement_row() returns trigger language plpgsql security invoker set search_path='' as $$
declare k text;v jsonb;conf jsonb;
begin
 if new.recorded_on>(now() at time zone 'Europe/Brussels')::date or new.recorded_on<(now() at time zone 'Europe/Brussels')::date-730 then raise exception 'Date de mesure invalide.';end if;
 select settings into conf from public.coaching_analysis_settings where client_id=new.client_id;
 for k,v in select * from jsonb_each(new.measurements) loop
 if k!~'^site[1-9]$' or jsonb_typeof(v)<>'number' or (v::text)::numeric<1 or (v::text)::numeric>300 then raise exception 'Mensuration invalide.';end if;
 if not coalesce((conf->'sites'->k->>'enabled')::boolean,false) then raise exception 'Site de mensuration désactivé.';end if;
 end loop;
 if new.measurements='{}'::jsonb then raise exception 'Renseigne au moins une mensuration.';end if;
 return new;
end $$;
revoke all on function aa_private.validate_measurement_row() from public,anon;
grant execute on function aa_private.validate_measurement_row() to authenticated;
create trigger aa_validate_measurements before insert or update on public.client_measurements for each row execute function aa_private.validate_measurement_row();
create function aa_private.validate_day_type() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.recorded_on>(now() at time zone 'Europe/Brussels')::date or new.recorded_on<(now() at time zone 'Europe/Brussels')::date-730 then raise exception 'Date invalide.';end if;return new;
end $$;
revoke all on function aa_private.validate_day_type() from public,anon;
grant execute on function aa_private.validate_day_type() to authenticated;
create trigger aa_validate_day_type before insert or update on public.client_day_types for each row execute function aa_private.validate_day_type();
commit;
-- Larger structured plans can contain the coach's five day variants.
alter table public.client_plans drop constraint client_plans_nutrition_plan_check;
alter table public.client_plans add constraint client_plans_nutrition_plan_check check(char_length(nutrition_plan)<=300000);
