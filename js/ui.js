import {
  listarTurmas,
  listarAlunos,
  listarHorarios,
  criarTurma,
  criarAluno,
  criarHorario,
  salvarChamada,
  removerChamada,
  listarChamadasMes,
  obterChamadaPorData,
  formatarDataBR,
} from "./api.js";

export const nomesDiasSemana = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

const mapaDiaSemana = {
  0: "Domingo",
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado",
};

export const uiState = {
  turmas: [],
  turmaAtualId: null,
  alunosTurmaAtual: [],
};

/* --------- util status --------- */
function setStatus(element, msg, erro = false) {
  if (!element) return;
  element.textContent = msg;
  element.style.color = erro ? "#e53935" : "#4caf50";
  if (msg) {
    setTimeout(() => {
      if (element.textContent === msg) element.textContent = "";
    }, 4000);
  }
}

/* --------- Navegação de views --------- */
export function initNavigation() {
  const navButtons = document.querySelectorAll(".nav-item");
  const views = {
    attendance: document.getElementById("view-attendance"),
    reports: document.getElementById("view-reports"),
    settings: document.getElementById("view-settings"),
  };

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      navButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const viewName = btn.dataset.view;
      Object.values(views).forEach((v) => v.classList.add("hidden"));
      views[viewName].classList.remove("hidden");
    });
  });
}

/* --------- Carregar turmas em selects e sidebar --------- */
export async function carregarTurmasUI() {
  uiState.turmas = await listarTurmas();

  const turmaSelect = document.getElementById("turmaSelect");
  const turmaRelatorioSelect = document.getElementById("turmaRelatorioSelect");
  const turmaGlobalSelect = document.getElementById("turmaGlobalSelect");
  const turmaConfigList = document.getElementById("listaTurmasConfig");

  [turmaSelect, turmaRelatorioSelect, turmaGlobalSelect].forEach((sel) => {
    if (!sel) return;
    sel.innerHTML = "";
    uiState.turmas.forEach((t, index) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.nome;
      if (index === 0) opt.selected = true;
      sel.appendChild(opt);
    });
  });

  // lista lateral nas configurações
  if (turmaConfigList) {
    turmaConfigList.innerHTML = "";
    uiState.turmas.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t.nome;
      turmaConfigList.appendChild(li);
    });
  }

  if (uiState.turmas.length > 0) {
    uiState.turmaAtualId = uiState.turmas[0].id;
  }

  atualizarRotuloTurmaGlobal();
}

export function atualizarRotuloTurmaGlobal() {
  const label = document.getElementById("turmaGlobalLabel");
  const turma = uiState.turmas.find((t) => t.id === uiState.turmaAtualId);
  if (label && turma) {
    label.textContent = turma.descricao || turma.nome;
  }
}

/* --------- Alunos / Horários / Chamada (tela principal) --------- */
export async function atualizarTurmaAtual(novoId) {
  uiState.turmaAtualId = novoId;

  // Sincroniza selects principais
  ["turmaSelect", "turmaRelatorioSelect", "turmaGlobalSelect"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = novoId;
  });

  atualizarRotuloTurmaGlobal();
  await renderizarAlunosChamada();
  await renderizarHorariosTurma();
  await atualizarRelatorios();
}

export async function renderizarAlunosChamada() {
  const turmaId = uiState.turmaAtualId;
  if (!turmaId) return;

  uiState.alunosTurmaAtual = await listarAlunos(turmaId);

  const listaAlunos = document.getElementById("listaAlunos");
  const tituloTurma = document.getElementById("tituloTurma");
  const turma = uiState.turmas.find((t) => t.id === turmaId);

  if (tituloTurma && turma) {
    tituloTurma.textContent = `Alunos - ${turma.nome}`;
  }

  listaAlunos.innerHTML = "";
  uiState.alunosTurmaAtual.forEach((aluno) => {
    const li = document.createElement("li");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "aluno-checkbox";
    cb.dataset.alunoId = aluno.id;

    const label = document.createElement("label");
    label.textContent = aluno.nome;

    li.appendChild(cb);
    li.appendChild(label);
    listaAlunos.appendChild(li);
  });

  // tentar carregar chamada existente para a data selecionada
  const dataInput = document.getElementById("dataChamada");
  if (dataInput && dataInput.value) {
    await carregarMarcacoesParaData(dataInput.value);
  }

  const textoGerado = document.getElementById("textoGerado");
  if (textoGerado) textoGerado.value = "";
}

