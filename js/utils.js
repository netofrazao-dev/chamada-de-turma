/* =========================================================
   Utilitários gerais: HTML seguro, datas, formatação, etc.
   ========================================================= */

/* ---------- HTML seguro (evita injeção de HTML/script) ---------- */

class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Marca um texto como HTML confiável (não será escapado). */
export const raw = (value) => new SafeHtml(String(value ?? ""));

function renderValue(v) {
  if (v === null || v === undefined || v === false) return "";
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(renderValue).join("");
  return escapeHtml(v);
}

/**
 * Template tag: tudo que for interpolado é escapado automaticamente.
 *   el.innerHTML = html`<b>${aluno.nome}</b>`;
 */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    out += renderValue(v) + strings[i + 1];
  });
  return new SafeHtml(out);
}

/** Cria um elemento a partir de HTML (primeiro elemento). */
export function el(markup) {
  const tpl = document.createElement("template");
  tpl.innerHTML = String(markup).trim();
  return tpl.content.firstElementChild;
}

/* ---------- Datas (sempre no fuso local, sem UTC) ---------- */

const pad = (n) => String(n).padStart(2, "0");

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hojeISO = () => toISODate(new Date());
export const mesAtualISO = () => hojeISO().slice(0, 7);

export function parseISODate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDias(iso, n) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function addMeses(mes, n) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Intervalo [inicio, fim) de um mês "AAAA-MM" em datas ISO. */
export function getMesInicioFim(mes) {
  return { inicio: `${mes}-01`, fim: `${addMeses(mes, 1)}-01` };
}

export function ultimoDiaDoMes(mes) {
  return addDias(`${addMeses(mes, 1)}-01`, -1);
}

export function diasDoMes(mes) {
  const [y, m] = mes.split("-").map(Number);
  const total = new Date(y, m, 0).getDate();
  return Array.from({ length: total }, (_, i) => `${mes}-${pad(i + 1)}`);
}

export const diaDaSemana = (iso) => parseISODate(iso).getDay();
export const isValidISODate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
export const isValidMes = (s) => /^\d{4}-\d{2}$/.test(s || "");

export function formatarDataBR(iso) {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function formatarDataLonga(iso, { ano = true } = {}) {
  const txt = parseISODate(iso).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(ano ? { year: "numeric" } : {}),
  });
  return capitalizar(txt);
}

export function formatarDataCurta(iso) {
  const d = parseISODate(iso);
  return `${DIAS_CURTOS[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function nomeMes(mes) {
  const [y, m] = mes.split("-").map(Number);
  return `${capitalizar(MESES[m - 1])} de ${y}`;
}

/* ---------- Texto ---------- */

export const capitalizar = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

export function normalizar(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function iniciais(nome) {
  const partes = String(nome || "?").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  const a = partes[0][0] || "";
  const b = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (a + b).toUpperCase();
}

export const primeiroNome = (nome) => String(nome || "").trim().split(/\s+/)[0] || "";

export const compararNomes = (a, b) =>
  String(a || "").localeCompare(String(b || ""), "pt-BR", { sensitivity: "base" });

export const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/* ---------- Números ---------- */

export function formatarHoras(h) {
  const n = Number(h) || 0;
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
}

export function formatarPercentual(p) {
  if (p === null || p === undefined || Number.isNaN(p)) return "–";
  return `${Number(p).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/* ---------- Regras de negócio das aulas ---------- */

export const TIPOS_AULA = {
  normal: "Normal",
  reforco: "Reforço",
  reposicao: "Reposição",
};

export const isAulaExtra = (tipo) => tipo === "reforco" || tipo === "reposicao";

/** Aula normal vale 1,5h; reforço e reposição valem 1h. */
export const horasPorTipo = (tipo) => (isAulaExtra(tipo) ? 1 : 1.5);

export function horasDaChamada(chamada) {
  if (chamada?.horas_aula !== null && chamada?.horas_aula !== undefined && chamada.horas_aula !== "") {
    return Number(chamada.horas_aula);
  }
  return horasPorTipo(chamada?.tipo_aula);
}

/**
 * "ministrada"  → o professor da turma deu a aula
 * "substituida" → outro professor deu a aula
 * "cancelada"   → a aula não aconteceu
 */
export function statusAula(chamada) {
  if (chamada.foi_ministrada !== false) return "ministrada";
  if (chamada.professor_substituto_id || chamada.substituto_nome_manual) return "substituida";
  return "cancelada";
}

export const sameId = (a, b) => String(a) === String(b);

/* ---------- Diversos ---------- */

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** localStorage com proteção (pode falhar em modo privado). */
export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignora */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignora */
    }
  },
};

/* ---------- Arquivos ---------- */

/** CSV no padrão do Excel em português (separador ";" e BOM para acentos). */
export function gerarCSV(linhas) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + linhas.map((l) => l.map(esc).join(";")).join("\r\n");
}

export function baixarArquivo(nome, conteudo, tipo = "text/csv;charset=utf-8") {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function slug(s) {
  return normalizar(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "arquivo";
}

/* ---------- Erros amigáveis ---------- */

export function mensagemErro(err, fallback = "Ocorreu um erro inesperado. Tente novamente.") {
  if (!err) return fallback;
  const msg = String(err.message || err.error_description || err || "");
  const code = err.code || "";

  if (/Invalid login credentials/i.test(msg)) return "Email ou senha incorretos.";
  if (/Email not confirmed/i.test(msg)) return "Seu email ainda não foi confirmado. Verifique sua caixa de entrada.";
  if (/User already registered|already been registered/i.test(msg)) return "Já existe uma conta com este email.";
  if (/Password should be at least/i.test(msg)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/should be different from the old/i.test(msg)) return "A nova senha deve ser diferente da atual.";
  if (/Database error saving new user/i.test(msg))
    return "Não foi possível criar a conta. Confirme com a coordenação se o seu email foi autorizado.";
  if (/rate limit|only request this after|too many/i.test(msg))
    return "Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.";
  if (/Unable to validate email|invalid email|valid email/i.test(msg)) return "Informe um email válido.";
  if (/JWT expired|session.*(missing|expired)|refresh token/i.test(msg)) return "Sua sessão expirou. Entre novamente.";
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg))
    return "Sem conexão com o servidor. Verifique sua internet e tente novamente.";
  if (code === "42501" || /row-level security|permission denied/i.test(msg))
    return "Você não tem permissão para fazer isso.";
  if (code === "23505") return "Este registro já existe.";
  if (code === "23503") return "Este registro está ligado a outros dados e não pode ser alterado.";
  return msg || fallback;
}
