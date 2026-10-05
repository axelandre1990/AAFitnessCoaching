import {
  getClientHome,
  getCoachHome,
  getClientCheckIns,
  submitCheckIn,
  replyToCheckIn,
  inviteClient
} from "./data.js?v=14";

const shell = document.querySelector("#signed-in-panel");
const clientView = document.querySelector("#client-dashboard");
const coachView = document.querySelector("#coach-dashboard");
const blockedView = document.querySelector("#access-blocked");
const clientHistory = document.querySelector("#client-history");
const coachHistory = document.querySelector("#coach-history");
const clientList = document.querySelector("#client-list");
const coachGrid = document.querySelector("#coach-main-grid");
let activeRole = null;
let selectedClient = null;

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
  card.append(element("p", "checkin-entry__body", checkIn.body));
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

async function loadClient() {
  clientHistory.replaceChildren(element("p", "empty-state", "Chargement de ton suivi…"));
  try {
    const checkIns = await getClientHome();
    clientHistory.replaceChildren();
    if (!checkIns.length) {
      clientHistory.append(element("p", "empty-state", "Ton premier check-in apparaîtra ici après son envoi."));
      return;
    }
    for (const checkIn of checkIns) clientHistory.append(renderCheckIn(checkIn));
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

async function showClientHistory(clientId, clientName) {
  selectedClient = { id: clientId, name: clientName };
  document.querySelector("#coach-detail-title").textContent = clientName;
  coachGrid.hidden = true;
  document.querySelector("#coach-client-detail").hidden = false;
  coachHistory.replaceChildren(element("p", "empty-state", "Chargement des check-ins…"));
  try {
    const checkIns = await getClientCheckIns(clientId);
    coachHistory.replaceChildren();
    if (!checkIns.length) {
      coachHistory.append(element("p", "empty-state", "Ce client n’a pas encore envoyé de check-in."));
      return;
    }
    for (const checkIn of checkIns) coachHistory.append(renderCheckIn(checkIn, { coachMode: true }));
  } catch (error) {
    coachHistory.replaceChildren(element("p", "empty-state empty-state--error", error.message));
  }
}

export function unmountDashboard() {
  activeRole = null;
  selectedClient = null;
  shell.hidden = true;
  clientView.hidden = true;
  coachView.hidden = true;
  blockedView.hidden = true;
  clientHistory.replaceChildren();
  coachHistory.replaceChildren();
  clientList.replaceChildren();
  document.querySelector("#checkin-form").reset();
  document.querySelector("#invite-form").reset();
}

export async function mountDashboard({ role, profile, onSignOut }) {
  unmountDashboard();
  shell.hidden = false;
  document.querySelector("#dashboard-name").textContent = profile.full_name || "Espace AA Fitness Coaching";
  document.querySelector("#dashboard-role").textContent = role === "coach" ? "COACH" : "CLIENT";
  if (role === "client") {
    activeRole = role;
    clientView.hidden = false;
    await loadClient();
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

document.querySelector("#checkin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (activeRole !== "client") return;
  const form = event.currentTarget;
  const body = form.elements.body.value;
  const button = document.querySelector("#checkin-submit");
  const message = document.querySelector("#checkin-message");
  button.disabled = true;
  button.textContent = "Envoi…";
  announce(message, "Envoi de ton check-in…");
  try {
    await submitCheckIn(body);
    form.reset();
    announce(message, "Ton check-in a été envoyé à ton coach.", "success");
    await loadClient();
  } catch (error) {
    announce(message, error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Envoyer mon check-in";
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
  showClientHistory(button.dataset.clientId, button.dataset.clientName);
});

document.querySelector("#coach-back").addEventListener("click", () => {
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
    if (selectedClient) await showClientHistory(selectedClient.id, selectedClient.name);
    await loadCoach();
  } catch (error) {
    announce(message, error.message, "error");
    button.disabled = false;
    button.textContent = "Envoyer mon retour";
  }
});
