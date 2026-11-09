/* Admin: emails autorizados a criar conta. */
import { html, mensagemErro, normalizar } from "../../utils.js";
import { icon } from "../../icons.js";
import { confirmar, toast, toastErro, setBusy, spinner, errorState, emptyState } from "../../components.js";
import { listarEmailsAutorizados, adicionarEmailAutorizado, removerEmailAutorizado } from "../../api.js";

export async function renderAdminEmails(view, ctx) {
  let emails = [];
  let filtro = "";

  view.innerHTML = String(html`
    <section class="page">
      <header class="page-head">
        <div>
          <h1>Acessos</h1>
          <p class="muted">Só quem estiver nesta lista consegue criar conta no sistema.</p>
        </div>
      </header>
      <form class="card add-card" id="ae-form" novalidate>
        <h2 class="card-title">${icon("mail")}Autorizar novo email</h2>
        <div class="add-row">
          <label class="field grow">
            <span class="field-label">Email do professor</span>
            <input type="email" name="email" required placeholder="professor@email.com" autocomplete="off" inputmode="email">
          </label>
          <button type="submit" class="btn btn-primary">${icon("plus")}Autorizar</button>
        </div>
        <span class="field-hint">Depois de autorizado, o professor cria a conta pela tela de login, em “Criar conta”.</span>
      </form>
      <section class="card list-card">
        <div class="list-head">
          <h2 class="card-title">Emails autorizados <span class="count" id="ae-count"></span></h2>
          <label class="search search-sm">${icon("search")}<input type="search" id="ae-busca" placeholder="Buscar" aria-label="Buscar email"></label>
        </div>
        <ul class="email-list" id="ae-lista">${spinner()}</ul>
      </section>
    </section>`);

  const form = view.querySelector("#ae-form");
  const lista = view.querySelector("#ae-lista");

  async function carregar() {
    try {
      emails = await listarEmailsAutorizados();
    } catch (err) {
      if (!ctx.isActive()) return;
      lista.innerHTML = String(errorState(mensagemErro(err)));
      lista.querySelector("[data-retry]").addEventListener("click", carregar);
      return;
    }
    if (!ctx.isActive()) return;
    desenhar();
  }

  function desenhar() {
    view.querySelector("#ae-count").textContent = emails.length;
    const f = normalizar(filtro);
    const vis = emails.filter((e) => !f || normalizar(e.email).includes(f));
    if (!vis.length) {
      lista.innerHTML = String(html`<li>${emptyState({ iconName: "mail", title: emails.length ? "Nenhum email encontrado" : "Nenhum email autorizado" })}</li>`);
      return;
    }
    lista.innerHTML = String(html`${vis.map((e) => html`
      <li class="email-row">
        <span class="email-icon">${icon("mail")}</span>
        <span class="email-addr">${e.email}</span>
        <button type="button" class="icon-btn danger" data-id="${e.id}" data-email="${e.email}" aria-label="Remover ${e.email}" title="Remover">${icon("trash")}</button>
      </li>`)}`);
  }

  lista.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-id]");
    if (!b) return;
    const ok = await confirmar({
      title: "Remover autorização?",
      message: `“${b.dataset.email}” não poderá mais criar conta. Contas já criadas continuam funcionando.`,
      confirmText: "Remover",
      danger: true,
    });
    if (!ok) return;
    try {
      await removerEmailAutorizado(b.dataset.id);
      toast("Email removido.");
      await carregar();
    } catch (err) {
      toastErro(mensagemErro(err));
    }
  });

  view.querySelector("#ae-busca").addEventListener("input", (e) => {
    filtro = e.target.value;
    desenhar();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("[type=submit]");
    setBusy(btn, true, "Salvando...");
    try {
      await adicionarEmailAutorizado(form.email.value);
      toast("Email autorizado!");
      form.email.value = "";
      await carregar();
    } catch (err) {
      toastErro(mensagemErro(err));
    } finally {
      setBusy(btn, false);
    }
  });

  await carregar();
}
