begin;
insert into auth.users(id,email) values
('00000000-0000-4000-a000-000000000071','aa-v7-coach@example.invalid'),
('00000000-0000-4000-a000-000000000072','aa-v7-client-a@example.invalid'),
('00000000-0000-4000-a000-000000000073','aa-v7-client-b@example.invalid');
update public.profiles set role='coach' where id='00000000-0000-4000-a000-000000000071';
insert into public.coach_clients(coach_id,client_id) values('00000000-0000-4000-a000-000000000071','00000000-0000-4000-a000-000000000072');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000071',true);
insert into public.coaching_analysis_settings(client_id,settings) values('00000000-0000-4000-a000-000000000072','{"sites":{"site1":{"enabled":true,"label":"Chest"}}}');
insert into public.coaching_roadmap(client_id,week_start,prescription) values('00000000-0000-4000-a000-000000000072',date_trunc('week',current_date)::date,'{"training":{"protein_g":150,"carbs_g":200,"fat_g":60}}');
insert into public.client_plans(client_id,coach_id,nutrition_plan,training_plan) values('00000000-0000-4000-a000-000000000072','00000000-0000-4000-a000-000000000071','{"schema":"aa-nutrition-plan","meals":[]}','');
update public.client_plans set nutrition_plan='{"schema":"aa-nutrition-plan","meals":[],"targets":{"protein_g":180}}' where client_id='00000000-0000-4000-a000-000000000072';
do $$begin if(select count(*) from public.client_plan_versions where client_id='00000000-0000-4000-a000-000000000072')<>2 then raise exception 'FAIL snapshot';end if;end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000072',true);
insert into public.client_measurements(client_id,recorded_on,measurements) values('00000000-0000-4000-a000-000000000072',current_date,'{"site1":100}');
insert into public.client_day_types values('00000000-0000-4000-a000-000000000072',current_date,'training');
do $$declare failed boolean;begin
 failed:=false;begin insert into public.coaching_roadmap(client_id,week_start,prescription) values('00000000-0000-4000-a000-000000000072',date_trunc('week',current_date)::date+7,'{}');exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'FAIL client coach write';end if;
 failed:=false;begin update public.client_measurements set measurements='{"site2":90}' where client_id=auth.uid();exception when others then if sqlerrm='Site de mensuration désactivé.' then failed:=true;else raise;end if;end;if not failed then raise exception 'FAIL disabled site';end if;
 failed:=false;begin update public.client_measurements set measurements='{"site1":301}' where client_id=auth.uid();exception when others then if sqlerrm='Mensuration invalide.' then failed:=true;else raise;end if;end;if not failed then raise exception 'FAIL bounds';end if;
 failed:=false;begin insert into public.client_day_types values(auth.uid(),current_date+1,'rest');exception when others then if sqlerrm='Date invalide.' then failed:=true;else raise;end if;end;if not failed then raise exception 'FAIL future day';end if;
 if(select count(*) from public.client_plan_versions where client_id=auth.uid())<>2 then raise exception 'FAIL client cannot read versions';end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000073',true);
do $$begin
 if exists(select 1 from public.coaching_analysis_settings) or exists(select 1 from public.coaching_roadmap) or exists(select 1 from public.client_measurements) or exists(select 1 from public.client_day_types) or exists(select 1 from public.client_plan_versions) then raise exception 'FAIL unrelated client reads';end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000071',true);
do $$begin
 if (select count(*) from public.client_measurements)<>1 or (select count(*) from public.client_day_types)<>1 then raise exception 'FAIL coach read';end if;
end $$;

-- Controlled imports validate values, preserve existing dates and require assignment.
select public.aa_import_daily('00000000-0000-4000-a000-000000000072',current_date-1,'{"weight_kg":70,"steps":5000,"protein_g":100,"carbs_g":200,"fat_g":50}');
select public.aa_import_daily('00000000-0000-4000-a000-000000000072',current_date-1,'{"weight_kg":90}');
do $$declare answers jsonb; first_id uuid; again_id uuid; failed boolean:=false;begin
 if(select metrics->>'weight_kg' from public.daily_tracking_entries where client_id='00000000-0000-4000-a000-000000000072' and recorded_on=current_date-1)<>'70' then raise exception 'FAIL import overwrite';end if;
 if(select (metrics->>'calories')::numeric from public.daily_tracking_entries where client_id='00000000-0000-4000-a000-000000000072' and recorded_on=current_date-1)<>1650 then raise exception 'FAIL import kcal';end if;
 begin perform public.aa_import_daily('00000000-0000-4000-a000-000000000073',current_date-1,'{"weight_kg":70}');exception when others then if sqlerrm='Import coach non autorisé.' then failed:=true;else raise;end if;end;if not failed then raise exception 'FAIL import unrelated';end if;
 select jsonb_object_agg(k,'Synthetic answer'::text) into answers from unnest(array['full_name','attitude_details','wins','challenges','diet','improvements','sleep','performance','wellbeing','support','coaching_feedback','coach_help','next_week','summary']) k;
 answers:=answers||'{"attitude":5,"energy":5,"mood":5,"hunger":5,"stress":5,"fatigue":5}'::jsonb;
 perform public.aa_set_checkin_day('00000000-0000-4000-a000-000000000072',2);
 first_id:=public.aa_import_weekly('00000000-0000-4000-a000-000000000072',current_date-7,answers);
 again_id:=public.aa_import_weekly('00000000-0000-4000-a000-000000000072',current_date-7,answers);
 if first_id<>again_id then raise exception 'FAIL duplicate weekly';end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000072',true);
do $$declare failed boolean:=false;begin
 begin perform public.aa_import_daily(auth.uid(),current_date-2,'{"weight_kg":70}');exception when others then if sqlerrm='Import coach non autorisé.' then failed:=true;else raise;end if;end;if not failed then raise exception 'FAIL client import';end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000071',true);
update public.coaching_analysis_settings set settings='{"sites":{"site1":{"label":"Chest","enabled":false},"site2":{"label":"Arm","enabled":true}}}' where client_id='00000000-0000-4000-a000-000000000072';
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000072',true);
update public.client_measurements set measurements='{"site1":100,"site2":40}' where client_id=auth.uid();
do $$declare failed boolean:=false;begin
 begin update public.client_measurements set measurements='{"site2":41}' where client_id=auth.uid();exception when others then if sqlerrm='Conserve les anciennes mensurations désactivées.' then failed:=true;else raise;end if;end;if not failed then raise exception 'FAIL disabled history lost';end if;
end $$;
reset role;
set local role anon;
do $$declare t text;begin foreach t in array array['coaching_analysis_settings','coaching_roadmap','client_measurements','client_day_types','client_plan_versions'] loop if has_table_privilege('anon','public.'||t,'select') or has_table_privilege('anon','public.'||t,'insert') then raise exception 'FAIL anon grant';end if;end loop;end $$;
reset role;
rollback;
select 'V7 private analysis, dated roadmap, measurement bounds, day types, plan snapshots and assigned coach RLS passed; fixtures rolled back' as result;
