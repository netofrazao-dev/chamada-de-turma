/* Relatório mensal de aulas/horas de um professor (usado pelo professor e pelo admin). */
import { html, mensagemErro, formatarHoras, parseISODate, DIAS_CURTOS, TIPOS_AULA, isAulaExtra, horasDaChamada, mesAtualISO, isValidMes, plural } from "../utils.js";
import { icon } from "../icons.js";
import { statCard, spinner, errorState, emptyState, monthPicker } from "../components.js";
import { listarAulasProfessorMes } from "../api.js";
import { updateQuery } from "../router.js";
import { session, nomeUsuario } from "../session.js";
import { imprimirRelatorioProfessor, exportarCSVProfessor } from "../reports.js";

const STATUS = {
  propria: { label: "Ministrada", pill: "success", icon: "check" },
  substituicao: { label: "Como substituto", pill: "purple", icon: "repeat" },
  substituida: { label: "Substituída", pill: "danger", icon: "transfer" },
  cancelada: { label: "Não aconteceu", pill: "muted", icon: "x" },
};

export async function desenharRelatorioProfessor(alvo, { professorId, mes, isActive = () => true }) {
  alvo.innerHTML = String(spinner("Calculando horas..."));
  let r;
  try {
    r = await listarAulasProfessorMes(professorId, mes);
  } catch (err) {
    if (!isActive()) return null;
    alvo.innerHTML = String(errorState(mensagemErro(err)));
    alvo.querySelector("[data-retry]").addEventListener("click", () => desenharRelatorioProfessor(alvo, { professorId, mes, isActive }));
    return null;
  }
  if (!isActive()) return null;

  alvo.innerHTML = String(html`
    <div class="stat-grid">
      ${statCard({ label: "Total de horas", value: formatarHoras(r.horasTotal), iconName: "clock", tone: "primary" })}
      ${statCard({ label: "Aulas próprias", value: r.qtdProprias, hint: formatarHoras(r.horasProprias), iconName: "checkCircle", tone: "success" })}
      ${statCard({ label: "Como substituto", value: r.qtdSubstituicao, hint: formatarHoras(r.horasSubstituicao), iconName: "repeat", tone: "purple" })}
      ${statCard({ label: "Substituídas por outro", value: r.qtdSubstituidas, hint: "não contam horas", iconName: "transfer", tone: "danger" })}
      ${r.qtdCanceladas ? statCard({ label: "Não aconteceram", value: r.qtdCanceladas, iconName: "xCircle" }) : ""}
    </div>
    <section class="card list-card">
      <div class="list-head">
        <h2 class="card-title">${icon("calendar")}Aulas do mês <span class="count">${r.aulas.length}</span></h2>
      </div>
      ${r.aulas.length
        ? html`<ul class="aula-list">
            ${r.aulas.map((a) => {
              const s = STATUS[a.tipo];
              const conta = a.tipo === "propria" || a.tipo === "substituicao";
              const d = parseISODate(a.data);
              return html`
                <li class="aula-row ${conta ? "" : "is-muted"}">
                  <span class="date-chip"><b>${String(d.getDate()).padStart(2, "0")}</b><small>${DIAS_CURTOS[d.getDay()]}</small></span>
                  <div class="aula-info">
                    <strong>${a.turma_nome}</strong>
                    <span class="pill-row">
                      <span class="pill pill-${s.pill}">${icon(s.icon)}${s.label}${a.tipo === "substituida" ? ` por ${a.substituto_nome}` : ""}</span>
                      ${isAulaExtra(a.tipo_aula) ? html`<span class="pill pill-info">${TIPOS_AULA[a.tipo_aula]}</span>` : ""}
                    </span>
                  </div>
                  <span class="aula-horas">${conta ? formatarHoras(horasDaChamada(a)) : "—"}</span>
                </li>`;
            })}
          </ul>
          <p class="note muted">${icon("info")}<span>Aula normal vale 1,5h; reforço e reposição valem 1h. ${plural(r.aulas.length, "aula listada", "aulas listadas")}.</span></p>`
        : emptyState({ iconName: "calendar", title: "Nenhuma aula neste mês", text: "As chamadas salvas nas suas turmas aparecem aqui automaticamente." })}
    </section>`);
  return r;
}

/** Tela "Meu relatório" do professor. */
export async function renderMeuRelatorio(view, ctx) {
  let mes = isValidMes(ctx.query.mes) ? ctx.query.mes : mesAtualISO();
  let resultado = null;
  const profNome = nomeUsuario();

  view.innerHTML = String(html`
    <section class="page">
      <header class="page-head">
        <div>
          <h1>Meu relatório</h1>
          <p class="muted">Suas aulas, substituições e carga horária do mês.</p>
        </div>
      </header>
      <div class="report-bar">
        <div id="mr-mes"></div>
        <div class="btn-row">
          <button type="button" class="btn btn-secondary btn-sm" id="mr-pdf" disabled>${icon("printer")}PDF</button>
          <button type="button" class="btn btn-secondary btn-sm" id="mr-csv" disabled>${icon("sheet")}Excel</button>
        </div>
      </div>
      <div id="mr-conteudo" class="stack"></div>
    </section>`);

  const alvo = view.querySelector("#mr-conteudo");
  const btnPdf = view.querySelector("#mr-pdf");
  const btnCsv = view.querySelector("#mr-csv");

  async function carregar() {
    btnPdf.disabled = btnCsv.disabled = true;
    const pedido = mes;
    const r = await desenharRelatorioProfessor(alvo, { professorId: session.professor.id, mes: pedido, isActive: () => ctx.isActive() && pedido === mes });
    if (r) {
      resultado = { r, mes: pedido };
      btnPdf.disabled = btnCsv.disabled = false;
    }
  }

  const picker = monthPicker({
    value: mes,
    onChange: (m) => {
      mes = m;
      updateQuery({ mes: m === mesAtualISO() ? undefined : m });
      carregar();
    },
  });
  view.querySelector("#mr-mes").appendChild(picker.el);
  btnPdf.addEventListener("click", () => resultado && imprimirRelatorioProfessor({ profNome, mes: resultado.mes, resultado: resultado.r }));
  btnCsv.addEventListener("click", () => resultado && exportarCSVProfessor({ profNome, mes: resultado.mes, resultado: resultado.r }));

  await carregar();
}
