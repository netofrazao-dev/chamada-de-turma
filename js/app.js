/* =========================================================
   Ponto de entrada do app.
   ========================================================= */
import { html, mensagemErro, store } from "./utils.js";
import { icon } from "./icons.js";
import { abrirMenu, closeAllModals, fecharMenu, errorState, avatar } from "./components.js";
import { route, match, startRouter, stopRouter, navigate, setLeaveGuard } from "./router.js";
import { onAuthChange, signOut } from "./auth.js";
import { getProfessorPorUsuario } from "./api.js";
import { session, setSession, clearSession, nomeUsuario } from "./session.js";
import { initPWA, instalarApp, podeInstalar, onInstallChange, mostrarBannerInstalacao } from "./pwa.js";
import { APP_VERSAO } from "./config.js";
import { renderLogin, renderErroPerfil } from "./views/login.js";
import { renderHome } from "./views/turmas.js";
import { renderTurma } from "./views/turma/index.js";
import { renderMeuRelatorio } from "./views/relatorioProfessor.js";
import { renderAdminInicio, renderAdminProfessor } from "./views/admin/inicio.js";
import { renderAdminChamadas } from "./views/admin/chamadas.js";
import { renderAdminHoras } from "./views/admin/horas.js";
import { renderAdminRelatorio } from "./views/admin/relatorio.js";
import { renderAdminEmails } from "./views/admin/emails.js";

const root = document.getElementById("app");

/* ---------------- Tema claro/escuro ---------------- */

