import { mountTracking } from "./tracking.js?v=19";
import { mountPhotos } from "./progress-photos.js?v=19";
let trackingModules = [];
async function loadTracking(target, photosTarget, clientId, coach, valid) {
 const content=document.createElement('div'),photoContent=document.createElement('div');
 const tracking = await mountTracking(content,clientId,{coach});
 if (!valid()) { tracking.destroy(); return; }
 target.replaceChildren(content); trackingModules.push(tracking);
 const photos = await mountPhotos(photoContent,clientId,{coach,enabled:tracking.settings?.photos_enabled ?? true});
 if (!valid()) { photos.destroy(); return; }
 photosTarget.replaceChildren(photoContent); trackingModules.push(photos);
}

import {
  getClientHome,
  getCoachHome,
  getClientCheckIns,
  getClientPlan,
  getProgressEntries,
  saveClientPlan,
  getCurrentProfile,
  submitWeeklyCheckIn,
  setCheckinDay,
  getTrainingHistory,
  submitTrainingSession,
  submitProgressEntry,
  replyToCheckIn,
  inviteClient
} from "./data.js?v=19";
import { mountNutritionBuilder, renderClientNutrition } from "./nutrition-builder.js?v=19";

import { mountWeeklyCheckIn, renderWeeklyAnswers } from "./weekly-checkin.js?v=19";
import { mountTrainingBuilder, renderClientTraining, renderTrainingHistory } from "./training.js?v=19";
let weeklyCheckin = null;
let trainingBuilder = null;
let detailRevision = 0;
const shell = document.querySelector("#signed-in-panel");
const clientView = document.querySelector("#client-dashboard");
const coachView = document.querySelector("#coach-dashboard");
const blockedView = document.querySelector("#access-blocked");
const clientHistory = document.querySelector("#client-history");
const coachHistory = document.querySelector("#coach-history");
const clientList = document.querySelector("#client-list");
const coachGrid = document.querySelector("#coach-main-grid");
const clientProgress = document.querySelector("#client-progress-history");
const coachProgress = document.querySelector("#coach-progress-history");
let activeRole = null;
let selectedClient = null;
let activeClientId = null;
let nutritionBuilder = null;

function announce(element, text, kind = "") {
  element.textContent = text;
  element.className = `inline-message${kind ? ` inline-message--${kind}` : ""}`;
}

function dateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderFeedback(reply) {
  const card = element("div", "feedback-bubble");
  card.append(element("span", "feedback-bubble__label", "RETOUR DU COACH"));
  card.append(element("p", "", reply.body));
  card.append(element("time", "feedback-bubble__date", dateLabel(reply.created_at)));
  return card;
}

function renderCheckIn(checkIn, { coachMode = false } = {}) {
  const card = element("article", "checkin-entry");
  const header = element("div", "checkin-entry__header");
  header.append(element("time", "checkin-entry__date", dateLabel(checkIn.created_at)));
  header.append(element("span", `status-pill${checkIn.status === "reviewed" ? " status-pill--done" : ""}`, checkIn.status === "reviewed" ? "Répondu" : "À traiter"));
  card.append(header);
  if (checkIn.kind === "weekly" && checkIn.answers) renderWeeklyAnswers(card, checkIn);
  else card.append(element("p", "checkin-entry__body", checkIn.body));
  for (const reply of checkIn.feedback || []) card.append(renderFeedback(reply));

  if (coachMode && checkIn.status !== "reviewed") {
    const form = element("form", "reply-form");
    form.dataset.replyForm = "true";
    form.dataset.checkinId = checkIn.id;
    const label = element("label", "auth-field", "Ton retour");
    const textarea = element("textarea", "reply-form__textarea");
    textarea.name = "body";
    textarea.rows = 3;
    textarea.maxLength = 4000;
    textarea.required = true;
    textarea.placeholder = "Écris ta réponse au client…";
    label.append(textarea);
    const message = element("p", "inline-message");
    message.setAttribute("role", "status");
    const button = element("button", "auth-primary dashboard-submit", "Envoyer mon retour");
    button.type = "submit";
    form.append(label, message, button);
    card.append(form);
  }
  return card;
}

function formatMeasurement(value, unit) {
  if (value === null || value === undefined || value === "") return null;
  return `${new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 1 }).format(Number(value))} ${unit}`;
}

