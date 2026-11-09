/* Tela inicial do professor: "Minhas turmas" + componentes de turma. */
import {
  html, el, mensagemErro, hojeISO, formatarDataLonga, primeiroNome, DIAS_CURTOS, DIAS_SEMANA,
  diaDaSemana, plural, normalizar, compararNomes,
} from "../utils.js";
import { icon } from "../icons.js";
import { openModal, confirmar, toast, toastErro, setBusy, abrirMenu, emptyState, errorState, spinner } from "../components.js";
import { listarTurmas, resumoTurmas, criarTurma, atualizarTurma, excluirTurma, definirDiasTurma } from "../api.js";
import { session, nomeUsuario } from "../session.js";
import { navigate } from "../router.js";

/* ---------------- Card de turma ---------------- */

export function turmaCard(turma, resumo, { onChanged, mostrarAcoes = true } = {}) {
  const r = resumo || { alunos: 0, dias: [], chamadaHoje: false };
  const hoje = diaDaSemana(hojeISO());
  const temAulaHoje = r.dias.includes(hoje);

  const card = el(html`
    <article class="turma-card ${temAulaHoje ? "is-today" : ""}">
      <a class="turma-card-main" href="#/turma/${turma.id}/chamada">
        <div class="turma-card-top">
          <h3 class="turma-card-title">${turma.nome}</h3>
          ${r.chamadaHoje
            ? html`<span class="pill pill-success">${icon("check")}Chamada de hoje feita</span>`
            : temAulaHoje
              ? html`<span class="pill pill-warning">${icon("clock")}Aula hoje</span>`
              : ""}
        </div>
        ${turma.descricao ? html`<p class="turma-card-desc">${turma.descricao}</p>` : ""}
        <div class="turma-card-meta">
          <span>${icon("users")}${plural(r.alunos, "aluno", "alunos")}</span>
          <span class="dias-chips" title="${r.dias.map((d) => DIAS_SEMANA[d]).join(", ") || "Dias de aula não definidos"}">
            ${r.dias.length
              ? DIAS_CURTOS.map((d, i) => html`<i class="${r.dias.includes(i) ? "on" : ""} ${i === hoje ? "today" : ""}">${d[0]}</i>`)
              : html`<em>Dias não definidos</em>`}
          </span>
        </div>
      </a>
      <div class="turma-card-actions">
        <a class="btn btn-primary btn-sm" href="#/turma/${turma.id}/chamada">${icon("clipboard")}Chamada</a>
        <a class="btn btn-ghost btn-sm" href="#/turma/${turma.id}/alunos">${icon("users")}Alunos</a>
        <a class="btn btn-ghost btn-sm" href="#/turma/${turma.id}/relatorio">${icon("chart")}Relatório</a>
        ${mostrarAcoes ? html`<button type="button" class="icon-btn" data-more aria-label="Mais opções da turma">${icon("more")}</button>` : ""}
      </div>
    </article>`);

  card.querySelector("[data-more]")?.addEventListener("click", (e) => {
    e.stopPropagation();
    abrirMenu(e.currentTarget, [
      { label: "Editar turma", icon: "pencil", onClick: () => abrirFormTurma({ turma, dias: r.dias, onSaved: onChanged }) },
      { label: "Excluir turma", icon: "trash", danger: true, onClick: () => confirmarExclusaoTurma(turma, onChanged) },
    ]);
  });
  return card;
}

export async function confirmarExclusaoTurma(turma, onDone) {
  const ok = await confirmar({
    title: "Excluir turma?",
    message: `A turma “${turma.nome}” deixará de aparecer na lista. O histórico de chamadas continua guardado no banco.`,
    confirmText: "Excluir turma",
    danger: true,
  });
  if (!ok) return;
  try {
    await excluirTurma(turma.id);
    toast("Turma excluída.");
    onDone?.();
  } catch (err) {
    toastErro(mensagemErro(err));
  }
}

