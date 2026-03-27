import {
  listarTurmas,
  listarAlunos,
  listarHorarios,
  criarTurma,
  criarAluno,
  salvarChamada,
  removerChamada,
  listarChamadasMes,
  obterChamadaPorData,
  formatarDataBR,
  excluirTurma,
  removerAluno,
  adminListarProfessores,
} from "./api.js";
import { getCurrentUser } from "./auth.js";

export const uiState = {
  turmas: [],
  turmaAtual: null,       // objeto turma
  alunosTurmaAtual: [],   // array de alunos
  presencas: new Map(),   // alunoId -> true/false

  // controle de admin
  isAdmin: false,
  adminProfessores: [],
  adminProfessorSelecionado: null,
};
  // ⬇️ controle simples de qual "tela" está ativa para evitar race condition
let currentView = null;

const nomesDiasSemana = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

function setStatus(element, msg, erro = false, timeout = 3500) {
  if (!element) return;
  element.textContent = msg;
  element.style.color = erro ? "#e53935" : "#22c55e";
  if (msg && timeout) {
    setTimeout(() => {
      if (element.textContent === msg) element.textContent = "";
    }, timeout);
  }
}

/* ================== Painel de turmas ================== */

export async function carregarTurmasPainel(options = {}) {
  const { professorId } = options;

  // captura a tela onde esse carregamento começou
  const viewId = currentView;

  const todasTurmas = await listarTurmas();
  if (currentView !== viewId) return; // usuário saiu da tela

  uiState.turmas = todasTurmas;

  const grid = document.getElementById("turmasGrid");
  if (!grid) return;
  grid.innerHTML = "";

  // Decide qual professor usar como filtro:
  const effectiveProfessorId =
    professorId ??
    (uiState.isAdmin && uiState.adminProfessorSelecionado
      ? uiState.adminProfessorSelecionado.id
      : null);

  const turmasParaRender = effectiveProfessorId
    ? todasTurmas.filter(
        (t) => String(t.professor_id) === String(effectiveProfessorId)
      )
    : todasTurmas;

  if (!turmasParaRender.length) {
    if (uiState.isAdmin && effectiveProfessorId) {
      grid.innerHTML =
        "<p class='help-text'>Nenhuma turma cadastrada para este professor.</p>";
    } else {
      grid.innerHTML =
        "<p class='help-text'>Nenhuma turma cadastrada ainda.</p>";
    }
    return;
  }

for (const turma of turmasParaRender) {
    if (currentView !== viewId) return; // saiu da tela durante o loop

    const alunos = await listarAlunos(turma.id);
    if (currentView !== viewId) return;

    const horarios = await listarHorarios(turma.id);
    if (currentView !== viewId) return;

    const numAlunos = alunos.length;
    const diasSemanaSet = new Set(horarios.map((h) => h.dia_semana));
    const diasSemanaStr =
      diasSemanaSet.size > 0
        ? Array.from(diasSemanaSet)
            .sort()
            .map((d) => nomesDiasSemana[d])
            .join(", ")
        : "Dias não cadastrados";

    const card = document.createElement("div");
    card.className = "turma-card";
    card.innerHTML = `
      <div class="turma-card-title">${turma.nome}</div>
      <div class="turma-card-meta">${numAlunos} aluno(s)</div>
      <div class="turma-card-dias">${diasSemanaStr}</div>
      <div class="turma-card-actions">
        <button class="btn btn-primary btn-abrir">Abrir</button>
        <button class="btn btn-outline btn-editar">Editar</button>
        <button class="btn btn-outline btn-excluir" style="color:#b91c1c;border-color:#fecaca;">
          Excluir
        </button>
      </div>
    `;

    card.querySelector(".btn-abrir").addEventListener("click", () => {
      abrirTurma(turma.id);
    });

    card.querySelector(".btn-editar").addEventListener("click", () => {
      abrirFormTurmaEdicao(turma);
    });

    card.querySelector(".btn-excluir").addEventListener("click", async () => {
      const ok = confirm(
        `Tem certeza que deseja excluir a turma "${turma.nome}"? Isso também removerá alunos e chamadas associadas.`
      );
      if (!ok) return;
      try {
        await excluirTurma(turma.id);
        await carregarTurmasPainel(); // respeita filtro atual via uiState
      } catch (e) {
        alert(e.message || "Erro ao excluir turma.");
      }
    });

    grid.appendChild(card);
  }
}

/* ================== Admin: professores como "pastas" ================== */