function renderProgress(target, entries, emptyCopy) {
  target.replaceChildren();
  if (!entries.length) {
    target.append(element("p", "empty-state", emptyCopy));
    return;
  }
  for (const entry of entries) {
    const row = element("article", "progress-entry");
    row.append(element("time", "progress-entry__date", dateLabel(entry.created_at)));
    const weightLabel = formatMeasurement(entry.weight_kg, "kg");
    const waistLabel = formatMeasurement(entry.waist_cm, "cm");
    const values = [weightLabel && `Poids ${weightLabel}`, waistLabel && `Taille ${waistLabel}`]
      .filter(Boolean).join(" · ");
    row.append(element("strong", "progress-entry__values", values));
    if (entry.notes) row.append(element("p", "progress-entry__notes", entry.notes));
    target.append(row);
  }
}

async function loadProgressHistory(target, clientId, emptyCopy) {
  target.replaceChildren(element("p", "empty-state", "Chargement de la progression…"));
  try {
    renderProgress(target, await getProgressEntries(clientId), emptyCopy);
  } catch (error) {
    target.replaceChildren(element("p", "empty-state empty-state--error", error.message));
  }
}

async function loadClient(clientId) {
 void loadTracking(document.querySelector("#client-daily-tracking"),document.querySelector("#client-progress-photos"),clientId,false,()=>activeRole==="client" && activeClientId===clientId);
  clientHistory.replaceChildren(element("p", "empty-state", "Chargement de ton suivi…"));
  try {
    const [checkIns, plan, identity, history] = await Promise.all([getClientHome(), getClientPlan(clientId), getCurrentProfile(), getTrainingHistory(clientId)]);
    if (activeRole !== "client" || activeClientId !== clientId) return;
    weeklyCheckin = mountWeeklyCheckIn(document.querySelector("#checkin-form"), {email: identity.user.email, fullName: identity.profile.full_name, checkinDay: identity.profile.checkin_day, checkIns});
    clientHistory.replaceChildren();
    if (!checkIns.length) {
      clientHistory.append(element("p", "empty-state", "Ton premier check-in apparaîtra ici après son envoi."));
    } else {
      for (const checkIn of checkIns) clientHistory.append(renderCheckIn(checkIn));
    }
    renderClientNutrition(document.querySelector("#client-nutrition-plan"), plan?.nutrition_plan || "");
    renderClientTraining(document.querySelector("#client-training-plan"), plan?.training_plan || "", {history, onSubmit: async (dayId, logs, notes, requestId) => {
      await submitTrainingSession(dayId, logs, notes, requestId);
      const updated = await getTrainingHistory(clientId);
      if (activeClientId === clientId) renderTrainingHistory(document.querySelector("#client-training-history"), updated);
    }});
    renderTrainingHistory(document.querySelector("#client-training-history"), history);
    document.querySelector("#client-plan-updated").textContent = plan?.updated_at ? `Mis à jour le ${dateLabel(plan.updated_at)}` : "Ton programme apparaîtra ici dès que ton coach l’aura préparé.";
    await loadProgressHistory(clientProgress, clientId, "Aucune mesure enregistrée pour le moment.");
  } catch (error) {
    clientHistory.replaceChildren(element("p", "empty-state empty-state--error", error.message));
  }
}

async function loadCoach() {
  clientList.replaceChildren(element("p", "empty-state", "Chargement des clients…"));
  try {
    const clients = await getCoachHome();
    document.querySelector("#client-count").textContent = String(clients.length);
    document.querySelector("#pending-count").textContent = String(clients.reduce((total, client) => total + client.pending_count, 0));
    clientList.replaceChildren();
    if (!clients.length) {
      clientList.append(element("p", "empty-state", "Tu n’as pas encore de client. Invite un client pour commencer."));
      return;
    }
    for (const client of clients) {
      const button = element("button", "client-row");
      button.type = "button";
      button.dataset.clientId = client.id;
      button.dataset.clientName = client.full_name || "Client AA";
      button.dataset.checkinDay = client.checkin_day || "";
      const main = element("span", "client-row__main");
      main.append(element("strong", "client-row__name", client.full_name || "Client AA"));
      main.append(element("span", "client-row__meta", client.latest_check_in ? `Dernier check-in · ${dateLabel(client.latest_check_in.created_at)}` : "En attente du premier check-in"));
      button.append(main);
      button.append(element("span", `client-row__count${client.pending_count ? " client-row__count--pending" : ""}`, String(client.pending_count)));
      button.append(element("span", "client-row__arrow", "›"));
      clientList.append(button);
    }
  } catch (error) {
    clientList.replaceChildren(element("p", "empty-state empty-state--error", error.message));
  }
}

