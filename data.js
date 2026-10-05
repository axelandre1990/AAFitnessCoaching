import { supabase } from "./supabase.js?v=22";

function throwIfError(error) {
  if (!error) return;
  if (error.code === "42P01" || error.code === "PGRST205") {
    throw new Error("L’espace coach/client n’est pas encore configuré dans Supabase. Consulte le guide de configuration.");
  }
  throw new Error(error.message || "Une erreur est survenue. Réessaie.");
}

export async function getCurrentProfile() {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  throwIfError(authError);
  if (!user) return { user: null, profile: null };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, checkin_day")
    .eq("id", user.id)
    .maybeSingle();
  throwIfError(error);
  return { user, profile: profile ? { ...profile, email: user.email } : null };
}

async function getFeedback(checkIns) {
  const ids = checkIns.map((item) => item.id);
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("coach_feedback")
    .select("id, check_in_id, coach_id, body, created_at")
    .in("check_in_id", ids)
    .order("created_at", { ascending: true });
  throwIfError(error);
  return data || [];
}

function attachFeedback(checkIns, feedback) {
  return checkIns.map((item) => ({
    ...item,
    feedback: feedback.filter((reply) => reply.check_in_id === item.id)
  }));
}

export async function getClientHome() {
  const { data: checkIns, error } = await supabase
    .from("check_ins")
    .select("id, body, status, created_at, kind, answers, week_start, due_date, submitted_late")
    .order("created_at", { ascending: false });
  throwIfError(error);
  const feedback = await getFeedback(checkIns || []);
  return attachFeedback(checkIns || [], feedback);
}

export async function getClientPlan(clientId) {
  const { data, error } = await supabase
    .from("client_plans")
    .select("nutrition_plan, training_plan, updated_at")
    .eq("client_id", clientId)
    .maybeSingle();
  throwIfError(error);
  return data;
}

export async function saveClientPlan(clientId, { nutritionPlan, trainingPlan }) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  throwIfError(authError);
  if (!user) throw new Error("Ta session a expiré. Reconnecte-toi pour modifier le programme.");
  const plan = {
    client_id: clientId,
    coach_id: user.id,
    nutrition_plan: String(nutritionPlan || "").trim(),
    training_plan: String(trainingPlan || "").trim(),
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase
    .from("client_plans")
    .upsert(plan, { onConflict: "client_id" })
    .select("nutrition_plan, training_plan, updated_at")
    .single();
  throwIfError(error);
  return data;
}

export async function getProgressEntries(clientId) {
  const { data, error } = await supabase
    .from("progress_entries")
    .select("id, weight_kg, waist_cm, notes, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(24);
  throwIfError(error);
  return data || [];
}

export async function submitProgressEntry({ weightKg, waistCm, notes }) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  throwIfError(authError);
  if (!user) throw new Error("Ta session a expiré. Reconnecte-toi pour ajouter une mesure.");
  const entry = {
    client_id: user.id,
    weight_kg: weightKg === "" || weightKg == null ? null : Number(weightKg),
    waist_cm: waistCm === "" || waistCm == null ? null : Number(waistCm),
    notes: String(notes || "").trim()
  };
  if (entry.weight_kg === null && entry.waist_cm === null) {
    throw new Error("Ajoute au moins ton poids ou ton tour de taille.");
  }
  const { data, error } = await supabase
    .from("progress_entries")
    .insert(entry)
    .select("id, weight_kg, waist_cm, notes, created_at")
    .single();
  throwIfError(error);
  return data;
}

export async function submitCheckIn(body) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  throwIfError(authError);
  if (!user) throw new Error("Ta session a expiré. Reconnecte-toi pour envoyer ton check-in.");
  const cleanBody = String(body || "").trim();
  if (!cleanBody) throw new Error("Écris ton retour avant de l’envoyer.");

  const { data, error } = await supabase
    .from("check_ins")
    .insert({ client_id: user.id, body: cleanBody })
    .select("id, body, status, created_at, kind, answers, week_start, due_date, submitted_late")
    .single();
  throwIfError(error);
  return { ...data, feedback: [] };
}

