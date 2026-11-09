/* =========================================================
   Service worker do Challenger Presença
   - Deixa o app instalável (Android, iPhone, computador).
   - Sempre busca a versão mais nova quando há internet
     (não é preciso "limpar cache" depois de atualizar o site).
   - Sem internet, abre a última versão guardada.
   - Nunca guarda dados do Supabase (chamadas, alunos...).
   ========================================================= */

const VERSION = "2.0.0";
const APP_CACHE = `presenca-app-${VERSION}`;
const CDN_CACHE = "presenca-cdn-v1";

const APP_SHELL = [
  "./",
  "index.html",
  "manifest.json",
  "css/app.css",
  "js/app.js",
  "js/config.js",
  "js/supabaseClient.js",
  "js/utils.js",
  "js/icons.js",
  "js/components.js",
  "js/router.js",
  "js/api.js",
  "js/auth.js",
  "js/session.js",
  "js/stats.js",
  "js/pwa.js",
  "js/reports.js",
  "js/views/login.js",
  "js/views/turmas.js",
  "js/views/relatorioProfessor.js",
  "js/views/turma/index.js",
  "js/views/turma/chamada.js",
  "js/views/turma/alunos.js",
  "js/views/turma/relatorio.js",
  "js/views/turma/calendario.js",
  "js/views/admin/inicio.js",
  "js/views/admin/chamadas.js",
  "js/views/admin/horas.js",
  "js/views/admin/relatorio.js",
  "js/views/admin/emails.js",
  "imagens/logo.jpg",
  "icons/globe-128.png",
  "icons/icon-192.png",
  "icons/apple-touch-icon.png",
  "favicon.ico",
];

// Bibliotecas externas com versão fixa (podem ficar em cache "para sempre").
const CDN_HOSTS = ["cdn.jsdelivr.net"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);
      // Um arquivo com problema não impede a instalação dos outros.
      await Promise.allSettled(
        APP_SHELL.map((url) =>
          fetch(new Request(url, { cache: "reload" })).then((res) => (res.ok ? cache.put(url, res) : null))
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const tinhaVersaoAntiga = keys.includes("chamada-turma-v1");
      await Promise.all(
        keys.filter((k) => k !== APP_CACHE && k !== CDN_CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
      // Quem estava com a versão antiga aberta recarrega para receber a nova.
      if (tinhaVersaoAntiga) {
        const janelas = await self.clients.matchAll({ type: "window" });
        janelas.forEach((c) => c.navigate(c.url).catch(() => {}));
      }
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Bibliotecas do CDN: cache primeiro (a URL tem versão fixa).
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Só cuida dos arquivos do próprio site. Supabase e outros passam direto.
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, { fallback: "index.html" }));
    return;
  }
  event.respondWith(networkFirst(req));
});

async function networkFirst(req, { fallback } = {}) {
  const cache = await caches.open(APP_CACHE);
  try {
    // "no-cache" revalida com o servidor: garante a versão mais recente.
    const res = await fetch(req, { cache: "no-cache" }).catch(() => fetch(req));
    if (res.ok && res.type === "basic") {
      const url = new URL(req.url);
      cache.put(url.pathname.endsWith("/") ? req : url.href.split("?")[0], res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    const cached =
      (await cache.match(req, { ignoreSearch: true })) ||
      (fallback ? await cache.match(fallback) : undefined) ||
      (fallback ? await cache.match("./") : undefined);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CDN_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone()).catch(() => {});
  return res;
}
