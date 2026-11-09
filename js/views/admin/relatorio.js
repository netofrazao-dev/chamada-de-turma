/* Admin: relatório mensal de um professor. */
import { html, mesAtualISO, isValidMes, compararNomes, sameId, mensagemErro } from "../../utils.js";
import { icon } from "../../icons.js";
import { monthPicker, spinner, errorState, emptyState } from "../../components.js";
import { getProfessores } from "../../session.js";
import { updateQuery } from "../../router.js";
import { desenharRelatorioProfessor } from "../relatorioProfessor.js";
import { imprimirRelatorioProfessor, exportarCSVProfessor } from "../../reports.js";

export async function renderAdminRelatorio(view, ctx) {
  view.innerHTML = String(html`
    <section class="page">
      <header class="page-head">
        <div>
          <h1>Relatório por professor</h1>
          <p class="muted">Aulas, substituições e horas de cada professor no mês.</p>
        </div>
      </header>
      <div class="card filters" id="ar-filtros">${spinner()}</div>
      <div id="ar-conteudo" class="stack"></div>
    </section>`);

  let profs;
  try {
    profs = await getProfessores();
  } catch (err) {
    view.querySelector("#ar-filtros").innerHTML = String(errorState(mensagemErro(err)));
    return;
  }
  if (!ctx.isActive()) return;
  profs = [...profs].sort((a, b) => compararNomes(a.nome || a.email, b.nome || b.email));

  const estado = {
    prof: profs.some((p) => sameId(p.id, ctx.query.prof)) ? ctx.query.prof : "",
    mes: isValidMes(ctx.query.mes) ? ctx.query.mes : mesAtualISO(),
  };
  let resultado = null;

  const filtros = view.querySelector("#ar-filtros");
  filtros.innerHTML = String(html`
    <label class="field">
      <span class="field-label">Professor</span>
      <select id="ar-prof">
        <option value="">Selecione um professor...</option>
        ${profs.map((p) => html`<option value="${p.id}">${p.nome || p.email}</option>`)}
      </select>
    </label>
    <div class="field"><span class="field-label">Mês</span><div id="ar-mes"></div></div>
    <div class="field">
      <span class="field-label">Exportar</span>
      <div class="btn-row">
        <button type="button" class="btn btn-secondary btn-sm" id="ar-pdf" disabled>${icon("printer")}PDF</button>
        <button type="button" class="btn btn-secondary btn-sm" id="ar-csv" disabled>${icon("sheet")}Excel</button>
      </div>
    </div>`);

  const sel = filtros.querySelector("#ar-prof");
  const btnPdf = filtros.querySelector("#ar-pdf");
  const btnCsv = filtros.querySelector("#ar-csv");
  const conteudo = view.querySelector("#ar-conteudo");
  sel.value = estado.prof;

  const profNome = () => {
    const p = profs.find((x) => sameId(x.id, estado.prof));
    return p ? p.nome || p.email : "";
  };
  const sync = () => updateQuery({ prof: estado.prof, mes: estado.mes === mesAtualISO() ? undefined : estado.mes });

  async function carregar() {
    btnPdf.disabled = btnCsv.disabled = true;
    resultado = null;
    if (!estado.prof) {
      conteudo.innerHTML = String(emptyState({ iconName: "user", title: "Escolha um professor", text: "Selecione o professor e o mês para ver o relatório." }));
      return;
    }
    const pedido = `${estado.prof}|${estado.mes}`;
    const r = await desenharRelatorioProfessor(conteudo, {
      professorId: estado.prof,
      mes: estado.mes,
      isActive: () => ctx.isActive() && pedido === `${estado.prof}|${estado.mes}`,
    });
    if (r) {
      resultado = { r, mes: estado.mes, nome: profNome() };
      btnPdf.disabled = btnCsv.disabled = false;
    }
  }

  sel.addEventListener("change", () => {
    estado.prof = sel.value;
    sync();
    carregar();
  });
  const picker = monthPicker({
    value: estado.mes,
    onChange: (m) => {
      estado.mes = m;
      sync();
      carregar();
    },
  });
  filtros.querySelector("#ar-mes").appendChild(picker.el);
  btnPdf.addEventListener("click", () => resultado && imprimirRelatorioProfessor({ profNome: resultado.nome, mes: resultado.mes, resultado: resultado.r }));
  btnCsv.addEventListener("click", () => resultado && exportarCSVProfessor({ profNome: resultado.nome, mes: resultado.mes, resultado: resultado.r }));

  await carregar();
}
