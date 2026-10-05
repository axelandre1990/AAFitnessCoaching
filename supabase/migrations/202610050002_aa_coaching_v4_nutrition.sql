-- AA Fitness Coaching V4: allow structured meal plans to be stored in the existing client plan record.
alter table public.client_plans
  drop constraint if exists client_plans_nutrition_plan_check;

alter table public.client_plans
  add constraint client_plans_nutrition_plan_check
  check (char_length(nutrition_plan) <= 60000);

comment on column public.client_plans.nutrition_plan is
  'Coach-authored nutrition plan. V3 plain text remains readable; V4 plans use the aa-nutrition-plan JSON schema.';