/* ---------------- Formulário de turma ---------------- */

export function abrirFormTurma({ turma = null, dias = [], professorId = session.professor?.id, onSaved } = {}) {
  const editando = !!turma;
  const m = openModal({
    title: editando ? "Editar turma" : "Nova turma",
    content: html`
      <form id="form-turma" class="form-grid" novalidate>
        <label class="field">
          <span class="field-label">Nome da turma</span>
          <input type="text" name="nome" required maxlength="80" placeholder="Ex.: Kids 2 – Sábado manhã" value="${turma?.nome || ""}" autofocus>
        </label>
        <label class="field">
          <span class="field-label">Descrição <small>(opcional)</small></span>
          <input type="text" name="descricao" maxlength="160" placeholder="Ex.: Livro 3, sala 2, 9h às 10h30" value="${turma?.descricao || ""}">
        </label>
        <fieldset class="field">
          <legend class="field-label">Dias de aula</legend>
          <div class="day-picker">
            ${DIAS_SEMANA.map((d, i) => html`
              <label class="day-option">
                <input type="checkbox" name="dia" value="${i}" ${dias.includes(i) ? "checked" : ""}>
                <span title="${d}">${DIAS_CURTOS[i]}</span>
              </label>`)}
          </div>
          <span class="field-hint">Ajuda a mostrar “aula hoje” e os dias sem chamada no calendário.</span>
        </fieldset>
        <p class="form-error" hidden></p>
      </form>`,
    footer: html`
      <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
      <button type="submit" form="form-turma" class="btn btn-primary">${icon("check")}${editando ? "Salvar" : "Criar turma"}</button>`,
  });

  const form = m.body.querySelector("#form-turma");
  const erro = form.querySelector(".form-error");
  m.footer.querySelector("[data-cancel]").addEventListener("click", () => m.close());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = form.nome.value.trim();
    if (!nome) {
      erro.hidden = false;
      erro.textContent = "Informe o nome da turma.";
      form.nome.focus();
      return;
    }
    const descricao = form.descricao.value;
    const diasSel = [...form.querySelectorAll("input[name=dia]:checked")].map((i) => Number(i.value));
    const btn = m.footer.querySelector("[type=submit]");
    setBusy(btn, true, "Salvando...");
    erro.hidden = true;
    try {
      let turmaId = turma?.id;
      if (editando) await atualizarTurma(turmaId, { nome, descricao });
      else turmaId = (await criarTurma({ professorId, nome, descricao })).id;

      const mudouDias = diasSel.length !== dias.length || diasSel.some((d) => !dias.includes(d));
      if (mudouDias) {
        try {
          await definirDiasTurma(turmaId, diasSel);
        } catch (err) {
          toast(`Turma salva, mas os dias de aula não foram atualizados: ${mensagemErro(err)}`, { type: "warning", duration: 7000 });
        }
      }
      toast(editando ? "Turma atualizada." : "Turma criada!");
      await m.close();
      onSaved?.(turmaId);
    } catch (err) {
      erro.hidden = false;
      erro.textContent = mensagemErro(err);
      setBusy(btn, false);
    }
  });
}

