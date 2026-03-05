import { signUp, signIn, signOut, onAuthChange, getCurrentUser } from "./auth.js";
import { carregarTurmasPainel, initTurmasUI, initVoltarTurmas } from "./ui.js";
import { getProfessorAtual } from "./api.js";

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
async function initAfterLogin() {
  if (appInitialized) return;
  appInitialized = true;

  initTurmasUI();
  initVoltarTurmas();
  await carregarTurmasPainel();
}

/* --------- Auth UI (não alterada na lógica) --------- */
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
      appInitialized = false;
    });
  }
}

/* --------- Inicialização --------- */
document.addEventListener("DOMContentLoaded", async () => {
  initAuthUI();
  initAppEvents();

  // Observer de auth
  onAuthChange(async (user) => {
    setAppView(!!user);
    if (user) {
      const prof = await getProfessorAtual().catch(() => null);
      const nameEl = document.getElementById("currentTeacherName");
      if (prof && nameEl) {
        nameEl.textContent = prof.nome || user.email;
      }
      await initAfterLogin();
    } else {
      appInitialized = false;
    }
  });

  // Se já estiver logado (refresh)
  const existingUser = await getCurrentUser();
  if (existingUser) {
    setAppView(true);
    const prof = await getProfessorAtual().catch(() => null);
    const nameEl = document.getElementById("currentTeacherName");
    if (prof && nameEl) {
      nameEl.textContent = prof.nome || existingUser.email;
    }
    await initAfterLogin();
  } else {
    setAppView(false);
  }
});