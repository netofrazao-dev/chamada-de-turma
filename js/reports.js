/* =========================================================
   Relatórios para imprimir / salvar em PDF e exportar para Excel (CSV).
   A impressão acontece na própria página (funciona também no app
   instalado e no iPhone, sem bloqueio de pop-up).
   ========================================================= */
import {
  html, formatarDataBR, formatarDataCurta, formatarHoras, formatarPercentual, nomeMes,
  TIPOS_AULA, isAulaExtra, statusAula, gerarCSV, baixarArquivo, slug, horasDaChamada,
} from "./utils.js";
import { ESCOLA_NOME, APP_NOME, FREQUENCIA_MINIMA } from "./config.js";
import { contagemDia } from "./stats.js";

const hojeBR = () => new Date().toLocaleDateString("pt-BR");

function cabecalho(titulo, meta) {
  return html`
    <header class="pr-header">
      <img src="imagens/logo.jpg" alt="${ESCOLA_NOME}" class="pr-logo">
      <div>
        <h1>${titulo}</h1>
        <div class="pr-meta">
          ${meta.map(([k, v]) => html`<div><span>${k}</span><strong>${v}</strong></div>`)}
        </div>
      </div>
    </header>`;
}

const rodape = () => html`<footer class="pr-footer">${ESCOLA_NOME} • ${APP_NOME} • Emitido em ${hojeBR()}</footer>`;

async function imprimir(markup, titulo) {
  document.getElementById("print-root")?.remove();
  const root = document.createElement("div");
  root.id = "print-root";
  root.innerHTML = String(markup);
  document.body.appendChild(root);
  document.body.classList.add("printing");

  const tituloAnterior = document.title;
  document.title = titulo;

  await Promise.all(
    [...root.querySelectorAll("img")].map((img) =>
      img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })
    )
  );

  const limpar = () => {
    document.title = tituloAnterior;
    document.body.classList.remove("printing");
    root.remove();
    window.removeEventListener("afterprint", limpar);
  };
  window.addEventListener("afterprint", limpar);
  setTimeout(() => window.print(), 60);
}

const descricaoStatus = (c, nomeSubst) => {
  const st = statusAula(c);
  if (st === "cancelada") return "Aula não aconteceu";
  if (st === "substituida") return `Substituição: ${nomeSubst || "outro professor"}`;
  return "Ministrada";
};

/* ---------------- Relatório da turma ---------------- */

export function imprimirRelatorioTurma({ turma, professorNome, mes, frequencia, resumo, chamadas, alunos, nomeSubstituto }) {
  const linhasFreq = frequencia.map((f) => html`
    <tr class="${f.percentual !== null && f.percentual < FREQUENCIA_MINIMA ? "pr-low" : ""}">
      <td>${f.aluno.nome}</td>
      <td class="num">${f.total ? f.presencas : "–"}</td>
      <td class="num">${f.total ? f.faltas : "–"}</td>
      <td class="num">${f.total || "–"}</td>
      <td class="num"><strong>${formatarPercentual(f.percentual)}</strong></td>
    </tr>`);

  const linhasDias = chamadas.map((c) => {
    const cont = contagemDia(c, alunos);
    const presentes = cont.linhas.filter((l) => l.status === "presente").map((l) => l.aluno.nome);
    const faltas = cont.linhas.filter((l) => l.status === "ausente").map((l) => l.aluno.nome);
    const st = statusAula(c);
    return html`
      <tr>
        <td class="nowrap">${formatarDataCurta(c.data)}</td>
        <td>${TIPOS_AULA[c.tipo_aula] || "Normal"}<br><small>${descricaoStatus(c, nomeSubstituto?.(c))}</small></td>
        <td>${st === "cancelada" ? "—" : presentes.join(", ") || "—"}</td>
        <td>${st === "cancelada" ? "—" : faltas.join(", ") || "—"}</td>
      </tr>`;
  });

  const markup = html`
    <div class="pr-page">
      ${cabecalho("Relatório de Frequência", [
        ["Turma", turma.nome],
        ["Professor(a)", professorNome || "-"],
        ["Mês", nomeMes(mes)],
      ])}
      <section class="pr-summary">
        <div><strong>${resumo.total}</strong><span>Aulas registradas</span></div>
        <div><strong>${resumo.ministradas}</strong><span>Ministradas</span></div>
        <div><strong>${resumo.substituidas}</strong><span>Com substituto</span></div>
        <div><strong>${resumo.canceladas}</strong><span>Não aconteceram</span></div>
        <div><strong>${formatarHoras(resumo.horas)}</strong><span>Carga horária</span></div>
      </section>
      <h2>Frequência por aluno</h2>
      <table class="pr-table">
        <thead><tr><th>Aluno</th><th class="num">Presenças</th><th class="num">Faltas</th><th class="num">Aulas</th><th class="num">Frequência</th></tr></thead>
        <tbody>${linhasFreq.length ? linhasFreq : html`<tr><td colspan="5">Nenhum aluno cadastrado.</td></tr>`}</tbody>
      </table>
      <p class="pr-note">Destacados: frequência abaixo de ${FREQUENCIA_MINIMA}%. Aulas que não aconteceram não contam falta. Reforço e reposição contam apenas para quem participou. Alunos sem marcação no dia não recebem falta.</p>
      <h2>Aulas do mês</h2>
      <table class="pr-table pr-days">
        <thead><tr><th>Data</th><th>Aula</th><th>Presentes</th><th>Faltas</th></tr></thead>
        <tbody>${linhasDias.length ? linhasDias : html`<tr><td colspan="4">Nenhuma chamada registrada neste mês.</td></tr>`}</tbody>
      </table>
      ${rodape()}
    </div>`;

  return imprimir(markup, `Frequência - ${turma.nome} - ${mes}`);
}

