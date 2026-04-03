import {
  isAdmin,
  adminListarProfessores,
  adminListarTodasTurmas,
  adminListarEmailsAutorizados,
  adminAdicionarEmailAutorizado,
  adminRemoverEmailAutorizado,
  listarChamadasMes,
  formatarDataBR,
  calcularHorasPorProfessor,
  listarAulasProfesorMes, // NOVO
} from "./api.js";

const adminState = {
  professores: [],
  turmas: [],
  emails: [],
};

let adminUiConfigurado = false;
let filtrosChamadasInicializados = false;

/* ================== Init geral do Painel Admin ================== */

export async function initAdminUI() {
  const adminBtn = document.getElementById("adminPanelBtn");
  const adminView = document.getElementById("admin-view");
  if (!adminBtn || !adminView) return;

  const usuarioEhAdmin = await isAdmin().catch(() => false);

  if (!usuarioEhAdmin) {
    // Garante que não apareça para professor
    adminBtn.classList.add("hidden");
    adminView.classList.add("hidden");
    return;
  }

  // Mostrar botão para admin
  adminBtn.classList.remove("hidden");

  if (adminUiConfigurado) return;
  adminUiConfigurado = true;

  // Botão que alterna entre Minhas turmas e Painel Admin
  adminBtn.addEventListener("click", async () => {
    const turmasView = document.getElementById("turmas-view");
    const turmaDetailView = document.getElementById("turma-detail-view");
    const adminAberto = !adminView.classList.contains("hidden");

    if (adminAberto) {
      // Voltar para o painel de turmas
      adminView.classList.add("hidden");
      turmasView?.classList.remove("hidden");
      turmaDetailView?.classList.add("hidden");
      adminBtn.textContent = "Painel Admin";
    } else {
      // Abrir painel admin
      adminView.classList.remove("hidden");
      turmasView?.classList.add("hidden");
      turmaDetailView?.classList.add("hidden");
      adminBtn.textContent = "Minhas turmas";

      ativarAbaAdmin("visao-geral");
      await carregarVisaoGeralAdmin();
    }
  });

  initAdminTabs();
  await initRelatorioProfTab();
}

/* ================== Abas do Painel Admin ================== */

function initAdminTabs() {
  const tabBtns = document.querySelectorAll(".admin-tab");
  if (!tabBtns.length) return;

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.adminTab;
      ativarAbaAdmin(tab);

      if (tab === "visao-geral") await carregarVisaoGeralAdmin();
      if (tab === "chamadas") await carregarTabChamadasAdmin();
      if (tab === "professores") await carregarTabProfessoresAdmin();
      if (tab === "emails") await carregarTabEmailsAdmin();
    });
  });
}

function ativarAbaAdmin(tab) {
  document.querySelectorAll(".admin-tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.adminTab === tab);
  });
  document.querySelectorAll(".admin-tab-content").forEach((el) => {
    el.classList.add("hidden");
  });
  const activeContent = document.getElementById(`admin-tab-${tab}`);
  if (activeContent) activeContent.classList.remove("hidden");
}

async function carregarDadosBaseAdmin() {
  if (adminState.professores.length && adminState.turmas.length) return;

  const [profs, turmas] = await Promise.all([
    adminListarProfessores(),
    adminListarTodasTurmas(),
  ]);
  adminState.professores = profs;
  adminState.turmas = turmas;
}

/* ================== Aba: Visão Geral ================== */

