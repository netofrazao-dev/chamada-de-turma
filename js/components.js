/* =========================================================
   Componentes de interface reutilizáveis
   (toast, modal, confirmação, menu, seletor de mês...)
   ========================================================= */
import { html, raw, el, escapeHtml, iniciais, addMeses, nomeMes, MESES } from "./utils.js";
import { icon } from "./icons.js";

/* ---------------- Toast ---------------- */

function toastHost() {
  let host = document.getElementById("toasts");
  if (!host) {
    host = el('<div id="toasts" class="toasts" aria-live="polite" aria-atomic="false"></div>');
    document.body.appendChild(host);
  }
  return host;
}

export function toast(message, { type = "success", duration = 3200, action } = {}) {
  const icons = { success: "checkCircle", error: "xCircle", info: "info", warning: "alert" };
  const t = el(html`
    <div class="toast toast-${type}" role="${type === "error" ? "alert" : "status"}">
      ${icon(icons[type] || "info")}
      <span class="toast-msg">${message}</span>
      ${action ? html`<button type="button" class="toast-action">${action.label}</button>` : ""}
      <button type="button" class="toast-close" aria-label="Fechar">${icon("x")}</button>
    </div>`);
  const remove = () => {
    t.classList.add("leaving");
    setTimeout(() => t.remove(), 220);
  };
  t.querySelector(".toast-close").addEventListener("click", remove);
  if (action) {
    t.querySelector(".toast-action").addEventListener("click", () => {
      action.onClick?.();
      remove();
    });
  }
  toastHost().appendChild(t);
  if (duration) setTimeout(remove, duration);
  return remove;
}

export const toastErro = (message) => toast(message, { type: "error", duration: 6000 });

/* ---------------- Modal ----------------
   Cada modal aberto cria uma entrada no histórico, então o botão
   "voltar" do Android fecha o modal em vez de sair da tela. */

const modalStack = [];
let modalSeq = 0;

window.addEventListener("popstate", (e) => {
  const atual = e.state?.modal ?? 0;
  for (let i = modalStack.length - 1; i >= 0; i--) {
    if (modalStack[i].id > atual) modalStack[i].close(undefined, { fromPop: true });
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalStack.length) {
    const top = modalStack[modalStack.length - 1];
    if (top.dismissible) top.close();
  }
});

function toNode(content) {
  if (content instanceof Node) return content;
  const wrap = document.createElement("div");
  wrap.innerHTML = String(content ?? "");
  const frag = document.createDocumentFragment();
  while (wrap.firstChild) frag.appendChild(wrap.firstChild);
  return frag;
}

/**
 * Abre um modal. Retorna { el, body, footer, close, closed }.
 * `closed` é uma Promise resolvida com o valor passado para close().
 */
export function openModal({ title, content = "", footer = "", size = "md", dismissible = true, onClose, className = "" } = {}) {
  const id = ++modalSeq;
  const overlay = el(html`
    <div class="modal-overlay ${className}">
      <div class="modal modal-${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title-${id}" tabindex="-1">
        <div class="modal-grabber" aria-hidden="true"></div>
        <header class="modal-header">
          <h2 class="modal-title" id="modal-title-${id}">${title || ""}</h2>
          ${dismissible ? html`<button type="button" class="icon-btn modal-close" aria-label="Fechar">${icon("x")}</button>` : ""}
        </header>
        <div class="modal-body"></div>
        <footer class="modal-footer"></footer>
      </div>
    </div>`);

  const dialog = overlay.querySelector(".modal");
  const body = overlay.querySelector(".modal-body");
  const footerEl = overlay.querySelector(".modal-footer");
  body.appendChild(toNode(content));
  if (footer) footerEl.appendChild(toNode(footer));
  else footerEl.remove();

  const lastFocus = document.activeElement;
  let resolveClosed;
  const closed = new Promise((r) => (resolveClosed = r));
  let isClosed = false;

  function close(result, { fromPop = false } = {}) {
    if (isClosed) return Promise.resolve();
    isClosed = true;
    const idx = modalStack.indexOf(entry);
    if (idx >= 0) modalStack.splice(idx, 1);
    overlay.classList.remove("open");
    overlay.classList.add("closing");
    setTimeout(() => overlay.remove(), 200);
    if (!modalStack.length) document.body.classList.remove("modal-open");
    try {
      lastFocus?.focus?.({ preventScroll: true });
    } catch {
      /* ignora */
    }

    // Remove a entrada do histórico criada pelo modal ANTES de avisar quem
    // está esperando (evita conflito com navegações feitas logo em seguida).
    const historico =
      !fromPop && history.state?.modal === id
        ? new Promise((res) => {
            let feito = false;
            const done = () => {
              if (feito) return;
              feito = true;
              window.removeEventListener("popstate", done);
              res();
            };
            window.addEventListener("popstate", done);
            setTimeout(done, 400);
            history.back();
          })
        : Promise.resolve();

    return historico.then(() => {
      onClose?.(result);
      resolveClosed(result);
    });
  }

  const entry = { id, close, dismissible };
  modalStack.push(entry);
  history.pushState({ ...(history.state || {}), modal: id }, "");

  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay && dismissible) close();
  });
  overlay.querySelector(".modal-close")?.addEventListener("click", () => close());

  document.body.appendChild(overlay);
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => {
    overlay.classList.add("open");
    const focusable = body.querySelector("[autofocus], input:not([type=hidden]):not([disabled]), select, textarea");
    if (focusable && window.matchMedia("(pointer: fine)").matches) focusable.focus();
    else dialog.focus({ preventScroll: true });
  });

  return { el: overlay, dialog, body, footer: footerEl, close, closed };
}

