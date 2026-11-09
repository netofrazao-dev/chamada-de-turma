/* Aba "Relatório": resumo do mês, calendário e frequência por aluno. */
import { html, mensagemErro, mesAtualISO, isValidMes, formatarHoras, formatarPercentual } from "../../utils.js";
import { icon } from "../../icons.js";
import { monthPicker, statCard, spinner, errorState, emptyState } from "../../components.js";
import { listarAlunos, listarChamadasMes } from "../../api.js";
import { nomeProfessor } from "../../session.js";
import { updateQuery } from "../../router.js";
import { frequenciaAlunos, resumoChamadas } from "../../stats.js";
import { imprimirRelatorioTurma, exportarCSVTurma } from "../../reports.js";
import { FREQUENCIA_MINIMA } from "../../config.js";
import { renderCalendario, abrirDetalheDia } from "./calendario.js";

export async function renderRelatorio(box, ctx) {
  const { turma, dias, professorNome } = ctx;
  let mes = isValidMes(ctx.query.mes) ? ctx.query.mes : mesAtualISO();
  let alunos = null;
  let dados = null;

  box.innerHTML = String(html`
    <div class="stack">
      <div class="report-bar">
        <div id="rel-mes"></div>
        <div class="btn-row">
          <button type="button" class="btn btn-secondary btn-sm" id="rel-pdf" disabled>${icon("printer")}PDF</button>
          <button type="button" class="btn btn-secondary btn-sm" id="rel-csv" disabled>${icon("sheet")}Excel</button>
        </div>
      </div>
      <div id="rel-conteudo">${spinner()}</div>
    </div>`);

  const picker = monthPicker({
    value: mes,
    onChange: (m) => {
      mes = m;
      updateQuery({ mes: m === mesAtualISO() ? undefined : m });
      carregar();
    },
  });
  box.querySelector("#rel-mes").appendChild(picker.el);
  const conteudo = box.querySelector("#rel-conteudo");
  const btnPdf = box.querySelector("#rel-pdf");
  const btnCsv = box.querySelector("#rel-csv");

  btnPdf.addEventListener("click", () => {
    if (!dados) return;
    imprimirRelatorioTurma({
      turma,
      professorNome,
      mes: dados.mes,
      frequencia: dados.frequencia,
      resumo: dados.resumo,
      chamadas: dados.chamadas,
      alunos,
      nomeSubstituto: (c) => (c.substituto_nome_manual ? `${c.substituto_nome_manual} (externo)` : nomeProfessor(c.professor_substituto_id)),
    });
  });
  btnCsv.addEventListener("click", () => {
    if (!dados) return;
    exportarCSVTurma({ turma, mes: dados.mes, frequencia: dados.frequencia, chamadas: dados.chamadas });
  });

  async function carregar() {
    const pedido = mes;
    conteudo.classList.add("is-loading");
    btnPdf.disabled = btnCsv.disabled = true;
    try {
      const [als, chamadas] = await Promise.all([alunos ? alunos : listarAlunos(turma.id), listarChamadasMes(turma.id, pedido)]);
      if (!ctx.isActive() || pedido !== mes) return;
      alunos = als;
      dados = { mes: pedido, chamadas, frequencia: frequenciaAlunos(alunos, chamadas), resumo: resumoChamadas(chamadas) };
      desenhar();
      btnPdf.disabled = btnCsv.disabled = false;
    } catch (err) {
      if (!ctx.isActive()) return;
      conteudo.innerHTML = String(errorState(mensagemErro(err)));
      conteudo.querySelector("[data-retry]").addEventListener("click", carregar);
    } finally {
      conteudo.classList.remove("is-loading");
    }
  }

  function desenhar() {
    const { resumo: r, frequencia, chamadas } = dados;
    const comDados = frequencia.filter((f) => f.total > 0);
    const media = comDados.length ? comDados.reduce((a, f) => a + f.percentual, 0) / comDados.length : null;
    const baixos = comDados.filter((f) => f.percentual < FREQUENCIA_MINIMA).length;

    conteudo.innerHTML = String(html`
      <div class="stat-grid">
        ${statCard({ label: "Aulas no mês", value: r.total, iconName: "calendarCheck" })}
        ${statCard({ label: "Frequência média", value: formatarPercentual(media), iconName: "chart", tone: media !== null && media < FREQUENCIA_MINIMA ? "warning" : "success" })}
        ${statCard({ label: "Carga horária", value: formatarHoras(r.horas), iconName: "clock", tone: "primary" })}
        ${statCard({ label: "Com substituto", value: r.substituidas, iconName: "repeat", tone: "purple" })}
        ${statCard({ label: "Não aconteceram", value: r.canceladas, iconName: "xCircle", tone: "danger" })}
        ${r.reforco || r.reposicao ? statCard({ label: "Reforço / Reposição", value: `${r.reforco} / ${r.reposicao}`, iconName: "book", tone: "info" }) : ""}
      </div>

      <section class="card">
        <h2 class="card-title">${icon("calendar")}Calendário de aulas</h2>
        <p class="muted small">Toque em um dia para ver os detalhes${dias.length ? "" : ". Defina os dias de aula da turma para ver também os dias que ficaram sem chamada"}.</p>
        <div id="rel-cal"></div>
      </section>

      <section class="card list-card">
        <div class="list-head">
          <h2 class="card-title">${icon("users")}Frequência por aluno</h2>
          ${baixos ? html`<span class="pill pill-warning">${icon("alert")}${baixos} abaixo de ${FREQUENCIA_MINIMA}%</span>` : ""}
        </div>
        ${frequencia.length
          ? html`<ul class="freq-list">
              ${frequencia.map((f) => {
                const low = f.percentual !== null && f.percentual < FREQUENCIA_MINIMA;
                return html`
                  <li class="freq-row ${low ? "is-low" : ""}">
                    <div class="freq-top">
                      <span class="freq-nome">${f.aluno.nome}</span>
                      <span class="freq-num">${f.total ? html`<span class="muted">${f.presencas}P · ${f.faltas}F</span><strong>${formatarPercentual(f.percentual)}</strong>` : html`<span class="muted">Sem aulas no mês</span>`}</span>
                    </div>
                    <div class="progress ${low ? "progress-warn" : ""}"><span style="width:${f.percentual ?? 0}%"></span></div>
                  </li>`;
              })}
            </ul>`
          : emptyState({ iconName: "users", title: "Nenhum aluno na turma" })}
      </section>`);

    conteudo.querySelector("#rel-cal").appendChild(
      renderCalendario({
        mes: dados.mes,
        chamadas,
        alunos,
        dias,
        onDayClick: (data, chamada) => abrirDetalheDia({ turma, data, chamada, alunos, onChanged: carregar }),
      })
    );
  }

  await carregar();
}