async function showClientHistory(clientId, clientName, checkinDay = null) {
  const revision = ++detailRevision;
 for (const module of trackingModules) module.destroy(); trackingModules=[];
 void loadTracking(document.querySelector("#coach-daily-tracking"),document.querySelector("#coach-progress-photos"),clientId,true,()=>activeRole==="coach" && revision===detailRevision);
  selectedClient = { id: clientId, name: clientName, checkinDay };
  document.querySelector("#checkin-schedule-form").elements.weekday.value = checkinDay || "";
  announce(document.querySelector("#checkin-schedule-message"), "");
  nutritionBuilder = null; trainingBuilder = null;
  document.querySelector("#coach-detail-title").textContent = clientName;
  coachGrid.hidden = true;
  document.querySelector("#coach-client-detail").hidden = false;
  coachHistory.replaceChildren(element("p", "empty-state", "Chargement des check-ins…"));
  try {
    const [checkIns, plan, history] = await Promise.all([getClientCheckIns(clientId), getClientPlan(clientId), getTrainingHistory(clientId)]);
    if (revision !== detailRevision || activeRole !== "coach") return;
    coachHistory.replaceChildren();
    if (!checkIns.length) {
      coachHistory.append(element("p", "empty-state", "Ce client n’a pas encore envoyé de check-in."));
    } else {
      for (const checkIn of checkIns) coachHistory.append(renderCheckIn(checkIn, { coachMode: true }));
    }
    const planForm = document.querySelector("#coach-plan-form");
    const nutritionContainer = element("div", "nutrition-editor");
    const trainingContainer = element("div", "training-editor");
    const [nutrition, training] = await Promise.all([mountNutritionBuilder(nutritionContainer, plan?.nutrition_plan || ""), mountTrainingBuilder(trainingContainer, plan?.training_plan || "")]);
    if (revision !== detailRevision || activeRole !== "coach") return;
    nutritionBuilder = nutrition; trainingBuilder = training;
    document.querySelector("#nutrition-builder").replaceChildren(nutritionContainer);
    document.querySelector("#training-builder").replaceChildren(trainingContainer);
    renderTrainingHistory(document.querySelector("#coach-training-history"), history);
    announce(document.querySelector("#coach-plan-message"), plan?.updated_at ? `Dernière mise à jour · ${dateLabel(plan.updated_at)}` : "Aucun programme enregistré.");
    await loadProgressHistory(coachProgress, clientId, "Ce client n’a pas encore saisi de mesure.");
  } catch (error) {
    coachHistory.replaceChildren(element("p", "empty-state empty-state--error", error.message));
  }
}

export function unmountDashboard() {
 for (const module of trackingModules) module.destroy(); trackingModules=[];
 for (const id of ["client-daily-tracking","client-progress-photos","coach-daily-tracking","coach-progress-photos"]) document.getElementById(id).replaceChildren();
  ++detailRevision;
  weeklyCheckin = null; trainingBuilder = null;
  activeRole = null;
  selectedClient = null;
  shell.hidden = true;
  clientView.hidden = true;
  coachView.hidden = true;
  blockedView.hidden = true;
  coachGrid.hidden = false;
  document.querySelector("#coach-client-detail").hidden = true;
  nutritionBuilder = null;
  document.querySelector("#nutrition-builder").replaceChildren();
  document.querySelector("#training-builder").replaceChildren();
  document.querySelector("#client-training-history").replaceChildren();
  document.querySelector("#coach-training-history").replaceChildren();
  clientHistory.replaceChildren();
  coachHistory.replaceChildren();
  clientList.replaceChildren();
  clientProgress.replaceChildren();
  coachProgress.replaceChildren();
  document.querySelector("#checkin-form").reset();
  document.querySelector("#invite-form").reset();

  document.querySelector("#coach-plan-form").reset();
  activeClientId = null;
}

export async function mountDashboard({ role, profile, onSignOut }) {
  unmountDashboard();
  shell.hidden = false;
  document.querySelector("#dashboard-name").textContent = profile.full_name || "Espace AA Fitness Coaching";
  document.querySelector("#dashboard-role").textContent = role === "coach" ? "COACH" : "CLIENT";
  if (role === "client") {
    activeRole = role;
    activeClientId = profile.id;
    clientView.hidden = false;
    await loadClient(profile.id);
  } else if (role === "coach") {
    activeRole = role;
    coachView.hidden = false;
    await loadCoach();
  } else {
    document.querySelector("#access-message").textContent = "Ton compte n’a pas de rôle AA Fitness Coaching actif. Contacte le coach pour activer ton accès.";
    blockedView.hidden = false;
  }
  document.querySelector("#sign-out").onclick = onSignOut;
  document.querySelector("#blocked-sign-out").onclick = onSignOut;
}

