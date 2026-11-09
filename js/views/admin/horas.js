/* Admin: horas por professor em um período. */
import { html, mensagemErro, mesAtualISO, addMeses, ultimoDiaDoMes, formatarHoras, formatarDataBR, isValidISODate } from "../../utils.js";
import { icon } from "../../icons.js";
import { spinner, errorState, emptyState, avatar, statCard } from "../../components.js";
import { calcularHorasPorProfessor } from "../../api.js";
import { updateQuery } from "../../router.js";
import { exportarCSVHoras } from "../../reports.js";

function periodoMes(mes) {
  return { inicio: `${mes}-01`, fim: ultimoDiaDoMes(mes) };
}

export async function renderAdminHoras(view, ctx) {
  const padrao = periodoMes(mesAtualISO());
  const estado = {
    inicio: isValidISODate(ctx.query.de) ? ctx.query.de : ctx.query.de === "" ? "" : padrao.inicio,
    fim: isValidISODate(ctx.query.ate) ? ctx.query.ate : ctx.query.ate === "" ? "" : padrao.fim,
  };
  let dados = [];

  view.innerHTML = String(html`
    <section class="page">
      <header class="page-head">
        <div>
          <h1>Horas por professor</h1>
          <p class="muted">Aulas ministradas e substituições no período escolhido.</p>
        </div>
        <button type="button" class="btn btn-secondary" id="ah-csv" disabled>${icon("sheet")}Exportar Excel</button>
      </header>
      <div class="card filters">
        <label class="field"><span class="field-label">De</span><input type="date" id="ah-de"></label>
        <label class="field"><span class="field-label">Até</span><input type="date" id="ah-ate"></label>
        <div class="field">
          <span class="field-label">Atalhos</span>
          <div class="chip-row">
            <button type="button" class="chip" data-p="mes">Este mês</button>
            <button type="button" class="chip" data-p="anterior">Mês passado</button>
            <button type="button" class="chip" data-p="tudo">Todo o período</button>
          </div>
        </div>
      </div>
      <div id="ah-conteudo" class="stack"></div>
    </section>`);

  const de = view.querySelector("#ah-de");
  const ate = view.querySelector("#ah-ate");
  const conteudo = view.querySelector("#ah-conteudo");
  const btnCsv = view.querySelector("#ah-csv");
  de.value = estado.inicio;
  ate.value = estado.fim;

  const aplicar = () => {
    estado.inicio = de.value;
    estado.fim = ate.value;
    updateQuery({ de: estado.inicio, ate: estado.fim });
    carregar();
  };
  de.addEventListener("change", aplicar);
  ate.addEventListener("change", aplicar);
  view.querySelectorAll("[data-p]").forEach((b) =>
    b.addEventListener("click", () => {
      let p = { inicio: "", fim: "" };
      if (b.dataset.p === "mes") p = periodoMes(mesAtualISO());
      if (b.dataset.p === "anterior") p = periodoMes(addMeses(mesAtualISO(), -1));
      de.value = p.inicio;
      ate.value = p.fim;
      aplicar();
    })
  );
  btnCsv.addEventListener("click", () => exportarCSVHoras({ dados, inicio: estado.inicio, fim: estado.fim }));

  async function carregar() {
    const pedido = `${estado.inicio}|${estado.fim}`;
    btnCsv.disabled = true;
    conteudo.innerHTML = String(spinner("Calculando horas..."));
    try {
      const r = await calcularHorasPorProfessor({ inicio: estado.inicio || undefined, fim: estado.fim || undefined });
      if (!ctx.isActive() || pedido !== `${estado.inicio}|${estado.fim}`) return;
      dados = r;
      desenhar();
      btnCsv.disabled = !dados.length;
    } catch (err) {
      if (!ctx.isActive()) return;
      conteudo.innerHTML = String(errorState(mensagemErro(err)));
      conteudo.querySelector("[data-retry]").addEventListener("click", carregar);
    }
  }

  function desenhar() {
    const total = dados.reduce((a, p) => a + p.horas_total, 0);
    const aulas = dados.reduce((a, p) => a + p.aulas, 0);
    const max = Math.max(1, ...dados.map((p) => p.horas_total));
    const periodo = estado.inicio || estado.fim
      ? `${estado.inicio ? formatarDataBR(estado.inicio) : "início"} a ${estado.fim ? formatarDataBR(estado.fim) : "hoje"}`
      : "Todo o período";

    conteudo.innerHTML = String(html`
      <div class="stat-grid">
        ${statCard({ label: "Total de horas", value: formatarHoras(total), iconName: "clock", tone: "primary", hint: periodo })}
        ${statCard({ label: "Aulas contabilizadas", value: aulas, iconName: "calendarCheck", tone: "success" })}
        ${statCard({ label: "Professores com aulas", value: dados.filter((p) => p.aulas > 0).length, iconName: "users", tone: "info" })}
      </div>
      <section class="card list-card">
        <h2 class="card-title">${icon("chart")}Ranking de horas</h2>
        ${dados.length
          ? html`<ul class="hours-list">
              ${dados.map((p) => html`
                <li class="hours-row">
                  ${avatar(p.nome || p.email)}
                  <div class="hours-info">
                    <div class="hours-top">
                      <a href="#/admin/professor/${p.id}"><strong>${p.nome || p.email}</strong></a>
                      <strong class="hours-total">${formatarHoras(p.horas_total)}</strong>
                    </div>
                    <div class="bar-split" title="Próprias: ${formatarHoras(p.horas_proprias)} • Substituição: ${formatarHoras(p.horas_substituicao)}">
                      <span class="bar-own" style="width:${(p.horas_proprias / max) * 100}%"></span>
                      <span class="bar-sub" style="width:${(p.horas_substituicao / max) * 100}%"></span>
                    </div>
                    <div class="muted small">${p.aulas} ${p.aulas === 1 ? "aula" : "aulas"} • próprias ${formatarHoras(p.horas_proprias)} • substituição ${formatarHoras(p.horas_substituicao)}${p.role === "admin" ? " • Admin" : ""}</div>
                  </div>
                </li>`)}
            </ul>
            <div class="legend-inline"><span><i class="bar-own"></i>Aulas próprias</span><span><i class="bar-sub"></i>Substituições</span></div>`
          : emptyState({ iconName: "users", title: "Nenhum professor encontrado" })}
      </section>`);
  }

  await carregar();
}
