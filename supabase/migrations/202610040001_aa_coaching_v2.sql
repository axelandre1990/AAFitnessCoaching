-- AA Fitness Coaching V2: client/coach identities, check-ins, feedback, and row-level security.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'client' check (role in ('client', 'coach')),
  created_at timestamptz not null default now()
);

create table if not exists public.coach_clients (
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coach_id, client_id),
  check (coach_id <> client_id)
);

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  status text not null default 'pending' check (status in ('pending', 'reviewed')),
  created_at timestamptz not null default now()
);

create table if not exists public.coach_feedback (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists check_ins_client_created_idx on public.check_ins(client_id, created_at desc);
create index if not exists coach_feedback_check_in_created_idx on public.coach_feedback(check_in_id, created_at);
create index if not exists coach_clients_client_idx on public.coach_clients(client_id);

create or replace function public.create_client_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'client')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_aa_profile on auth.users;
create trigger on_auth_user_created_aa_profile
  after insert on auth.users
  for each row execute procedure public.create_client_profile();

insert into public.profiles (id, full_name, role)
select id, coalesce(raw_user_meta_data ->> 'full_name', ''), 'client'
from auth.users
on conflict (id) do nothing;

create or replace function public.is_aa_coach()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'coach'
  );
$$;

create or replace function public.is_aa_assigned_client(target_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_aa_coach() and exists (
    select 1 from public.coach_clients cc
    where cc.coach_id = (select auth.uid()) and cc.client_id = target_client
  );
$$;

create or replace function public.is_aa_assigned_check_in(target_check_in uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_aa_coach() and exists (
    select 1
    from public.check_ins ci
    join public.coach_clients cc on cc.client_id = ci.client_id
    where ci.id = target_check_in and cc.coach_id = (select auth.uid())
  );
$$;

revoke all on function public.is_aa_coach() from public, anon;
revoke all on function public.is_aa_assigned_client(uuid) from public, anon;
revoke all on function public.is_aa_assigned_check_in(uuid) from public, anon;
grant execute on function public.is_aa_coach() to authenticated;
grant execute on function public.is_aa_assigned_client(uuid) to authenticated;
grant execute on function public.is_aa_assigned_check_in(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.coach_clients enable row level security;
alter table public.check_ins enable row level security;
alter table public.coach_feedback enable row level security;

drop policy if exists aa_profiles_read_self_or_coach_client on public.profiles;
create policy aa_profiles_read_self_or_coach_client on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_aa_assigned_client(id));

drop policy if exists aa_assignments_read_participants on public.coach_clients;
create policy aa_assignments_read_participants on public.coach_clients
  for select to authenticated
  using (coach_id = (select auth.uid()) or client_id = (select auth.uid()));

drop policy if exists aa_check_ins_client_read on public.check_ins;
create policy aa_check_ins_client_read on public.check_ins
  for select to authenticated
  using (client_id = (select auth.uid()));

drop policy if exists aa_check_ins_coach_read on public.check_ins;
create policy aa_check_ins_coach_read on public.check_ins
  for select to authenticated
  using (public.is_aa_assigned_client(client_id));

drop policy if exists aa_check_ins_client_insert on public.check_ins;
create policy aa_check_ins_client_insert on public.check_ins
  for insert to authenticated
  with check (client_id = (select auth.uid()) and status = 'pending');

drop policy if exists aa_check_ins_coach_update_status on public.check_ins;
create policy aa_check_ins_coach_update_status on public.check_ins
  for update to authenticated
  using (public.is_aa_assigned_client(client_id))
  with check (public.is_aa_assigned_client(client_id) and status in ('pending', 'reviewed'));

drop policy if exists aa_feedback_client_read on public.coach_feedback;
create policy aa_feedback_client_read on public.coach_feedback
  for select to authenticated
  using (exists (
    select 1 from public.check_ins ci
    where ci.id = check_in_id and ci.client_id = (select auth.uid())
  ));

drop policy if exists aa_feedback_coach_read on public.coach_feedback;
create policy aa_feedback_coach_read on public.coach_feedback
  for select to authenticated
  using (public.is_aa_assigned_check_in(check_in_id));

drop policy if exists aa_feedback_coach_insert on public.coach_feedback;
create policy aa_feedback_coach_insert on public.coach_feedback
  for insert to authenticated
  with check (coach_id = (select auth.uid()) and public.is_aa_assigned_check_in(check_in_id));

-- Store a coach reply and mark its check-in reviewed in one transaction.
create or replace function public.aa_reply_to_check_in(target_check_in uuid, reply_body text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if char_length(trim(coalesce(reply_body, ''))) not between 1 and 4000 then
    raise exception 'La réponse doit contenir entre 1 et 4000 caractères.';
  end if;

  insert into public.coach_feedback (check_in_id, coach_id, body)
  values (target_check_in, (select auth.uid()), trim(reply_body));

  update public.check_ins
  set status = 'reviewed'
  where id = target_check_in;

  if not found then
    raise exception 'Check-in introuvable ou accès non autorisé.';
  end if;
end;
$$;
revoke all on function public.aa_reply_to_check_in(uuid, text) from public, anon;
grant execute on function public.aa_reply_to_check_in(uuid, text) to authenticated;

revoke all on public.profiles, public.coach_clients, public.check_ins, public.coach_feedback from anon, authenticated;
grant all on public.profiles, public.coach_clients, public.check_ins, public.coach_feedback to service_role;
grant select on public.profiles, public.coach_clients, public.check_ins, public.coach_feedback to authenticated;
grant insert (client_id, body) on public.check_ins to authenticated;
grant update (status) on public.check_ins to authenticated;
grant insert (check_in_id, coach_id, body) on public.coach_feedback to authenticated;

comment on table public.profiles is 'AA Fitness Coaching profile; role can only be changed by project administration.';
comment on table public.coach_clients is 'Explicit assignment list; assignment writes use the invite-client Edge Function.';