function temaAtual() {
  const t = document.documentElement.dataset.theme;
  if (t === "light" || t === "dark") return t;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function aplicarTema(t) {
  if (t) document.documentElement.dataset.theme = t;
  const cor = temaAtual() === "dark" ? "#0b1222" : "#13215a";
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", cor));
}

function alternarTema() {
  const novo = temaAtual() === "dark" ? "light" : "dark";
  store.set("tema", novo);
  aplicarTema(novo);
  atualizarBotaoTema();
}

function atualizarBotaoTema() {
  const b = document.getElementById("btn-theme");
  if (!b) return;
  const dark = temaAtual() === "dark";
  b.innerHTML = String(icon(dark ? "sun" : "moon"));
  b.setAttribute("aria-label", dark ? "Usar tema claro" : "Usar tema escuro");
  b.title = dark ? "Tema claro" : "Tema escuro";
}

/* ---------------- Rotas ---------------- */

const soAdmin = (fn) => (view, ctx) => {
  if (!session.isAdmin) {
    navigate("/", { replace: true });
    return;
  }
  return fn(view, ctx);
};

route("/", (view, ctx) => {
  if (session.isAdmin) {
    navigate("/admin", { replace: true });
    return;
  }
  return renderHome(view, ctx);
});
route("/turmas", renderHome);
route("/turma/:id/:aba?", renderTurma);
route("/meu-relatorio", renderMeuRelatorio);
route("/admin", soAdmin(renderAdminInicio));
route("/admin/professor/:id", soAdmin(renderAdminProfessor));
route("/admin/chamadas", soAdmin(renderAdminChamadas));
route("/admin/horas", soAdmin(renderAdminHoras));
route("/admin/relatorio", soAdmin(renderAdminRelatorio));
route("/admin/emails", soAdmin(renderAdminEmails));

function navItems() {
  if (session.isAdmin) {
    return [
      { href: "#/admin", label: "Início", icon: "home", match: (p) => p === "/admin" || p.startsWith("/admin/professor") || p.startsWith("/turma") },
      { href: "#/admin/chamadas", label: "Chamadas", icon: "clipboard", match: (p) => p.startsWith("/admin/chamadas") },
      { href: "#/admin/horas", label: "Horas", icon: "clock", match: (p) => p.startsWith("/admin/horas") },
      { href: "#/admin/relatorio", label: "Relatórios", icon: "file", match: (p) => p.startsWith("/admin/relatorio") },
      { href: "#/admin/emails", label: "Acessos", icon: "shield", match: (p) => p.startsWith("/admin/emails") },
    ];
  }
  return [
    { href: "#/", label: "Turmas", icon: "users", match: (p) => p === "/" || p === "/turmas" || p.startsWith("/turma") },
    { href: "#/meu-relatorio", label: "Meu relatório", icon: "chart", match: (p) => p.startsWith("/meu-relatorio") },
  ];
}

/* ---------------- Estrutura (topo + navegação) ---------------- */

let offInstall = null;

function montarShell() {
  const itens = navItems();
  root.innerHTML = String(html`
    <div class="shell ${session.isAdmin ? "is-admin" : ""}">
      <header class="topbar">
        <div class="topbar-inner">
          <a class="brand" href="#/" aria-label="Início">
            <img src="icons/globe-128.png" alt="" width="34" height="34">
            <span class="brand-text"><strong>Challenger</strong><small>Presença</small></span>
          </a>
          <nav class="topnav" aria-label="Menu principal">
            ${itens.map((i) => html`<a href="${i.href}" class="topnav-link">${icon(i.icon)}<span>${i.label}</span></a>`)}
          </nav>
          <div class="topbar-actions">
            <button type="button" class="topbar-btn install-cta" id="btn-install" hidden>${icon("smartphone")}<span>Instalar app</span></button>
            <button type="button" class="icon-btn topbar-icon" id="btn-theme"></button>
            <button type="button" class="user-btn" id="btn-user" aria-label="Conta" aria-haspopup="menu">
              ${avatar(nomeUsuario())}
              <span class="user-name">${nomeUsuario()}</span>
              ${icon("chevronDown", "hide-sm")}
            </button>
          </div>
        </div>
      </header>
      <main id="view" class="view" tabindex="-1"></main>
      <nav class="bottomnav" aria-label="Navegação">
        ${itens.map((i) => html`<a href="${i.href}" class="bottomnav-link">${icon(i.icon)}<span>${i.label}</span></a>`)}
      </nav>
    </div>`);

  document.body.classList.toggle("has-bottomnav", itens.length > 1);
  atualizarBotaoTema();
  document.getElementById("btn-theme").addEventListener("click", alternarTema);

  const btnInstall = document.getElementById("btn-install");
  const syncInstall = () => (btnInstall.hidden = !podeInstalar());
  syncInstall();
  offInstall?.();
  offInstall = onInstallChange(syncInstall);
  btnInstall.addEventListener("click", instalarApp);

  document.getElementById("btn-user").addEventListener("click", (e) => {
    e.stopPropagation();
    abrirMenu(e.currentTarget, [
      { header: nomeUsuario(), hint: `${session.user?.email || ""}${session.isAdmin ? " • Admin" : ""}` },
      { divider: true },
      podeInstalar() ? { label: "Instalar o app", icon: "smartphone", onClick: instalarApp } : null,
      { label: temaAtual() === "dark" ? "Tema claro" : "Tema escuro", icon: temaAtual() === "dark" ? "sun" : "moon", onClick: alternarTema },
      { label: "Atualizar dados", icon: "refresh", onClick: () => location.reload() },
      { divider: true },
      { label: "Sair", icon: "logout", danger: true, onClick: sair },
      { header: `Versão ${APP_VERSAO}` },
    ]);
  });
}

function marcarNavAtiva(path) {
  const itens = navItems();
  document.querySelectorAll(".topnav-link, .bottomnav-link").forEach((a) => {
    const item = itens.find((i) => i.href === a.getAttribute("href"));
    const ativo = item ? item.match(path) : false;
    a.classList.toggle("active", ativo);
    if (ativo) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

/* ---------------- Renderização das telas ---------------- */

let navToken = 0;
let cleanups = [];

async function renderRoute({ path, query }) {
  closeAllModals();
  fecharMenu();
  cleanups.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignora */
    }
  });
  cleanups = [];
  setLeaveGuard(null);

  const m = match(path);
  if (!m) {
    navigate("/", { replace: true });
    return;
  }
  marcarNavAtiva(path);

  const token = ++navToken;
  const view = document.getElementById("view");
  if (!view) return;
  view.innerHTML = "";
  window.scrollTo(0, 0);

  const ctx = {
    params: m.params,
    query,
    isActive: () => token === navToken,
    onCleanup: (fn) => cleanups.push(fn),
  };
  try {
    await m.handler(view, ctx);
  } catch (err) {
    console.error(err);
    if (token !== navToken) return;
    view.innerHTML = String(html`<section class="page">${errorState(mensagemErro(err))}</section>`);
    view.querySelector("[data-retry]")?.addEventListener("click", () => renderRoute({ path, query }));
  }
}

/* ---------------- Autenticação ---------------- */

let usuarioAtualId = null;
let modoRecuperacao = false;
let recuperacaoAberta = false;

function splash() {
  root.innerHTML = String(html`
    <div class="splash"><img src="icons/globe-128.png" alt="" width="72" height="72"><span class="spinner"></span></div>`);
}

function avisoDoLink() {
  const h = window.__hashInicial || "";
  if (!/error/.test(h)) return null;
  const p = new URLSearchParams(h.replace(/^#/, ""));
  const desc = p.get("error_description") || "";
  if (/expired|invalid/i.test(desc) || p.get("error_code") === "otp_expired") {
    return { texto: "O link usado expirou ou já foi utilizado. Solicite um novo link." };
  }
  return desc ? { texto: desc } : null;
}

function mostrarLogin(opts = {}) {
  stopRouter();
  offInstall?.();
  document.body.classList.remove("has-bottomnav");
  history.replaceState(null, "", location.pathname + location.search);
  renderLogin(root, { aviso: avisoDoLink(), ...opts });
  window.__hashInicial = "";
}

async function entrar(user) {
  splash();
  let professor;
  try {
    professor = await getProfessorPorUsuario(user.id);
  } catch (err) {
    if (modoRecuperacao || usuarioAtualId !== user.id) return;
    renderErroPerfil(root, { mensagem: mensagemErro(err), onRetry: () => entrar(user), onLogout: sair });
    return;
  }
  if (modoRecuperacao || usuarioAtualId !== user.id) return;
  if (!professor) {
    renderErroPerfil(root, {
      mensagem: "Sua conta ainda não está ligada a um perfil de professor. Aguarde alguns segundos e tente de novo, ou fale com a coordenação.",
      onRetry: () => entrar(user),
      onLogout: sair,
    });
    return;
  }
  setSession({ user, professor });
  montarShell();
  startRouter(renderRoute);
  setTimeout(mostrarBannerInstalacao, 1500);
}

async function sair() {
  splash();
  usuarioAtualId = null;
  await signOut();
  clearSession();
  mostrarLogin();
}

function iniciar() {
  aplicarTema();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    aplicarTema();
    atualizarBotaoTema();
  });
  initPWA();
  splash();

  if (/type=recovery/.test(window.__hashInicial || "")) modoRecuperacao = true;

  onAuthChange(async (event, sess) => {
    const user = sess?.user ?? null;

    // Link de "esqueci minha senha": mostra o formulário de nova senha.
    if (event === "PASSWORD_RECOVERY") modoRecuperacao = true;
    if (modoRecuperacao) {
      if (user && !recuperacaoAberta) {
        recuperacaoAberta = true;
        stopRouter();
        history.replaceState(null, "", location.pathname + location.search);
        renderLogin(root, { modo: "nova-senha" });
      } else if (!user && event !== "PASSWORD_RECOVERY") {
        modoRecuperacao = false;
        mostrarLogin();
      }
      return;
    }

    if (!user) {
      if (usuarioAtualId !== null || event === "INITIAL_SESSION" || event === "SIGNED_OUT") {
        usuarioAtualId = null;
        clearSession();
        mostrarLogin();
      }
      return;
    }
    if (user.id === usuarioAtualId) {
      session.user = user;
      return;
    }
    usuarioAtualId = user.id;
    await entrar(user);
  });
}

iniciar();
