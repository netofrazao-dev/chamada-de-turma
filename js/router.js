/* =========================================================
   Roteador simples baseado no "#" da URL.
   Ex.: #/turma/12/chamada?data=2026-03-10
   Isso faz o botão "voltar" do celular funcionar dentro do app.
   ========================================================= */

const routes = [];
let renderFn = null;
let leaveGuard = null;
let currentPath = null;

export function route(pattern, handler) {
  const keys = [];
  // Processa os segmentos em ordem, para que os nomes batam com os grupos da regex.
  const source = pattern
    .split("/")
    .filter(Boolean)
    .map((seg) => {
      const m = seg.match(/^:(\w+)(\?)?$/);
      if (!m) return `/${seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
      keys.push(m[1]);
      return m[2] ? "(?:/([^/]+))?" : "/([^/]+)";
    })
    .join("");
  const regex = new RegExp(`^${source || "/"}/?$`);
  routes.push({ regex, keys, handler });
}

export function parseHash(hash = location.hash) {
  const h = hash.replace(/^#/, "") || "/";
  const [path, qs = ""] = h.split("?");
  return { path: path || "/", query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function match(path) {
  for (const r of routes) {
    const m = path.match(r.regex);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => {
        if (m[i + 1] !== undefined) params[k] = decodeURIComponent(m[i + 1]);
      });
      return { handler: r.handler, params };
    }
  }
  return null;
}

export function buildHash(path, query = {}) {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();
  return `#${path}${qs ? `?${qs}` : ""}`;
}

/** Navega para uma rota. `replace` não cria entrada nova no histórico. */
export function navigate(path, { replace = false, query } = {}) {
  const hash = query ? buildHash(path, query) : `#${path}`;
  if (location.hash === hash) {
    if (renderFn) renderFn(parseHash(hash));
    return;
  }
  if (replace) location.replace(hash);
  else location.hash = hash;
}

/** Atualiza a URL sem renderizar de novo (ex.: trocar a data da chamada). */
export function updateQuery(query) {
  const { path } = parseHash();
  const hash = buildHash(path, query);
  currentPath = hash;
  history.replaceState(history.state, "", hash);
}

/**
 * Impede sair da tela atual (ex.: chamada não salva).
 * fn deve retornar Promise<boolean> (true = pode sair).
 */
export function setLeaveGuard(fn) {
  leaveGuard = fn;
}

async function onHashChange() {
  const target = location.hash || "#/";
  if (target === currentPath) return;
  if (leaveGuard) {
    const ok = await leaveGuard();
    if (!ok) {
      history.replaceState(history.state, "", currentPath || "#/");
      return;
    }
    leaveGuard = null;
  }
  currentPath = target;
  renderFn?.(parseHash(target));
}

export function startRouter(render) {
  renderFn = render;
  currentPath = location.hash || "#/";
  window.removeEventListener("hashchange", onHashChange);
  window.addEventListener("hashchange", onHashChange);
  render(parseHash(currentPath));
}

export function stopRouter() {
  window.removeEventListener("hashchange", onHashChange);
  renderFn = null;
  leaveGuard = null;
}

export function refresh() {
  renderFn?.(parseHash());
}
