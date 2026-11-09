/* Admin: chamadas por turma e mês. */
import { html, mensagemErro, mesAtualISO, isValidMes, formatarDataCurta, TIPOS_AULA, isAulaExtra, statusAula, compararNomes, sameId } from "../../utils.js";
import { icon } from "../../icons.js";
import { monthPicker, spinner, errorState, emptyState } from "../../components.js";
import { listarTodasTurmas, listarAlunos, listarChamadasMes, listarDiasTurma } from "../../api.js";
import { getProfessores, nomeProfessor } from "../../session.js";
import { updateQuery } from "../../router.js";
import { contagemDia, resumoChamadas } from "../../stats.js";
import { renderCalendario, abrirDetalheDia } from "../turma/calendario.js";

export async function renderAdminChamadas(view, ctx) {
  view.innerHTML = String(html`
    <section class="page">
      <header class="page-head">
        <div>
          <h1>Chamadas</h1>
          <p class="muted">Veja os dias com e sem chamada de cada turma.</p>
        </div>
      </header>
      <div class="card filters" id="ac-filtros">${spinner()}</div>
      <div id="ac-conteudo" class="stack"></div>
    </section>`);

  let profs;
  let turmas;
  try {
    [profs, turmas] = await Promise.all([getProfessores(), listarTodasTurmas()]);
  } catch (err) {
    if (!ctx.isActive()) return;
    view.querySelector("#ac-filtros").innerHTML = String(errorState(mensagemErro(err)));
    view.querySelector("[data-retry]").addEventListener("click", () => renderAdminChamadas(view, ctx));
    return;
  }
  if (!ctx.isActive()) return;

  turmas = turmas.filter((t) => t.ativo !== false).sort((a, b) => compararNomes(a.nome, b.nome));
  const profsOrd = [...profs].sort((a, b) => compararNomes(a.nome || a.email, b.nome || b.email));
  const estado = {
    prof: ctx.query.prof || "",
    turma: ctx.query.turma || "",
    mes: isValidMes(ctx.query.mes) ? ctx.query.mes : mesAtualISO(),
  };

  const filtros = view.querySelector("#ac-filtros");
  filtros.innerHTML = String(html`
    <label class="field">
      <span class="field-label">Professor</span>
      <select id="ac-prof">
        <option value="">Todos os professores</option>
        ${profsOrd.map((p) => html`<option value="${p.id}">${p.nome || p.email}</option>`)}
      </select>
    </label>
    <label class="field">
      <span class="field-label">Turma</span>
      <select id="ac-turma"></select>
    </label>
    <div class="field">
      <span class="field-label">Mês</span>
      <div id="ac-mes"></div>
    </div>`);

  const selProf = filtros.querySelector("#ac-prof");
  const selTurma = filtros.querySelector("#ac-turma");
  const conteudo = view.querySelector("#ac-conteudo");
  selProf.value = estado.prof;

  function preencherTurmas() {
    const lista = turmas.filter((t) => !estado.prof || sameId(t.professor_id, estado.prof));
    selTurma.innerHTML = String(
      lista.length
        ? html`${lista.map((t) => html`<option value="${t.id}">${t.nome}${estado.prof ? "" : ` — ${nomeProfessor(t.professor_id, profs) || "?"}`}</option>`)}`
        : html`<option value="">Nenhuma turma</option>`
    );
    if (!lista.some((t) => sameId(t.id, estado.turma))) estado.turma = lista[0]?.id ?? "";
    selTurma.value = estado.turma;
  }

  const sync = () => updateQuery({ prof: estado.prof, turma: estado.turma, mes: estado.mes === mesAtualISO() ? undefined : estado.mes });

  selProf.addEventListener("change", () => {
    estado.prof = selProf.value;
    preencherTurmas();
    sync();
    carregar();
  });
  selTurma.addEventListener("change", () => {
    estado.turma = selTurma.value;
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
  filtros.querySelector("#ac-mes").appendChild(picker.el);

  async function carregar() {
    const turma = turmas.find((t) => sameId(t.id, estado.turma));
    if (!turma) {
      conteudo.innerHTML = String(emptyState({ iconName: "cap", title: "Nenhuma turma para mostrar" }));
      return;
    }
    const pedido = `${estado.turma}|${estado.mes}`;
    conteudo.innerHTML = String(spinner("Carregando chamadas..."));
    try {
      const [alunos, chamadas, dias] = await Promise.all([
        listarAlunos(turma.id),
        listarChamadasMes(turma.id, estado.mes),
        listarDiasTurma(turma.id).catch(() => []),
      ]);
      if (!ctx.isActive() || pedido !== `${estado.turma}|${estado.mes}`) return;
      desenhar(turma, alunos, chamadas, dias);
    } catch (err) {
      if (!ctx.isActive()) return;
      conteudo.innerHTML = String(errorState(mensagemErro(err)));
      conteudo.querySelector("[data-retry]").addEventListener("click", carregar);
    }
  }

  function desenhar(turma, alunos, chamadas, dias) {
    const r = resumoChamadas(chamadas);
    conteudo.innerHTML = String(html`
      <section class="card">
        <div class="list-head">
          <div>
            <h2 class="card-title">${turma.nome}</h2>
            <p class="muted small">${nomeProfessor(turma.professor_id, profs) || ""} • ${r.total} ${r.total === 1 ? "chamada" : "chamadas"} no mês</p>
          </div>
          <a class="btn btn-ghost btn-sm" href="#/turma/${turma.id}/relatorio?mes=${estado.mes}">${icon("chart")}Abrir turma</a>
        </div>
        <div id="ac-cal"></div>
      </section>
      <section class="card list-card">
        <h2 class="card-title">${icon("list")}Chamadas registradas</h2>
        ${chamadas.length
          ? html`<div class="table-wrap"><table class="table">
              <thead><tr><th>Data</th><th>Tipo</th><th>Aula</th><th class="num">Presentes</th><th class="num">Faltas</th></tr></thead>
              <tbody>
                ${chamadas.map((c) => {
                  const cont = contagemDia(c, alunos);
                  const st = statusAula(c);
                  return html`<tr data-date="${c.data}" class="clickable">
                    <td class="nowrap">${formatarDataCurta(c.data)}</td>
                    <td><span class="pill ${isAulaExtra(c.tipo_aula) ? "pill-info" : ""}">${TIPOS_AULA[c.tipo_aula] || "Normal"}</span></td>
                    <td>${st === "ministrada" ? html`<span class="pill pill-success">Ministrada</span>` : st === "substituida" ? html`<span class="pill pill-purple">Substituto</span>` : html`<span class="pill pill-danger">Não aconteceu</span>`}</td>
                    <td class="num">${st === "cancelada" ? "–" : cont.presentes}</td>
                    <td class="num">${st === "cancelada" ? "–" : cont.ausentes}</td>
                  </tr>`;
                })}
              </tbody></table></div>`
          : emptyState({ iconName: "clipboard", title: "Nenhuma chamada neste mês" })}
      </section>`);

    const abrir = (data, chamada) => abrirDetalheDia({ turma, data, chamada, alunos, onChanged: carregar });
    conteudo.querySelector("#ac-cal").appendChild(renderCalendario({ mes: estado.mes, chamadas, alunos, dias, onDayClick: abrir }));
    conteudo.querySelectorAll("tr[data-date]").forEach((tr) =>
      tr.addEventListener("click", () => abrir(tr.dataset.date, chamadas.find((c) => c.data === tr.dataset.date)))
    );
  }

  preencherTurmas();
  sync();
  await carregar();
}