async function carregarVisaoGeralAdmin() {
  const container = document.getElementById("adminTurmasContainer");
  const statusEl = document.getElementById("adminVisaoGeralStatus");
  if (!container) return;

  container.innerHTML = "";
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.style.color = "#22c55e";
  }

  try {
    await carregarDadosBaseAdmin();

    if (!adminState.professores.length) {
      container.innerHTML =
        "<p class='help-text'>Nenhum professor cadastrado.</p>";
      return;
    }

    // Ordena professores por nome
    const professoresOrdenados = [...adminState.professores].sort((a, b) => {
      const na = (a.nome || a.email || "").toLowerCase();
      const nb = (b.nome || b.email || "").toLowerCase();
      return na.localeCompare(nb, "pt-BR");
    });

    professoresOrdenados.forEach((prof) => {
      const turmasProfessor = adminState.turmas.filter(
        (t) => String(t.professor_id) === String(prof.id)
      );

      const grupo = document.createElement("div");
      grupo.className = "admin-professor-group";

      // Cabeçalho (accordion)
      const header = document.createElement("button");
      header.type = "button";
      header.className = "admin-prof-header";
      header.innerHTML = `
        <div class="admin-prof-info">
          <div class="admin-prof-nome">${prof.nome || prof.email || "Sem nome"}</div>
          <div class="admin-prof-email">${prof.email || ""}</div>
        </div>
        <div class="admin-prof-meta">
          <span class="badge-turmas">${turmasProfessor.length} turma(s)</span>
          <span class="admin-prof-toggle-icon">▸</span>
        </div>
      `;

      // Lista de turmas do professor
      const listaTurmas = document.createElement("div");
      listaTurmas.className = "admin-prof-turmas hidden";

      if (!turmasProfessor.length) {
        listaTurmas.innerHTML =
          "<p class='help-text'>Nenhuma turma cadastrada para este professor.</p>";
      } else {
        const ul = document.createElement("ul");
        ul.className = "admin-turmas-lista";

        turmasProfessor.forEach((turma) => {
          const ativa = turma.ativo === true;
          const li = document.createElement("li");
          li.className = "admin-turma-item";
          li.innerHTML = `
            <div class="admin-turma-info">
              <div class="admin-turma-nome">${turma.nome}</div>
              <div class="admin-turma-descricao">${turma.descricao || ""}</div>
            </div>
            <div class="admin-turma-status">
              <span class="status-badge ${
                ativa ? "status-ativo" : "status-inativo"
              }">
                ${ativa ? "Ativa" : "Inativa"}
              </span>
            </div>
          `;
          ul.appendChild(li);
        });

        listaTurmas.appendChild(ul);
      }

      // Toggle (expandir/recolher)
      header.addEventListener("click", () => {
        const isOpen = !listaTurmas.classList.contains("hidden");
        listaTurmas.classList.toggle("hidden", isOpen);
        header.classList.toggle("open", !isOpen);

        const icon = header.querySelector(".admin-prof-toggle-icon");
        if (icon) {
          icon.textContent = isOpen ? "▸" : "▾";
        }
      });

      // Opcional: começar todos recolhidos (como está)
      // Se quiser algum aberto por padrão, remova a classe 'hidden' do primeiro

      grupo.appendChild(header);
      grupo.appendChild(listaTurmas);
      container.appendChild(grupo);
    });
  } catch (err) {
    if (statusEl) {
      statusEl.style.color = "#e53935";
      statusEl.textContent =
        err.message || "Erro ao carregar visão geral. Verifique permissões.";
    }
  }
}

/* ================== Aba: Chamadas (Admin) ================== */

async function initFiltrosChamadasAdmin() {
  if (filtrosChamadasInicializados) return;

  const profSelect = document.getElementById("adminFiltroProfessor");
  const turmaSelect = document.getElementById("adminFiltroTurma");
  const mesInput = document.getElementById("adminFiltroMes");
  if (!profSelect || !turmaSelect || !mesInput) return;

  // Preenche professores
  profSelect.innerHTML = `<option value="">Todos</option>`;
  adminState.professores.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.nome || p.email;
    profSelect.appendChild(opt);
  });

  function preencherTurmas() {
    const profId = profSelect.value;
    turmaSelect.innerHTML = "";

    const turmasFiltradas = adminState.turmas.filter((t) =>
      profId ? String(t.professor_id) === String(profId) : true
    );

    if (!turmasFiltradas.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Nenhuma turma encontrada";
      turmaSelect.appendChild(opt);
      return;
    }

    turmasFiltradas.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.nome;
      turmaSelect.appendChild(opt);
    });

    // Seleciona primeira por padrão
    turmaSelect.value = turmasFiltradas[0].id;
  }

  preencherTurmas();

  // Mês padrão = mês atual
  if (!mesInput.value) {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    mesInput.value = `${ano}-${mes}`;
  }

  profSelect.addEventListener("change", async () => {
    preencherTurmas();
    await atualizarChamadasAdmin();
  });

  turmaSelect.addEventListener("change", atualizarChamadasAdmin);
  mesInput.addEventListener("change", atualizarChamadasAdmin);

  filtrosChamadasInicializados = true;
}