/** Fecha todos os modais sem mexer no histórico (usado ao trocar de tela). */
export function closeAllModals() {
  for (let i = modalStack.length - 1; i >= 0; i--) modalStack[i].close(undefined, { fromPop: true });
}

/** Diálogo de confirmação. Resolve true/false. */
export function confirmar({ title = "Confirmar", message = "", confirmText = "Confirmar", cancelText = "Cancelar", danger = false } = {}) {
  const m = openModal({
    title,
    size: "sm",
    content: html`<p class="confirm-text">${message}</p>`,
    footer: html`
      <button type="button" class="btn btn-ghost" data-act="cancel">${cancelText}</button>
      <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok">${confirmText}</button>`,
  });
  m.footer.querySelector('[data-act="cancel"]').addEventListener("click", () => m.close(false));
  m.footer.querySelector('[data-act="ok"]').addEventListener("click", () => m.close(true));
  setTimeout(() => m.footer.querySelector('[data-act="ok"]')?.focus(), 50);
  return m.closed.then((v) => v === true);
}

/* ---------------- Menu suspenso ---------------- */

let menuAberto = null;

export function fecharMenu() {
  if (menuAberto) {
    menuAberto.remove();
    menuAberto = null;
  }
}

document.addEventListener("click", (e) => {
  if (menuAberto && !menuAberto.contains(e.target)) fecharMenu();
});
window.addEventListener("resize", fecharMenu);
window.addEventListener("hashchange", fecharMenu);
document.addEventListener("keydown", (e) => e.key === "Escape" && fecharMenu());

/**
 * items: [{ label, icon, onClick, danger, header, divider, hint }]
 */
export function abrirMenu(anchor, items, { align = "end" } = {}) {
  fecharMenu();
  const menu = el('<div class="menu" role="menu"></div>');
  items.forEach((it) => {
    if (!it) return;
    if (it.divider) {
      menu.appendChild(el('<div class="menu-divider" role="separator"></div>'));
      return;
    }
    if (it.header) {
      menu.appendChild(el(html`<div class="menu-header">${it.header}${it.hint ? html`<small>${it.hint}</small>` : ""}</div>`));
      return;
    }
    const b = el(html`<button type="button" role="menuitem" class="menu-item ${it.danger ? "danger" : ""}">
      ${it.icon ? icon(it.icon) : ""}<span>${it.label}</span></button>`);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      fecharMenu();
      it.onClick?.();
    });
    menu.appendChild(b);
  });
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let left = align === "end" ? r.right - mw : r.left;
  left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
  let top = r.bottom + 6;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menuAberto = menu;
  setTimeout(() => menu.querySelector(".menu-item")?.focus({ preventScroll: true }), 0);
  return menu;
}

/* ---------------- Seletor de mês ---------------- */

/**
 * Seletor de mês com setas e grade de meses (funciona em todos os navegadores,
 * inclusive Safari/Firefox, que não têm <input type="month"> completo).
 */