export async function carregarMarcacoesParaData(dataStr) {
  const turmaId = uiState.turmaAtualId;
  if (!turmaId || !dataStr) return;

  const chamada = await obterChamadaPorData(turmaId, dataStr);
  const checkboxes = document.querySelectorAll(".aluno-checkbox");

  if (!chamada) {
    checkboxes.forEach((cb) => (cb.checked = false));
    return;
  }

  const mapaPresencas = new Map();
  chamada.chamada_presencas.forEach((p) => {
    mapaPresencas.set(p.aluno_id, p.presente);
  });

  checkboxes.forEach((cb) => {
    const alunoId = cb.dataset.alunoId;
    cb.checked = mapaPresencas.get(alunoId) === true;
  });
}

export async function renderizarHorariosTurma() {
  const turmaId = uiState.turmaAtualId;
  if (!turmaId) return;
  const horarios = await listarHorarios(turmaId);
  const tabela = document.getElementById("tabelaHorarios");
  const nomeTurmaHorario = document.getElementById("nomeTurmaHorario");
  const turma = uiState.turmas.find((t) => t.id === turmaId);

  if (nomeTurmaHorario && turma) {
    nomeTurmaHorario.textContent = turma.nome;
  }

  tabela.innerHTML = "";
  if (!horarios.length) {
    tabela.innerHTML = `<tr><td colspan="2">Horários não cadastrados</td></tr>`;
    return;
  }

  horarios.forEach((h) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${mapaDiaSemana[h.dia_semana]}</td>
      <td>${h.horario_texto}</td>
    `;
    tabela.appendChild(tr);
  });
}

/* --------- Salvar chamada + texto WhatsApp --------- */
export async function salvarChamadaETexto() {
  const turmaId = uiState.turmaAtualId;
  const dataInput = document.getElementById("dataChamada");
  const statusEl = document.getElementById("mensagemStatus");
  const textoGerado = document.getElementById("textoGerado");

  if (!turmaId || !dataInput.value) {
    setStatus(statusEl, "Selecione uma turma e uma data.", true);
    return;
  }

  const presentesIds = [];
  const presentesNomes = [];
  const ausentesNomes = [];

  const turma = uiState.turmas.find((t) => t.id === turmaId);

  document.querySelectorAll(".aluno-checkbox").forEach((cb) => {
    const alunoId = cb.dataset.alunoId;
    const aluno = uiState.alunosTurmaAtual.find((a) => a.id === alunoId);
    if (!aluno) return;

    if (cb.checked) {
      presentesIds.push(aluno.id);
      presentesNomes.push(aluno.nome);
    } else {
      ausentesNomes.push(aluno.nome);
    }
  });

  // salvar
  await salvarChamada(turmaId, dataInput.value, presentesIds, uiState.alunosTurmaAtual);

  // texto
  let texto = `CHAMADA DE PRESENÇA\n`;
  texto += `Turma: ${turma?.nome ?? ""}\n`;
  texto += `Data: ${formatarDataBR(dataInput.value)}\n\n`;
  texto += `Alunos presentes:\n`;
  texto += presentesNomes.length
    ? presentesNomes.map((n) => `- ${n}`).join("\n")
    : "- Nenhum aluno presente.\n";
  texto += `\nAlunos ausentes:\n`;
  texto += ausentesNomes.length
    ? ausentesNomes.map((n) => `- ${n}`).join("\n")
    : "- Nenhum aluno ausente.";

  if (textoGerado) textoGerado.value = texto;
  setStatus(statusEl, "Chamada salva e texto gerado.");

  await atualizarRelatorios();
}

export function copiarTexto() {
  const texto = document.getElementById("textoGerado")?.value ?? "";
  const statusEl = document.getElementById("mensagemStatus");
  if (!texto) return;
  navigator.clipboard.writeText(texto);
  setStatus(statusEl, "Texto copiado!");
}

export function enviarWhatsapp() {
  const textoEl = document.getElementById("textoGerado");
  const statusEl = document.getElementById("mensagemStatus");

  let texto = textoEl?.value ?? "";
  if (!texto) {
    setStatus(statusEl, "Gere o texto primeiro.", true);
    return;
  }
  const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.open(url, "_blank");
}

/* --------- Relatórios --------- */
export async function atualizarRelatorios() {
  await atualizarRelatorioMensal();
  await atualizarResumoIndividual();
  await renderCalendarioAulas();
  await atualizarListaDiasChamada();
}

export async function atualizarRelatorioMensal() {
  const turmaId = document.getElementById("turmaRelatorioSelect")?.value;
  const mes = document.getElementById("mesRelatorio")?.value;
  const tbody = document.getElementById("relatorioMensalBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!turmaId || !mes) return;

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
    tr.innerHTML = `<td colspan="5">Nenhuma chamada registrada para este mês/turma.</td>`;
    tbody.appendChild(tr);
  }
}

export async function atualizarResumoIndividual() {
  const alunoNome = document.getElementById("alunoRelatorioSelect")?.value;
  const turmaId = document.getElementById("turmaRelatorioSelect")?.value;
  const mes = document.getElementById("mesRelatorio")?.value;

  const totalEl = document.getElementById("resumoTotalAulasAluno");
  const presEl = document.getElementById("resumoPresencasAluno");
  const faltEl = document.getElementById("resumoFaltasAluno");
  const percEl = document.getElementById("resumoPercentualAluno");
  const historicoBody = document.getElementById("historicoAlunoBody");

  if (!totalEl || !presEl || !faltEl || !percEl || !historicoBody) return;

  historicoBody.innerHTML = "";
  totalEl.textContent = "0";
  presEl.textContent = "0";
  faltEl.textContent = "0";
  percEl.textContent = "0%";

  if (!alunoNome || !turmaId || !mes) return;

  const alunos = await listarAlunos(turmaId);
  const aluno = alunos.find((a) => a.nome === alunoNome);
  if (!aluno) return;

  const chamadas = await listarChamadasMes(turmaId, mes);
  const datas = chamadas.map((c) => c.data).sort();
  const totalDias = datas.length;
  let presencas = 0;

  chamadas.forEach((ch) => {
    const reg = ch.chamada_presencas?.find((p) => p.aluno_id === aluno.id);
    const presente = !!reg?.presente;
    if (presente) presencas++;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatarDataBR(ch.data)}</td>
      <td>${presente ? "Presente" : "Ausente"}</td>
    `;
    historicoBody.appendChild(tr);
  });

  const faltas = totalDias - presencas;
  const perc = totalDias > 0 ? ((presencas / totalDias) * 100).toFixed(1) : "0.0";

  totalEl.textContent = String(totalDias);
  presEl.textContent = String(presencas);
  faltEl.textContent = String(faltas);
  percEl.textContent = `${perc}%`;
}