async function atualizarChamadasAdmin() {
  const profSelect = document.getElementById("adminFiltroProfessor");
  const turmaSelect = document.getElementById("adminFiltroTurma");
  const mesInput = document.getElementById("adminFiltroMes");
  const tbody = document.getElementById("adminChamadasTableBody");
  const diasLista = document.getElementById("adminChamadasDiasLista");
  const statusEl = document.getElementById("adminChamadasStatus");

  if (!profSelect || !turmaSelect || !mesInput || !tbody || !diasLista)
    return;

  tbody.innerHTML = "";
  diasLista.innerHTML = "";
  statusEl.textContent = "";

  const turmaId = turmaSelect.value;
  const mes = mesInput.value;

  if (!turmaId || !mes) {
    statusEl.style.color = "#6b7280";
    statusEl.textContent = "Selecione uma turma e um mês.";
    return;
  }

  try {
    const chamadas = await listarChamadasMes(turmaId, mes);
    const turma = adminState.turmas.find((t) => t.id === turmaId);
    const professor = adminState.professores.find(
      (p) => p.id === turma?.professor_id
    );

    // Tabela de chamadas
    if (!chamadas.length) {
      tbody.innerHTML =
        "<tr><td colspan='6'>Nenhuma chamada registrada neste período.</td></tr>";
    } else {
      chamadas.forEach((ch) => {
        const totalRegistros = ch.chamada_presencas?.length ?? 0;
        const presentes =
          ch.chamada_presencas?.filter((p) => p.presente).length ?? 0;
        const ausentes = totalRegistros - presentes;

        const tipoAula = ch.tipo_aula || "normal";
        let tipoBadge;
        if (tipoAula === "reforco") {
          tipoBadge = '<span class="badge-status badge-tipo-aula-extra">Reforço</span>';
        } else if (tipoAula === "reposicao") {
          tipoBadge = '<span class="badge-status badge-tipo-aula-extra">Reposição</span>';
        } else {
          tipoBadge = '<span class="badge-status status-presente">Normal</span>';
        }

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${formatarDataBR(ch.data)}</td>
          <td>${turma?.nome || "-"}</td>
          <td>${professor?.nome || "-"}</td>
          <td>${tipoBadge}</td>
          <td>${presentes}</td>
          <td>${ausentes}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    // Resumo de dias com/sem chamada
    const [anoStr, mesStr] = mes.split("-");
    const ano = parseInt(anoStr, 10);
    const mesIdx = parseInt(mesStr, 10) - 1;
    const totalDiasMes = new Date(ano, mesIdx + 1, 0).getDate();
    const datasComChamada = new Set(chamadas.map((c) => c.data));

    for (let dia = 1; dia <= totalDiasMes; dia++) {
      const dataStr = `${anoStr}-${String(mesIdx + 1).padStart(
        2,
        "0"
      )}-${String(dia).padStart(2, "0")}`;
      const li = document.createElement("li");
      const temChamada = datasComChamada.has(dataStr);

      li.className = temChamada
        ? "dia-chamada dia-com-chamada"
        : "dia-chamada dia-sem-chamada";
      li.textContent = `${formatarDataBR(dataStr)} - ${
        temChamada ? "Com chamada" : "Sem chamada"
      }`;

      diasLista.appendChild(li);
    }
  } catch (err) {
    statusEl.style.color = "#e53935";
    statusEl.textContent =
      err.message || "Erro ao carregar chamadas. Verifique permissões.";
  }
}

async function carregarTabChamadasAdmin() {
  const statusEl = document.getElementById("adminChamadasStatus");
  try {
    await carregarDadosBaseAdmin();
    await initFiltrosChamadasAdmin();
    await atualizarChamadasAdmin();
  } catch (err) {
    statusEl.style.color = "#e53935";
    statusEl.textContent =
      err.message || "Erro ao carregar chamadas. Verifique permissões.";
  }
}

/* ================== Aba: Professores ================== */

async function carregarTabProfessoresAdmin() {
  const tbody   = document.getElementById("adminProfessoresTableBody");
  const statusEl = document.getElementById("adminProfessoresStatus");
  if (!tbody) return;

  if (statusEl) statusEl.textContent = "";

  // Adiciona filtro de período (apenas uma vez)
  if (!document.getElementById("adminHorasFiltro")) {
    const filtro = document.createElement("div");
    filtro.id = "adminHorasFiltro";
    filtro.className = "admin-filters";
    filtro.innerHTML = `
      <div class="field-group">
        <label for="adminHorasInicio">De</label>
        <input type="date" id="adminHorasInicio">
      </div>
      <div class="field-group">
        <label for="adminHorasFim">Até</label>
        <input type="date" id="adminHorasFim">
      </div>
      <button id="adminHorasFiltrarBtn" class="btn btn-secondary">Filtrar</button>
      <button id="adminHorasLimparBtn" class="btn btn-outline">Limpar</button>
    `;
    tbody.closest(".schedule-table-wrapper").before(filtro);

    document.getElementById("adminHorasFiltrarBtn")
      ?.addEventListener("click", carregarHorasProfessores);

    document.getElementById("adminHorasLimparBtn")
      ?.addEventListener("click", () => {
        document.getElementById("adminHorasInicio").value = "";
        document.getElementById("adminHorasFim").value = "";
        carregarHorasProfessores();
      });
  }

  // Atualiza cabeçalho da tabela
  const thead = tbody.closest("table")?.querySelector("thead tr");
  if (thead) {
    thead.innerHTML = `
      <th>Nome</th>
      <th>Email</th>
      <th>Perfil</th>
      <th>H. Próprias</th>
      <th>H. Substituição</th>
      <th>Total</th>
    `;
  }

  await carregarHorasProfessores();
}

async function carregarHorasProfessores() {
  const tbody   = document.getElementById("adminProfessoresTableBody");
  const statusEl = document.getElementById("adminProfessoresStatus");
  if (!tbody) return;

  tbody.innerHTML = "<tr><td colspan='6'>Carregando...</td></tr>";

  try {
    const inicio = document.getElementById("adminHorasInicio")?.value || undefined;
    const fim    = document.getElementById("adminHorasFim")?.value   || undefined;

    const dados = await calcularHorasPorProfessor({ inicio, fim });

    tbody.innerHTML = "";

    if (!dados.length) {
      tbody.innerHTML = "<tr><td colspan='6'>Nenhum professor encontrado.</td></tr>";
      return;
    }

    dados.forEach((p) => {
      const roleLabel = p.role === "admin" ? "Admin" : "Professor";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${p.nome || "-"}</td>
        <td>${p.email || "-"}</td>
        <td>
          <span class="role-badge ${p.role === "admin" ? "role-admin" : "role-professor"}">
            ${roleLabel}
          </span>
        </td>
        <td>${p.horas_proprias.toFixed(1)}h</td>
        <td>${p.horas_substituicao.toFixed(1)}h</td>
        <td><strong>${p.horas_total.toFixed(1)}h</strong></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    if (statusEl) {
      statusEl.style.color = "#e53935";
      statusEl.textContent = err.message || "Erro ao carregar horas dos professores.";
    }
    tbody.innerHTML = "<tr><td colspan='6'>Erro ao carregar dados.</td></tr>";
  }
}

/* ================== Aba: Emails Autorizados ================== */

async function carregarTabEmailsAdmin() {
  const statusEl = document.getElementById("adminEmailStatus");
  const form = document.getElementById("adminEmailForm");
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.style.color = "#22c55e";
  }

  try {
    adminState.emails = await adminListarEmailsAutorizados();
    renderEmailsAutorizados();
  } catch (err) {
    if (statusEl) {
      statusEl.style.color = "#e53935";
      statusEl.textContent =
        err.message || "Erro ao carregar emails autorizados.";
    }
  }

  if (form && !form.dataset.initialized) {
    form.dataset.initialized = "true";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("adminNovoEmail");
      if (!input) return;
      const email = input.value.trim();

      if (!email) {
        if (statusEl) {
          statusEl.style.color = "#e53935";
          statusEl.textContent = "Informe um email.";
        }
        return;
      }

      try {
        await adminAdicionarEmailAutorizado(email);
        input.value = "";
        adminState.emails = await adminListarEmailsAutorizados();
        renderEmailsAutorizados();
        if (statusEl) {
          statusEl.style.color = "#22c55e";
          statusEl.textContent = "Email autorizado adicionado com sucesso.";
        }
      } catch (err2) {
        if (statusEl) {
          statusEl.style.color = "#e53935";
          statusEl.textContent =
            err2.message || "Erro ao adicionar email autorizado.";
        }
      }
    });
  }
}

function renderEmailsAutorizados() {
  const tbody = document.getElementById("adminEmailsTableBody");
  const statusEl = document.getElementById("adminEmailStatus");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!adminState.emails.length) {
    tbody.innerHTML =
      "<tr><td colspan='2'>Nenhum email autorizado cadastrado.</td></tr>";
    return;
  }

  adminState.emails.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.email}</td>
      <td class="actions-cell">
        <button class="btn btn-outline btn-sm" data-email-id="${item.id}">
          Remover
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button[data-email-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-email-id");
      const email = btn.closest("tr")?.querySelector("td")?.textContent || "";
      const confirmar = confirm(
        `Remover o email autorizado "${email}"? Essa ação não pode ser desfeita.`
      );
      if (!confirmar) return;

      try {
        await adminRemoverEmailAutorizado(id);
        adminState.emails = await adminListarEmailsAutorizados();
        renderEmailsAutorizados();
        if (statusEl) {
          statusEl.style.color = "#22c55e";
          statusEl.textContent = "Email removido com sucesso.";
        }
      } catch (err) {
        if (statusEl) {
          statusEl.style.color = "#e53935";
          statusEl.textContent =
            err.message || "Erro ao remover email autorizado.";
        }
      }
    });
  });
}
/* ================== Aba: Relatório por Professor (nova) ================== */