export function monthPicker({ value, onChange }) {
  let atual = value;
  const root = el(html`
    <div class="month-picker">
      <button type="button" class="icon-btn" data-act="prev" aria-label="Mês anterior">${icon("chevronLeft")}</button>
      <button type="button" class="month-label" data-act="open" aria-haspopup="dialog"></button>
      <button type="button" class="icon-btn" data-act="next" aria-label="Próximo mês">${icon("chevronRight")}</button>
    </div>`);
  const label = root.querySelector(".month-label");

  const set = (mes, notify = true) => {
    atual = mes;
    label.innerHTML = String(html`${icon("calendar")}<span>${nomeMes(mes)}</span>`);
    if (notify) onChange?.(mes);
  };
  set(atual, false);

  root.querySelector('[data-act="prev"]').addEventListener("click", () => set(addMeses(atual, -1)));
  root.querySelector('[data-act="next"]').addEventListener("click", () => set(addMeses(atual, 1)));

  label.addEventListener("click", (e) => {
    e.stopPropagation();
    fecharMenu();
    let ano = Number(atual.slice(0, 4));
    const pop = el('<div class="menu month-popover" role="dialog" aria-label="Escolher mês"></div>');
    const draw = () => {
      pop.innerHTML = String(html`
        <div class="month-popover-head">
          <button type="button" class="icon-btn" data-y="-1" aria-label="Ano anterior">${icon("chevronLeft")}</button>
          <strong>${ano}</strong>
          <button type="button" class="icon-btn" data-y="1" aria-label="Próximo ano">${icon("chevronRight")}</button>
        </div>
        <div class="month-grid">
          ${MESES.map((m, i) => {
            const val = `${ano}-${String(i + 1).padStart(2, "0")}`;
            return html`<button type="button" class="month-cell ${val === atual ? "active" : ""}" data-m="${val}">${m.slice(0, 3)}</button>`;
          })}
        </div>`);
    };
    draw();
    pop.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const y = ev.target.closest("[data-y]");
      const m = ev.target.closest("[data-m]");
      if (y) {
        ano += Number(y.dataset.y);
        draw();
      } else if (m) {
        fecharMenu();
        set(m.dataset.m);
      }
    });
    document.body.appendChild(pop);
    const r = label.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8))}px`;
    pop.style.top = `${r.bottom + 6}px`;
    menuAberto = pop;
  });

  return { el: root, get value() { return atual; }, set: (m) => set(m, false) };
}

/* ---------------- Pequenos blocos de UI ---------------- */

export const spinner = (label = "Carregando...") =>
  html`<div class="loading-block" role="status"><span class="spinner"></span><span>${label}</span></div>`;

export function emptyState({ iconName = "info", title, text = "", action = "" }) {
  return html`
    <div class="empty-state">
      <div class="empty-icon">${icon(iconName)}</div>
      <h3>${title}</h3>
      ${text ? html`<p>${text}</p>` : ""}
      ${action}
    </div>`;
}

export function errorState(err, retryLabel = "Tentar novamente") {
  return html`
    <div class="empty-state error">
      <div class="empty-icon">${icon("alert")}</div>
      <h3>Não foi possível carregar</h3>
      <p>${err}</p>
      <button type="button" class="btn btn-secondary" data-retry>${icon("refresh")}${retryLabel}</button>
    </div>`;
}

export const avatar = (nome, cls = "") => html`<span class="avatar ${cls}" aria-hidden="true">${iniciais(nome)}</span>`;

export function statCard({ label, value, tone = "", iconName, hint = "" }) {
  return html`
    <div class="stat ${tone ? `stat-${tone}` : ""}">
      ${iconName ? html`<span class="stat-icon">${icon(iconName)}</span>` : ""}
      <div class="stat-body">
        <span class="stat-value">${value}</span>
        <span class="stat-label">${label}</span>
        ${hint ? html`<span class="stat-hint">${hint}</span>` : ""}
      </div>
    </div>`;
}

/** Coloca um botão em estado de carregamento. Retorna função para restaurar. */
export function setBusy(button, busy = true, text) {
  if (!button) return () => {};
  if (busy) {
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.classList.add("is-busy");
    button.innerHTML = `<span class="spinner spinner-sm"></span><span>${escapeHtml(text || "Aguarde...")}</span>`;
  } else {
    button.disabled = false;
    button.classList.remove("is-busy");
    if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }
  return () => setBusy(button, false);
}

export { raw };
