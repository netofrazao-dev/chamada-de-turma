import { signUp, signIn, signOut, onAuthChange, getCurrentUser } from "./auth.js";
import { listarAlunos } from "./api.js";
import {
  initNavigation,
  carregarTurmasUI,
  atualizarTurmaAtual,
  renderizarAlunosChamada,
  renderizarHorariosTurma,
  salvarChamadaETexto,
  copiarTexto,
  enviarWhatsapp,
  atualizarRelatorios,
  initConfigForms,
  removerChamadaDia,
  exportarPdfRelatorio,
  uiState,
  atualizarResumoIndividual,
  carregarMarcacoesParaData,
} from "./ui.js";
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

async function initAfterLogin() {
  await carregarTurmasUI();
  if (uiState.turmas.length === 0) {
    // Sem turmas, mostra apenas configs
    document.querySelector('[data-view="settings"]').click();
  } else {
    await atualizarTurmaAtual(uiState.turmaAtualId);
  }
  await initConfigForms();
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
      authMsg.textContent = "Cadastro realizado. Verifique seu email (se a confirmação estiver ativada).";
      showLogin();
    } catch (err) {
      authMsg.style.color = "#e53935";
      authMsg.textContent = err.message || "Erro ao cadastrar.";
    }
  });
}

/* --------- Eventos do app --------- */
function initAppEvents() {
  const turmaSelect = document.getElementById("turmaSelect");
  const turmaGlobalSelect = document.getElementById("turmaGlobalSelect");
  const turmaRelatorioSelect = document.getElementById("turmaRelatorioSelect");
  const mesRelatorio = document.getElementById("mesRelatorio");
  const alunoRelatorioSelect = document.getElementById("alunoRelatorioSelect");
  const dataChamada = document.getElementById("dataChamada");
  const marcarTodosBtn = document.getElementById("marcarTodosBtn");
  const desmarcarTodosBtn = document.getElementById("desmarcarTodosBtn");
  const gerarWhatsappBtn = document.getElementById("gerarWhatsappBtn");
  const copiarTextoBtn = document.getElementById("copiarTextoBtn");
  const enviarWhatsappBtn = document.getElementById("enviarWhatsappBtn");
  const removerChamadaBtn = document.getElementById("removerChamadaBtn");
  const exportarPdfBtn = document.getElementById("exportarPdfBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  [turmaSelect, turmaGlobalSelect].forEach((sel) => {
    if (!sel) return;
    sel.addEventListener("change", async (e) => {
      await atualizarTurmaAtual(e.target.value);
    });
  });

  if (turmaRelatorioSelect) {
    turmaRelatorioSelect.addEventListener("change", async () => {
      await atualizarRelatorios();
      // atualizar lista de alunos no select individual
      const alunos = await listarAlunos(turmaRelatorioSelect.value);
      alunoRelatorioSelect.innerHTML = "";
      const optPad = document.createElement("option");
      optPad.value = "";
      optPad.textContent = "Selecione um aluno";
      alunoRelatorioSelect.appendChild(optPad);
      alunos.forEach((a) => {
        const opt = document.createElement("option");
        opt.value = a.nome;
        opt.textContent = a.nome;
        alunoRelatorioSelect.appendChild(opt);
      });
    });
  }

  if (mesRelatorio) {
    mesRelatorio.addEventListener("change", atualizarRelatorios);
  }

  if (alunoRelatorioSelect) {
    alunoRelatorioSelect.addEventListener("change", atualizarResumoIndividual);
  }

  if (dataChamada) {
    dataChamada.addEventListener("change", (e) =>
      carregarMarcacoesParaData(e.target.value)
    );
  }

  if (marcarTodosBtn) {
    marcarTodosBtn.addEventListener("click", () => {
      document.querySelectorAll(".aluno-checkbox").forEach((cb) => (cb.checked = true));
    });
  }

  if (desmarcarTodosBtn) {
    desmarcarTodosBtn.addEventListener("click", () => {
      document.querySelectorAll(".aluno-checkbox").forEach((cb) => (cb.checked = false));
    });
  }

  if (gerarWhatsappBtn) {
    gerarWhatsappBtn.addEventListener("click", salvarChamadaETexto);
  }

  if (copiarTextoBtn) {
    copiarTextoBtn.addEventListener("click", copiarTexto);
  }

  if (enviarWhatsappBtn) {
    enviarWhatsappBtn.addEventListener("click", enviarWhatsapp);
  }

  if (removerChamadaBtn) {
    removerChamadaBtn.addEventListener("click", removerChamadaDia);
  }

  if (exportarPdfBtn) {
    exportarPdfBtn.addEventListener("click", exportarPdfRelatorio);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await signOut();
    });
  }
}

/* --------- Inicialização --------- */
document.addEventListener("DOMContentLoaded", async () => {
  initAuthUI();
  initNavigation();
  initAppEvents();

  // Definir data de hoje e mês atual
  const hoje = new Date();
  const dataChamada = document.getElementById("dataChamada");
  const mesRelatorio = document.getElementById("mesRelatorio");
  if (dataChamada) dataChamada.value = hoje.toISOString().split("T")[0];
  if (mesRelatorio) {
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    mesRelatorio.value = `${ano}-${mes}`;
  }

  // Observer de auth
  onAuthChange(async (user) => {
    setAppView(!!user);
    if (user) {
      // nome da professora
      const prof = await getProfessorAtual().catch(() => null);
      const nameEl = document.getElementById("currentTeacherName");
      if (prof && nameEl) {
        nameEl.textContent = prof.nome || user.email;
      }
      await initAfterLogin();
    }
  });

  // Se já estiver logado (refresh)
  const existingUser = await getCurrentUser();
  if (existingUser) {
    setAppView(true);
    const prof = await getProfessorAtual().catch(() => null);
    const nameEl = document.getElementById("currentTeacherName");
    if (prof && nameEl) nameEl.textContent = prof.nome || existingUser.email;
    await initAfterLogin();
  } else {
    setAppView(false);
  }
});