document.querySelector("#checkin-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (activeRole !== "client" || !weeklyCheckin) return;
  const button = document.querySelector("#checkin-submit");
  const message = document.querySelector("#checkin-message");
  let answers;
  try { answers = weeklyCheckin.serialize(); } catch (error) { announce(message,error.message,"error");return; }
  button.disabled = true; button.textContent = "Envoi…";
  try {
    await submitWeeklyCheckIn(answers);
    weeklyCheckin = null;
    announce(message,"Ton check-in hebdomadaire a été envoyé au coach.","success");
    await loadClient(activeClientId);
  } catch(error) {
    announce(message,error.message,"error");button.disabled=false;button.textContent="Envoyer mon check-in hebdomadaire";
  }
});
document.querySelector("#checkin-schedule-form").addEventListener("submit", async event => {
  event.preventDefault(); if(activeRole!=="coach" || !selectedClient) return;
  const clientId=selectedClient.id;
  const button=event.currentTarget.querySelector('button');const weekday=event.currentTarget.elements.weekday.value;
  const message=document.querySelector("#checkin-schedule-message");button.disabled=true;
  try {await setCheckinDay(clientId,weekday);if(selectedClient?.id===clientId){selectedClient.checkinDay=Number(weekday);announce(message,"Jour de check-in enregistré.","success");}await loadCoach();}
  catch(error){if(selectedClient?.id===clientId)announce(message,error.message,"error");}
  finally{button.disabled=false;}
});



document.querySelector("#coach-plan-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (activeRole !== "coach" || !selectedClient) return;
  const form = event.currentTarget;
  const button = document.querySelector("#coach-plan-submit");
  const message = document.querySelector("#coach-plan-message");
  button.disabled = true;
  button.textContent = "Enregistrement…";
  announce(message, "Enregistrement du programme…");
  try {
    if (!nutritionBuilder || !trainingBuilder) throw new Error("Le constructeur nutrition n’est pas disponible. Recharge la page et réessaie.");
    const plan = await saveClientPlan(selectedClient.id, { nutritionPlan: nutritionBuilder.serialize(), trainingPlan: trainingBuilder.serialize() });
    announce(message, `Programme enregistré · ${dateLabel(plan.updated_at)}`, "success");
  } catch (error) {
    announce(message, error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Enregistrer le programme";
  }
});

document.querySelector("#invite-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (activeRole !== "coach") return;
  const form = event.currentTarget;
  const button = document.querySelector("#invite-submit");
  const message = document.querySelector("#invite-message");
  button.disabled = true;
  button.textContent = "Ajout…";
  announce(message, "Préparation de l’accès client…");
  try {
    const result = await inviteClient({ email: form.elements.email.value, fullName: form.elements.full_name.value });
    form.reset();
    announce(message, result.message || "Client ajouté.", "success");
    await loadCoach();
  } catch (error) {
    announce(message, error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Inviter le client";
  }
});

document.querySelector("#refresh-coach").addEventListener("click", () => {
  if (activeRole === "coach") loadCoach();
});

clientList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-client-id]");
  if (!button || activeRole !== "coach") return;
  showClientHistory(button.dataset.clientId, button.dataset.clientName, button.dataset.checkinDay);
});

document.querySelector("#coach-back").addEventListener("click", () => {
  ++detailRevision;
  selectedClient = null;
  document.querySelector("#coach-client-detail").hidden = true;
  coachGrid.hidden = false;
});

coachHistory.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-reply-form]");
  if (!form || activeRole !== "coach") return;
  event.preventDefault();
  const button = form.querySelector("button[type=submit]");
  const message = form.querySelector(".inline-message");
  button.disabled = true;
  button.textContent = "Envoi…";
  announce(message, "Envoi de ton retour…");
  try {
    await replyToCheckIn(form.dataset.checkinId, form.elements.body.value);
    if (selectedClient) {
      const clientId=selectedClient.id;
      const checkIns=await getClientCheckIns(clientId);
      if(selectedClient?.id===clientId){coachHistory.replaceChildren();for(const item of checkIns)coachHistory.append(renderCheckIn(item,{coachMode:true}));}
    }
    await loadCoach();
  } catch (error) {
    announce(message, error.message, "error");
    button.disabled = false;
    button.textContent = "Envoyer mon retour";
  }
});
