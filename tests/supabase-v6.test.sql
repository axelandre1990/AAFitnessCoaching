-- Synthetic test accounts only. Transaction always rolls back.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-a000-000000000061','aa-v6-coach@example.invalid'),
 ('00000000-0000-4000-a000-000000000062','aa-v6-client-a@example.invalid'),
 ('00000000-0000-4000-a000-000000000063','aa-v6-client-b@example.invalid');
update public.profiles set role='coach' where id='00000000-0000-4000-a000-000000000061';
insert into public.coach_clients(coach_id,client_id) values('00000000-0000-4000-a000-000000000061','00000000-0000-4000-a000-000000000062');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000061',true);
select public.aa_save_tracking_settings('00000000-0000-4000-a000-000000000062',array['weight_kg','stress','blood_pressure','fasting_glucose','menstruation'],true,true,0);
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000062',true);
do $$declare failed boolean; row public.daily_tracking_entries;begin
 failed:=false;begin perform public.aa_save_tracking_settings('00000000-0000-4000-a000-000000000062',array['steps'],false,true,1);exception when others then if sqlerrm='Accès coach non autorisé.' then failed:=true;else raise;end if;end;if not failed then raise exception 'FAIL client can activate tracking';end if;
 failed:=false;begin perform public.aa_save_daily(current_date,'{"steps":5000}',0,1);exception when others then if sqlerrm like 'Suivi désactivé%' then failed:=true;else raise;end if;end;if not failed then raise exception 'FAIL disabled field accepted';end if;
 failed:=false;begin perform public.aa_save_daily(current_date,'{"protein_g":100}',0,1);exception when others then if sqlerrm='Renseigne les trois macros.' then failed:=true;else raise;end if;end;if not failed then raise exception 'FAIL incomplete macros';end if;
 failed:=false;begin perform public.aa_save_daily(current_date,'{"bp_systolic":120}',0,1);exception when others then if sqlerrm='Renseigne les deux pressions.' then failed:=true;else raise;end if;end;if not failed then raise exception 'FAIL incomplete pressure';end if;
 failed:=false;begin perform public.aa_save_daily(current_date+1,'{"weight_kg":70}',0,1);exception when others then if sqlerrm='Date invalide.' then failed:=true;else raise;end if;end;if not failed then raise exception 'FAIL future date';end if;
 row:=public.aa_save_daily(current_date,'{"weight_kg":70,"stress":5,"protein_g":150,"carbs_g":200,"fat_g":60,"menstruation":"yes","fasting_glucose":5,"glucose_unit":"mmol_l","bp_systolic":120,"bp_diastolic":80}',0,1);
 if row.metrics->>'calories'<>'1940.00' or row.revision<>1 then raise exception 'FAIL kcal formula or revision';end if;
 failed:=false;begin perform public.aa_save_daily(current_date,'{"weight_kg":71}',0,1);exception when others then if sqlerrm like 'Suivi modifié%' then failed:=true;else raise;end if;end;if not failed then raise exception 'FAIL concurrent overwrite';end if;
 failed:=false;begin perform public.aa_commit_photos('00000000-0000-4000-b000-000000000061',current_date,0,'');exception when others then if sqlerrm like 'Les trois poses%' then failed:=true;else raise;end if;end;if not failed then raise exception 'FAIL incomplete photo set';end if;
end $$;
-- Metadata-only objects, no real client photos.
insert into storage.objects(bucket_id,name,metadata) select 'aa-progress-photos','00000000-0000-4000-a000-000000000062/00000000-0000-4000-b000-000000000061/'||p||'.jpg','{"mimetype":"image/jpeg"}'::jsonb from unnest(array['front','side','back']) p;
select public.aa_commit_photos('00000000-0000-4000-b000-000000000061',current_date,0,'Synthetic photo test');
select public.aa_commit_photos('00000000-0000-4000-b000-000000000061',current_date,0,'Idempotent retry');
do $$begin if (select count(*) from storage.objects where bucket_id='aa-progress-photos')<>3 then raise exception 'FAIL complete photo set deleted';end if;end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000063',true);
do $$begin
 if exists(select 1 from public.daily_tracking_entries) or exists(select 1 from public.progress_photo_sets) or exists(select 1 from storage.objects where bucket_id='aa-progress-photos') then raise exception 'FAIL other client can access private records';end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000061',true);
do $$begin
 if (select count(*) from public.daily_tracking_entries)<>1 or (select count(*) from public.progress_photo_sets)<>1 or (select count(*) from storage.objects where bucket_id='aa-progress-photos')<>3 then raise exception 'FAIL assigned coach cannot read';end if;
end $$;
select public.aa_save_tracking_settings('00000000-0000-4000-a000-000000000062',array['weight_kg'],false,false,1);
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000062',true);
do $$declare r public.daily_tracking_entries; failed boolean:=false;begin
 begin perform public.aa_save_daily(current_date,'{"weight_kg":71}',1,1);exception when others then if sqlerrm like 'Ton coach a modifié%' then failed:=true;else raise;end if;end;if not failed then raise exception 'FAIL stale settings accepted';end if;
 r:=public.aa_save_daily(current_date,'{"weight_kg":71}',1,2);if r.metrics->>'stress'<>'5' or r.metrics->>'calories'<>'1940.00' then raise exception 'FAIL historic disabled values lost';end if;
end $$;
reset role;
rollback;
select 'V6 settings, validation, revisions, private photos and assigned-coach RLS passed; fixtures rolled back' as result;