// Lista professores como "pastas" para o admin
export async function carregarProfessoresComoPastas() {
    currentView = "admin-professores";
    const viewId = currentView;

  const grid = document.getElementById("turmasGrid");
  const headerTitle = document.querySelector("#turmas-view h2");
  const headerText = document.querySelector("#turmas-view .help-text");
  const novaTurmaBtn = document.getElementById("novaTurmaBtn");
  const adminVoltarBtn = document.getElementById("adminVoltarProfessoresBtn");

  if (!grid) return;

  // Ajusta textos para visão de professores
  if (headerTitle) headerTitle.textContent = "Professores";
  if (headerText) {
    headerText.textContent =
      "Selecione um professor para ver apenas as turmas dele.";
  }
  if (novaTurmaBtn) novaTurmaBtn.classList.add("hidden");
  if (adminVoltarBtn) adminVoltarBtn.classList.add("hidden");

  grid.innerHTML = "<p class='help-text'>Carregando professores...</p>";

  try {
    const professores = await adminListarProfessores();

    // se o usuário já saiu desta tela, não renderiza mais nada
    if (currentView !== viewId) return;

    uiState.adminProfessores = professores;
    uiState.adminProfessorSelecionado = null;

    grid.innerHTML = "";

    if (!professores.length) {
      grid.innerHTML =
        "<p class='help-text'>Nenhum professor cadastrado.</p>";
      return;
    }

    // Ordena por nome/email
    const ordenados = [...professores].sort((a, b) => {
      const na = (a.nome || a.email || "").toLowerCase();
      const nb = (b.nome || b.email || "").toLowerCase();
      return na.localeCompare(nb, "pt-BR");
    });

    ordenados.forEach((prof) => {
      const card = document.createElement("div");
      card.className = "turma-card professor-card";
      card.innerHTML = `
        <div class="turma-card-title">${prof.nome || prof.email}</div>
        <div class="turma-card-meta">${prof.email || ""}</div>
        <div class="turma-card-dias">
          Clique para ver as turmas deste professor.
        </div>
      `;
      card.addEventListener("click", async () => {
        uiState.adminProfessorSelecionado = prof;
        await carregarTurmasDoProfessor(prof);
      });
      grid.appendChild(card);
    });
  } catch (err) {
    grid.innerHTML = `<p class="status-message" style="color:#e53935;">
      ${err.message || "Erro ao carregar professores (verifique permissões)."}
    </p>`;
  }
}

async function carregarTurmasDoProfessor(prof) {
    currentView = `admin-turmas-prof-${prof.id}`;
  const headerTitle = document.querySelector("#turmas-view h2");
  const headerText = document.querySelector("#turmas-view .help-text");
  const novaTurmaBtn = document.getElementById("novaTurmaBtn");
  const adminVoltarBtn = document.getElementById("adminVoltarProfessoresBtn");

  if (headerTitle) {
    headerTitle.textContent = `Turmas de ${prof.nome || prof.email}`;
  }
  if (headerText) {
    headerText.textContent =
      "Escolha uma turma para gerenciar alunos, chamadas e relatórios.";
  }

  // Admin não cria turmas em nome do professor diretamente aqui
  if (novaTurmaBtn) novaTurmaBtn.classList.add("hidden");
  if (adminVoltarBtn) adminVoltarBtn.classList.remove("hidden");

  await carregarTurmasPainel({ professorId: prof.id });
}

// Voltar da visão de turmas de um professor para a lista de professores
export async function voltarParaProfessoresAdmin() {
  uiState.adminProfessorSelecionado = null;
    currentView = "admin-professores";
  await carregarProfessoresComoPastas();
}

/* ================== Form de turma ================== */

let turmaFormInicializado = false;

