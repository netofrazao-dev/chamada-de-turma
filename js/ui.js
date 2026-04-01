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
  atualizarAlunoNome,
} from "./api.js";
import { getCurrentUser } from "./auth.js";

export const uiState = {
  turmas: [],
  turmaAtual: null,
  alunosTurmaAtual: [],
  presencas: new Map(),
  isAdmin: false,
  adminProfessores: [],
  adminProfessorSelecionado: null,
  todosProfessores: [], // cache de todos os professores
};

// Helper: nome do professor pelo ID
function getNomeProfessor(professorId, lista) {
  if (!professorId || !lista?.length) return null;
  const p = lista.find((x) => String(x.id) === String(professorId));
  return p ? (p.nome || p.email) : null;
}

// Helper: garante que a lista de professores está carregada no cache
async function ensureProfessoresCarregados() {
  if (!uiState.todosProfessores.length) {
    try {
      uiState.todosProfessores = await adminListarProfessores();
    } catch {
      uiState.todosProfessores = [];
    }
  }
}

// controle simples de qual "tela" está ativa para evitar race condition
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
  const cancelarTurmaFormBtn = document.getElementById(
    "cancelarTurmaFormBtn"
  );
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
        <div style="display:flex; gap:0.4rem;">
          <button class="btn btn-outline btn-editar-aluno" data-aluno-id="${aluno.id}">
            Editar
          </button>
          <button class="btn btn-outline btn-remover-aluno" data-aluno-id="${aluno.id}">
            Remover
          </button>
        </div>
      `;
      lista.appendChild(li);
    });

    // Remover aluno
    lista.querySelectorAll(".btn-remover-aluno").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const alunoId = btn.dataset.alunoId;
        const aluno = uiState.alunosTurmaAtual.find(
          (a) => String(a.id) === String(alunoId)
        );
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

    // Editar nome do aluno
    lista.querySelectorAll(".btn-editar-aluno").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const alunoId = btn.dataset.alunoId;
        const aluno = uiState.alunosTurmaAtual.find(
          (a) => String(a.id) === String(alunoId)
        );
        if (!aluno) return;

        const novoNome = prompt("Editar nome do aluno:", aluno.nome);
        if (novoNome === null) return; // cancelou
        const nomeLimpo = novoNome.trim();
        if (!nomeLimpo) {
          alert("O nome não pode ser vazio.");
          return;
        }

        try {
          await atualizarAlunoNome(alunoId, nomeLimpo);
          alert("Nome atualizado com sucesso.");
          await renderTabAlunos();
        } catch (e) {
          alert(e.message || "Erro ao atualizar nome do aluno.");
        }
      });
    });
  }

  // inicializar form de novo aluno uma vez
  if (!novoAlunoFormInicializado) {
    novoAlunoFormInicializado = true;
    const form = document.getElementById("novoAlunoForm");

    if (form) {
      // evita múltiplos listeners
      const newForm = form.cloneNode(true);
      form.parentNode.replaceChild(newForm, form);

      const novoForm = document.getElementById("novoAlunoForm");
      const inputNome = document.getElementById("novoAlunoNome");
      const inputDataEntrada = document.getElementById("novoAlunoDataEntrada");

      // valor padrão da data de entrada = hoje
      if (inputDataEntrada && !inputDataEntrada.value) {
        inputDataEntrada.value = new Date().toISOString().slice(0, 10);
      }

      novoForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!uiState.turmaAtual) {
          alert("Nenhuma turma selecionada.");
          return;
        }

        if (!inputNome || !inputDataEntrada) {
          alert("Campos do formulário não encontrados.");
          return;
        }

        const nome = inputNome.value.trim();
        const dataEntrada = inputDataEntrada.value;

        if (!nome) {
          alert("Digite o nome do aluno.");
          return;
        }
        if (!dataEntrada) {
          alert("Informe a data de entrada na turma.");
          return;
        }

        try {
          await criarAluno(uiState.turmaAtual.id, nome, dataEntrada);
          inputNome.value = "";
          // mantém a data de entrada, ou você pode resetar para hoje se quiser
          await renderTabAlunos();
        } catch (err) {
          alert(err.message || "Erro ao adicionar aluno.");
        }
      });
    }
  } else {
    // garantir que o campo de data tenha valor padrão quando voltar para a aba
    const inputDataEntrada = document.getElementById("novoAlunoDataEntrada");
    if (inputDataEntrada && !inputDataEntrada.value) {
      inputDataEntrada.value = new Date().toISOString().slice(0, 10);
    }
  }
}

/* ============ Seção "Aula ministrada / substituto" ============ */

function atualizarInfoHoras(foiMinistrada, substitutoId, nomeManual) {
  const el = document.getElementById("horasInfo");
  if (!el) return;
  el.className = "help-text ministrada-info";

  if (foiMinistrada) {
    el.classList.add("ministrada-info--ok");
    el.textContent = "✓ Esta aula valerá 1.5h para você.";
  } else if (substitutoId) {
    el.classList.add("ministrada-info--warn");
    el.textContent =
      "⚠ Você não ministrou. As 1.5h vão para o professor substituto do sistema.";
  } else if (nomeManual) {
    el.classList.add("ministrada-info--warn");
    el.textContent = `⚠ Aula ministrada por "${nomeManual}" (externo). Não contabilizada no sistema.`;
  } else {
    el.classList.add("ministrada-info--err");
    el.textContent =
      "✗ Aula não realizada. Nenhuma hora será contabilizada.";
  }
}

async function initMinistradaSection() {
  const lista = document.getElementById("listaAlunosChamada");
  if (!lista) return;

  // Remove se já existir (para não duplicar ao trocar a data)
  document.getElementById("aula-ministrada-section")?.remove();
  await ensureProfessoresCarregados();

  const section = document.createElement("div");
  section.id = "aula-ministrada-section";
  section.className = "aula-ministrada-section";
  section.innerHTML = `
    <label class="ministrada-label">
      <input type="checkbox" id="foiMinistradaCheck" checked>
      <span>Eu ministrei esta aula</span>
    </label>
    <div id="substitutoContainer" class="hidden" style="margin-top:0.6rem;">
      <div class="field-group">
        <label for="professorSubstitutoSelect">Professor substituto</label>
        <select id="professorSubstitutoSelect">
          <option value="">Nenhum (aula não aconteceu)</option>
          ${uiState.todosProfessores
            .map(
              (p) =>
                `<option value="${p.id}">${p.nome || p.email}</option>`
            )
            .join("")}
          <option value="outro">Outro (qual?)</option>
        </select>
      </div>
      <div id="substitutoNomeManualContainer" class="hidden" style="margin-top:0.5rem;">
        <div class="field-group">
          <label for="substitutoNomeManualInput">Nome do substituto externo</label>
          <input type="text" id="substitutoNomeManualInput" placeholder="Nome completo do professor substituto">
        </div>
      </div>
    </div>
    <p id="horasInfo" class="help-text ministrada-info ministrada-info--ok">
      ✓ Esta aula valerá 1.5h para você.
    </p>
  `;

  lista.parentNode.insertBefore(section, lista);

  const check = section.querySelector("#foiMinistradaCheck");
  const subCont = section.querySelector("#substitutoContainer");
  const subSel = section.querySelector("#professorSubstitutoSelect");
  const nomeManualCont = section.querySelector(
    "#substitutoNomeManualContainer"
  );
  const nomeManualInp = section.querySelector("#substitutoNomeManualInput");

  const sync = () => {
    const isOutro = subSel.value === "outro";
    nomeManualCont.classList.toggle("hidden", !isOutro);
    if (!isOutro) nomeManualInp.value = "";
    atualizarInfoHoras(
      check.checked,
      !check.checked && !isOutro ? subSel.value || null : null,
      !check.checked && isOutro
        ? nomeManualInp.value.trim() || null
        : null
    );
  };

  check.addEventListener("change", () => {
    subCont.classList.toggle("hidden", check.checked);
    if (check.checked) {
      nomeManualCont.classList.add("hidden");
      nomeManualInp.value = "";
      subSel.value = "";
    }
    sync();
  });
  subSel.addEventListener("change", sync);
  nomeManualInp.addEventListener("input", sync);
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
    dataInput.value = new Date().toISOString().split("T")[0];
  }

  uiState.alunosTurmaAtual = await listarAlunos(uiState.turmaAtual.id);
  if (currentView !== viewId) return;

  lista.innerHTML = "";

  // Seção "Ministrada?"
  await initMinistradaSection();

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

        const foiMinistradaCheck =
          document.getElementById("foiMinistradaCheck");
        const professorSubstitutoSelect = document.getElementById(
          "professorSubstitutoSelect"
        );
        const substitutoNomeManualInput = document.getElementById(
          "substitutoNomeManualInput"
        );

        const foiMinistrada = foiMinistradaCheck
          ? foiMinistradaCheck.checked
          : true;
        let professorSubstitutoId = null;
        let substitutoNomeManual = null;

        if (!foiMinistrada && professorSubstitutoSelect) {
          const val = professorSubstitutoSelect.value;
          if (val === "outro") {
            substitutoNomeManual =
              substitutoNomeManualInput?.value.trim() || null;
          } else if (val) {
            professorSubstitutoId = val;
          }
        }

        await salvarChamada(
          uiState.turmaAtual.id,
          dataInput.value,
          presentesIds,
          uiState.alunosTurmaAtual,
          { foiMinistrada, professorSubstitutoId, substitutoNomeManual }
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

  const foiMinistradaCheck = document.getElementById("foiMinistradaCheck");
  const subContainer = document.getElementById("substitutoContainer");
  const professorSubstitutoSelect = document.getElementById(
    "professorSubstitutoSelect"
  );
  const nomeManualContainer = document.getElementById(
    "substitutoNomeManualContainer"
  );
  const nomeManualInput = document.getElementById(
    "substitutoNomeManualInput"
  );

  if (foiMinistradaCheck) {
    const foiMinistrada = chamada
      ? chamada.foi_ministrada !== false
      : true;
    foiMinistradaCheck.checked = foiMinistrada;

    if (!foiMinistrada) {
      subContainer?.classList.remove("hidden");
      if (chamada?.substituto_nome_manual) {
        if (professorSubstitutoSelect)
          professorSubstitutoSelect.value = "outro";
        nomeManualContainer?.classList.remove("hidden");
        if (nomeManualInput)
          nomeManualInput.value = chamada.substituto_nome_manual;
      } else if (chamada?.professor_substituto_id) {
        if (professorSubstitutoSelect)
          professorSubstitutoSelect.value =
            chamada.professor_substituto_id;
        nomeManualContainer?.classList.add("hidden");
        if (nomeManualInput) nomeManualInput.value = "";
      } else {
        if (professorSubstitutoSelect)
          professorSubstitutoSelect.value = "";
        nomeManualContainer?.classList.add("hidden");
        if (nomeManualInput) nomeManualInput.value = "";
      }
    } else {
      subContainer?.classList.add("hidden");
      nomeManualContainer?.classList.add("hidden");
      if (professorSubstitutoSelect) professorSubstitutoSelect.value = "";
      if (nomeManualInput) nomeManualInput.value = "";
    }

    atualizarInfoHoras(
      foiMinistrada,
      chamada?.professor_substituto_id || null,
      chamada?.substituto_nome_manual || null
    );
  }

  // Presenças (lógica original)
  uiState.presencas = new Map();
  document.querySelectorAll(".chamada-row").forEach((row) => {
    const alunoId = row.dataset.alunoId;
    const btnP = row.querySelector(".btn-presenca.present");
    const btnA = row.querySelector(".btn-presenca.absent");
    if (!btnP || !btnA) return;
    btnP.classList.remove("selected");
    btnA.classList.remove("selected");
    if (!chamada) return;
    const reg = chamada.chamada_presencas?.find(
      (p) => String(p.aluno_id) === String(alunoId)
    );
    if (!reg) return;
    uiState.presencas.set(alunoId, !!reg.presente);
    if (reg.presente) btnP.classList.add("selected");
    else btnA.classList.add("selected");
  });
}

/* ================== Tab RELATÓRIOS ================== */

async function renderTabRelatorios() {
  if (!uiState.turmaAtual) return;
  const viewId = currentView;

  await ensureProfessoresCarregados();

  const mesInput = document.getElementById("mesRelatorio");
  if (mesInput && !mesInput.value) {
    const hoje = new Date();
    mesInput.value = `${hoje.getFullYear()}-${String(
      hoje.getMonth() + 1
    ).padStart(2, "0")}`;
  }

  async function atualizarTudo() {
    if (!mesInput.value) return;
    document.getElementById("resumo-mes-card")?.remove();
    await renderResumoMes(mesInput.value);
    if (currentView !== viewId) return;
    await atualizarTabelaRelatorio(mesInput.value);
    if (currentView !== viewId) return;
    await renderCalendario(mesInput.value);
  }

  if (mesInput && !mesInput.dataset.initialized) {
    mesInput.dataset.initialized = "true";
    mesInput.addEventListener("change", atualizarTudo);
  }

  const tbody = document.getElementById("relatorioMensalBody");
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
    // data de entrada do aluno na turma (YYYY-MM-DD)
    const dataEntrada = aluno.data_entrada || null;

    // considera apenas chamadas a partir da data de entrada
    const chamadasValidas = dataEntrada
      ? chamadas.filter((ch) => ch.data >= dataEntrada)
      : chamadas;

    const totalDiasValidos = chamadasValidas.length;

    if (!totalDiasValidos) {
      // Nenhuma chamada em que esse aluno "está na turma" -> N/A
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
        (p) => String(p.aluno_id) === String(aluno.id)
      );
      if (reg?.presente) presencas++;
      // se não houver registro para este aluno nessa chamada válida,
      // consideramos como falta (aluno estava na turma e a chamada foi feita)
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

  ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].forEach((dia) => {
    const h = document.createElement("div");
    h.className = "calendar-header-day";
    h.textContent = dia;
    diasGrid.appendChild(h);
  });

  for (let i = 0; i < diaSemanaPrimeiro; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day-empty";
    diasGrid.appendChild(empty);
  }

  for (let diaAtual = 1; diaAtual <= totalDiasMes; diaAtual++) {
    const dataStr = `${ano}-${String(mesIndex + 1).padStart(
      2,
      "0"
    )}-${String(diaAtual).padStart(2, "0")}`;
    const dayDiv = document.createElement("div");
    dayDiv.className = "calendar-day-novo";
    if (dataStr === dataHoje) dayDiv.classList.add("calendar-today");

    const registro = mapaChamadas.get(dataStr);

    if (registro) {
      const foiMinistrada = registro.foi_ministrada !== false;
      const temSubstSistema =
        !foiMinistrada && !!registro.professor_substituto_id;
      const temSubstManual =
        !foiMinistrada && !!registro.substituto_nome_manual;
      const temSubstituto = temSubstSistema || temSubstManual;
      const aulaCancelada = !foiMinistrada && !temSubstituto;

      let statusClass, statusIcon, statusTitle;

      if (aulaCancelada) {
        statusClass = "calendar-cancelled";
        statusIcon = "✗";
        statusTitle = "Aula não realizada";
      } else if (!foiMinistrada && temSubstituto) {
        statusClass = "calendar-substituted";
        statusIcon = "🔄";
        const nomeSubst = registro.substituto_nome_manual
          ? `${registro.substituto_nome_manual} (externo)`
          : getNomeProfessor(
              registro.professor_substituto_id,
              uiState.todosProfessores
            ) || "Professor substituto";
        statusTitle = `Substituição: ${nomeSubst}`;
      } else {
        // Aula normal → lógica de presença
        const alunosNoDia = alunos.filter(
          (a) => (a.data_entrada || "0000-00-00") <= dataStr
        );
        const idsNoDia = new Set(alunosNoDia.map((a) => a.id));
        const totalAlunos = alunosNoDia.length;
        const presValidas = (registro.chamada_presencas || []).filter((p) =>
          idsNoDia.has(p.aluno_id)
        );
        const presentes = presValidas.filter((p) => p.presente).length;
        const ausentes = presValidas.length - presentes;

        dayDiv.dataset.presentes = presentes;
        dayDiv.dataset.ausentes = ausentes;
        dayDiv.dataset.total = totalAlunos;

        if (totalAlunos === 0) {
          statusClass = "calendar-no-class";
          statusIcon = "";
          statusTitle = "Sem alunos nesta data.";
        } else if (presValidas.length === 0) {
          statusClass = "calendar-no-call";
          statusIcon = "⚠️";
          statusTitle = "Sem chamada";
        } else if (presValidas.length >= totalAlunos) {
          statusClass = "calendar-complete";
          statusIcon = "✓";
          statusTitle = "Chamada completa";
        } else {
          statusClass = "calendar-partial";
          statusIcon = "◐";
          statusTitle = "Chamada parcial";
        }
      }

      dayDiv.classList.add(statusClass);
      dayDiv.dataset.data = dataStr;
      dayDiv.dataset.temChamada = "true";
      dayDiv.title = statusTitle;
      dayDiv.innerHTML = `
        <div class="calendar-day-number-novo">${diaAtual}</div>
        <div class="calendar-day-status">${statusIcon}</div>
        ${
          statusIcon
            ? '<div class="calendar-has-call-indicator"></div>'
            : ""
        }
      `;
      dayDiv.style.cursor = "pointer";
      dayDiv.addEventListener("click", () =>
        mostrarDetalhesCalendario(dataStr, mes)
      );
    } else {
      dayDiv.classList.add("calendar-no-class");
      dayDiv.innerHTML = `<div class="calendar-day-number-novo">${diaAtual}</div>`;
      dayDiv.title = "Sem chamada registrada";
    }

    diasGrid.appendChild(dayDiv);
  }

  const legenda = document.createElement("div");
  legenda.className = "calendar-legend-novo";
  legenda.innerHTML = `
    <div class="legend-title">Legenda</div>
    <div class="legend-items">
      <div class="legend-item"><div class="legend-color calendar-complete">✓</div><span>Chamada Completa</span></div>
      <div class="legend-item"><div class="legend-color calendar-partial">◐</div><span>Chamada Parcial</span></div>
      <div class="legend-item"><div class="legend-color calendar-no-call">⚠️</div><span>Sem Chamada</span></div>
      <div class="legend-item"><div class="legend-color calendar-substituted">🔄</div><span>Substituição</span></div>
      <div class="legend-item"><div class="legend-color calendar-cancelled">✗</div><span>Não Realizada</span></div>
      <div class="legend-item"><div class="legend-color calendar-no-class"></div><span>Sem Aula</span></div>
    </div>
  `;

  container.innerHTML = "";
  container.appendChild(diasGrid);
  container.appendChild(legenda);
}

async function mostrarDetalhesCalendario(data, mesAtual) {
  const modal = document.getElementById("calendarDetailModal");
  if (!modal || !uiState.turmaAtual) return;

  // Busca chamada e alunos
  const [chamada, alunos] = await Promise.all([
    obterChamadaPorData(uiState.turmaAtual.id, data),
    listarAlunos(uiState.turmaAtual.id),
  ]);

  // Se não tiver chamada, exibe mensagem amigável
  if (!chamada) {
    const dataFormatadaSem = new Date(
      data + "T00:00:00"
    ).toLocaleDateString("pt-BR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Detalhes da Chamada</h3>
          <button class="modal-close" onclick="this.closest('.modal').classList.add('hidden')">✕</button>
        </div>
        <div class="modal-body">
          <p>Não há chamada registrada para <strong>${dataFormatadaSem}</strong>.</p>
        </div>
      </div>
    `;
    modal.classList.remove("hidden");
    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    };
    return;
  }

  // Informações de substituição / status da aula
  const foiMinistrada = chamada.foi_ministrada !== false;
  let substituicaoInfoHtml = "";
  let statusAulaHtml = "";

  if (foiMinistrada) {
    statusAulaHtml =
      '<span style="color:#22c55e;">✓ Ministrada pelo professor da turma</span>';
  } else if (
    chamada.professor_substituto_id ||
    chamada.substituto_nome_manual
  ) {
    const nomeSubst = chamada.substituto_nome_manual
      ? `${chamada.substituto_nome_manual} (externo)`
      : getNomeProfessor(
          chamada.professor_substituto_id,
          uiState.todosProfessores
        ) || "Professor do sistema";
    statusAulaHtml = `<span style="color:#6d28d9;">🔄 Substituição por ${nomeSubst}</span>`;
    substituicaoInfoHtml = `
      <div class="detail-row">
        <span class="detail-label">Substituto:</span>
        <span class="detail-value" style="color:#6d28d9;">${nomeSubst}</span>
      </div>
    `;
  } else {
    statusAulaHtml =
      '<span style="color:#ef4444;">✗ Aula não realizada</span>';
  }

  const presencas = chamada.chamada_presencas || [];
  const presencaMap = new Map(
    presencas.map((p) => [String(p.aluno_id), p.presente])
  );

  let totalAlunosTurma = alunos.length;
  let totalConsideradosNoDia = 0;
  let presentes = 0;
  let ausentes = 0;
  let naoAplicaveis = 0;
  let pendentes = 0;

  let linhasAlunosHtml = "";

  alunos.forEach((aluno) => {
    const alunoIdStr = String(aluno.id);
    const dataEntrada = aluno.data_entrada || null;
    const alunoNaData =
      !dataEntrada || // sem data_entrada => considera desde sempre
      dataEntrada <= data; // entrou na turma em ou antes da data da chamada

    let statusTexto = "";
    let statusClasse = "";

    if (!alunoNaData) {
      // Não aplicável (entrou depois da data da chamada)
      statusTexto = "Ainda não era aluno nesse momento";
      statusClasse = "status-na";
      naoAplicaveis++;
    } else {
      totalConsideradosNoDia++;

      if (!presencaMap.has(alunoIdStr)) {
        // Chamada não registrada para esse aluno (pendente)
        statusTexto = "Pendente";
        statusClasse = "status-pendente";
        pendentes++;
      } else {
        const presente = !!presencaMap.get(alunoIdStr);
        if (presente) {
          statusTexto = "Presente";
          statusClasse = "status-presente";
          presentes++;
        } else {
          statusTexto = "Ausente";
          statusClasse = "status-ausente";
          ausentes++;
        }
      }
    }

    linhasAlunosHtml += `
      <tr>
        <td>${aluno.nome}</td>
        <td><span class="badge-status ${statusClasse}">${statusTexto}</span></td>
      </tr>
    `;
  });

  // Define status geral da chamada
  let statusChamada = "";
  let textoExplicacao = "";

  if (pendentes > 0) {
    statusChamada = "Chamada parcial";
    textoExplicacao = `Existem ${pendentes} aluno(s) sem presença registrada (pendentes). Alguns alunos ainda não foram marcados como presentes ou ausentes.`;
  } else {
    statusChamada = "Chamada completa";
    textoExplicacao =
      "Todos os alunos considerados para esta data têm presença registrada como presente ou ausente.";
  }

  const percentual =
    totalConsideradosNoDia > 0
      ? ((presentes / totalConsideradosNoDia) * 100).toFixed(1)
      : "0.0";

  const dataFormatada = new Date(
    data + "T00:00:00"
  ).toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

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
          <span class="detail-label">Turma:</span>
          <span class="detail-value">${uiState.turmaAtual.nome}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Status da aula:</span>
          <span class="detail-value">${statusAulaHtml}</span>
        </div>
        ${substituicaoInfoHtml}
        <div class="detail-row">
          <span class="detail-label">Status da chamada:</span>
          <span class="detail-value detail-status">${statusChamada}</span>
        </div>

        <div class="chamada-detalhe-resumo">
          <div><strong>Total de alunos (turma):</strong> ${totalAlunosTurma}</div>
          <div><strong>Considerados nesta data:</strong> ${totalConsideradosNoDia}</div>
          <div class="resumo-linha">
            <span class="badge-status status-presente">Presentes: ${presentes}</span>
            <span class="badge-status status-ausente">Ausentes: ${ausentes}</span>
          </div>
          <div class="resumo-linha">
            <span class="badge-status status-na">N/A: ${naoAplicaveis}</span>
            <span class="badge-status status-pendente">Pendentes: ${pendentes}</span>
          </div>
          <div class="detail-progress">
            <div class="progress-bar" style="width: ${percentual}%"></div>
          </div>
          <div class="detail-row" style="border-bottom:none; padding-top:0.5rem;">
            <span class="detail-label">Frequência:</span>
            <span class="detail-value detail-percent">${percentual}%</span>
          </div>
        </div>

        <div class="chamada-detalhe-explicacao">
          ${textoExplicacao}
        </div>

        <h4 style="margin-top:1rem; margin-bottom:0.5rem;">Alunos e status</h4>
        <div class="chamada-detalhe-lista-wrapper">
          <table class="chamada-detalhe-tabela">
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${linhasAlunosHtml}
            </tbody>
          </table>
        </div>

        <div style="margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid #e5e7eb;">
          <button id="btnRemoverChamada" class="btn btn-outline" style="width: 100%; color: #b91c1c; border-color: #fecaca;">
            🗑️ Remover Chamada
          </button>
        </div>
      </div>
    </div>
  `;

  modal.classList.remove("hidden");

  // Fechar clicando fora
  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  };

  // Remoção de chamada
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
        const dataEntrada = aluno.data_entrada || null;

        let status = "Ainda não era aluno nesse momento";

        // só considera a partir da data de entrada na turma
        if (!dataEntrada || dataStr >= dataEntrada) {
          const presenca = chamadaDoDia.chamada_presencas.find(
            (p) => String(p.aluno_id) === String(aluno.id)
          );
          if (!presenca) {
            status = "Ainda não era aluno nesse momento";
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

/* ============ Resumo mensal por turma (relatórios) ============ */

async function renderResumoMes(mes) {
  const viewId = currentView;
  if (!uiState.turmaAtual) return;

  document.getElementById("resumo-mes-card")?.remove();

  const chamadas = await listarChamadasMes(uiState.turmaAtual.id, mes);
  if (currentView !== viewId) return;

  const totalAulas = chamadas.length;
  const aulasMinistradas = chamadas.filter(
    (c) => c.foi_ministrada !== false
  ).length;
  const aulasSubstituidas = chamadas.filter(
    (c) =>
      c.foi_ministrada === false &&
      (c.professor_substituto_id || c.substituto_nome_manual)
  ).length;
  const aulasNaoRealizadas = chamadas.filter(
    (c) =>
      c.foi_ministrada === false &&
      !c.professor_substituto_id &&
      !c.substituto_nome_manual
  ).length;
  const horasTotal = chamadas
    .filter(
      (c) =>
        c.foi_ministrada !== false ||
        c.professor_substituto_id ||
        c.substituto_nome_manual
    )
    .reduce((acc, c) => acc + Number(c.horas_aula || 1.5), 0);

  let substituicoesHtml = "";
  if (aulasSubstituidas > 0) {
    const linhas = chamadas
      .filter(
        (c) =>
          c.foi_ministrada === false &&
          (c.professor_substituto_id || c.substituto_nome_manual)
      )
      .map((c) => {
        const nome = c.substituto_nome_manual
          ? `${c.substituto_nome_manual} <em>(externo)</em>`
          : getNomeProfessor(
              c.professor_substituto_id,
              uiState.todosProfessores
            ) || "Professor do sistema";
        return `<li style="padding:0.25rem 0;">${formatarDataBR(
          c.data
        )}: <span class="substituicao-nome">${nome}</span></li>`;
      })
      .join("");

    substituicoesHtml = `
      <div style="margin-top:0.75rem;">
        <strong style="font-size:0.9rem;">Substituições no mês:</strong>
        <ul style="list-style:none;padding:0;margin:0.4rem 0 0;">${linhas}</ul>
      </div>
    `;
  }

  const card = document.createElement("div");
  card.id = "resumo-mes-card";
  card.className = "card";
  card.innerHTML = `
    <h3 style="margin-bottom:0.75rem;">Resumo do Mês</h3>
    <div class="relatorio-summary-cards">
      <div class="summary-card">
        <div class="summary-card-label">Total de aulas</div>
        <div class="summary-card-value">${totalAulas}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Ministradas</div>
        <div class="summary-card-value" style="color:#15803d;">${aulasMinistradas}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Substituídas</div>
        <div class="summary-card-value" style="color:#6d28d9;">${aulasSubstituidas}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Não realizadas</div>
        <div class="summary-card-value" style="color:#b91c1c;">${aulasNaoRealizadas}</div>
      </div>
      <div class="summary-card summary-card--total">
        <div class="summary-card-label">Total de horas</div>
        <div class="summary-card-value">${horasTotal.toFixed(
          1
        )}h</div>
      </div>
    </div>
    ${substituicoesHtml}
  `;

  const tabRelatorios = document.getElementById("tab-relatorios");
  const firstCard = tabRelatorios?.querySelector(".card");
  if (firstCard) firstCard.parentNode.insertBefore(card, firstCard);
}