/* ---------------- Tela inicial ---------------- */

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export async function renderHome(view, ctx) {
  view.innerHTML = String(html`
    <section class="page">
      <header class="page-hero">
        <div>
          <p class="eyebrow">${formatarDataLonga(hojeISO())}</p>
          <h1>${saudacao()}, ${primeiroNome(nomeUsuario())}!</h1>
          <p class="muted">Escolha uma turma para fazer a chamada.</p>
        </div>
        <button type="button" class="btn btn-primary" id="nova-turma">${icon("plus")}Nova turma</button>
      </header>
      <div class="toolbar" id="toolbar" hidden>
        <label class="search">${icon("search")}<input type="search" id="busca" placeholder="Buscar turma" aria-label="Buscar turma"></label>
      </div>
      <div id="hoje"></div>
      <div id="lista">${spinner("Carregando turmas...")}</div>
    </section>`);

  const lista = view.querySelector("#lista");
  const hojeBox = view.querySelector("#hoje");
  const recarregar = () => renderHome(view, ctx);
  view.querySelector("#nova-turma").addEventListener("click", () =>
    abrirFormTurma({ onSaved: (id) => navigate(`/turma/${id}/alunos`) })
  );

  let turmas;
  let resumo;
  try {
    turmas = await listarTurmas({ professorId: session.professor.id });
    resumo = await resumoTurmas(turmas);
  } catch (err) {
    if (!ctx.isActive()) return;
    lista.innerHTML = String(errorState(mensagemErro(err)));
    lista.querySelector("[data-retry]").addEventListener("click", recarregar);
    return;
  }
  if (!ctx.isActive()) return;

  turmas.sort((a, b) => compararNomes(a.nome, b.nome));

  if (!turmas.length) {
    lista.innerHTML = String(
      emptyState({
        iconName: "cap",
        title: "Nenhuma turma ainda",
        text: "Crie sua primeira turma e adicione os alunos para começar a fazer chamadas.",
        action: html`<button type="button" class="btn btn-primary" data-nova>${icon("plus")}Criar turma</button>`,
      })
    );
    lista.querySelector("[data-nova]").addEventListener("click", () =>
      abrirFormTurma({ onSaved: (id) => navigate(`/turma/${id}/alunos`) })
    );
    return;
  }

  // Aulas de hoje (turmas com dia de aula hoje)
  const diaHoje = diaDaSemana(hojeISO());
  const deHoje = turmas.filter((t) => resumo.get(String(t.id))?.dias.includes(diaHoje));
  if (deHoje.length) {
    const pendentes = deHoje.filter((t) => !resumo.get(String(t.id)).chamadaHoje).length;
    hojeBox.innerHTML = String(html`
      <section class="today-card">
        <div class="today-head">
          <span class="today-icon">${icon("calendarCheck")}</span>
          <div>
            <h2>Aulas de hoje</h2>
            <p>${pendentes ? `${plural(pendentes, "chamada pendente", "chamadas pendentes")}` : "Todas as chamadas de hoje foram feitas. 🎉"}</p>
          </div>
        </div>
        <div class="today-list">
          ${deHoje.map((t) => {
            const feita = resumo.get(String(t.id)).chamadaHoje;
            return html`
              <a class="today-item ${feita ? "done" : ""}" href="#/turma/${t.id}/chamada">
                <span class="today-status">${icon(feita ? "check" : "clock")}</span>
                <span class="today-name">${t.nome}</span>
                <span class="today-cta">${feita ? "Ver" : "Fazer chamada"}${icon("chevronRight")}</span>
              </a>`;
          })}
        </div>
      </section>`);
  }

  const desenhar = (filtro = "") => {
    const f = normalizar(filtro);
    const visiveis = turmas.filter((t) => !f || normalizar(`${t.nome} ${t.descricao || ""}`).includes(f));
    lista.innerHTML = String(html`<h2 class="section-title">Minhas turmas <span class="count">${turmas.length}</span></h2>`);
    if (!visiveis.length) {
      lista.insertAdjacentHTML("beforeend", String(emptyState({ iconName: "search", title: "Nenhuma turma encontrada" })));
      return;
    }
    const grid = el('<div class="card-grid"></div>');
    visiveis.forEach((t) => grid.appendChild(turmaCard(t, resumo.get(String(t.id)), { onChanged: recarregar })));
    lista.appendChild(grid);
  };

  if (turmas.length > 6) {
    view.querySelector("#toolbar").hidden = false;
    view.querySelector("#busca").addEventListener("input", (e) => desenhar(e.target.value));
  }
  desenhar();
}