export function initTurmasUI() {
  const novaTurmaBtn = document.getElementById("novaTurmaBtn");
  const turmaForm = document.getElementById("turmaForm");
  const cancelarTurmaFormBtn = document.getElementById("cancelarTurmaFormBtn");
  const turmaFormNome = document.getElementById("turmaFormNome");
  const turmaFormId = document.getElementById("turmaFormId");
  const turmaFormStatus = document.getElementById("turmaFormStatus");

  if (turmaFormInicializado) return;
  turmaFormInicializado = true;

  // botão "voltar para professores" (modo admin)
  const adminVoltarBtn = document.getElementById("adminVoltarProfessoresBtn");
  if (adminVoltarBtn && !adminVoltarBtn.dataset.inicializado) {
    adminVoltarBtn.dataset.inicializado = "true";
    adminVoltarBtn.addEventListener("click", async () => {
      if (uiState.isAdmin) {
        await voltarParaProfessoresAdmin();
      }
    });
  }

  function mostrarForm(nova = true, turma = null) {
    turmaForm.classList.remove("hidden");
    turmaFormStatus.textContent = "";
    if (nova) {
      turmaFormId.value = "";
      turmaFormNome.value = "";
      document.getElementById("turmaFormDescricao").value = "";
      turmaFormNome.focus();
    } else if (turma) {
      turmaFormId.value = turma.id;
      turmaFormNome.value = turma.nome;
      document.getElementById("turmaFormDescricao").value =
        turma.descricao || "";
      turmaFormNome.focus();
    }
  }

  function esconderForm() {
    turmaForm.classList.add("hidden");
    turmaFormStatus.textContent = "";
  }

  if (novaTurmaBtn) {
    novaTurmaBtn.addEventListener("click", () => mostrarForm(true));
  }

  if (cancelarTurmaFormBtn) {
    cancelarTurmaFormBtn.addEventListener("click", () => esconderForm());
  }

  if (turmaForm) {
    turmaForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      turmaFormStatus.textContent = "";
      const nome = turmaFormNome.value.trim();
      const desc = document
        .getElementById("turmaFormDescricao")
        .value.trim();
      if (!nome) return;

      turmaForm
        .querySelector("button[type='submit']")
        .setAttribute("disabled", "disabled");

      try {
        if (turmaFormId.value) {
          // edição simples: só nome/descrição
          const turmaId = turmaFormId.value;
          const turma = uiState.turmas.find((t) => t.id === turmaId);
          if (turma) {
            turma.nome = nome;
            turma.descricao = desc;
          }
          const { supabase } = await import("./supabaseClient.js");
          const { error } = await supabase
            .from("turmas")
            .update({ nome, descricao: desc })
            .eq("id", turmaFormId.value);
          if (error) throw error;
        } else {
          await criarTurma({ nome, descricao: desc });
        }

        setStatus(turmaFormStatus, "Turma salva.", false);
        await carregarTurmasPainel();
        esconderForm();
      } catch (err) {
        setStatus(
          turmaFormStatus,
          err.message || "Erro ao salvar turma.",
          true,
          5000
        );
      } finally {
        turmaForm
          .querySelector("button[type='submit']")
          .removeAttribute("disabled");
      }
    });
  }
}

function abrirFormTurmaEdicao(turma) {
  const turmaForm = document.getElementById("turmaForm");
  const turmaFormId = document.getElementById("turmaFormId");
  const turmaFormNome = document.getElementById("turmaFormNome");
  const turmaFormDescricao = document.getElementById("turmaFormDescricao");
  const turmaFormStatus = document.getElementById("turmaFormStatus");
  if (!turmaForm || !turmaFormId || !turmaFormNome) return;

  turmaFormId.value = turma.id;
  turmaFormNome.value = turma.nome;
  if (turmaFormDescricao) turmaFormDescricao.value = turma.descricao || "";
  turmaFormStatus.textContent = "";
  turmaForm.classList.remove("hidden");
}

/* ================== Detalhe da turma ================== */

async function abrirTurma(turmaId) {
  const turma = uiState.turmas.find((t) => t.id === turmaId);
  if (!turma) return;
  uiState.turmaAtual = turma;

    currentView = `turma-detalhe-${turma.id}`;

  uiState.alunosTurmaAtual = await listarAlunos(turmaId);
  uiState.presencas = new Map();

  document.getElementById("turmaDetailNome").textContent = turma.nome;
  document.getElementById("turmaDetailInfo").textContent =
    (turma.descricao || "") +
    (uiState.alunosTurmaAtual.length
      ? ` • ${uiState.alunosTurmaAtual.length} aluno(s)`
      : "");

  document.getElementById("turmas-view").classList.add("hidden");
  document
    .getElementById("turma-detail-view")
    .classList.remove("hidden");

  initTurmaTabs();
  await renderTabAlunos();
}

export function initVoltarTurmas() {
  const btn = document.getElementById("voltarTurmasBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    // voltando para lista de turmas
    currentView =
      uiState.isAdmin && uiState.adminProfessorSelecionado
        ? `admin-turmas-prof-${uiState.adminProfessorSelecionado.id}`
        : "turmas-lista";

    document.getElementById("turmas-view").classList.remove("hidden");
    document
      .getElementById("turma-detail-view")
      .classList.add("hidden");
    uiState.turmaAtual = null;
    uiState.alunosTurmaAtual = [];
    uiState.presencas = new Map();
  });
}

