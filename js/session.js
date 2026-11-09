/* Estado da sessão atual (usuário logado e cache leve). */
import { listarProfessores } from "./api.js";

export const session = {
  user: null,
  professor: null,
  isAdmin: false,
  _professores: null,
};

export function setSession({ user, professor }) {
  session.user = user;
  session.professor = professor;
  session.isAdmin = professor?.role === "admin";
  session._professores = null;
}

export function clearSession() {
  session.user = null;
  session.professor = null;
  session.isAdmin = false;
  session._professores = null;
}

export function nomeUsuario() {
  return session.professor?.nome || session.user?.user_metadata?.nome || session.user?.email || "Professor";
}

/** Lista de professores (com cache). Professores sem permissão recebem lista vazia. */
export async function getProfessores({ force = false } = {}) {
  if (!session._professores || force) {
    try {
      session._professores = await listarProfessores();
    } catch {
      session._professores = session.professor ? [session.professor] : [];
    }
  }
  return session._professores;
}

export function nomeProfessor(id, lista = session._professores || []) {
  if (!id) return null;
  const p = lista.find((x) => String(x.id) === String(id));
  return p ? p.nome || p.email : null;
}
