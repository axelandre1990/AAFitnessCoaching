begin;
-- Invoker uses the existing column grants and assigned-coach RLS; conflict never updates client_id.
create function public.aa_save_client_plan(target_client uuid,nutrition text,training text)
returns setof public.client_plans language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.is_aa_assigned_client(target_client) then raise exception 'Accès coach non autorisé.';end if;
 return query insert into public.client_plans(client_id,coach_id,nutrition_plan,training_plan)
 values(target_client,auth.uid(),trim(coalesce(nutrition,'')),trim(coalesce(training,'')))
 on conflict(client_id) do update set nutrition_plan=excluded.nutrition_plan,training_plan=excluded.training_plan,updated_at=now()
 returning client_plans.*;
end $$;
revoke all on function public.aa_save_client_plan(uuid,text,text) from public,anon;
grant execute on function public.aa_save_client_plan(uuid,text,text) to authenticated;
commit;
