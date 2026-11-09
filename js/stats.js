/* =========================================================
   Cálculos de frequência e resumos (funções puras).
   ========================================================= */
import { statusAula, isAulaExtra, horasDaChamada, sameId, compararNomes } from "./utils.js";

export const alunoNaData = (aluno, data) => !aluno.data_entrada || aluno.data_entrada <= data;

function registroDoAluno(chamada, alunoId) {
  return (chamada.chamada_presencas || []).find((p) => sameId(p.aluno_id, alunoId));
}

/**
 * Frequência de cada aluno no conjunto de chamadas.
 * Regras:
 *  - aulas que não aconteceram (sem substituto) não contam falta;
 *  - só conta a partir da data de entrada do aluno na turma;
 *  - reforço/reposição só conta para quem participou;
 *  - aluno sem marcação no dia (ex.: cadastrado depois da chamada) não conta falta.
 */
export function frequenciaAlunos(alunos, chamadas) {
  return [...alunos]
    .sort((a, b) => compararNomes(a.nome, b.nome))
    .map((aluno) => {
      let presencas = 0;
      let faltas = 0;
      chamadas.forEach((ch) => {
        if (statusAula(ch) === "cancelada") return;
        if (!alunoNaData(aluno, ch.data)) return;
        const reg = registroDoAluno(ch, aluno.id);
        if (!reg) return;
        if (reg.presente) presencas++;
        else faltas++;
      });
      const total = presencas + faltas;
      return { aluno, presencas, faltas, total, percentual: total ? (presencas / total) * 100 : null };
    });
}

export function resumoChamadas(chamadas) {
  const r = { total: chamadas.length, ministradas: 0, substituidas: 0, canceladas: 0, reforco: 0, reposicao: 0, horas: 0 };
  chamadas.forEach((c) => {
    const st = statusAula(c);
    if (st === "ministrada") r.ministradas++;
    else if (st === "substituida") r.substituidas++;
    else r.canceladas++;
    if (c.tipo_aula === "reforco") r.reforco++;
    if (c.tipo_aula === "reposicao") r.reposicao++;
    if (st !== "cancelada") r.horas += horasDaChamada(c);
  });
  return r;
}

/** Contagem de presença de um dia, considerando só quem já era aluno. */
export function contagemDia(chamada, alunos) {
  const st = statusAula(chamada);
  const extra = isAulaExtra(chamada.tipo_aula);
  let presentes = 0;
  let ausentes = 0;
  let pendentes = 0;
  let considerados = 0;
  const linhas = [...alunos]
    .sort((a, b) => compararNomes(a.nome, b.nome))
    .map((aluno) => {
      if (!alunoNaData(aluno, chamada.data)) return { aluno, status: "na", label: "Ainda não era aluno" };
      const reg = registroDoAluno(chamada, aluno.id);
      if (st === "cancelada") return { aluno, status: "na", label: "Aula não aconteceu" };
      if (extra && !reg) return { aluno, status: "na", label: "Não participou" };
      considerados++;
      if (!reg) {
        pendentes++;
        return { aluno, status: "pendente", label: "Sem marcação" };
      }
      if (reg.presente) {
        presentes++;
        return { aluno, status: "presente", label: "Presente" };
      }
      ausentes++;
      return { aluno, status: "ausente", label: "Falta" };
    });
  return {
    linhas,
    presentes,
    ausentes,
    pendentes,
    considerados,
    percentual: considerados ? (presentes / considerados) * 100 : null,
  };
}

/**
 * Status visual do dia no calendário.
 * Retorna { key, label } — key vira classe CSS.
 */
export function statusCalendario(chamada, alunos, { diaDeAula = false, futuro = false } = {}) {
  if (!chamada) {
    if (diaDeAula && !futuro) return { key: "missing", label: "Dia de aula sem chamada" };
    if (diaDeAula) return { key: "planned", label: "Dia de aula" };
    return { key: "none", label: "" };
  }
  const st = statusAula(chamada);
  if (st === "cancelada") return { key: "cancelled", label: "Aula não aconteceu" };
  if (st === "substituida") return { key: "substituted", label: "Aula com substituto" };
  if (isAulaExtra(chamada.tipo_aula)) return { key: "extra", label: chamada.tipo_aula === "reforco" ? "Reforço" : "Reposição" };
  const c = contagemDia(chamada, alunos);
  if (c.pendentes > 0) return { key: "partial", label: "Chamada incompleta" };
  return { key: "done", label: "Chamada feita" };
}
