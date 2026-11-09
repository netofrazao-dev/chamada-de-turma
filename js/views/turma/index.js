/* Tela da turma: cabeçalho + abas (Chamada, Alunos, Relatório). */
import { html, mensagemErro, DIAS_SEMANA } from "../../utils.js";
import { icon } from "../../icons.js";
import { errorState, spinner, abrirMenu } from "../../components.js";
import { obterTurma, listarDiasTurma } from "../../api.js";
import { session, getProfessores, nomeProfessor } from "../../session.js";
import { navigate } from "../../router.js";
import { abrirFormTurma, confirmarExclusaoTurma } from "../turmas.js";
import { renderChamada } from "./chamada.js";
import { renderAlunos } from "./alunos.js";
import { renderRelatorio } from "./relatorio.js";

const ABAS = [
  { id: "chamada", label: "Chamada", icon: "clipboard", render: renderChamada },
  { id: "alunos", label: "Alunos", icon: "users", render: renderAlunos },
  { id: "relatorio", label: "Relatório", icon: "chart", render: renderRelatorio },
];

export async function renderTurma(view, ctx) {
  const { id } = ctx.params;
  const aba = ABAS.find((a) => a.id === ctx.params.aba);
  if (!aba) {
    navigate(`/turma/${id}/chamada`, { replace: true });
    return;
  }

  view.innerHTML = String(spinner("Abrindo turma..."));

  let turma;
  let dias = [];
  try {
    [turma, dias] = await Promise.all([obterTurma(id), listarDiasTurma(id).catch(() => [])]);
    await getProfessores();
  } catch (err) {
    if (!ctx.isActive()) return;
    view.innerHTML = String(errorState(mensagemErro(err)));
    view.querySelector("[data-retry]").addEventListener("click", () => renderTurma(view, ctx));
    return;
  }
  if (!ctx.isActive()) return;

  if (!turma || turma.ativo === false) {
    view.innerHTML = String(html`
      <section class="page">
        <div class="empty-state">
          <div class="empty-icon">${icon("alert")}</div>
          <h3>Turma não encontrada</h3>
          <p>Ela pode ter sido excluída ou você não tem acesso a ela.</p>
          <a class="btn btn-primary" href="#/">${icon("arrowLeft")}Voltar para as turmas</a>
        </div>
      </section>`);
    return;
  }

  const ehDono = String(turma.professor_id) === String(session.professor.id);
  const professorNome = nomeProfessor(turma.professor_id) || (ehDono ? session.professor.nome : "");
  const voltar = session.isAdmin && !ehDono ? `#/admin/professor/${turma.professor_id}` : "#/";

  view.innerHTML = String(html`
    <section class="page page-turma">
      <header class="turma-header">
        <a class="icon-btn back-btn" href="${voltar}" aria-label="Voltar">${icon("arrowLeft")}</a>
        <div class="turma-header-info">
          <h1>${turma.nome}</h1>
          <p class="muted">
            ${turma.descricao ? html`<span>${turma.descricao}</span>` : ""}
            ${session.isAdmin && professorNome ? html`<span>${icon("user")}${professorNome}</span>` : ""}
            ${dias.length ? html`<span>${icon("calendar")}${dias.map((d) => DIAS_SEMANA[d]).join(", ")}</span>` : ""}
          </p>
        </div>
        <button type="button" class="icon-btn" id="turma-more" aria-label="Opções da turma">${icon("more")}</button>
      </header>
      <nav class="tabs" role="tablist" aria-label="Seções da turma">
        ${ABAS.map((a) => html`
          <a role="tab" href="#/turma/${turma.id}/${a.id}" data-aba="${a.id}" class="tab ${a.id === aba.id ? "active" : ""}" aria-selected="${a.id === aba.id}">
            ${icon(a.icon)}<span>${a.label}</span>
          </a>`)}
      </nav>
      <div id="tab-content" class="tab-content"></div>
    </section>`);

  // Trocar de aba não cria entrada nova no histórico (voltar sai da turma).
  view.querySelectorAll(".tabs a").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      navigate(`/turma/${turma.id}/${a.dataset.aba}`, { replace: true });
    })
  );

  view.querySelector("#turma-more").addEventListener("click", (e) => {
    abrirMenu(e.currentTarget, [
      { label: "Editar turma", icon: "pencil", onClick: () => abrirFormTurma({ turma, dias, onSaved: () => renderTurma(view, ctx) }) },
      { label: "Excluir turma", icon: "trash", danger: true, onClick: () => confirmarExclusaoTurma(turma, () => navigate(voltar.slice(1))) },
    ]);
  });

  const turmaCtx = { ...ctx, turma, dias, professorNome, ehDono };
  await aba.render(view.querySelector("#tab-content"), turmaCtx);
}
