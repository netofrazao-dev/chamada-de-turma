/* =========================================================
   Acesso aos dados (Supabase).
   Mantém exatamente as mesmas tabelas e colunas do sistema original.
   ========================================================= */
import { supabase } from "./supabaseClient.js";
import { getMesInicioFim, horasDaChamada, hojeISO, statusAula, sameId } from "./utils.js";

const SELECT_CHAMADA =
  "id, turma_id, data, tipo_aula, horas_aula, foi_ministrada, professor_substituto_id, substituto_nome_manual, chamada_presencas(aluno_id, presente)";

function check({ data, error }) {
  if (error) throw error;
  return data;
}

/**
 * O Supabase devolve no máximo 1000 linhas por consulta.
 * Este helper busca página por página para não perder dados.
 */
async function fetchAll(build, pageSize = 1000) {
  let from = 0;
  let out = [];
  for (;;) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < pageSize) return out;
    from += pageSize;
  }
}

/* ---------------- Professores ---------------- */

export async function getProfessorPorUsuario(userId) {
  const { data, error } = await supabase
    .from("professores")
    .select("*")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listarProfessores() {
  return check(
    await supabase.from("professores").select("id, nome, email, role").order("nome", { ascending: true })
  ) || [];
}

/* ---------------- Turmas ---------------- */

export async function listarTurmas({ professorId } = {}) {
  let q = supabase.from("turmas").select("*").eq("ativo", true).order("created_at", { ascending: true });
  if (professorId) q = q.eq("professor_id", professorId);
  return check(await q) || [];
}

export async function obterTurma(id) {
  const { data, error } = await supabase.from("turmas").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listarTodasTurmas() {
  return check(
    await supabase
      .from("turmas")
      .select("id, nome, descricao, ativo, professor_id, created_at")
      .order("created_at", { ascending: true })
  ) || [];
}

/**
 * Informações extras para os cards de turma, com poucas consultas
 * (antes eram 2 consultas por turma, uma após a outra).
 */
export async function resumoTurmas(turmas) {
  const ids = turmas.map((t) => t.id);
  const resumo = new Map(ids.map((id) => [String(id), { alunos: 0, dias: [], chamadaHoje: false }]));
  if (!ids.length) return resumo;

  const hoje = hojeISO();
  const [alunos, horarios, chamadasHoje] = await Promise.all([
    fetchAll(() => supabase.from("alunos").select("id, turma_id").in("turma_id", ids).eq("ativo", true)),
    supabase
      .from("turma_horarios")
      .select("turma_id, dia_semana")
      .in("turma_id", ids)
      .then(check)
      .catch(() => []),
    supabase
      .from("chamadas")
      .select("turma_id")
      .in("turma_id", ids)
      .eq("data", hoje)
      .then(check)
      .catch(() => []),
  ]);

  alunos.forEach((a) => resumo.get(String(a.turma_id)) && resumo.get(String(a.turma_id)).alunos++);
  (horarios || []).forEach((h) => {
    const r = resumo.get(String(h.turma_id));
    if (r && !r.dias.includes(Number(h.dia_semana))) r.dias.push(Number(h.dia_semana));
  });
  resumo.forEach((r) => r.dias.sort((a, b) => a - b));
  (chamadasHoje || []).forEach((c) => {
    const r = resumo.get(String(c.turma_id));
    if (r) r.chamadaHoje = true;
  });
  return resumo;
}

export async function criarTurma({ professorId, nome, descricao }) {
  const nomeLimpo = (nome || "").trim();
  if (!nomeLimpo) throw new Error("Informe o nome da turma.");

  const { data: existente, error: dupErr } = await supabase
    .from("turmas")
    .select("id")
    .eq("professor_id", professorId)
    .eq("ativo", true)
    .ilike("nome", nomeLimpo)
    .limit(1);
  if (dupErr) throw dupErr;
  if (existente?.length) throw new Error("Você já tem uma turma com este nome.");

  return check(
    await supabase
      .from("turmas")
      .insert({ professor_id: professorId, nome: nomeLimpo, descricao: (descricao || "").trim() || null })
      .select("*")
      .single()
  );
}

export async function atualizarTurma(id, { nome, descricao }) {
  const nomeLimpo = (nome || "").trim();
  if (!nomeLimpo) throw new Error("Informe o nome da turma.");
  const { error } = await supabase
    .from("turmas")
    .update({ nome: nomeLimpo, descricao: (descricao || "").trim() || null })
    .eq("id", id);
  if (error) throw error;
}

/** Exclusão "suave": a turma some da lista, mas o histórico fica guardado. */
export async function excluirTurma(id) {
  const { error } = await supabase.from("turmas").update({ ativo: false }).eq("id", id);
  if (error) throw error;
}

/* ---------------- Dias de aula (turma_horarios) ---------------- */

export async function listarDiasTurma(turmaId) {
  const data = check(
    await supabase.from("turma_horarios").select("dia_semana").eq("turma_id", turmaId)
  ) || [];
  return [...new Set(data.map((h) => Number(h.dia_semana)))].sort((a, b) => a - b);
}

export async function definirDiasTurma(turmaId, dias) {
  const atuais = await listarDiasTurma(turmaId);
  const novos = dias.filter((d) => !atuais.includes(d));
  const removidos = atuais.filter((d) => !dias.includes(d));
  if (novos.length) {
    const { error } = await supabase
      .from("turma_horarios")
      .insert(novos.map((d) => ({ turma_id: turmaId, dia_semana: d, horario_texto: "" })));
    if (error) throw error;
  }
  if (removidos.length) {
    const { error } = await supabase
      .from("turma_horarios")
      .delete()
      .eq("turma_id", turmaId)
      .in("dia_semana", removidos);
    if (error) throw error;
  }
}

/* ---------------- Alunos ---------------- */

export async function listarAlunos(turmaId) {
  return check(
    await supabase
      .from("alunos")
      .select("*")
      .eq("turma_id", turmaId)
      .eq("ativo", true)
      .order("nome", { ascending: true })
  ) || [];
}

export async function criarAlunos(turmaId, nomes, dataEntrada) {
  const linhas = nomes
    .map((n) => (n || "").trim())
    .filter(Boolean)
    .map((nome) => ({ turma_id: turmaId, nome, data_entrada: dataEntrada || null }));
  if (!linhas.length) throw new Error("Informe o nome do aluno.");
  return check(await supabase.from("alunos").insert(linhas).select("*")) || [];
}

export async function atualizarAluno(id, { nome, data_entrada }) {
  const payload = {};
  if (nome !== undefined) {
    const n = (nome || "").trim();
    if (!n) throw new Error("Informe um nome válido.");
    payload.nome = n;
  }
  if (data_entrada !== undefined) payload.data_entrada = data_entrada || null;
  const { error } = await supabase.from("alunos").update(payload).eq("id", id);
  if (error) throw error;
}

export async function removerAluno(id) {
  const { error } = await supabase.from("alunos").update({ ativo: false }).eq("id", id);
  if (error) throw error;
}

export async function transferirAluno(alunoId, novaTurmaId, dataTransferencia) {
  const { data: aluno, error } = await supabase
    .from("alunos")
    .select("id, turma_id, nome")
    .eq("id", alunoId)
    .single();
  if (error) throw error;
  if (sameId(aluno.turma_id, novaTurmaId)) throw new Error("O aluno já está nesta turma.");

  const data = dataTransferencia || hojeISO();

  const { error: histErr } = await supabase.from("transferencias_alunos").insert({
    aluno_id: alunoId,
    turma_origem_id: aluno.turma_id,
    turma_destino_id: novaTurmaId,
    data_transferencia: data,
  });
  if (histErr) throw histErr;

  const { error: upErr } = await supabase
    .from("alunos")
    .update({ turma_id: novaTurmaId, data_entrada: data })
    .eq("id", alunoId);
  if (upErr) throw upErr;
}

export async function listarHistoricoTransferencias(alunoId) {
  return check(
    await supabase
      .from("transferencias_alunos")
      .select(
        "id, data_transferencia, turma_origem:turma_origem_id(nome), turma_destino:turma_destino_id(nome)"
      )
      .eq("aluno_id", alunoId)
      .order("data_transferencia", { ascending: false })
  ) || [];
}

/* ---------------- Chamadas ---------------- */

export async function obterChamadaPorData(turmaId, data) {
  const rows = check(
    await supabase
      .from("chamadas")
      .select(SELECT_CHAMADA)
      .eq("turma_id", turmaId)
      .eq("data", data)
      .order("id", { ascending: false })
      .limit(1)
  );
  return rows?.[0] ?? null;
}

export async function listarChamadasMes(turmaId, mes) {
  const { inicio, fim } = getMesInicioFim(mes);
  return fetchAll(() =>
    supabase
      .from("chamadas")
      .select(SELECT_CHAMADA)
      .eq("turma_id", turmaId)
      .gte("data", inicio)
      .lt("data", fim)
      .order("data", { ascending: true })
  );
}

/**
 * Salva (ou substitui) a chamada de um dia.
 * registros: [{ alunoId, presente }]
 */
export async function salvarChamada({
  turmaId,
  data,
  tipoAula = "normal",
  horasAula,
  foiMinistrada = true,
  professorSubstitutoId = null,
  substitutoNomeManual = null,
  registros = [],
}) {
  // Remove a chamada anterior do mesmo dia (as presenças saem junto, em cascata).
  const { error: delErr } = await supabase.from("chamadas").delete().eq("turma_id", turmaId).eq("data", data);
  if (delErr) throw delErr;

  const chamada = check(
    await supabase
      .from("chamadas")
      .insert({
        turma_id: turmaId,
        data,
        foi_ministrada: foiMinistrada,
        professor_substituto_id: foiMinistrada ? null : professorSubstitutoId || null,
        substituto_nome_manual: foiMinistrada ? null : substitutoNomeManual || null,
        tipo_aula: tipoAula || "normal",
        horas_aula: horasAula,
      })
      .select("id")
      .single()
  );

  if (registros.length) {
    const { error } = await supabase.from("chamada_presencas").insert(
      registros.map((r) => ({ chamada_id: chamada.id, aluno_id: r.alunoId, presente: !!r.presente }))
    );
    if (error) throw error;
  }
  return chamada.id;
}

export async function removerChamada(chamadaId) {
  const { error } = await supabase.from("chamadas").delete().eq("id", chamadaId);
  if (error) throw error;
}

/* ---------------- Relatórios de professor ---------------- */

/** Aulas de um professor no mês: próprias, como substituto e as que foram substituídas. */
export async function listarAulasProfessorMes(professorId, mes) {
  const { inicio, fim } = getMesInicioFim(mes);
  const campos =
    "id, data, turma_id, horas_aula, foi_ministrada, professor_substituto_id, substituto_nome_manual, tipo_aula";

  const turmas = check(await supabase.from("turmas").select("id, nome").eq("professor_id", professorId)) || [];
  const turmaIds = turmas.map((t) => t.id);
  const nomeTurma = new Map(turmas.map((t) => [String(t.id), t.nome]));

  const [daTurma, comoSubstituto] = await Promise.all([
    turmaIds.length
      ? fetchAll(() =>
          supabase
            .from("chamadas")
            .select(campos)
            .in("turma_id", turmaIds)
            .gte("data", inicio)
            .lt("data", fim)
            .order("data", { ascending: true })
        )
      : [],
    fetchAll(() =>
      supabase
        .from("chamadas")
        .select(`${campos}, turmas(nome)`)
        .eq("professor_substituto_id", professorId)
        .eq("foi_ministrada", false)
        .gte("data", inicio)
        .lt("data", fim)
        .order("data", { ascending: true })
    ),
  ]);

  const precisaNomes = daTurma.some((c) => statusAula(c) === "substituida" && c.professor_substituto_id);
  const profs = precisaNomes ? await listarProfessores().catch(() => []) : [];
  const nomeProf = new Map(profs.map((p) => [String(p.id), p.nome || p.email]));

  const aulas = [];
  daTurma.forEach((c) => {
    const st = statusAula(c);
    if (st === "ministrada") {
      aulas.push({ ...c, turma_nome: nomeTurma.get(String(c.turma_id)) || "-", tipo: "propria" });
    } else if (st === "substituida") {
      const substituto = c.substituto_nome_manual
        ? `${c.substituto_nome_manual} (externo)`
        : nomeProf.get(String(c.professor_substituto_id)) || "outro professor";
      aulas.push({ ...c, turma_nome: nomeTurma.get(String(c.turma_id)) || "-", tipo: "substituida", substituto_nome: substituto });
    } else {
      aulas.push({ ...c, turma_nome: nomeTurma.get(String(c.turma_id)) || "-", tipo: "cancelada" });
    }
  });
  comoSubstituto.forEach((c) => {
    aulas.push({ ...c, turma_nome: c.turmas?.nome || nomeTurma.get(String(c.turma_id)) || "-", tipo: "substituicao" });
  });
  aulas.sort((a, b) => a.data.localeCompare(b.data));

  const soma = (tipo) => aulas.filter((a) => a.tipo === tipo).reduce((acc, a) => acc + horasDaChamada(a), 0);
  const conta = (tipo) => aulas.filter((a) => a.tipo === tipo).length;
  const horasProprias = soma("propria");
  const horasSubstituicao = soma("substituicao");

  return {
    aulas,
    horasProprias,
    horasSubstituicao,
    horasTotal: horasProprias + horasSubstituicao,
    qtdProprias: conta("propria"),
    qtdSubstituicao: conta("substituicao"),
    qtdSubstituidas: conta("substituida"),
    qtdCanceladas: conta("cancelada"),
  };
}

/** Horas de todos os professores em um período (datas inclusivas). */
export async function calcularHorasPorProfessor({ inicio, fim } = {}) {
  const [professores, turmas] = await Promise.all([
    listarProfessores(),
    fetchAll(() => supabase.from("turmas").select("id, professor_id")),
  ]);
  const donoTurma = new Map(turmas.map((t) => [String(t.id), t.professor_id]));

  const filtrar = (q) => {
    if (inicio) q = q.gte("data", inicio);
    if (fim) q = q.lte("data", fim);
    return q;
  };

  const [proprias, subs] = await Promise.all([
    fetchAll(() =>
      filtrar(
        supabase
          .from("chamadas")
          .select("id, horas_aula, tipo_aula, turma_id")
          .or("foi_ministrada.is.null,foi_ministrada.eq.true")
          .order("id", { ascending: true })
      )
    ),
    fetchAll(() =>
      filtrar(
        supabase
          .from("chamadas")
          .select("id, horas_aula, tipo_aula, professor_substituto_id")
          .eq("foi_ministrada", false)
          .not("professor_substituto_id", "is", null)
          .order("id", { ascending: true })
      )
    ),
  ]);

  const mapa = new Map(
    professores.map((p) => [String(p.id), { ...p, horas_proprias: 0, horas_substituicao: 0, aulas: 0 }])
  );
  proprias.forEach((c) => {
    const p = mapa.get(String(donoTurma.get(String(c.turma_id))));
    if (p) {
      p.horas_proprias += horasDaChamada(c);
      p.aulas++;
    }
  });
  subs.forEach((c) => {
    const p = mapa.get(String(c.professor_substituto_id));
    if (p) {
      p.horas_substituicao += horasDaChamada(c);
      p.aulas++;
    }
  });

  return [...mapa.values()]
    .map((p) => ({ ...p, horas_total: p.horas_proprias + p.horas_substituicao }))
    .sort((a, b) => b.horas_total - a.horas_total || String(a.nome).localeCompare(String(b.nome), "pt-BR"));
}

/* ---------------- Admin ---------------- */

async function contar(tabela, aplicar = (q) => q) {
  const { count, error } = await aplicar(supabase.from(tabela).select("id", { count: "exact", head: true }));
  if (error) throw error;
  return count ?? 0;
}

export async function resumoAdmin(mes) {
  const { inicio, fim } = getMesInicioFim(mes);
  const [alunos, chamadasMes] = await Promise.all([
    contar("alunos", (q) => q.eq("ativo", true)).catch(() => null),
    contar("chamadas", (q) => q.gte("data", inicio).lt("data", fim)).catch(() => null),
  ]);
  return { alunos, chamadasMes };
}

export async function listarEmailsAutorizados() {
  return check(await supabase.from("emails_autorizados").select("*").order("email", { ascending: true })) || [];
}

export async function adicionarEmailAutorizado(email) {
  const limpo = (email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo)) throw new Error("Informe um email válido.");

  const { data: existente, error } = await supabase
    .from("emails_autorizados")
    .select("id")
    .eq("email", limpo)
    .limit(1);
  if (error) throw error;
  if (existente?.length) throw new Error("Este email já está autorizado.");

  return check(await supabase.from("emails_autorizados").insert({ email: limpo }).select("*").single());
}

export async function removerEmailAutorizado(id) {
  const { error } = await supabase.from("emails_autorizados").delete().eq("id", id);
  if (error) throw error;
}
