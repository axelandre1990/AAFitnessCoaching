import { captureInstallPrompt, getInstallState, requestInstall } from "./install.js?v=13";

const installButton = document.querySelector("#install-button");
const installLabel = document.querySelector("#install-label");
const dialog = document.querySelector("#install-dialog");
const dialogTitle = document.querySelector("#dialog-title");
const dialogCopy = document.querySelector("#dialog-copy");
const browserNote = document.querySelector("#browser-note");
const statusCopy = document.querySelector("#status-copy");

function setInstallView() {
  const state = getInstallState();
  installLabel.textContent = state === "installed" ? "AA Fitness Coaching est installé" : "Installer AA Fitness Coaching";
  installButton.disabled = state === "installed";
  browserNote.hidden = !["unavailable", "dismissed"].includes(state);
  statusCopy.textContent = state === "installed"
    ? "AA Fitness Coaching est installé sur cet appareil"
    : state === "dismissed"
      ? "Tu peux installer AA Fitness Coaching quand tu le souhaites"
      : "Préparation de ton espace sécurisé";
}

function showHelp(state) {
  if (state === "ios-help") {
    dialogTitle.textContent = "Ajoute l’app à ton iPhone";
    dialogCopy.innerHTML = "<p>En quelques secondes, AA Fitness Coaching sera accessible depuis ton écran d’accueil.</p><ol><li>Appuie sur le bouton <strong>Partager</strong> dans Safari.</li><li>Choisis <strong>Sur l’écran d’accueil</strong>.</li><li>Confirme avec <strong>Ajouter</strong>.</li></ol>";
  } else if (state === "dismissed") {
    dialogTitle.textContent = "Tu pourras l’installer plus tard";
    dialogCopy.innerHTML = "<p>L’installation a été fermée. AA Fitness Coaching reste accessible dans ton navigateur.</p><p>Tu peux réessayer depuis le menu d’installation de ton navigateur quand tu le souhaites.</p>";
  } else {
    dialogTitle.textContent = "Ouvre AA Fitness Coaching quand tu veux";
    dialogCopy.innerHTML = "<p>Ce navigateur ne propose pas l’installation de l’application pour le moment.</p><p>Tu peux quand même utiliser AA Fitness Coaching ici, ou ouvrir cette page dans Safari ou Chrome sur ton téléphone pour l’ajouter à ton écran d’accueil.</p>";
  }
  if (!dialog.open) dialog.showModal();
}

async function onInstallClick() {
  const state = getInstallState();
  if (state === "ios-help" || state === "unavailable") {
    showHelp(state);
    return;
  }
  if (state === "dismissed") {
    showHelp(state);
    return;
  }
  if (state === "installed") return;

  const result = await requestInstall();
  if (result.outcome === "accepted") statusCopy.textContent = "AA Fitness Coaching a été ajouté à ton appareil";
  if (result.outcome === "dismissed") {
    setInstallView();
    showHelp("dismissed");
  }
  if (result.outcome === "unavailable") showHelp("unavailable");
}

captureInstallPrompt();
installButton.addEventListener("click", onInstallClick);
window.addEventListener("aa-install-state-change", setInstallView);
setInstallView();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // The launch screen remains usable if offline support is unavailable.
    });
  });
}
