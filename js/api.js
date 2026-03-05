import { supabase } from "./supabaseClient.js";

/* --------- Helpers datas --------- */
export function formatarDataBR(data) {
  if (!data) return "";
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a}`;
}

export function getMesInicioFim(mesStr) {
  // mesStr = "YYYY-MM"
  const [ano, mes] = mesStr.split("-").map(Number);
  const inicio = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 1); // primeiro dia do mês seguinte
  return {
    inicio: inicio.toISOString().slice(0, 10),
    fim: fim.toISOString().slice(0, 10),
  };
}

/* --------- Professor --------- */
export async function getProfessorAtual() {
  const { data: { user } } = await supabase.auth.getUser();
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

  // pega professor atual
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado.");

  const { data: prof, error: errProf } = await supabase
    .from("professores")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (errProf) throw errProf;

  // checagem de duplicidade por nome para este professor
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

export async function criarAluno(turmaId, nome) {
  const { data, error } = await supabase
    .from("alunos")
    .insert({ turma_id: turmaId, nome })
    .select("*")
    .single();

  if (error) throw error;
  return data;
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
    .select("id, data, chamada_presencas(aluno_id, presente)")
    .eq("turma_id", turmaId)
    .eq("data", dataStr)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;
  return data ?? null;
}

// Salva chamada como no sistema atual:
// - uma chamada por turma+data
// - presença por aluno
export async function salvarChamada(turmaId, dataStr, presentesIds, todosAlunos) {
  // verifica se já existe
  const existente = await obterChamadaPorData(turmaId, dataStr);

  if (existente) {
    // apaga chamada antiga (cascade em presenças)
    const { error: delErr } = await supabase
      .from("chamadas")
      .delete()
      .eq("id", existente.id);
    if (delErr) throw delErr;
  }

  // cria nova chamada
  const { data: chamada, error: chErr } = await supabase
    .from("chamadas")
    .insert({ turma_id: turmaId, data: dataStr })
    .select("id")
    .single();

  if (chErr) throw chErr;

  const chamadaId = chamada.id;

  // insere presenças para todos os alunos
  const registros = todosAlunos.map((aluno) => ({
    chamada_id: chamadaId,
    aluno_id: aluno.id,
    presente: presentesIds.includes(aluno.id),
  }));

  const { error: presErr } = await supabase
    .from("chamada_presencas")
    .insert(registros);

  if (presErr) throw presErr;

  return chamadaId;
}

export async function removerChamada(turmaId, dataStr) {
  const chamada = await obterChamadaPorData(turmaId, dataStr);
  if (!chamada) return false;

  const { error } = await supabase.from("chamadas").delete().eq("id", chamada.id);
  if (error) throw error;
  return true;
}

/* --------- Relatórios --------- */
export async function listarChamadasMes(turmaId, mesStr) {
  const { inicio, fim } = getMesInicioFim(mesStr);

  const { data, error } = await supabase
    .from("chamadas")
    .select("id, data, chamada_presencas(aluno_id, presente)")
    .eq("turma_id", turmaId)
    .gte("data", inicio)
    .lt("data", fim)
    .order("data", { ascending: true });

  if (error) throw error;
  return data || [];
}
export async function excluirTurma(turmaId) {
  const { error } = await supabase
    .from("turmas")
    .delete()
    .eq("id", turmaId);

  if (error) throw error;
}

export async function removerAluno(alunoId) {
  // soft delete: marca inativo para não quebrar relatórios antigos
  const { error } = await supabase
    .from("alunos")
    .update({ ativo: false })
    .eq("id", alunoId);

  if (error) throw error;
}
