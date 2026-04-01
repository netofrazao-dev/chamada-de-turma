import { supabase } from "./supabaseClient.js";

/* --------- Helpers datas --------- */
export function formatarDataBR(data) {
  if (!data) return "";
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a}`;
}

export function getMesInicioFim(mesStr) {
  const [ano, mes] = mesStr.split("-").map(Number);
  const inicio = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 1);
  return {
    inicio: inicio.toISOString().slice(0, 10),
    fim: fim.toISOString().slice(0, 10),
  };
}

/* --------- Professor (usuário atual) --------- */
export async function getProfessorAtual() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("professores")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  if (error) throw error;
  return data;
}

/* --------- Turmas --------- */
export async function listarTurmas() {
  const { data, error } = await supabase
    .from("turmas")
    .select("*")
    .eq("ativo", true)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function criarTurma({ nome, descricao }) {
  const nomeLimpo = nome.trim();
  if (!nomeLimpo) throw new Error("Informe o nome da turma.");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado.");

  const { data: prof, error: errProf } = await supabase
    .from("professores")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (errProf) throw errProf;

  const { data: turmaExistente, error: dupErr } = await supabase
    .from("turmas")
    .select("id")
    .eq("professor_id", prof.id)
    .ilike("nome", nomeLimpo)
    .maybeSingle();

  if (dupErr && dupErr.code !== "PGRST116") throw dupErr;

  if (turmaExistente) {
    throw new Error("Já existe uma turma com este nome.");
  }

  const { data, error } = await supabase
    .from("turmas")
    .insert({
      professor_id: prof.id,
      nome: nomeLimpo,
      descricao,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function excluirTurma(turmaId) {
  const { error } = await supabase
    .from("turmas")
    .update({ ativo: false })
    .eq("id", turmaId);

  if (error) throw error;
}

/* --------- Alunos --------- */
export async function listarAlunos(turmaId) {
  const { data, error } = await supabase
    .from("alunos")
    .select("*")
    .eq("turma_id", turmaId)
    .eq("ativo", true)
    .order("nome", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function criarAluno(turmaId, nome, dataEntrada) {
  const payload = {
    turma_id: turmaId,
    nome,
    data_entrada: dataEntrada || null,
  };

  const { data, error } = await supabase
    .from("alunos")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function atualizarAlunoNome(alunoId, novoNome) {
  const nomeLimpo = (novoNome || "").trim();
  if (!nomeLimpo) throw new Error("Informe um nome válido.");

  const { data, error } = await supabase
    .from("alunos")
    .update({ nome: nomeLimpo })
    .eq("id", alunoId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function removerAluno(alunoId) {
  const { error } = await supabase
    .from("alunos")
    .update({ ativo: false })
    .eq("id", alunoId);

  if (error) throw error;
}

/* --------- Horários --------- */
export async function listarHorarios(turmaId) {
  const { data, error } = await supabase
    .from("turma_horarios")
    .select("*")
    .eq("turma_id", turmaId)
    .order("dia_semana", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function criarHorario(turmaId, diaSemana, horarioTexto) {
  const { data, error } = await supabase
    .from("turma_horarios")
    .insert({
      turma_id: turmaId,
      dia_semana: diaSemana,
      horario_texto: horarioTexto,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/* --------- Chamadas --------- */

export async function obterChamadaPorData(turmaId, dataStr) {
  const { data, error } = await supabase
    .from("chamadas")
    .select(
      "id, data, foi_ministrada, professor_substituto_id, substituto_nome_manual, chamada_presencas(aluno_id, presente)"
    )
    .eq("turma_id", turmaId)
    .eq("data", dataStr)
    .maybeSingle();

  // PGRST116 = "No rows"
  if (error && error.code !== "PGRST116") throw error;
  return data ?? null;
}

export async function listarChamadasMes(turmaId, mesStr) {
  const { inicio, fim } = getMesInicioFim(mesStr);

  const { data, error } = await supabase
    .from("chamadas")
    .select(
      "id, data, foi_ministrada, professor_substituto_id, substituto_nome_manual, chamada_presencas(aluno_id, presente)"
    )
    .eq("turma_id", turmaId)
    .gte("data", inicio)
    .lt("data", fim)
    .order("data", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function salvarChamada(
  turmaId,
  dataStr,
  presentesIds,
  todosAlunos,
  {
    foiMinistrada = true,
    professorSubstitutoId = null,
    substitutoNomeManual = null,
  } = {}
) {
  const existente = await obterChamadaPorData(turmaId, dataStr);

  if (existente) {
    const { error: delErr } = await supabase
      .from("chamadas")
      .delete()
      .eq("id", existente.id);
    if (delErr) throw delErr;
  }

  const { data: chamada, error: chErr } = await supabase
    .from("chamadas")
    .insert({
      turma_id: turmaId,
      data: dataStr,
      foi_ministrada: foiMinistrada,
      professor_substituto_id: professorSubstitutoId || null,
      substituto_nome_manual: substitutoNomeManual || null,
    })
    .select("id")
    .single();

  if (chErr) throw chErr;

  const registros = todosAlunos.map((aluno) => ({
    chamada_id: chamada.id,
    aluno_id: aluno.id,
    presente: presentesIds.includes(aluno.id),
  }));

  const { error: presErr } = await supabase
    .from("chamada_presencas")
    .insert(registros);

  if (presErr) throw presErr;

  return chamada.id;
}

export async function removerChamada(turmaId, dataStr) {
  const chamada = await obterChamadaPorData(turmaId, dataStr);
  if (!chamada) return false;

  const { error } = await supabase
    .from("chamadas")
    .delete()
    .eq("id", chamada.id);

  if (error) throw error;
  return true;
}

/* --------- Admin / permissões --------- */

export async function isAdmin() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("professores")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;

  return data?.role === "admin";
}

export async function adminListarProfessores() {
  const { data, error } = await supabase
    .from("professores")
    .select("id, nome, email, role")
    .order("nome", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function adminListarTodasTurmas() {
  const { data, error } = await supabase
    .from("turmas")
    .select("id, nome, descricao, ativo, professor_id, professores(nome, email)")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

/* --------- Admin: e-mails autorizados --------- */

export async function adminListarEmailsAutorizados() {
  const { data, error } = await supabase
    .from("emails_autorizados")
    .select("*")
    .order("email", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function adminAdicionarEmailAutorizado(email) {
  const emailLimpo = (email || "").trim().toLowerCase();
  if (!emailLimpo) throw new Error("Informe um e-mail válido.");

  // evita duplicado
  const { data: existente, error: dupErr } = await supabase
    .from("emails_autorizados")
    .select("id")
    .eq("email", emailLimpo)
    .maybeSingle();

  if (dupErr && dupErr.code !== "PGRST116") throw dupErr;
  if (existente) throw new Error("Este e-mail já está autorizado.");

  const { data, error } = await supabase
    .from("emails_autorizados")
    .insert({ email: emailLimpo })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function adminRemoverEmailAutorizado(id) {
  const { error } = await supabase
    .from("emails_autorizados")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

/* --------- Relatórios: horas por professor --------- */

export async function calcularHorasPorProfessor({ inicio, fim } = {}) {
  const [professores, turmasRes] = await Promise.all([
    adminListarProfessores(),
    supabase.from("turmas").select("id, professor_id"),
  ]);

  if (turmasRes.error) throw turmasRes.error;

  const turmaMap = new Map(
    (turmasRes.data || []).map((t) => [t.id, t.professor_id])
  );

  // Aulas que o próprio professor ministrou (foi_ministrada = true)
  let qProprias = supabase
    .from("chamadas")
    .select("horas_aula, turma_id")
    .eq("foi_ministrada", true);

  // Aulas que ele foi substituto (foi_ministrada = false + professor_substituto_id)
  let qSubs = supabase
    .from("chamadas")
    .select("horas_aula, professor_substituto_id")
    .eq("foi_ministrada", false)
    .not("professor_substituto_id", "is", null);

  if (inicio) {
    qProprias = qProprias.gte("data", inicio);
    qSubs = qSubs.gte("data", inicio);
  }
  if (fim) {
    qProprias = qProprias.lte("data", fim);
    qSubs = qSubs.lte("data", fim);
  }

  const [{ data: proprias, error: e1 }, { data: subs, error: e2 }] =
    await Promise.all([qProprias, qSubs]);

  if (e1) throw e1;
  if (e2) throw e2;

  const horasMap = new Map(
    professores.map((p) => [
      p.id,
      { ...p, horas_proprias: 0, horas_substituicao: 0 },
    ])
  );

  (proprias || []).forEach((c) => {
    const profId = turmaMap.get(c.turma_id);
    if (profId && horasMap.has(profId)) {
      horasMap.get(profId).horas_proprias += Number(c.horas_aula || 1.5);
    }
  });

  (subs || []).forEach((c) => {
    const profId = c.professor_substituto_id;
    if (profId && horasMap.has(profId)) {
      horasMap.get(profId).horas_substituicao += Number(c.horas_aula || 1.5);
    }
  });

  return Array.from(horasMap.values())
    .map((p) => ({
      ...p,
      horas_total: p.horas_proprias + p.horas_substituicao,
    }))
    .sort((a, b) => b.horas_total - a.horas_total);
}

/* --------- NOVO: relatório mensal por professor --------- */

export async function listarAulasProfesorMes(professorId, mesStr) {
  const { inicio, fim } = getMesInicioFim(mesStr);

  // Turmas que esse professor é titular
  const { data: turmas, error: tErr } = await supabase
    .from("turmas")
    .select("id, nome")
    .eq("professor_id", professorId);

  if (tErr) throw tErr;

  const turmaIds = (turmas || []).map((t) => t.id);
  const turmaMapLocal = new Map((turmas || []).map((t) => [t.id, t.nome]));

  let aulasPropriasList = [];

  if (turmaIds.length) {
    const { data: proprias, error: pErr } = await supabase
      .from("chamadas")
      .select(
        "id, data, turma_id, horas_aula, foi_ministrada, professor_substituto_id, substituto_nome_manual"
      )
      .in("turma_id", turmaIds)
      .eq("foi_ministrada", true)
      .gte("data", inicio)
      .lt("data", fim)
      .order("data", { ascending: true });

    if (pErr) throw pErr;

    aulasPropriasList = (proprias || []).map((c) => ({
      ...c,
      turma_nome: turmaMapLocal.get(c.turma_id) || "-",
      tipo: "propria",
    }));
  }

  // Aulas em que ele foi substituto
  const { data: subs, error: sErr } = await supabase
    .from("chamadas")
    .select(
      "id, data, turma_id, horas_aula, foi_ministrada, professor_substituto_id, substituto_nome_manual, turmas(nome)"
    )
    .eq("professor_substituto_id", professorId)
    .eq("foi_ministrada", false)
    .gte("data", inicio)
    .lt("data", fim)
    .order("data", { ascending: true });

  if (sErr) throw sErr;

  const aulasSubsList = (subs || []).map((c) => ({
    ...c,
    turma_nome: c.turmas?.nome || turmaMapLocal.get(c.turma_id) || "-",
    tipo: "substituicao",
  }));

  const todas = [...aulasPropriasList, ...aulasSubsList].sort((a, b) =>
    a.data.localeCompare(b.data)
  );

  const horasProprias = aulasPropriasList.reduce(
    (acc, c) => acc + Number(c.horas_aula || 1.5),
    0
  );

  const horasSubstituicao = aulasSubsList.reduce(
    (acc, c) => acc + Number(c.horas_aula || 1.5),
    0
  );

  return {
    aulas: todas,
    horasTotal: horasProprias + horasSubstituicao,
    horasProprias,
    horasSubstituicao,
  };
}