export async function atualizarListaDiasChamada() {
  const lista = document.getElementById("listaDiasChamada");
  const turmaId = document.getElementById("turmaRelatorioSelect")?.value;
  const mes = document.getElementById("mesRelatorio")?.value;
  const dataCorrecao = document.getElementById("dataCorrecao");

  if (!lista) return;
  lista.innerHTML = "";

  if (!turmaId || !mes) {
    const li = document.createElement("li");
    li.textContent = "Selecione uma turma e um mês.";
    lista.appendChild(li);
    return;
  }

  const chamadas = await listarChamadasMes(turmaId, mes);
  if (!chamadas.length) {
    const li = document.createElement("li");
    li.textContent = "Nenhuma chamada registrada para este mês/turma.";
    lista.appendChild(li);
    return;
  }

  // mapear dias de aula pela tabela de horários
  const horarios = await listarHorarios(turmaId);
  const diasSemanaTurma = new Set(horarios.map((h) => h.dia_semana));

  chamadas.forEach((ch) => {
    const [ano, m, d] = ch.data.split("-").map(Number);
    const dataObj = new Date(ano, m - 1, d);
    const diaSem = dataObj.getDay();
    const isDiaAula = diasSemanaTurma.has(diaSem);

    const li = document.createElement("li");
    li.innerHTML = `
      ${formatarDataBR(ch.data)} - ${nomesDiasSemana[diaSem]}
      ${isDiaAula ? "" : '<span class="day-warning">(fora do dia de aula da turma)</span>'}
    `;

    if (dataCorrecao) {
      li.style.cursor = "pointer";
      li.title = "Clique para selecionar esta data para correção";
      li.addEventListener("click", () => {
        dataCorrecao.value = ch.data;
      });
    }

    lista.appendChild(li);
  });
}

