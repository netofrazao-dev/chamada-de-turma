/* Painel da coordenação: visão geral e turmas de cada professor. */
import { html, el, mensagemErro, hojeISO, mesAtualISO, nomeMes, formatarDataLonga, normalizar, compararNomes, plural, sameId } from "../../utils.js";
import { icon } from "../../icons.js";
import { statCard, spinner, errorState, emptyState, avatar } from "../../components.js";
import { listarTodasTurmas, resumoAdmin, resumoTurmas } from "../../api.js";
import { getProfessores } from "../../session.js";
import { turmaCard } from "../turmas.js";

export async function renderAdminInicio(view, ctx) {
  view.innerHTML = String(html`
    <section class="page">
      <header class="page-hero">
        <div>
          <p class="eyebrow">${formatarDataLonga(hojeISO())}</p>
          <h1>Painel da coordenação</h1>
          <p class="muted">Acompanhe professores, turmas e chamadas.</p>
        </div>
      </header>
      <div id="adm-stats" class="stat-grid">${spinner()}</div>
      <div class="list-head">
        <h2 class="section-title">Professores <span class="count" id="adm-count"></span></h2>
        <label class="search search-sm">${icon("search")}<input type="search" id="adm-busca" placeholder="Buscar professor" aria-label="Buscar professor"></label>
      </div>
      <div id="adm-profs"></div>
    </section>`);

  const statsEl = view.querySelector("#adm-stats");
  const profsEl = view.querySelector("#adm-profs");
  const mes = mesAtualISO();

  let profs;
  let turmas;
  let resumo;
  try {
    [profs, turmas, resumo] = await Promise.all([getProfessores({ force: true }), listarTodasTurmas(), resumoAdmin(mes)]);
  } catch (err) {
    if (!ctx.isActive()) return;
    statsEl.innerHTML = "";
    profsEl.innerHTML = String(errorState(mensagemErro(err)));
    profsEl.querySelector("[data-retry]").addEventListener("click", () => renderAdminInicio(view, ctx));
    return;
  }
  if (!ctx.isActive()) return;

  const ativas = turmas.filter((t) => t.ativo !== false);
  statsEl.innerHTML = String(html`
    ${statCard({ label: "Professores", value: profs.length, iconName: "users", tone: "primary" })}
    ${statCard({ label: "Turmas ativas", value: ativas.length, iconName: "cap", tone: "info" })}
    ${statCard({ label: "Alunos ativos", value: resumo.alunos ?? "–", iconName: "user", tone: "success" })}
    ${statCard({ label: `Chamadas em ${nomeMes(mes).split(" ")[0].toLowerCase()}`, value: resumo.chamadasMes ?? "–", iconName: "clipboard", tone: "purple" })}`);

  const ordenados = [...profs].sort((a, b) => compararNomes(a.nome || a.email, b.nome || b.email));
  view.querySelector("#adm-count").textContent = ordenados.length;

  const desenhar = (filtro = "") => {
    const f = normalizar(filtro);
    const vis = ordenados.filter((p) => !f || normalizar(`${p.nome} ${p.email}`).includes(f));
    if (!vis.length) {
      profsEl.innerHTML = String(emptyState({ iconName: "search", title: "Nenhum professor encontrado" }));
      return;
    }
    profsEl.innerHTML = String(html`
      <div class="card-grid prof-grid">
        ${vis.map((p) => {
          const n = ativas.filter((t) => sameId(t.professor_id, p.id)).length;
          return html`
            <a class="prof-card" href="#/admin/professor/${p.id}">
              ${avatar(p.nome || p.email, "avatar-lg")}
              <div class="prof-info">
                <strong>${p.nome || p.email}</strong>
                <span class="muted small">${p.email || ""}</span>
                <span class="pill-row">
                  <span class="pill">${icon("cap")}${plural(n, "turma", "turmas")}</span>
                  ${p.role === "admin" ? html`<span class="pill pill-primary">${icon("shield")}Admin</span>` : ""}
                </span>
              </div>
              ${icon("chevronRight", "chev")}
            </a>`;
        })}
      </div>`);
  };
  view.querySelector("#adm-busca").addEventListener("input", (e) => desenhar(e.target.value));
  desenhar();
}

export async function renderAdminProfessor(view, ctx) {
  const { id } = ctx.params;
  view.innerHTML = String(spinner());
  let prof;
  let turmas;
  let resumo;
  try {
    const [profs, todas] = await Promise.all([getProfessores(), listarTodasTurmas()]);
    prof = profs.find((p) => sameId(p.id, id));
    turmas = todas.filter((t) => sameId(t.professor_id, id) && t.ativo !== false).sort((a, b) => compararNomes(a.nome, b.nome));
    resumo = await resumoTurmas(turmas);
  } catch (err) {
    if (!ctx.isActive()) return;
    view.innerHTML = String(errorState(mensagemErro(err)));
    view.querySelector("[data-retry]").addEventListener("click", () => renderAdminProfessor(view, ctx));
    return;
  }
  if (!ctx.isActive()) return;

  if (!prof) {
    view.innerHTML = String(html`<section class="page">${emptyState({ iconName: "alert", title: "Professor não encontrado", action: html`<a class="btn btn-primary" href="#/admin">${icon("arrowLeft")}Voltar</a>` })}</section>`);
    return;
  }

  view.innerHTML = String(html`
    <section class="page">
      <header class="turma-header">
        <a class="icon-btn back-btn" href="#/admin" aria-label="Voltar">${icon("arrowLeft")}</a>
        ${avatar(prof.nome || prof.email, "avatar-lg")}
        <div class="turma-header-info">
          <h1>${prof.nome || prof.email}</h1>
          <p class="muted"><span>${icon("mail")}${prof.email || "-"}</span>${prof.role === "admin" ? html`<span>${icon("shield")}Admin</span>` : ""}</p>
        </div>
      </header>
      <div class="btn-row">
        <a class="btn btn-secondary" href="#/admin/relatorio?prof=${prof.id}">${icon("file")}Relatório mensal</a>
        <a class="btn btn-ghost" href="#/admin/chamadas?prof=${prof.id}">${icon("clipboard")}Ver chamadas</a>
      </div>
      <h2 class="section-title">Turmas <span class="count">${turmas.length}</span></h2>
      <div id="prof-turmas"></div>
    </section>`);

  const alvo = view.querySelector("#prof-turmas");
  if (!turmas.length) {
    alvo.innerHTML = String(emptyState({ iconName: "cap", title: "Nenhuma turma ativa", text: "Este professor ainda não criou turmas." }));
    return;
  }
  const grid = el('<div class="card-grid"></div>');
  turmas.forEach((t) => grid.appendChild(turmaCard(t, resumo.get(String(t.id)), { onChanged: () => renderAdminProfessor(view, ctx) })));
  alvo.appendChild(grid);
}
