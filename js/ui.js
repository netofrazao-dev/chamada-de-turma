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
} from "./api.js";

export const uiState = {
  turmas: [],
  turmaAtual: null,       // objeto turma
  alunosTurmaAtual: [],   // array de alunos
  presencas: new Map(),   // alunoId -> true/false
};

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

export async function carregarTurmasPainel() {
  const turmas = await listarTurmas();
  uiState.turmas = turmas;

  const grid = document.getElementById("turmasGrid");
  if (!grid) return;
  grid.innerHTML = "";

  if (!turmas.length) {
    grid.innerHTML = "<p class='help-text'>Nenhuma turma cadastrada ainda.</p>";
    return;
  }

  for (const turma of turmas) {
    // alunos da turma para contagem
    const alunos = await listarAlunos(turma.id);
    const horarios = await listarHorarios(turma.id);

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

    // listeners
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
        await carregarTurmasPainel();
      } catch (e) {
        alert(e.message || "Erro ao excluir turma.");
      }
    });

    grid.appendChild(card);
  }
}

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
      const desc = document.getElementById("turmaFormDescricao").value.trim();
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
          // update no banco
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

  // carrega alunos
  uiState.alunosTurmaAtual = await listarAlunos(turmaId);
  uiState.presencas = new Map();

  // header
  document.getElementById("turmaDetailNome").textContent = turma.nome;
  document.getElementById("turmaDetailInfo").textContent =
    (turma.descricao || "") +
    (uiState.alunosTurmaAtual.length
      ? ` • ${uiState.alunosTurmaAtual.length} aluno(s)`
      : "");

  // mostra view de detalhe
  document.getElementById("turmas-view").classList.add("hidden");
  document.getElementById("turma-detail-view").classList.remove("hidden");

  // abas
  initTurmaTabs();
  await renderTabAlunos();
}

export function initVoltarTurmas() {
  const btn = document.getElementById("voltarTurmasBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    document.getElementById("turmas-view").classList.remove("hidden");
    document.getElementById("turma-detail-view").classList.add("hidden");
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

// VARIÁVEL GLOBAL PARA CONTROLAR SE O FORMULÁRIO JÁ FOI INICIALIZADO
let novoAlunoFormInicializado = false;

async function renderTabAlunos() {
  const lista = document.getElementById("listaAlunosTurma");
  if (!lista || !uiState.turmaAtual) return;

  uiState.alunosTurmaAtual = await listarAlunos(uiState.turmaAtual.id);
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

  // INICIALIZAR FORMULÁRIO DE ADICIONAR ALUNO UMA VEZ
  if (!novoAlunoFormInicializado) {
    novoAlunoFormInicializado = true;
    const form = document.getElementById("novoAlunoForm");
    
    if (form) {
      // REMOVER LISTENERS ANTIGOS (se houver)
      const newForm = form.cloneNode(true);
      form.parentNode.replaceChild(newForm, form);
      
      // ADICIONAR NOVO LISTENER
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
  const lista = document.getElementById("listaAlunosChamada");
  const dataInput = document.getElementById("dataChamada");
  const salvarBtn = document.getElementById("salvarChamadaBtn");
  const statusEl = document.getElementById("mensagemStatus");

  if (!lista || !uiState.turmaAtual) return;

  // data padrão: hoje
  if (dataInput && !dataInput.value) {
    const hoje = new Date();
    dataInput.value = hoje.toISOString().split("T")[0];
  }

  uiState.alunosTurmaAtual = await listarAlunos(uiState.turmaAtual.id);
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

  // carregar chamada existente para a data
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
        setStatus(statusEl, err.message || "Erro ao salvar chamada.", true);
      }
    });
  }
}

async function carregarChamadaParaData(dataStr) {
  if (!uiState.turmaAtual || !dataStr) return;
  const chamada = await obterChamadaPorData(uiState.turmaAtual.id, dataStr);

  uiState.presencas = new Map();
  const rows = document.querySelectorAll(".chamada-row");
  rows.forEach((row) => {
    const alunoId = row.dataset.alunoId;
    const btnP = row.querySelector(".btn-presenca.present");
    const btnA = row.querySelector(".btn-presenca.absent");
    btnP.classList.remove("selected");
    btnA.classList.remove("selected");

    if (!chamada) {
      // nenhum registro: deixa ambos desmarcados
      return;
    }

    const reg = chamada.chamada_presencas?.find((p) => p.aluno_id === alunoId);
    if (!reg) return;

    uiState.presencas.set(alunoId, !!reg.presente);
    if (reg.presente) {
      btnP.classList.add("selected");
    } else {
      btnA.classList.add("selected");
    }
  });
}