function initTurmaTabs() {
  const tabBtns = document.querySelectorAll(".turma-tab");
  const tabContents = {
    alunos: document.getElementById("tab-alunos"),
    chamada: document.getElementById("tab-chamada"),
    relatorios: document.getElementById("tab-relatorios"),
  };

  tabBtns.forEach((btn) => {
    btn.onclick = async () => {
      const tab = btn.dataset.turmaTab;
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      Object.values(tabContents).forEach((c) => c.classList.add("hidden"));
      tabContents[tab].classList.remove("hidden");

      if (tab === "alunos") await renderTabAlunos();
      if (tab === "chamada") await renderTabChamada();
      if (tab === "relatorios") await renderTabRelatorios();
    };
  });
}

/* ================== Tab ALUNOS ================== */

let novoAlunoFormInicializado = false;

async function renderTabAlunos() {
  const viewId = currentView;

  const lista = document.getElementById("listaAlunosTurma");
  if (!lista || !uiState.turmaAtual) return;

  uiState.alunosTurmaAtual = await listarAlunos(uiState.turmaAtual.id);
  if (currentView !== viewId) return;

  lista.innerHTML = "";

  if (!uiState.alunosTurmaAtual.length) {
    lista.innerHTML = `<li class="help-text">Nenhum aluno cadastrado.</li>`;
  } else {
    uiState.alunosTurmaAtual.forEach((aluno) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span>${aluno.nome}</span>
        <button class="btn btn-outline btn-remover-aluno" data-aluno-id="${aluno.id}">
          Remover
        </button>
      `;
      lista.appendChild(li);
    });

    lista.querySelectorAll(".btn-remover-aluno").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const alunoId = btn.dataset.alunoId;
        const aluno = uiState.alunosTurmaAtual.find((a) => a.id === alunoId);
        if (!aluno) return;
        const ok = confirm(`Remover aluno "${aluno.nome}" da turma?`);
        if (!ok) return;
        try {
          await removerAluno(alunoId);
          await renderTabAlunos();
        } catch (e) {
          alert(e.message || "Erro ao remover aluno.");
        }
      });
    });
  }

  // inicializar form de novo aluno uma vez
  if (!novoAlunoFormInicializado) {
    novoAlunoFormInicializado = true;
    const form = document.getElementById("novoAlunoForm");

    if (form) {
      const newForm = form.cloneNode(true);
      form.parentNode.replaceChild(newForm, form);

      const novoForm = document.getElementById("novoAlunoForm");
      novoForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!uiState.turmaAtual) {
          alert("Nenhuma turma selecionada.");
          return;
        }

        const input = document.getElementById("novoAlunoNome");
        if (!input) {
          alert("Campo de entrada não encontrado.");
          return;
        }

        const nome = input.value.trim();
        if (!nome) {
          alert("Digite o nome do aluno.");
          return;
        }

        try {
          await criarAluno(uiState.turmaAtual.id, nome);
          input.value = "";
          await renderTabAlunos();
        } catch (err) {
          alert(err.message || "Erro ao adicionar aluno.");
        }
      });
    }
  }
}

/* ================== Tab CHAMADA ================== */

async function renderTabChamada() {
  const viewId = currentView;

  const lista = document.getElementById("listaAlunosChamada");
  const dataInput = document.getElementById("dataChamada");
  const salvarBtn = document.getElementById("salvarChamadaBtn");
  const statusEl = document.getElementById("mensagemStatus");

  if (!lista || !uiState.turmaAtual) return;

  if (dataInput && !dataInput.value) {
    const hoje = new Date();
    dataInput.value = hoje.toISOString().split("T")[0];
  }

  uiState.alunosTurmaAtual = await listarAlunos(uiState.turmaAtual.id);
  if (currentView !== viewId) return;

  lista.innerHTML = "";

  if (!uiState.alunosTurmaAtual.length) {
    lista.innerHTML =
      "<p class='help-text'>Cadastre alunos na aba Alunos antes de fazer a chamada.</p>";
    if (salvarBtn) salvarBtn.disabled = true;
    return;
  }
  if (salvarBtn) salvarBtn.disabled = false;

  uiState.presencas = new Map();

  uiState.alunosTurmaAtual.forEach((aluno) => {
    const row = document.createElement("div");
    row.className = "chamada-row";
    row.dataset.alunoId = aluno.id;

    row.innerHTML = `
      <span class="chamada-aluno-nome">${aluno.nome}</span>
      <div class="chamada-buttons">
        <button class="btn-presenca present">Presente</button>
        <button class="btn-presenca absent">Ausente</button>
      </div>
    `;

    const btnPresente = row.querySelector(".btn-presenca.present");
    const btnAusente = row.querySelector(".btn-presenca.absent");

    btnPresente.addEventListener("click", () => {
      uiState.presencas.set(aluno.id, true);
      btnPresente.classList.add("selected");
      btnAusente.classList.remove("selected");
    });

    btnAusente.addEventListener("click", () => {
      uiState.presencas.set(aluno.id, false);
      btnAusente.classList.add("selected");
      btnPresente.classList.remove("selected");
    });

    lista.appendChild(row);
  });

  if (dataInput) {
    await carregarChamadaParaData(dataInput.value);
    dataInput.onchange = async (e) => {
      await carregarChamadaParaData(e.target.value);
    };
  }

  if (salvarBtn && !salvarBtn.dataset.initialized) {
    salvarBtn.dataset.initialized = "true";
    salvarBtn.addEventListener("click", async () => {
      if (!dataInput.value) {
        setStatus(statusEl, "Selecione uma data.", true);
        return;
      }
      try {
        const presentesIds = uiState.alunosTurmaAtual
          .filter((a) => uiState.presencas.get(a.id) === true)
          .map((a) => a.id);
        await salvarChamada(
          uiState.turmaAtual.id,
          dataInput.value,
          presentesIds,
          uiState.alunosTurmaAtual
        );
        setStatus(statusEl, "Chamada salva com sucesso.");
      } catch (err) {
        setStatus(
          statusEl,
          err.message || "Erro ao salvar chamada.",
          true
        );
      }
    });
  }
}

async function carregarChamadaParaData(dataStr) {
  const viewId = currentView;
  if (!uiState.turmaAtual || !dataStr) return;

  const chamada = await obterChamadaPorData(uiState.turmaAtual.id, dataStr);
  if (currentView !== viewId) return;

  uiState.presencas = new Map();
  const rows = document.querySelectorAll(".chamada-row");
  rows.forEach((row) => {
    const alunoId = row.dataset.alunoId;
    const btnP = row.querySelector(".btn-presenca.present");
    const btnA = row.querySelector(".btn-presenca.absent");
    btnP.classList.remove("selected");
    btnA.classList.remove("selected");

    if (!chamada) return;

    const reg = chamada.chamada_presencas?.find(
      (p) => p.aluno_id === alunoId
    );
    if (!reg) return;

    uiState.presencas.set(alunoId, !!reg.presente);
    if (reg.presente) {
      btnP.classList.add("selected");
    } else {
      btnA.classList.add("selected");
    }
  });
}

/* ================== Tab RELATÓRIOS (versão atual, sem correção de faltas) ================== */

async function renderTabRelatorios() {
  if (!uiState.turmaAtual) return;

  const viewId = currentView;

  const mesInput = document.getElementById("mesRelatorio");
  const tbody = document.getElementById("relatorioMensalBody");

  if (mesInput && !mesInput.value) {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    mesInput.value = `${ano}-${mes}`;
  }

  async function atualizarTudo() {
    if (!mesInput.value) return;
    await atualizarTabelaRelatorio(mesInput.value);
    if (currentView !== viewId) return;
    await renderCalendario(mesInput.value);
  }

  if (mesInput && !mesInput.dataset.initialized) {
    mesInput.dataset.initialized = "true";
    mesInput.addEventListener("change", atualizarTudo);
  }

  if (tbody) tbody.innerHTML = "";
  await atualizarTudo();

  const exportarBtn = document.getElementById("exportarPdfBtn");
  if (exportarBtn && !exportarBtn.dataset.initialized) {
    exportarBtn.dataset.initialized = "true";
    exportarBtn.addEventListener("click", exportarPdfRelatorio);
  }
}

async function atualizarTabelaRelatorio(mes) {
  const viewId = currentView;

  const tbody = document.getElementById("relatorioMensalBody");
  if (!tbody || !uiState.turmaAtual) return;
  tbody.innerHTML = "";

  const turmaId = uiState.turmaAtual.id;
  const alunos = await listarAlunos(turmaId);
  if (currentView !== viewId) return;

  const chamadas = await listarChamadasMes(turmaId, mes);
  if (currentView !== viewId) return;

  if (!alunos.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5">Nenhum aluno cadastrado.</td>`;
    tbody.appendChild(tr);
    return;
  }

  alunos.forEach((aluno) => {
    // data de criação do aluno (YYYY-MM-DD)
    const createdDate =
      (aluno.created_at && aluno.created_at.slice(0, 10)) || null;

    const chamadasValidas = createdDate
      ? chamadas.filter((ch) => ch.data >= createdDate)
      : chamadas;

    const totalDiasValidos = chamadasValidas.length;

    if (!totalDiasValidos) {
      // Nenhuma chamada onde esse aluno "existe" -> N/A
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${aluno.nome}</td>
        <td>–</td>
        <td>–</td>
        <td>–</td>
        <td>–</td>
      `;
      tbody.appendChild(tr);
      return;
    }

    let presencas = 0;

    chamadasValidas.forEach((ch) => {
      const reg = ch.chamada_presencas?.find(
        (p) => p.aluno_id === aluno.id
      );
      if (reg?.presente) presencas++;
      // se não houver registro para este aluno nessa chamada válida,
      // consideramos como falta (pois o aluno já existia na data)
    });

    const faltas = totalDiasValidos - presencas;
    const perc =
      totalDiasValidos > 0
        ? ((presencas / totalDiasValidos) * 100).toFixed(1)
        : "0.0";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${aluno.nome}</td>
      <td>${presencas}</td>
      <td>${faltas}</td>
      <td>${totalDiasValidos}</td>
      <td>${perc}%</td>
    `;
    tbody.appendChild(tr);
  });
}

async function renderCalendario(mes) {
  const viewId = currentView;

  const container = document.getElementById("calendarioContainer");
  if (!container || !uiState.turmaAtual) return;

  const turmaId = uiState.turmaAtual.id;

  const [anoStr, mesStr] = mes.split("-");
  const ano = parseInt(anoStr, 10);
  const mesIndex = parseInt(mesStr, 10) - 1;
  const primeiroDia = new Date(ano, mesIndex, 1);
  const diaSemanaPrimeiro = primeiroDia.getDay();
  const totalDiasMes = new Date(ano, mesIndex + 1, 0).getDate();




  
  const chamadas = await listarChamadasMes(turmaId, mes);
  if (currentView !== viewId) return;

  const mapaChamadas = new Map();
  chamadas.forEach((c) => mapaChamadas.set(c.data, c));

  const alunos = await listarAlunos(turmaId);
  if (currentView !== viewId) return;

  const hoje = new Date();
  const dataHoje = `${hoje.getFullYear()}-${String(
    hoje.getMonth() + 1
  ).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

  const diasGrid = document.createElement("div");
  diasGrid.className = "calendar-grid-novo";

  const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  diasSemana.forEach((dia) => {
    const header = document.createElement("div");
    header.className = "calendar-header-day";
    header.textContent = dia;
    diasGrid.appendChild(header);
  });

  // Espaços vazios antes do primeiro dia
  for (let i = 0; i < diaSemanaPrimeiro; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day-empty";
    diasGrid.appendChild(empty);
  }

  for (let diaAtual = 1; diaAtual <= totalDiasMes; diaAtual++) {
    const dataStr = `${ano}-${String(mesIndex + 1).padStart(2, "0")}-${String(
      diaAtual
    ).padStart(2, "0")}`;
    const isHoje = dataStr === dataHoje;

    const dayDiv = document.createElement("div");
    dayDiv.className = "calendar-day-novo";
    if (isHoje) dayDiv.classList.add("calendar-today");

    const registro = mapaChamadas.get(dataStr);

    if (registro) {
      // Só conta alunos que já "existiam" nessa data
      const alunosNoDia = alunos.filter((aluno) => {
        const createdDate =
          (aluno.created_at && aluno.created_at.slice(0, 10)) || "0000-00-00";
        return createdDate <= dataStr;
      });
      const totalAlunosDia = alunosNoDia.length;

      const totalReg = registro.chamada_presencas?.length ?? 0;
      const presentes =
        registro.chamada_presencas?.filter((p) => p.presente).length ?? 0;
      const ausentes = totalReg - presentes;

      let statusClass = "calendar-no-call";
      let statusIcon = "⚠️";
      let statusTitle = "Sem chamada";

      if (totalAlunosDia > 0 && totalReg >= totalAlunosDia) {
        statusClass = "calendar-complete";
        statusIcon = "✓";
        statusTitle = "Chamada completa";
      } else if (totalReg > 0) {
        statusClass = "calendar-partial";
        statusIcon = "◐";
        statusTitle = "Chamada parcial";
      }

      dayDiv.classList.add(statusClass);
      dayDiv.dataset.data = dataStr;
      dayDiv.dataset.presentes = presentes;
      dayDiv.dataset.ausentes = ausentes;
      dayDiv.dataset.total = totalAlunosDia;
      dayDiv.dataset.temChamada = "true";
      dayDiv.title = statusTitle;

      dayDiv.innerHTML = `
        <div class="calendar-day-number-novo">${diaAtual}</div>
        <div class="calendar-day-status">${statusIcon}</div>
        <div class="calendar-has-call-indicator"></div>
      `;

      dayDiv.addEventListener("click", () => {
        mostrarDetalhesCalendario(
          dataStr,
          presentes,
          ausentes,
          totalAlunosDia,
          statusTitle,
          mes
        );
      });

      dayDiv.style.cursor = "pointer";
    } else {
      dayDiv.classList.add("calendar-no-class");
      dayDiv.innerHTML = `<div class="calendar-day-number-novo">${diaAtual}</div>`;
      dayDiv.title = "Sem chamada registrada";
    }

    diasGrid.appendChild(dayDiv);
  }

  // Legenda permanece a mesma
  const legenda = document.createElement("div");
  legenda.className = "calendar-legend-novo";
  legenda.innerHTML = `
    <div class="legend-title">Legenda</div>
    <div class="legend-items">
      <div class="legend-item">
        <div class="legend-color calendar-complete">✓</div>
        <span>Chamada Completa</span>
      </div>
      <div class="legend-item">
        <div class="legend-color calendar-partial">◐</div>
        <span>Chamada Parcial</span>
      </div>
      <div class="legend-item">
        <div class="legend-color calendar-no-call">⚠️</div>
        <span>Sem Chamada</span>
      </div>
      <div class="legend-item">
        <div class="legend-color calendar-no-class"></div>
        <span>Sem Aula</span>
      </div>
    </div>
  `;

  container.innerHTML = "";
  container.appendChild(diasGrid);
  container.appendChild(legenda);
}

async function mostrarDetalhesCalendario(
  data,
  presentes,
  ausentes,
  total,
  status,
  mesAtual
) {
  const modal = document.getElementById("calendarDetailModal");
  if (!modal) return;

  const percentual =
    total > 0 ? ((presentes / total) * 100).toFixed(1) : "0.0";
  const dataFormatada = new Date(data + "T00:00:00").toLocaleDateString(
    "pt-BR",
    {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );

  const chamada = await obterChamadaPorData(uiState.turmaAtual.id, data);
  const temChamada = !!chamada;

  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>Detalhes da Chamada</h3>
        <button class="modal-close" onclick="this.closest('.modal').classList.add('hidden')">✕</button>
      </div>
      <div class="modal-body">
        <div class="detail-row">
          <span class="detail-label">Data:</span>
          <span class="detail-value">${dataFormatada}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Status:</span>
          <span class="detail-value detail-status">${status}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Presentes:</span>
          <span class="detail-value detail-present">${presentes}/${total}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Ausentes:</span>
          <span class="detail-value detail-absent">${ausentes}/${total}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Frequência:</span>
          <span class="detail-value detail-percent">${percentual}%</span>
        </div>
        <div class="detail-progress">
          <div class="progress-bar" style="width: ${percentual}%"></div>
        </div>
        ${
          temChamada
            ? `
          <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #e5e7eb;">
            <button id="btnRemoverChamada" class="btn btn-outline" style="width: 100%; color: #b91c1c; border-color: #fecaca;">
              🗑️ Remover Chamada
            </button>
          </div>
        `
            : ""
        }
      </div>
    </div>
  `;

  modal.classList.remove("hidden");

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  if (temChamada) {
    const btnRemover = document.getElementById("btnRemoverChamada");
    if (btnRemover) {
      btnRemover.addEventListener("click", async () => {
        const confirmar = confirm(
          `Tem certeza que deseja remover a chamada de ${dataFormatada}? Esta ação não pode ser desfeita.`
        );
        if (!confirmar) return;

        try {
          await removerChamada(uiState.turmaAtual.id, data);
          modal.classList.add("hidden");
          await renderCalendario(mesAtual);
          alert("Chamada removida com sucesso!");
        } catch (err) {
          alert(err.message || "Erro ao remover chamada.");
        }
      });
    }
  }
}

/* ================== Exportar PDF ================== */

async function exportarPdfRelatorio() {
  if (!uiState.turmaAtual) return;
  const turma = uiState.turmaAtual;
  const mes = document.getElementById("mesRelatorio")?.value;
  if (!mes) return;

  const user = await getCurrentUser();
  const nomeProfessor = user?.user_metadata?.nome || "Professor";

  const [anoStr, mesNumStr] = mes.split("-");
  const ano = parseInt(anoStr, 10);
  const mesIndex = parseInt(mesNumStr, 10) - 1;
  const tituloMes = `${mesNumStr}/${ano}`;

  const alunos = await listarAlunos(turma.id);
  const chamadasDoMes = await listarChamadasMes(turma.id, mes);

  const totalDiasMes = new Date(ano, mesIndex + 1, 0).getDate();
  const nomesDiasSemanaCurto = [
    "Dom",
    "Seg",
    "Ter",
    "Qua",
    "Qui",
    "Sex",
    "Sab",
  ];

  let detalhesDiariosHtml = "";
  for (let diaAtual = 1; diaAtual <= totalDiasMes; diaAtual++) {
    const dataStr = `${anoStr}-${String(mesIndex + 1).padStart(
      2,
      "0"
    )}-${String(diaAtual).padStart(2, "0")}`;
    const dataObj = new Date(ano, mesIndex, diaAtual);
    const diaSemanaNome = nomesDiasSemanaCurto[dataObj.getDay()];

    const chamadaDoDia = chamadasDoMes.find((c) => c.data === dataStr);

    if (chamadaDoDia) {
      detalhesDiariosHtml += `
        <div class="dia-detalhe">
          <h3>Dia ${diaAtual} (${diaSemanaNome})</h3>
          <ul>
      `;
alunos.forEach((aluno) => {
  const createdDate =
    (aluno.created_at && aluno.created_at.slice(0, 10)) || null;

  let status = "N/A";

  if (!createdDate || dataStr >= createdDate) {
    const presenca = chamadaDoDia.chamada_presencas.find(
      (p) => p.aluno_id === aluno.id
    );
    if (!presenca) {
      status = "N/A";
    } else {
      status = presenca.presente ? "Presente" : "Ausente";
    }
  }

  detalhesDiariosHtml += `<li>Aluno ${aluno.nome}: ${status}</li>`;
});
      detalhesDiariosHtml += `</ul></div>`;
    }
  }

  const tbodyHtml =
    document.getElementById("relatorioMensalBody")?.innerHTML ?? "";

  const win = window.open("", "_blank");
  if (!win) return;

  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório de Frequência - ${turma.nome} - ${tituloMes}</title>
<style>
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    margin: 20px;
    color: #333;
  }
  h1 { font-size: 18px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin-bottom: 12px; }
  h3 { font-size: 14px; margin-top: 15px; margin-bottom: 5px; color: #555; }
  .meta { font-size: 12px; margin-bottom: 16px; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin-bottom: 20px;
  }
  th, td {
    border: 1px solid #ddd;
    padding: 6px 4px;
    text-align: left;
  }
  th { background-color: #f5f5f5; }
  .dia-detalhe ul { list-style: none; padding: 0; margin: 0; }
  .dia-detalhe li { font-size: 11px; margin-bottom: 2px; }
</style>
</head>
<body>
  <h1><br>Professor(a): ${nomeProfessor}</h1>
  <h2>Relatório de Frequência Mensal</h2>
  <div class="meta">
    <div><strong>Turma:</strong> ${turma.nome}</div>
    <div><strong>Mês:</strong> ${tituloMes}</div>
  </div>
  
  <h3>Resumo Mensal</h3>
  <table>
    <thead>
      <tr>
        <th>Aluno</th>
        <th>Presenças</th>
        <th>Faltas</th>
        <th>Total de Aulas</th>
        <th>% Frequência</th>
      </tr>
    </thead>
    <tbody>
      ${tbodyHtml}
    </tbody>
  </table>

  <h3>Detalhes Diários</h3>
  <div class="detalhes-diarios">
    ${detalhesDiariosHtml}
  </div>

  <script>
    window.onload = function() { window.print(); };
  <\/script>
</body>
</html>`);
  win.document.close();
}

/* ================== Perfil atual (admin x professor) ================== */

export function setPerfilAtual({ isAdmin }) {
  uiState.isAdmin = !!isAdmin;
}