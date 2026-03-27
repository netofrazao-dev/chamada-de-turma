import {
  signUp,
  signIn,
  signOut,
  onAuthChange,
  getCurrentUser,
} from "./auth.js";

import {
  carregarTurmasPainel,
  initTurmasUI,
  initVoltarTurmas,
  setPerfilAtual,
  carregarProfessoresComoPastas,
} from "./ui.js";

import { getProfessorAtual } from "./api.js";
import { initAdminUI } from "./adminUi.js";

function setAppView(loggedIn) {
  const authView = document.getElementById("auth-view");
  const appView = document.getElementById("app-view");
  if (loggedIn) {
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
  } else {
    authView.classList.remove("hidden");
    appView.classList.add("hidden");
  }
}

let appInitialized = false;

async function initAfterLogin(isAdmin) {
  if (appInitialized) return;
  appInitialized = true;

  initTurmasUI();
  initVoltarTurmas();

  // informa o perfil para o módulo de UI (admin x professor)
  setPerfilAtual({ isAdmin });

  if (isAdmin) {
    // Admin: primeira tela = lista de professores (“pastas”)
    await carregarProfessoresComoPastas();
  } else {
    // Professor: comportamento antigo, lista direta de turmas
    await carregarTurmasPainel();
  }

  // painel admin continua funcionando (botão / seções extras)
  await initAdminUI();
}

/* --------- Auth UI --------- */
function initAuthUI() {
  const loginTab = document.getElementById("loginTabBtn");
  const signupTab = document.getElementById("signupTabBtn");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const authMsg = document.getElementById("authMessage");

  function showLogin() {
    loginTab.classList.add("active");
    signupTab.classList.remove("active");
    loginForm.classList.remove("hidden");
    signupForm.classList.add("hidden");
    authMsg.textContent = "";
  }

  function showSignup() {
    signupTab.classList.add("active");
    loginTab.classList.remove("active");
    signupForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
    authMsg.textContent = "";
  }

  loginTab.addEventListener("click", showLogin);
  signupTab.addEventListener("click", showSignup);

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authMsg.textContent = "";
    try {
      const email = document.getElementById("loginEmail").value;
      const password = document.getElementById("loginPassword").value;
      await signIn({ email, password });
      authMsg.style.color = "#4caf50";
      authMsg.textContent = "Login realizado.";
    } catch (err) {
      authMsg.style.color = "#e53935";
      authMsg.textContent = err.message || "Erro ao fazer login.";
    }
  });

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authMsg.textContent = "";
    try {
      const nome = document.getElementById("signupNome").value;
      const email = document.getElementById("signupEmail").value;
      const password = document.getElementById("signupPassword").value;
      await signUp({ nome, email, password });
      authMsg.style.color = "#4caf50";
      authMsg.textContent =
        "Cadastro realizado. Verifique seu email (se a confirmação estiver ativada).";
      showLogin();
    } catch (err) {
      authMsg.style.color = "#e53935";
      authMsg.textContent = err.message || "Erro ao cadastrar.";
    }
  });
}

/* --------- Eventos gerais do app --------- */
function initAppEvents() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await signOut();
      appInitialized = false; // permite re‑inicializar quando logar de novo
    });
  }
}

/* --------- Inicialização --------- */
document.addEventListener("DOMContentLoaded", async () => {
  initAuthUI();
  initAppEvents();

  // Observer de auth (login / logout / troca de sessão)
  onAuthChange(async (user) => {
    setAppView(!!user);

    if (user) {
      const prof = await getProfessorAtual().catch(() => null);
      const nameEl = document.getElementById("currentTeacherName");

      if (prof && nameEl) {
        let nome = prof.nome || user.email;
        if (prof.role === "admin") {
          nome += " (Admin)";
        }
        nameEl.textContent = nome;
      }

      const ehAdmin = prof?.role === "admin";
      await initAfterLogin(ehAdmin);
    } else {
      appInitialized = false;
    }
  });

  // Se já estiver logado (refresh da página)
  const existingUser = await getCurrentUser();
  if (existingUser) {
    setAppView(true);
    const prof = await getProfessorAtual().catch(() => null);
    const nameEl = document.getElementById("currentTeacherName");

    if (prof && nameEl) {
      let nome = prof.nome || existingUser.email;
      if (prof.role === "admin") {
        nome += " (Admin)";
      }
      nameEl.textContent = nome;
    }

    const ehAdmin = prof?.role === "admin";
    await initAfterLogin(ehAdmin);
  } else {
    setAppView(false);
  }
});