export async function getCoachHome() {
  const { data: assignments, error: assignmentError } = await supabase
    .from("coach_clients")
    .select("client_id")
    .order("created_at", { ascending: false });
  throwIfError(assignmentError);
  const clientIds = [...new Set((assignments || []).map((item) => item.client_id))];
  if (!clientIds.length) return [];

  const [{ data: profiles, error: profileError }, { data: checkIns, error: checkInError }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, checkin_day").in("id", clientIds),
    supabase.from("check_ins").select("id, client_id, body, status, created_at, kind, answers, week_start, due_date, submitted_late").in("client_id", clientIds).order("created_at", { ascending: false })
  ]);
  throwIfError(profileError);
  throwIfError(checkInError);
  return (profiles || []).map((profile) => {
    const clientCheckIns = (checkIns || []).filter((item) => item.client_id === profile.id);
    return {
      ...profile,
      pending_count: clientCheckIns.filter((item) => item.status === "pending").length,
      latest_check_in: clientCheckIns[0] || null
    };
  });
}

export async function getClientCheckIns(clientId) {
  const { data, error } = await supabase
    .from("check_ins")
    .select("id, client_id, body, status, created_at, kind, answers, week_start, due_date, submitted_late")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  throwIfError(error);
  const checkIns = data || [];
  const feedback = await getFeedback(checkIns);
  return attachFeedback(checkIns, feedback);
}

export async function replyToCheckIn(checkInId, body) {
  const cleanBody = String(body || "").trim();
  if (!cleanBody) throw new Error("Écris ta réponse avant de l’envoyer.");
  const { error } = await supabase.rpc("aa_reply_to_check_in", {
    target_check_in: checkInId,
    reply_body: cleanBody
  });
  throwIfError(error);
}

export async function inviteClient({ email, fullName }) {
  const { data, error } = await supabase.functions.invoke("invite-client", {
    body: { email: String(email || "").trim(), full_name: String(fullName || "").trim() }
  });
  if (error) {
    const responseMessage = data?.error || error.message;
    if (/function|404|not found/i.test(responseMessage || "")) {
      throw new Error("L’invitation coach n’est pas encore activée dans Supabase. Consulte le guide de configuration.");
    }
    throw new Error(responseMessage || "Impossible d’ajouter ce client pour le moment.");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function setCheckinDay(clientId, weekday) {
  const {error}=await supabase.rpc("aa_set_checkin_day",{target_client:clientId,weekday:Number(weekday)});throwIfError(error);
}
export async function submitWeeklyCheckIn(answers) {
  const {data,error}=await supabase.rpc("aa_submit_weekly_check_in",{response_answers:answers,form_version:1});throwIfError(error);return data;
}
export async function getTrainingHistory(clientId) {
  const {data,error}=await supabase.from("training_sessions").select("id, plan_day_id, session_name, performed_on, notes, created_at, training_sets(exercise_item_id, exercise_id, exercise_name, exercise_order, set_index, reps, load_kg)").eq("client_id",clientId).order("created_at",{ascending:false}).limit(20);
  throwIfError(error);
  return (data||[]).map(session=>({...session,training_sets:(session.training_sets||[]).sort((a,b)=>a.exercise_order-b.exercise_order||a.set_index-b.set_index)}));
}
export async function submitTrainingSession(dayId, logs, notes, requestId) {
  const {data,error}=await supabase.rpc("aa_submit_training_session",{day_id:dayId,completed_sets:logs,session_notes:notes,client_request_id:requestId});throwIfError(error);return data;
}

export async function getLatestTrainingSessions(clientId, dayIds) {
  const rows = await Promise.all([...new Set(dayIds)].slice(0,14).map(async dayId => {
    const {data,error}=await supabase.from("training_sessions").select("id, plan_day_id, session_name, performed_on, notes, created_at, training_sets(exercise_item_id, exercise_id, exercise_name, exercise_order, set_index, reps, load_kg)").eq("client_id",clientId).eq("plan_day_id",dayId).order("created_at",{ascending:false}).limit(1);
    throwIfError(error); return data?.[0] || null;
  }));
  return rows.filter(Boolean);
}
