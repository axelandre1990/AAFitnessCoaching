import { supabase } from "./supabase.js?v=22";
import { getCurrentProfile } from "./data.js?v=22";
import { mountDashboard, unmountDashboard } from "./dashboard.js?v=22";

const landing = document.querySelector(".welcome");
const panel = document.querySelector("#auth-panel");
const signedInPanel = document.querySelector("#signed-in-panel");
const form = document.querySelector("#auth-form");
const title = document.querySelector("#auth-title");
const intro = document.querySelector("#auth-intro");
const message = document.querySelector("#auth-message");
const submit = document.querySelector("#auth-submit");
const nameField = document.querySelector("#name-field");
const emailField = document.querySelector("#email-field");
const passwordField = document.querySelector("#password-field");
const confirmPasswordField = document.querySelector("#confirm-password-field");
const activationNote = document.querySelector("#activation-note");
const forgot = document.querySelector("#forgot-password");
const switcher = document.querySelector("#auth-switch");
const installDialog = document.querySelector("#install-dialog");
let mode = "login";
let routeRevision = 0;
let expectedRole = null;
let authLinkType = new URLSearchParams(window.location.hash.slice(1)).get("type");
let activationPending = authLinkType === "invite" || Boolean(new URLSearchParams(window.location.search).get("code"));

function showMessage(text, kind = "") {
  message.textContent = text;
  message.className = `auth-message${kind ? ` auth-message--${kind}` : ""}`;
}

function showLanding() {
  routeRevision += 1;
  expectedRole = null;
  unmountDashboard();
  landing.hidden = false;
  panel.hidden = true;
  signedInPanel.hidden = true;
  if (installDialog?.open) installDialog.close();
}

function showAuth(nextMode) {
  mode = nextMode;
  panel.dataset.mode = mode;
  landing.hidden = true;
  signedInPanel.hidden = true;
  panel.hidden = false;
  form.hidden = mode === "signup";
  activationNote.hidden = mode !== "signup";
  form.reset();
  showMessage("");
  nameField.hidden = mode !== "signup";
  emailField.hidden = mode === "update";
  form.elements.name.required = false;
  form.elements.email.required = mode !== "update";
  passwordField.hidden = mode === "reset";
  confirmPasswordField.hidden = !["signup", "update"].includes(mode);
  form.elements.password.required = !["reset", "signup"].includes(mode);
  form.elements.confirm_password.required = mode === "update";
  form.elements.password.autocomplete = mode === "update" ? "new-password" : "current-password";
  title.textContent = mode === "signup" ? "Première connexion" : mode === "reset" ? "Réinitialiser le mot de passe" : mode === "update" ? "Créer mon mot de passe" : expectedRole === "coach" ? "Connexion coach" : "Se connecter";
  intro.textContent = mode === "signup"
    ? "Active l’accès que ton coach vient de créer pour toi."
    : mode === "reset"
      ? "Nous t’enverrons un lien sécurisé pour choisir un nouveau mot de passe."
        : mode === "update"
        ? "Choisis un mot de passe personnel pour activer ton espace AA Fitness Coaching."
        : expectedRole === "coach" ? "Connecte-toi avec le compte coach attribué dans AA Fitness Coaching." : "Retrouve ton espace personnel.";
  submit.textContent = mode === "reset" ? "Envoyer le lien" : mode === "update" ? "Activer mon compte" : "Se connecter";
  forgot.hidden = mode !== "login";
  switcher.innerHTML = mode === "login"
    ? 'Première connexion ? <button type="button" data-mode="signup">Créer mon compte</button>'
    : mode === "signup"
      ? 'Tu as déjà un compte ? <button type="button" data-mode="login">Se connecter</button>'
      : mode === "update" ? "" : '<button type="button" data-mode="login">Retour à la connexion</button>';
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (mode !== "signup") (mode === "update" ? form.elements.password : form.elements.email).focus();
}

function showBlocked(messageText) {
  const app = document.querySelector("#signed-in-panel");
  app.hidden = false;
  document.querySelector("#client-dashboard").hidden = true;
  document.querySelector("#coach-dashboard").hidden = true;
  document.querySelector("#access-blocked").hidden = false;
  document.querySelector("#access-message").textContent = messageText;
}

