/* Calendário mensal de chamadas + modal com os detalhes de um dia. */
import {
  html, el, diasDoMes, diaDaSemana, hojeISO, DIAS_CURTOS, formatarDataLonga, formatarPercentual,
  TIPOS_AULA, isAulaExtra, statusAula, mensagemErro,
} from "../../utils.js";
import { icon } from "../../icons.js";
import { openModal, confirmar, toast, toastErro, setBusy } from "../../components.js";
import { statusCalendario, contagemDia } from "../../stats.js";
import { removerChamada } from "../../api.js";
import { nomeProfessor } from "../../session.js";
import { navigate } from "../../router.js";

const LEGENDA = [
  ["done", "Chamada feita"],
  ["partial", "Incompleta"],
  ["extra", "Reforço / Reposição"],
  ["substituted", "Com substituto"],
  ["cancelled", "Não aconteceu"],
  ["missing", "Dia de aula sem chamada"],
];

const ICONES = { done: "check", partial: "alert", extra: "book", substituted: "repeat", cancelled: "x", missing: "clock" };

export function renderCalendario({ mes, chamadas, alunos, dias = [], onDayClick, legenda = true }) {
  const porData = new Map(chamadas.map((c) => [c.data, c]));
  const hoje = hojeISO();
  const datas = diasDoMes(mes);
  const offset = diaDaSemana(datas[0]);
  const usados = new Set();

  const cells = datas.map((d) => {
    const ch = porData.get(d);
    const s = statusCalendario(ch, alunos, { diaDeAula: dias.includes(diaDaSemana(d)), futuro: d >= hoje });
    if (s.key !== "none" && s.key !== "planned") usados.add(s.key);
    const num = Number(d.slice(8));
    const clicavel = !!onDayClick;
    return html`
      <button type="button" class="cal-day s-${s.key} ${d === hoje ? "is-today" : ""}" data-date="${d}" ${clicavel ? "" : "disabled"}
        aria-label="${num} — ${s.label || "sem chamada"}" title="${s.label}">
        <span class="cal-num">${num}</span>
        ${ICONES[s.key] ? html`<span class="cal-mark">${icon(ICONES[s.key])}</span>` : ""}
        ${ch && isAulaExtra(ch.tipo_aula) ? html`<span class="cal-tag">${ch.tipo_aula === "reforco" ? "Ref." : "Rep."}</span>` : ""}
      </button>`;
  });

  const root = el(html`
    <div class="calendar">
      <div class="cal-grid">
        ${DIAS_CURTOS.map((d) => html`<span class="cal-head">${d}</span>`)}
        ${Array.from({ length: offset }, () => html`<span class="cal-empty"></span>`)}
        ${cells}
      </div>
      ${legenda
        ? html`<div class="cal-legend">
            ${LEGENDA.filter(([k]) => usados.has(k) || k === "done").map(([k, label]) => html`<span class="leg"><i class="cal-swatch s-${k}">${ICONES[k] ? icon(ICONES[k]) : ""}</i>${label}</span>`)}
          </div>`
        : ""}
    </div>`);

  if (onDayClick) {
    root.querySelector(".cal-grid").addEventListener("click", (e) => {
      const b = e.target.closest("[data-date]");
      if (b) onDayClick(b.dataset.date, porData.get(b.dataset.date) || null);
    });
  }
  return root;
}

/** Modal com o resumo de um dia de aula. */
export function abrirDetalheDia({ turma, data, chamada, alunos, onChanged, podeEditar = true }) {
  if (!chamada) {
    const m = openModal({
      title: formatarDataLonga(data),
      size: "sm",
      content: html`<div class="empty-state compact"><div class="empty-icon">${icon("calendar")}</div><h3>Sem chamada neste dia</h3><p>Nenhuma chamada foi registrada para esta data.</p></div>`,
      footer: podeEditar
        ? html`<button type="button" class="btn btn-ghost" data-close>Fechar</button>
               <button type="button" class="btn btn-primary" data-go>${icon("clipboard")}Fazer chamada</button>`
        : html`<button type="button" class="btn btn-primary btn-block" data-close>Fechar</button>`,
    });
    m.footer.querySelector("[data-close]").addEventListener("click", () => m.close());
    m.footer.querySelector("[data-go]")?.addEventListener("click", async () => {
      await m.close();
      navigate(`/turma/${turma.id}/chamada`, { query: { data } });
    });
    return;
  }

  const st = statusAula(chamada);
  const c = contagemDia(chamada, alunos);
  let statusHtml;
  if (st === "ministrada") statusHtml = html`<span class="pill pill-success">${icon("check")}Ministrada pelo professor da turma</span>`;
  else if (st === "substituida") {
    const nome = chamada.substituto_nome_manual
      ? `${chamada.substituto_nome_manual} (externo)`
      : nomeProfessor(chamada.professor_substituto_id) || "professor substituto";
    statusHtml = html`<span class="pill pill-purple">${icon("repeat")}Substituição: ${nome}</span>`;
  } else statusHtml = html`<span class="pill pill-danger">${icon("x")}Aula não aconteceu</span>`;

  const m = openModal({
    title: formatarDataLonga(data),
    content: html`
      <div class="day-detail">
        <div class="pill-row">
          ${statusHtml}
          <span class="pill ${isAulaExtra(chamada.tipo_aula) ? "pill-info" : ""}">${TIPOS_AULA[chamada.tipo_aula] || "Normal"}</span>
        </div>
        ${st !== "cancelada"
          ? html`
            <div class="mini-stats">
              <div><strong class="t-success">${c.presentes}</strong><span>Presentes</span></div>
              <div><strong class="t-danger">${c.ausentes}</strong><span>Faltas</span></div>
              ${c.pendentes ? html`<div><strong class="t-warning">${c.pendentes}</strong><span>Sem marcação</span></div>` : ""}
              <div><strong>${formatarPercentual(c.percentual)}</strong><span>Frequência</span></div>
            </div>
            <div class="progress"><span style="width:${c.percentual ?? 0}%"></span></div>`
          : ""}
        <ul class="status-list">
          ${c.linhas.map((l) => html`<li><span>${l.aluno.nome}</span><span class="pill pill-${{ presente: "success", ausente: "danger", pendente: "warning", na: "muted" }[l.status]}">${l.label}</span></li>`)}
        </ul>
      </div>`,
    footer: podeEditar
      ? html`<button type="button" class="btn btn-danger-ghost" data-del>${icon("trash")}Excluir</button>
             <button type="button" class="btn btn-primary" data-edit>${icon("pencil")}Editar chamada</button>`
      : html`<button type="button" class="btn btn-primary btn-block" data-close>Fechar</button>`,
  });

  m.footer.querySelector("[data-close]")?.addEventListener("click", () => m.close());
  m.footer.querySelector("[data-edit]")?.addEventListener("click", async () => {
    await m.close();
    navigate(`/turma/${turma.id}/chamada`, { query: { data } });
  });
  m.footer.querySelector("[data-del]")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const ok = await confirmar({
      title: "Excluir chamada?",
      message: `A chamada de ${formatarDataLonga(data)} será apagada. Esta ação não pode ser desfeita.`,
      confirmText: "Excluir",
      danger: true,
    });
    if (!ok) return;
    setBusy(btn, true, "Excluindo...");
    try {
      await removerChamada(chamada.id);
      toast("Chamada excluída.");
      await m.close();
      onChanged?.();
    } catch (err) {
      setBusy(btn, false);
      toastErro(mensagemErro(err));
    }
  });
}