let relatorioProfInicializado = false;

async function initRelatorioProfTab() {
  if (document.getElementById("admin-tab-relatorio-prof")) return;

  // Adiciona botão de aba dinamicamente
  const tabsEl = document.querySelector(".admin-tabs");
  if (tabsEl && !tabsEl.querySelector('[data-admin-tab="relatorio-prof"]')) {
    const btn = document.createElement("button");
    btn.className = "admin-tab";
    btn.dataset.adminTab = "relatorio-prof";
    btn.textContent = "Relatório por Prof.";
    tabsEl.appendChild(btn);
    btn.addEventListener("click", async () => {
      ativarAbaAdmin("relatorio-prof");
      await carregarTabRelatorioProfAdmin();
    });
  }

  // Cria seção de conteúdo
  const section = document.createElement("section");
  section.id = "admin-tab-relatorio-prof";
  section.className = "admin-tab-content hidden";
  section.innerHTML = `
    <div class="card">
      <div class="section-header">
        <div>
          <h3>Relatório Mensal por Professor</h3>
          <p class="help-text">Veja as aulas ministradas, substituições e horas de cada professor.</p>
        </div>
      </div>
      <div class="admin-filters">
        <div class="field-group">
          <label for="relProfSelect">Professor</label>
          <select id="relProfSelect">
            <option value="">Selecione...</option>
          </select>
        </div>
        <div class="field-group">
          <label for="relProfMes">Mês</label>
          <input type="month" id="relProfMes">
        </div>
<button id="relProfGerarBtn" class="btn btn-primary">Gerar</button>
<button id="relProfPdfBtn" class="btn btn-secondary">Exportar PDF</button>
      </div>

      <div id="relProfSummary" class="hidden" style="margin-bottom:1rem;">
        <div class="relatorio-summary-cards" id="relProfSummaryCards"></div>
      </div>

      <div class="schedule-table-wrapper">
        <table class="schedule-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Turma</th>
              <th>Tipo</th>
              <th>Horas</th>
            </tr>
          </thead>
          <tbody id="relProfTableBody">
            <tr><td colspan="4" style="color:#6b7280;">Selecione um professor e clique em Gerar.</td></tr>
          </tbody>
        </table>
      </div>
      <p id="relProfStatus" class="status-message"></p>
    </div>
  `;

  const emailsTab = document.getElementById("admin-tab-emails");
  if (emailsTab) emailsTab.after(section);
  else document.getElementById("admin-view")?.appendChild(section);
}