export async function renderCalendarioAulas() {
  const tbody = document.getElementById("calendarioBody");
  const turmaId = document.getElementById("turmaRelatorioSelect")?.value;
  const mes = document.getElementById("mesRelatorio")?.value;

  if (!tbody) return;
  tbody.innerHTML = "";
  if (!turmaId || !mes) return;

  const horarios = await listarHorarios(turmaId);
  const diasSemanaTurma = new Set(horarios.map((h) => h.dia_semana));

  const [anoStr, mesStr] = mes.split("-");
  const ano = parseInt(anoStr, 10);
  const mesIndex = parseInt(mesStr, 10) - 1;
  const primeiroDia = new Date(ano, mesIndex, 1);
  const diaSemanaPrimeiro = primeiroDia.getDay();
  const totalDiasMes = new Date(ano, mesIndex + 1, 0).getDate();

  const chamadas = await listarChamadasMes(turmaId, mes);
  const mapaChamadas = new Map();
  chamadas.forEach((c) => mapaChamadas.set(c.data, c));

  let diaAtual = 1;
  for (let semana = 0; semana < 6 && diaAtual <= totalDiasMes; semana++) {
    const tr = document.createElement("tr");
    for (let ds = 0; ds < 7; ds++) {
      const td = document.createElement("td");
      td.classList.add("calendar-day");

      if ((semana === 0 && ds < diaSemanaPrimeiro) || diaAtual > totalDiasMes) {
        td.innerHTML = "";
      } else {
        const dataStr = `${ano}-${String(mesIndex + 1).padStart(2, "0")}-${String(
          diaAtual
        ).padStart(2, "0")}`;

        const diaSemanaNumero = ds;
        const isDiaAula = diasSemanaTurma.has(diaSemanaNumero);

        const numDiv = document.createElement("div");
        numDiv.classList.add("calendar-day-number");
        numDiv.textContent = diaAtual;
        td.appendChild(numDiv);

        if (isDiaAula) {
          const registro = mapaChamadas.get(dataStr);
          const dot = document.createElement("span");
          dot.classList.add("calendar-status-dot");

          if (registro) {
            const totalReg = registro.chamada_presencas?.length ?? 0;
            const totalAlunos = (await listarAlunos(turmaId)).length;
            if (totalReg >= totalAlunos && totalAlunos > 0) {
              dot.classList.add("calendar-status--ok");
              dot.title = "Chamada completa";
            } else {
              dot.classList.add("calendar-status--partial");
              dot.title = "Chamada incompleta";
            }
          } else {
            dot.classList.add("calendar-status--missing");
            dot.title = "Dia de aula sem chamada";
          }
          td.appendChild(dot);
        }

        diaAtual++;
      }

      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

/* --------- Configurações: alunos e horários --------- */
export async function initConfigForms() {
  const turmaSelect = document.getElementById("turmaSelect");
  const novoAlunoForm = document.getElementById("novoAlunoForm");
  const novoHorarioForm = document.getElementById("novoHorarioForm");
  const novaTurmaForm = document.getElementById("novaTurmaForm");
  const statusEl = document.getElementById("mensagemStatus"); // aproveito o mesmo

  if (novaTurmaForm) {
    novaTurmaForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nome = document.getElementById("novaTurmaNome").value.trim();
      const desc = document.getElementById("novaTurmaDescricao").value.trim();
      if (!nome) return;
      await criarTurma({ nome, descricao: desc });
      await carregarTurmasUI();
      if (turmaSelect) turmaSelect.value = uiState.turmaAtualId;
      setStatus(statusEl, "Turma criada.");
      novaTurmaForm.reset();
    });
  }

  if (novoAlunoForm) {
    novoAlunoForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!uiState.turmaAtualId) return;
      const nome = document.getElementById("novoAlunoNome").value.trim();
      if (!nome) return;
      await criarAluno(uiState.turmaAtualId, nome);
      await renderizarAlunosChamada();
      setStatus(statusEl, "Aluno adicionado.");
      novoAlunoForm.reset();
    });
  }

  if (novoHorarioForm) {
    novoHorarioForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!uiState.turmaAtualId) return;
      const dia = parseInt(document.getElementById("novoHorarioDia").value, 10);
      const texto = document.getElementById("novoHorarioTexto").value.trim();
      if (!texto) return;
      await criarHorario(uiState.turmaAtualId, dia, texto);
      await renderizarHorariosTurma();
      setStatus(statusEl, "Horário adicionado.");
      novoHorarioForm.reset();
    });
  }
}