async function showSignedIn() {
  const revision = ++routeRevision;
  unmountDashboard();
  landing.hidden = true;
  panel.hidden = true;
  signedInPanel.hidden = false;
  if (installDialog?.open) installDialog.close();

  try {
    const { user, profile } = await getCurrentProfile();
    if (revision !== routeRevision) return;
    if (!user) return showLanding();
    if (!profile) {
      await mountDashboard({ role: null, profile: { full_name: "" }, onSignOut: signOut });
      showBlocked("Ton compte est connecté, mais le profil AA Fitness Coaching n’est pas encore installé dans Supabase. L’administrateur doit appliquer la configuration V2.");
      return;
    }
    if (expectedRole && profile.role !== expectedRole) {
      showBlocked("Cette adresse n’a pas de rôle coach. Connecte-toi avec le compte auquel l’accès coach a été attribué.");
      return;
    }
    await mountDashboard({ role: profile.role, profile, onSignOut: signOut });
  } catch (error) {
    if (revision !== routeRevision) return;
    await mountDashboard({ role: null, profile: { full_name: "" }, onSignOut: signOut });
    showBlocked(error.message || "Impossible de charger ton espace. Vérifie ta connexion et réessaie.");
  }
}

async function signOut() {
  await supabase.auth.signOut();
  activationPending = false;
  showLanding();
}

document.querySelector("#open-login").addEventListener("click", () => showAuth("login"));
document.querySelector("#open-signup").addEventListener("click", () => showAuth("signup"));
document.querySelector("#open-coach").addEventListener("click", () => {
  expectedRole = "coach";
  showAuth("login");
});
document.querySelector("#auth-back").addEventListener("click", showLanding);
forgot.addEventListener("click", () => showAuth("reset"));
switcher.addEventListener("click", (event) => {
  const nextMode = event.target.closest("[data-mode]")?.dataset.mode;
  if (nextMode) {
    if (nextMode === "signup") expectedRole = null;
    showAuth(nextMode);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("");
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const email = String(data.get("email") || "").trim();
  const password = String(data.get("password") || "");
  const confirmation = String(data.get("confirm_password") || "");
  if (mode === "update" && password !== confirmation) {
    showMessage("Les deux mots de passe ne correspondent pas.", "error");
    return;
  }
  submit.disabled = true;
  submit.textContent = "Un instant…";
  try {
    if (mode === "update") {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      activationPending = false;
      authLinkType = null;
      window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
      await showSignedIn();
    } else if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });
      if (error) throw error;
      showMessage("Si cette adresse correspond à un compte, un lien de réinitialisation va être envoyé.", "success");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await showSignedIn();
    }
  } catch (error) {
    const messages = {
      "Invalid login credentials": "Adresse e-mail ou mot de passe incorrect.",
      "Email not confirmed": "Confirme d’abord ton adresse e-mail avec le lien reçu.",
      "User already registered": "Un compte existe déjà avec cette adresse. Connecte-toi plutôt.",
      "Password should be at least 6 characters": "Choisis un mot de passe d’au moins 8 caractères."
    };
    showMessage(messages[error.message] || error.message || "Une erreur est survenue. Réessaie.", "error");
  } finally {
    submit.disabled = false;
    submit.textContent = mode === "reset" ? "Envoyer le lien" : mode === "update" ? "Activer mon compte" : "Se connecter";
  }
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    window.setTimeout(() => showAuth("update"), 0);
    return;
  }
  if (session?.user) {
    if (activationPending) {
      window.setTimeout(() => showAuth("update"), 0);
      return;
    }
    window.setTimeout(() => showSignedIn(), 0);
  } else if (event === "SIGNED_OUT") {
    window.setTimeout(showLanding, 0);
  }
});

const { data: { session } } = await supabase.auth.getSession();
if (session?.user) {
  if (activationPending) showAuth("update");
  else await showSignedIn();
} else {
  const linkError = new URLSearchParams(window.location.hash.slice(1)).get("error_description");
  if (linkError) {
    showAuth("login");
    showMessage("Ce lien d’invitation ou de réinitialisation a expiré ou n’est plus valide. Demande un nouveau lien au coach.", "error");
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
  }
}

export { supabase };