async function carregarTabRelatorioProfAdmin() {
  await carregarDadosBaseAdmin();
  if (relatorioProfInicializado) return;
  relatorioProfInicializado = true;

  const select = document.getElementById("relProfSelect");
  if (select) {
    select.innerHTML = '<option value="">Selecione...</option>';
    adminState.professores.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.nome || p.email;
      select.appendChild(opt);
    });
  }

  const mesInput = document.getElementById("relProfMes");
  if (mesInput && !mesInput.value) {
    const hoje = new Date();
    mesInput.value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  }

  document.getElementById("relProfGerarBtn")?.addEventListener("click", gerarRelatorioProf);
  document.getElementById("relProfPdfBtn")?.addEventListener("click", exportarPdfRelatorioAdmin);
}

async function gerarRelatorioProf() {
  const profId   = document.getElementById("relProfSelect")?.value;
  const mes      = document.getElementById("relProfMes")?.value;
  const tbody    = document.getElementById("relProfTableBody");
  const summary  = document.getElementById("relProfSummary");
  const cards    = document.getElementById("relProfSummaryCards");
  const statusEl = document.getElementById("relProfStatus");

  if (!tbody) return;

  if (!profId || !mes) {
    if (statusEl) { statusEl.style.color = "#e53935"; statusEl.textContent = "Selecione um professor e um mês."; }
    return;
  }

  tbody.innerHTML = "<tr><td colspan='4'>Carregando...</td></tr>";
  summary?.classList.add("hidden");
  if (statusEl) statusEl.textContent = "";

  // Guarda para o PDF
  window._relProfDados = null;

  try {
    const resultado = await listarAulasProfesorMes(profId, mes);
    const { aulas, horasTotal, horasProprias, horasSubstituicao, qtdSubstituidas } = resultado;

    window._relProfDados = {
      resultado,
      profNome: document.getElementById("relProfSelect")
        ?.selectedOptions[0]?.textContent || "-",
      mes,
    };

    const qtdProprias = aulas.filter((a) => a.tipo === "propria").length;
    const qtdSubs     = aulas.filter((a) => a.tipo === "substituicao").length;

    if (cards) {
      cards.innerHTML = `
        <div class="summary-card">
          <div class="summary-card-label">Aulas próprias</div>
          <div class="summary-card-value">${qtdProprias}</div>
        </div>
        <div class="summary-card">
          <div class="summary-card-label">Como substituto</div>
          <div class="summary-card-value">${qtdSubs}</div>
        </div>
        <div class="summary-card" style="border-color:#ef4444;">
          <div class="summary-card-label">Aulas substituídas</div>
          <div class="summary-card-value" style="color:#b91c1c;">${qtdSubstituidas ?? 0}</div>
        </div>
        <div class="summary-card">
          <div class="summary-card-label">H. próprias</div>
          <div class="summary-card-value">${horasProprias.toFixed(1)}h</div>
        </div>
        <div class="summary-card">
          <div class="summary-card-label">H. substituição</div>
          <div class="summary-card-value">${horasSubstituicao.toFixed(1)}h</div>
        </div>
        <div class="summary-card summary-card--total">
          <div class="summary-card-label">Total de horas</div>
          <div class="summary-card-value">${horasTotal.toFixed(1)}h</div>
        </div>
      `;
    }
    summary?.classList.remove("hidden");

    tbody.innerHTML = "";
    if (!aulas.length) {
      tbody.innerHTML = "<tr><td colspan='4' style='color:#6b7280;'>Nenhuma aula registrada neste período.</td></tr>";
      return;
    }

    aulas.forEach((aula) => {
      let tipoBadge, horasCell;
      if (aula.tipo === "propria") {
        tipoBadge = '<span class="badge-status status-presente">Ministrada</span>';
        horasCell = `${Number(aula.horas_aula || 1.5).toFixed(1)}h`;
      } else if (aula.tipo === "substituicao") {
        tipoBadge = '<span class="badge-status status-na">Como substituto</span>';
        horasCell = `${Number(aula.horas_aula || 1.5).toFixed(1)}h`;
      } else {
        const nomeSubst = aula.substituto_nome || "outro professor";
        tipoBadge = `<span class="badge-status status-ausente" title="Substituída por ${nomeSubst}">Substituída</span>
          <span style="font-size:0.75rem;color:#6b7280;display:block;margin-top:2px;">por ${nomeSubst}</span>`;
        horasCell = '<span style="color:#9ca3af;">—</span>';
      }

      // Badge de tipo de aula (reforço/reposição)
      const tipoAula = aula.tipo_aula || "normal";
      let tipoAulaBadge = "";
      if (tipoAula === "reforco") {
        tipoAulaBadge = ' <span class="badge-status badge-tipo-aula-extra">Reforço</span>';
      } else if (tipoAula === "reposicao") {
        tipoAulaBadge = ' <span class="badge-status badge-tipo-aula-extra">Reposição</span>';
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatarDataBR(aula.data)}</td>
        <td>${aula.turma_nome}</td>
        <td>${tipoBadge}${tipoAulaBadge}</td>
        <td>${horasCell}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    if (statusEl) { statusEl.style.color = "#e53935"; statusEl.textContent = err.message || "Erro ao gerar relatório."; }
    tbody.innerHTML = "<tr><td colspan='4'>Erro ao carregar dados.</td></tr>";
  }
}
/* ================== PDF — Relatório por Professor ================== */

function exportarPdfRelatorioAdmin() {
  const dados = window._relProfDados;
  if (!dados) {
    alert("Gere o relatório antes de exportar.");
    return;
  }
  const { resultado, profNome, mes } = dados;
  abrirJanelaPdfRelatorioProf({ resultado, profNome, mes });
}

export function abrirJanelaPdfRelatorioProf({ resultado, profNome, mes }) {
  const { aulas, horasTotal, horasProprias, horasSubstituicao, qtdSubstituidas } = resultado;

  const [anoStr, mesStr] = mes.split("-");
  const tituloMes = `${mesStr}/${anoStr}`;
  const hoje = new Date().toLocaleDateString("pt-BR");

  const qtdProprias = aulas.filter((a) => a.tipo === "propria").length;
  const qtdSubs     = aulas.filter((a) => a.tipo === "substituicao").length;
  const totalDadas  = qtdProprias + qtdSubs;

  const linhasHtml = aulas.map((aula) => {
    let statusHtml, horasHtml;
    if (aula.tipo === "propria") {
      statusHtml = '<span class="badge ok">✓ Ministrada</span>';
      horasHtml  = `${Number(aula.horas_aula || 1.5).toFixed(1)}h`;
    } else if (aula.tipo === "substituicao") {
      statusHtml = '<span class="badge sub">🔄 Aula como substituto</span>';
      horasHtml  = `${Number(aula.horas_aula || 1.5).toFixed(1)}h`;
    } else {
      const nome = aula.substituto_nome || "outro professor";
      statusHtml = `<span class="badge lost">✗ Substituída por ${nome}</span><br>
        <small class="obs">Esta aula não foi contabilizada na carga horária</small>`;
      horasHtml  = "—";
    }
    return `
      <tr>
        <td>${formatarDataBR(aula.data)}</td>
        <td>${aula.turma_nome}</td>
        <td>${statusHtml}</td>
        <td class="horas">${horasHtml}</td>
      </tr>`;
  }).join("");

  const win = window.open("", "_blank");
  if (!win) { alert("Permita pop-ups para exportar o PDF."); return; }

  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório Mensal — ${profNome} — ${tituloMes}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #1f2937; padding: 32px; font-size: 13px; }
  .header { border-bottom: 3px solid #1565c0; padding-bottom: 14px; margin-bottom: 20px; }
  .header h1 { font-size: 20px; color: #1565c0; }
  .header h2 { font-size: 14px; color: #6b7280; font-weight: 500; margin-top: 4px; }
  .meta { display: flex; gap: 2rem; margin-top: 12px; font-size: 12px; }
  .meta span { color: #6b7280; }
  .meta strong { color: #1f2937; }
  h3 { font-size: 13px; color: #1565c0; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0.04em; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #f1f5f9; text-align: left; padding: 7px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #374151; border-bottom: 2px solid #e5e7eb; }
  td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .horas { text-align: right; font-weight: 600; white-space: nowrap; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge.ok   { background: #dcfce7; color: #166534; }
  .badge.sub  { background: #ede9fe; color: #5b21b6; }
  .badge.lost { background: #fee2e2; color: #b91c1c; }
  .obs { font-size: 10px; color: #9ca3af; font-style: italic; }
  .resumo { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; page-break-inside: avoid; }
  .resumo h3 { margin-top: 0; }
  .resumo table { margin-bottom: 0; }
  .resumo td { padding: 6px 8px; font-size: 13px; }
  .resumo td:last-child { text-align: right; font-weight: 700; min-width: 60px; }
  .row-total { background: #eff6ff; }
  .row-total td { color: #1565c0; font-size: 15px; }
  .row-lost td { color: #b91c1c; }
  .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 11px; color: #9ca3af; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
  <div class="header">
    <h1>Challenger Language School</h1>
    <h2>Relatório Mensal de Aulas</h2>
    <div class="meta">
      <div><span>Professor(a): </span><strong>${profNome}</strong></div>
      <div><span>Período: </span><strong>${tituloMes}</strong></div>
      <div><span>Emitido em: </span><strong>${hoje}</strong></div>
    </div>
  </div>

  <h3>Aulas no Período</h3>
  <table>
    <thead>
      <tr>
        <th>Data</th>
        <th>Turma</th>
        <th>Status</th>
        <th style="text-align:right;">Horas</th>
      </tr>
    </thead>
    <tbody>
      ${linhasHtml || '<tr><td colspan="4" style="color:#9ca3af;">Nenhuma aula registrada neste período.</td></tr>'}
    </tbody>
  </table>

  <div class="resumo">
    <h3>Resumo do Mês</h3>
    <table>
      <tr class="row-total">
        <td>Total de horas no mês</td>
        <td>${horasTotal.toFixed(1)}h</td>
      </tr>
      <tr>
        <td>Total de aulas dadas (próprias + substituto)</td>
        <td>${totalDadas}</td>
      </tr>
      <tr>
        <td>Aulas próprias ministradas</td>
        <td>${qtdProprias}</td>
      </tr>
      <tr>
        <td>Horas próprias</td>
        <td>${horasProprias.toFixed(1)}h</td>
      </tr>
      <tr>
        <td>Aulas como substituto</td>
        <td>${qtdSubs}</td>
      </tr>
      <tr>
        <td>Horas como substituto</td>
        <td>${horasSubstituicao.toFixed(1)}h</td>
      </tr>
      <tr class="row-lost">
        <td>Aulas substituídas por outro professor <small style="font-weight:400;">(não contabilizadas)</small></td>
        <td>${qtdSubstituidas ?? 0}</td>
      </tr>
    </table>
  </div>

  <div class="footer">Challenger Language School • Sistema de Presença</div>

  <script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`);
  win.document.close();
}
