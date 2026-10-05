-- Run as postgres in Supabase SQL Editor. All fixtures are synthetic and rolled back.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-a000-000000000001','aa-v5-coach@example.invalid'),
 ('00000000-0000-4000-a000-000000000002','aa-v5-client-a@example.invalid'),
 ('00000000-0000-4000-a000-000000000003','aa-v5-client-b@example.invalid');
update public.profiles set role='coach' where id='00000000-0000-4000-a000-000000000001';
insert into public.coach_clients(coach_id,client_id) values('00000000-0000-4000-a000-000000000001','00000000-0000-4000-a000-000000000002');
insert into public.client_plans(client_id,coach_id,training_plan) values('00000000-0000-4000-a000-000000000002','00000000-0000-4000-a000-000000000001','{"schema":"aa-training-plan","version":1,"days":[{"id":"test-day","name":"Séance de test","exercises":[{"id":"test-row","exerciseId":"test-exercise","name":"Exercice de test","sets":3}]}]}');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000001',true);
select public.aa_set_checkin_day('00000000-0000-4000-a000-000000000002',3);
do $$declare rejected boolean:=false;begin
 begin perform public.aa_set_checkin_day('00000000-0000-4000-a000-000000000003',2);
 exception when others then if sqlerrm='Accès coach non autorisé.' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'FAIL unassigned coach can change day';end if;
end;$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000002',true);
do $$declare answers jsonb;key text;rejected boolean;first_id uuid;second_id uuid;begin
 rejected:=false;begin perform public.aa_set_checkin_day('00000000-0000-4000-a000-000000000002',4);
 exception when others then if sqlerrm='Accès coach non autorisé.' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'FAIL client can change own schedule';end if;
 rejected:=false;begin perform public.aa_submit_weekly_check_in('{}',1);
 exception when others then if sqlerrm like 'Réponse obligatoire manquante%' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'FAIL incomplete questionnaire accepted';end if;
 answers:='{}';foreach key in array array['full_name','attitude_details','wins','challenges','diet','improvements','sleep','performance','wellbeing','support','coaching_feedback','coach_help','next_week','summary'] loop answers:=answers||jsonb_build_object(key,'Réponse synthétique');end loop;
 foreach key in array array['attitude','energy','mood','hunger','stress','fatigue'] loop answers:=answers||jsonb_build_object(key,5);end loop;
 perform public.aa_submit_weekly_check_in(answers,1);
 rejected:=false;begin perform public.aa_submit_weekly_check_in(answers,1);
 exception when others then if sqlerrm='Ton check-in de cette semaine a déjà été envoyé.' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'FAIL duplicate weekly accepted';end if;
 first_id:=public.aa_submit_training_session('test-day','[{"item_id":"test-row","set_index":1,"reps":9,"load_kg":42.5}]','Test synthétique','00000000-0000-4000-b000-000000000001');
 second_id:=public.aa_submit_training_session('test-day','[{"item_id":"test-row","set_index":1,"reps":9,"load_kg":42.5}]','Test synthétique','00000000-0000-4000-b000-000000000001');
 if first_id<>second_id then raise exception 'FAIL duplicate request is not idempotent';end if;
 if (select count(*) from public.training_sessions where client_id='00000000-0000-4000-a000-000000000002')<>1 then raise exception 'FAIL own sessions not readable';end if;
 if (select load_kg from public.training_sets where session_id=first_id)<>42.5 then raise exception 'FAIL actual load not saved';end if;
 rejected:=false;begin perform public.aa_submit_training_session('test-day','[{"item_id":"test-row","set_index":2,"reps":9,"load_kg":-1}]','','00000000-0000-4000-b000-000000000002');
 exception when others then if sqlerrm='La charge doit être comprise entre 0 et 1000 kg.' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'FAIL negative load accepted';end if;
end;$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000003',true);
do $$begin
 if exists(select 1 from public.training_sessions where client_id='00000000-0000-4000-a000-000000000002') then raise exception 'FAIL another client can see sessions';end if;
 if exists(select 1 from public.training_sets) then raise exception 'FAIL another client can see sets';end if;
 if exists(select 1 from public.check_ins where client_id='00000000-0000-4000-a000-000000000002') then raise exception 'FAIL another client can see check-ins';end if;
end;$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000001',true);
do $$begin
 if (select count(*) from public.training_sessions where client_id='00000000-0000-4000-a000-000000000002')<>1 then raise exception 'FAIL assigned coach cannot see sessions';end if;
 if not exists(select 1 from public.check_ins where client_id='00000000-0000-4000-a000-000000000002' and kind='weekly') then raise exception 'FAIL assigned coach cannot see weekly';end if;
end;$$;
reset role;
rollback;
select 'V5 SQL security and persistence checks passed; all synthetic fixtures rolled back' as result;
