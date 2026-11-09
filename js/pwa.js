/* =========================================================
   PWA: service worker, botão "Instalar app" e aviso offline.
   - Android/Chrome/Edge/desktop: usa o prompt nativo de instalação
     (no Android o Chrome gera um app de verdade — WebAPK).
   - iPhone/iPad: mostra o passo a passo do Safari
     (Compartilhar → Adicionar à Tela de Início).
   ========================================================= */
import { html, el, store } from "./utils.js";
import { icon } from "./icons.js";
import { openModal, toast } from "./components.js";
import { APP_NOME } from "./config.js";

let deferredPrompt = null;
const listeners = new Set();
const BANNER_KEY = "pwa-banner-dispensado-em";

const ua = navigator.userAgent || "";

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isAndroid = () => /android/i.test(ua);
export const isMobile = () => isIOS() || isAndroid();
const isInAppBrowser = () => /FBAN|FBAV|Instagram|Line\/|WhatsApp|Snapchat|TikTok|; wv\)/i.test(ua);
const isIOSSafari = () => isIOS() && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true
  );
}

/** O botão de instalar deve aparecer? */
export const podeInstalar = () => !isStandalone();

export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn());

export function initPWA() {
  if ("serviceWorker" in navigator) {
    const register = () =>
      navigator.serviceWorker.register("service-worker.js", { scope: "./" }).catch((err) => {
        console.warn("Service worker não registrado:", err);
      });
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    store.set(BANNER_KEY, Date.now());
    toast("App instalado! Procure o ícone “Presença” na tela inicial.", { duration: 5000 });
    removerBanner();
    notify();
  });

  const updateOnline = () => {
    document.body.classList.toggle("is-offline", !navigator.onLine);
    let bar = document.getElementById("offline-bar");
    if (!navigator.onLine && !bar) {
      bar = el(html`<div id="offline-bar" class="offline-bar" role="status">${icon("wifiOff")}<span>Você está sem internet. As alterações não serão salvas até a conexão voltar.</span></div>`);
      document.body.appendChild(bar);
    } else if (navigator.onLine && bar) {
      bar.remove();
      toast("Conexão restabelecida.", { type: "info", duration: 2500 });
    }
  };
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);
  if (!navigator.onLine) updateOnline();
}

/** Ação do botão "Instalar app". */
export async function instalarApp() {
  if (deferredPrompt) {
    const prompt = deferredPrompt;
    deferredPrompt = null;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome !== "accepted") {
        // O navegador só permite usar o prompt uma vez; ele volta a disparar depois.
      }
    } catch {
      mostrarInstrucoes();
    }
    notify();
    return;
  }
  mostrarInstrucoes();
}

function passo(n, conteudo) {
  return html`<li class="install-step"><span class="install-step-n">${n}</span><div>${conteudo}</div></li>`;
}

export function mostrarInstrucoes() {
  let titulo = "Instalar o aplicativo";
  let corpo;

  if (isInAppBrowser()) {
    corpo = html`
      <p class="install-lead">Você abriu o link dentro de outro app (WhatsApp, Instagram...). Para instalar, abra no navegador:</p>
      <ol class="install-steps">
        ${passo(1, html`Toque no menu <b>⋮</b> ou <b>…</b> no canto da tela.`)}
        ${passo(2, html`Escolha <b>${isIOS() ? "Abrir no Safari" : "Abrir no Chrome"}</b>.`)}
        ${passo(3, html`Depois toque em <b>Instalar app</b> novamente.`)}
      </ol>`;
  } else if (isIOS()) {
    titulo = "Instalar no iPhone / iPad";
    corpo = html`
      ${!isIOSSafari()
        ? html`<p class="install-note">${icon("info")}<span>Funciona melhor pelo <b>Safari</b>. Se não encontrar a opção, abra este site no Safari.</span></p>`
        : ""}
      <ol class="install-steps">
        ${passo(1, html`Toque no botão <b>Compartilhar</b> <span class="kbd">${icon("share")}</span> na barra do navegador.`)}
        ${passo(2, html`Role a lista e toque em <b>Adicionar à Tela de Início</b> <span class="kbd">${icon("plusSquare")}</span>.`)}
        ${passo(3, html`Confirme em <b>Adicionar</b>. O ícone <b>Presença</b> aparece na sua tela inicial.`)}
      </ol>`;
  } else if (isAndroid()) {
    titulo = "Instalar no Android";
    corpo = html`
      <ol class="install-steps">
        ${passo(1, html`Abra este site no <b>Google Chrome</b>.`)}
        ${passo(2, html`Toque no menu <b>⋮</b> (canto superior direito).`)}
        ${passo(3, html`Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.`)}
      </ol>
      <p class="install-note">${icon("info")}<span>No Android o Chrome instala o app como um aplicativo de verdade: ele aparece na gaveta de apps e abre em tela cheia.</span></p>`;
  } else {
    titulo = "Instalar no computador";
    corpo = html`
      <ol class="install-steps">
        ${passo(1, html`Use o <b>Chrome</b> ou o <b>Edge</b>.`)}
        ${passo(2, html`Clique no ícone de instalar <span class="kbd">${icon("download")}</span> no lado direito da barra de endereço.`)}
        ${passo(3, html`Ou abra o menu do navegador e escolha <b>Instalar ${APP_NOME}</b>.`)}
      </ol>`;
  }

  const m = openModal({
    title: titulo,
    size: "sm",
    content: html`
      <div class="install-hero">
        <img src="icons/icon-192.png" alt="" width="64" height="64">
        <div><strong>${APP_NOME}</strong><span>Acesso rápido, em tela cheia, direto da tela inicial.</span></div>
      </div>
      ${corpo}`,
    footer: html`<button type="button" class="btn btn-primary btn-block" data-ok>Entendi</button>`,
  });
  m.footer.querySelector("[data-ok]").addEventListener("click", () => m.close());
}

/* ---------- Banner discreto convidando a instalar (só no celular) ---------- */

function removerBanner() {
  document.getElementById("install-banner")?.remove();
}

export function mostrarBannerInstalacao() {
  if (!podeInstalar() || !isMobile()) return;
  const dispensado = store.get(BANNER_KEY, 0);
  if (Date.now() - dispensado < 1000 * 60 * 60 * 24 * 7) return;
  if (document.getElementById("install-banner")) return;

  const b = el(html`
    <div id="install-banner" class="install-banner" role="region" aria-label="Instalar aplicativo">
      <img src="icons/icon-192.png" alt="" width="40" height="40">
      <div class="install-banner-text">
        <strong>Instale o app no celular</strong>
        <span>Abra a chamada com um toque.</span>
      </div>
      <button type="button" class="btn btn-primary btn-sm" data-install>Instalar</button>
      <button type="button" class="icon-btn" data-close aria-label="Agora não">${icon("x")}</button>
    </div>`);
  b.querySelector("[data-install]").addEventListener("click", () => {
    removerBanner();
    store.set(BANNER_KEY, Date.now());
    instalarApp();
  });
  b.querySelector("[data-close]").addEventListener("click", () => {
    store.set(BANNER_KEY, Date.now());
    removerBanner();
  });
  document.body.appendChild(b);
}