/* ================== Tab RELATÓRIOS ================== */

async function renderTabRelatorios() {
  if (!uiState.turmaAtual) return;

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
  const tbody = document.getElementById("relatorioMensalBody");
  if (!tbody || !uiState.turmaAtual) return;
  tbody.innerHTML = "";

  const turmaId = uiState.turmaAtual.id;
  const alunos = await listarAlunos(turmaId);
  const chamadas = await listarChamadasMes(turmaId, mes);
  const totalDias = chamadas.length;

  if (!alunos.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5">Nenhum aluno cadastrado.</td>`;
    tbody.appendChild(tr);
    return;
  }

  alunos.forEach((aluno) => {
    let presencas = 0;
    chamadas.forEach((ch) => {
      const reg = ch.chamada_presencas?.find((p) => p.aluno_id === aluno.id);
      if (reg?.presente) presencas++;
    });

    const faltas = totalDias - presencas;
    const perc = totalDias > 0 ? ((presencas / totalDias) * 100).toFixed(1) : "0.0";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${aluno.nome}</td>
      <td>${presencas}</td>
      <td>${faltas}</td>
      <td>${totalDias}</td>
      <td>${perc}%</td>
    `;
    tbody.appendChild(tr);
  });

  if (!totalDias) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5">Nenhuma chamada registrada neste mês.</td>`;
    tbody.appendChild(tr);
  }
}

async function renderCalendario(mes) {
  const container = document.getElementById("calendarioContainer");
  if (!container || !uiState.turmaAtual) return;

  const turmaId = uiState.turmaAtual.id;

  const [anoStr, mesStr] = mes.split("-");
  const ano = parseInt(anoStr, 10);
  const mesIndex = parseInt(mesStr, 10) - 1;
  const primeiroDia = new Date(ano, mesIndex, 1);
  const diaSemanaPrimeiro = primeiroDia.getDay();
  const totalDiasMes = new Date(ano, mesIndex + 1, 0).getDate();

  // Buscar TODAS as chamadas do mês, independentemente dos horários
  const chamadas = await listarChamadasMes(turmaId, mes);
  const mapaChamadas = new Map();
  chamadas.forEach((c) => mapaChamadas.set(c.data, c));

  const alunos = await listarAlunos(turmaId);
  const totalAlunos = alunos.length;

  const hoje = new Date();
  const dataHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

  // Nomes dos meses
  const nomesMeses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const nomeMes = nomesMeses[mesIndex];

  // Criar grid de dias
  const diasGrid = document.createElement("div");
  diasGrid.className = "calendar-grid-novo";

  // Cabeçalho com dias da semana
  const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  diasSemana.forEach((dia) => {
    const header = document.createElement("div");
    header.className = "calendar-header-day";
    header.textContent = dia;
    diasGrid.appendChild(header);
  });

  // Dias vazios antes do primeiro dia do mês
  for (let i = 0; i < diaSemanaPrimeiro; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day-empty";
    diasGrid.appendChild(empty);
  }

  // Dias do mês
  for (let diaAtual = 1; diaAtual <= totalDiasMes; diaAtual++) {
    const dataStr = `${ano}-${String(mesIndex + 1).padStart(2, "0")}-${String(diaAtual).padStart(2, "0")}`;
    const isHoje = dataStr === dataHoje;

    const dayDiv = document.createElement("div");
    dayDiv.className = "calendar-day-novo";

    if (isHoje) dayDiv.classList.add("calendar-today");

    // Verificar se há chamada registrada para este dia
    const registro = mapaChamadas.get(dataStr);
    
    if (registro) {
      // DIA COM CHAMADA REGISTRADA
      let statusClass = "calendar-no-call";
      let statusIcon = "⚠️";
      let statusTitle = "Sem chamada";
      let temChamada = true;
      let presentes = 0;
      let ausentes = 0;

      const totalReg = registro.chamada_presencas?.length ?? 0;
      presentes = registro.chamada_presencas?.filter(p => p.presente).length ?? 0;
      ausentes = totalReg - presentes;

      if (totalReg >= totalAlunos && totalAlunos > 0) {
        statusClass = "calendar-complete";
        statusIcon = "✓";
        statusTitle = "Chamada completa";
      } else if (totalReg > 0) {
        statusClass = "calendar-partial";
        statusIcon = "◐";
        statusTitle = "Chamada parcial";
      } else {
        statusClass = "calendar-no-call";
        statusIcon = "⚠️";
        statusTitle = "Sem chamada";
      }

      dayDiv.classList.add(statusClass);
      dayDiv.dataset.data = dataStr;
      dayDiv.dataset.presentes = presentes;
      dayDiv.dataset.ausentes = ausentes;
      dayDiv.dataset.total = totalAlunos;
      dayDiv.dataset.temChamada = temChamada;
      dayDiv.title = statusTitle;

      // Renderizar com indicador visual
      dayDiv.innerHTML = `
        <div class="calendar-day-number-novo">${diaAtual}</div>
        <div class="calendar-day-status">${statusIcon}</div>
        <div class="calendar-has-call-indicator"></div>
      `;

      // Clique para ver detalhes
      dayDiv.addEventListener("click", () => {
        mostrarDetalhesCalendario(dataStr, presentes, ausentes, totalAlunos, statusTitle, mes);
      });

      dayDiv.style.cursor = "pointer";
    } else {
      // DIA SEM CHAMADA REGISTRADA - mostrar em cinza
      dayDiv.classList.add("calendar-no-class");
      dayDiv.innerHTML = `<div class="calendar-day-number-novo">${diaAtual}</div>`;
      dayDiv.title = "Sem chamada registrada";
    }

    diasGrid.appendChild(dayDiv);
  }

  // Renderizar legenda
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

  // Limpar e renderizar
  container.innerHTML = "";
  container.appendChild(diasGrid);
  container.appendChild(legenda);
}

async function mostrarDetalhesCalendario(data, presentes, ausentes, total, status, mesAtual) {
  const modal = document.getElementById("calendarDetailModal");
  if (!modal) return;

  const percentual = total > 0 ? ((presentes / total) * 100).toFixed(1) : "0.0";
  const dataFormatada = new Date(data + "T00:00:00").toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  // Verificar se existe chamada para esta data
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
        ${temChamada ? `
          <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #e5e7eb;">
            <button id="btnRemoverChamada" class="btn btn-outline" style="width: 100%; color: #b91c1c; border-color: #fecaca;">
              🗑️ Remover Chamada
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  modal.classList.remove("hidden");

  // Fechar ao clicar fora
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  // Adicionar listener para remover chamada se ela existir
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
          
          // Recarregar o calendário para refletir a mudança
          await renderCalendario(mesAtual);
          
          // Mostrar mensagem de sucesso
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

  const [anoStr, mesNumStr] = mes.split("-");
  const ano = parseInt(anoStr, 10);
  const mesIndex = parseInt(mesNumStr, 10) - 1;
  const tituloMes = `${mesNumStr}/${ano}`;

  const alunos = await listarAlunos(turma.id);
  const chamadasDoMes = await listarChamadasMes(turma.id, mes);

  const totalDiasMes = new Date(ano, mesIndex + 1, 0).getDate();
  const nomesDiasSemanaCurto = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

  let detalhesDiariosHtml = '';
  for (let diaAtual = 1; diaAtual <= totalDiasMes; diaAtual++) {
    const dataStr = `${anoStr}-${String(mesIndex + 1).padStart(2, "0")}-${String(diaAtual).padStart(2, "0")}`;
    const dataObj = new Date(ano, mesIndex, diaAtual);
    const diaSemanaNome = nomesDiasSemanaCurto[dataObj.getDay()];

    const chamadaDoDia = chamadasDoMes.find(c => c.data === dataStr);

    if (chamadaDoDia) {
      detalhesDiariosHtml += `
        <div class="dia-detalhe">
          <h3>Dia ${diaAtual} (${diaSemanaNome})</h3>
          <ul>
      `;
      alunos.forEach(aluno => {
        const presenca = chamadaDoDia.chamada_presencas.find(p => p.aluno_id === aluno.id);
        const status = presenca?.presente ? 'Presente' : 'Ausente';
        detalhesDiariosHtml += `<li>Aluno ${aluno.nome}: ${status}</li>`;
      });
      detalhesDiariosHtml += `</ul></div>`;
    }
  }

  const tbodyHtml = document.getElementById("relatorioMensalBody")?.innerHTML ?? "";

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
  <h1>Escola: CLS<br>Teacher: JHENNY</h1>
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