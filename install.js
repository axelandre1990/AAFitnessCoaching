let deferredPrompt = null;
let appInstalled = false;
let promptDismissed = false;

export function captureInstallPrompt(targetWindow = window) {
  targetWindow.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    targetWindow.dispatchEvent(new Event("aa-install-state-change"));
  });

  targetWindow.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    appInstalled = true;
    targetWindow.dispatchEvent(new Event("aa-install-state-change"));
  });
}

export function getInstallState({ window: targetWindow = window, navigator: targetNavigator = navigator } = {}) {
  const standalone = targetWindow.matchMedia?.("(display-mode: standalone)").matches
    || targetNavigator.standalone === true;
  if (standalone || appInstalled) return "installed";
  if (deferredPrompt) return "prompt";
  if (promptDismissed) return "dismissed";

  const userAgent = targetNavigator.userAgent || "";
  const iosDevice = /iPhone|iPad|iPod/i.test(userAgent)
    || (targetNavigator.platform === "MacIntel" && targetNavigator.maxTouchPoints > 1);
  const safariOnIos = iosDevice && /Safari/i.test(userAgent)
    && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);
  if (safariOnIos) return "ios-help";
  return "unavailable";
}

export async function requestInstall() {
  if (!deferredPrompt) return { outcome: "unavailable" };

  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  await promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  const outcome = choice?.outcome === "accepted" ? "accepted" : "dismissed";
  promptDismissed = outcome === "dismissed";
  return { outcome };
}
