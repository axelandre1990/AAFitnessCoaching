import { supabase } from "./supabase.js?v=14";

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
    .select("id, full_name, role")
    .eq("id", user.id)
    .maybeSingle();
  throwIfError(error);
  return { user, profile };
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
    .select("id, body, status, created_at")
    .order("created_at", { ascending: false });
  throwIfError(error);
  const feedback = await getFeedback(checkIns || []);
  return attachFeedback(checkIns || [], feedback);
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
    .select("id, body, status, created_at")
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
    supabase.from("profiles").select("id, full_name").in("id", clientIds),
    supabase.from("check_ins").select("id, client_id, body, status, created_at").in("client_id", clientIds).order("created_at", { ascending: false })
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
    .select("id, client_id, body, status, created_at")
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