/* --------- Correção de chamadas / PDF --------- */
export async function removerChamadaDia() {
  const turmaId = document.getElementById("turmaRelatorioSelect")?.value;
  const data = document.getElementById("dataCorrecao")?.value;
  const statusEl = document.getElementById("mensagemStatus");

  if (!turmaId || !data) {
    setStatus(statusEl, "Selecione turma e data para remover.", true);
    return;
  }

  const ok = confirm(`Remover chamada do dia ${formatarDataBR(data)}?`);
  if (!ok) return;

  const removed = await removerChamada(turmaId, data);
  if (!removed) {
    setStatus(statusEl, "Não há chamada nessa data.", true);
    return;
  }

  await atualizarRelatorios();
  setStatus(statusEl, "Chamada removida.");
}

export function exportarPdfRelatorio() {
  const turmaId = document.getElementById("turmaRelatorioSelect")?.value;
  const mes = document.getElementById("mesRelatorio")?.value;
  const tbodyHtml = document.getElementById("relatorioMensalBody")?.innerHTML ?? "";
  const turma = uiState.turmas.find((t) => t.id === turmaId);

  if (!turmaId || !mes || !turma) return;

  const [ano, mesNum] = mes.split("-");
  const tituloMes = `${mesNum}/${ano}`;

  const novaJanela = window.open("", "_blank");
  if (!novaJanela) return;

  novaJanela.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório de Frequência - ${turma.nome} - ${tituloMes}</title>
<style>
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    margin: 20px;
    color: #333333;
  }
  h1 {
    font-size: 18px;
    margin-bottom: 4px;
  }
  h2 {
    font-size: 16px;
    margin-bottom: 12px;
  }
  .meta {
    font-size: 12px;
    margin-bottom: 16px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th, td {
    border: 1px solid #dddddd;
    padding: 6px 4px;
    text-align: left;
  }
  th {
    background-color: #f5f5f5;
  }
</style>
</head>
<body>
  <h1>Escola: CLS<br>Teacher: JHENNY</h1>
  <h2>Relatório de Frequência Mensal</h2>
  <div class="meta">
    <div><strong>Turma:</strong> ${turma.nome}</div>
    <div><strong>Mês:</strong> ${tituloMes}</div>
  </div>
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
  <script>
    window.onload = function() { window.print(); };
  <\/script>
</body>
</html>`);
  novaJanela.document.close();
}