export function exportarCSVTurma({ turma, mes, frequencia, chamadas }) {
  const validas = chamadas.filter((c) => statusAula(c) !== "cancelada");
  const cab = ["Aluno", ...validas.map((c) => `${formatarDataBR(c.data).slice(0, 5)}${isAulaExtra(c.tipo_aula) ? ` (${TIPOS_AULA[c.tipo_aula]})` : ""}`), "Presenças", "Faltas", "Aulas", "Frequência (%)"];
  const linhas = frequencia.map((f) => {
    const dias = validas.map((c) => {
      if (f.aluno.data_entrada && c.data < f.aluno.data_entrada) return "";
      const reg = (c.chamada_presencas || []).find((p) => String(p.aluno_id) === String(f.aluno.id));
      if (!reg) return "";
      return reg.presente ? "P" : "F";
    });
    return [f.aluno.nome, ...dias, f.presencas, f.faltas, f.total, f.percentual === null ? "" : f.percentual.toFixed(1).replace(".", ",")];
  });
  baixarArquivo(`frequencia-${slug(turma.nome)}-${mes}.csv`, gerarCSV([cab, ...linhas]));
}

/* ---------------- Relatório do professor ---------------- */

const STATUS_PROF = {
  propria: "Ministrada",
  substituicao: "Como substituto",
  substituida: "Substituída",
  cancelada: "Não aconteceu",
};

export function imprimirRelatorioProfessor({ profNome, mes, resultado }) {
  const r = resultado;
  const linhas = r.aulas.map((a) => {
    const conta = a.tipo === "propria" || a.tipo === "substituicao";
    let status = STATUS_PROF[a.tipo];
    if (a.tipo === "substituida") status += ` por ${a.substituto_nome}`;
    return html`
      <tr class="${conta ? "" : "pr-muted"}">
        <td class="nowrap">${formatarDataCurta(a.data)}</td>
        <td>${a.turma_nome}</td>
        <td>${TIPOS_AULA[a.tipo_aula] || "Normal"}</td>
        <td>${status}${conta ? "" : html`<br><small>Não entra na carga horária</small>`}</td>
        <td class="num">${conta ? formatarHoras(horasDaChamada(a)) : "—"}</td>
      </tr>`;
  });

  const markup = html`
    <div class="pr-page">
      ${cabecalho("Relatório Mensal de Aulas", [
        ["Professor(a)", profNome],
        ["Mês", nomeMes(mes)],
      ])}
      <section class="pr-summary">
        <div><strong>${formatarHoras(r.horasTotal)}</strong><span>Total de horas</span></div>
        <div><strong>${r.qtdProprias}</strong><span>Aulas próprias (${formatarHoras(r.horasProprias)})</span></div>
        <div><strong>${r.qtdSubstituicao}</strong><span>Como substituto (${formatarHoras(r.horasSubstituicao)})</span></div>
        <div><strong>${r.qtdSubstituidas}</strong><span>Substituídas por outro</span></div>
        <div><strong>${r.qtdCanceladas}</strong><span>Não aconteceram</span></div>
      </section>
      <h2>Aulas no período</h2>
      <table class="pr-table">
        <thead><tr><th>Data</th><th>Turma</th><th>Tipo</th><th>Status</th><th class="num">Horas</th></tr></thead>
        <tbody>${linhas.length ? linhas : html`<tr><td colspan="5">Nenhuma aula registrada neste mês.</td></tr>`}</tbody>
        <tfoot><tr><td colspan="4">Total de horas</td><td class="num">${formatarHoras(r.horasTotal)}</td></tr></tfoot>
      </table>
      <p class="pr-note">Aula normal: 1,5h • Reforço e reposição: 1h. Aulas substituídas contam para o professor substituto.</p>
      <div class="pr-sign">
        <div><span></span>Professor(a)</div>
        <div><span></span>Coordenação</div>
      </div>
      ${rodape()}
    </div>`;

  return imprimir(markup, `Relatório - ${profNome} - ${mes}`);
}

export function exportarCSVProfessor({ profNome, mes, resultado }) {
  const linhas = resultado.aulas.map((a) => {
    const conta = a.tipo === "propria" || a.tipo === "substituicao";
    return [
      formatarDataBR(a.data),
      a.turma_nome,
      TIPOS_AULA[a.tipo_aula] || "Normal",
      STATUS_PROF[a.tipo] + (a.tipo === "substituida" ? ` por ${a.substituto_nome}` : ""),
      conta ? String(horasDaChamada(a)).replace(".", ",") : "0",
    ];
  });
  linhas.push([], ["Total de horas", "", "", "", String(resultado.horasTotal).replace(".", ",")]);
  baixarArquivo(
    `relatorio-${slug(profNome)}-${mes}.csv`,
    gerarCSV([["Data", "Turma", "Tipo de aula", "Status", "Horas"], ...linhas])
  );
}

export function exportarCSVHoras({ dados, inicio, fim }) {
  const n = (v) => String(Number(v.toFixed(2))).replace(".", ",");
  const linhas = dados.map((p) => [p.nome || "", p.email || "", p.role === "admin" ? "Admin" : "Professor", p.aulas, n(p.horas_proprias), n(p.horas_substituicao), n(p.horas_total)]);
  const periodo = inicio || fim ? `${inicio || "inicio"}_a_${fim || "hoje"}` : "todo-periodo";
  baixarArquivo(
    `horas-professores-${periodo}.csv`,
    gerarCSV([["Professor", "Email", "Perfil", "Aulas", "Horas próprias", "Horas substituição", "Total"], ...linhas])
  );
}
