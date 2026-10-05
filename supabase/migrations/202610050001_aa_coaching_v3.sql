-- AA Fitness Coaching V3: coach-managed plans and client progress entries.
create table if not exists public.client_plans (
  client_id uuid primary key references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  nutrition_plan text not null default '' check (char_length(nutrition_plan) <= 6000),
  training_plan text not null default '' check (char_length(training_plan) <= 6000),
  updated_at timestamptz not null default now()
);

create table if not exists public.progress_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  weight_kg numeric(5,2) check (weight_kg between 20 and 400),
  waist_cm numeric(5,2) check (waist_cm between 30 and 250),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  check (weight_kg is not null or waist_cm is not null)
);

create index if not exists progress_entries_client_created_idx
  on public.progress_entries(client_id, created_at desc);

alter table public.client_plans enable row level security;
alter table public.progress_entries enable row level security;

drop policy if exists aa_client_plans_read on public.client_plans;
create policy aa_client_plans_read on public.client_plans
  for select to authenticated
  using (client_id = (select auth.uid()) or public.is_aa_assigned_client(client_id));

drop policy if exists aa_client_plans_coach_insert on public.client_plans;
create policy aa_client_plans_coach_insert on public.client_plans
  for insert to authenticated
  with check (coach_id = (select auth.uid()) and public.is_aa_assigned_client(client_id));

drop policy if exists aa_client_plans_coach_update on public.client_plans;
create policy aa_client_plans_coach_update on public.client_plans
  for update to authenticated
  using (coach_id = (select auth.uid()) and public.is_aa_assigned_client(client_id))
  with check (coach_id = (select auth.uid()) and public.is_aa_assigned_client(client_id));

drop policy if exists aa_progress_entries_read on public.progress_entries;
create policy aa_progress_entries_read on public.progress_entries
  for select to authenticated
  using (client_id = (select auth.uid()) or public.is_aa_assigned_client(client_id));

drop policy if exists aa_progress_entries_client_insert on public.progress_entries;
create policy aa_progress_entries_client_insert on public.progress_entries
  for insert to authenticated
  with check (client_id = (select auth.uid()));

revoke all on public.client_plans, public.progress_entries from anon, authenticated;
grant all on public.client_plans, public.progress_entries to service_role;
grant select on public.client_plans, public.progress_entries to authenticated;
grant insert (client_id, coach_id, nutrition_plan, training_plan) on public.client_plans to authenticated;
grant update (coach_id, nutrition_plan, training_plan, updated_at) on public.client_plans to authenticated;
grant insert (client_id, weight_kg, waist_cm, notes) on public.progress_entries to authenticated;

comment on table public.client_plans is 'Nutrition and training guidance written by the assigned coach and visible to that client.';
comment on table public.progress_entries is 'Client-submitted measurements, visible only to that client and the assigned coach.';
