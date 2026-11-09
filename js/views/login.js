/* Tela de entrada: login, cadastro, recuperação e nova senha. */
import { html, mensagemErro } from "../utils.js";
import { icon } from "../icons.js";
import { setBusy, toast } from "../components.js";
import { signIn, signUp, enviarLinkRedefinicao, definirNovaSenha } from "../auth.js";
import { instalarApp, podeInstalar, onInstallChange } from "../pwa.js";
import { APP_NOME, ESCOLA_NOME } from "../config.js";

function campoSenha(id, label, autocomplete) {
  return html`
    <label class="field">
      <span class="field-label">${label}</span>
      <span class="input-wrap">
        ${icon("lock", "input-icon")}
        <input type="password" id="${id}" required minlength="6" autocomplete="${autocomplete}" placeholder="••••••••">
        <button type="button" class="input-action" data-toggle-pw="${id}" aria-label="Mostrar senha">${icon("eye")}</button>
      </span>
    </label>`;
}

function campoEmail(id) {
  return html`
    <label class="field">
      <span class="field-label">Email</span>
      <span class="input-wrap">
        ${icon("mail", "input-icon")}
        <input type="email" id="${id}" required autocomplete="email" inputmode="email" placeholder="seu@email.com">
      </span>
    </label>`;
}

export function renderLogin(root, { modo = "login", aviso = null } = {}) {
  root.innerHTML = String(html`
    <div class="auth-screen">
      <div class="auth-bg" aria-hidden="true"></div>
      <main class="auth-card" id="auth-card">
        <div class="auth-logo"><img src="imagens/logo.jpg" alt="${ESCOLA_NOME}" width="770" height="507"></div>
        <h1 class="auth-title">${APP_NOME}</h1>
        <p class="auth-sub" id="auth-sub"></p>

        <div class="segmented auth-tabs" role="tablist" id="auth-tabs">
          <button type="button" role="tab" data-modo="login">Entrar</button>
          <button type="button" role="tab" data-modo="cadastro">Criar conta</button>
        </div>

        <form id="form-login" class="auth-form" novalidate>
          ${campoEmail("login-email")}
          ${campoSenha("login-senha", "Senha", "current-password")}
          <div class="auth-row"><button type="button" class="link-btn" data-modo-link="recuperar">Esqueci minha senha</button></div>
          <button type="submit" class="btn btn-primary btn-lg btn-block">Entrar</button>
        </form>

        <form id="form-cadastro" class="auth-form" novalidate>
          <label class="field">
            <span class="field-label">Nome completo</span>
            <span class="input-wrap">${icon("user", "input-icon")}<input type="text" id="cad-nome" required autocomplete="name" placeholder="Seu nome"></span>
          </label>
          ${campoEmail("cad-email")}
          ${campoSenha("cad-senha", "Senha (mínimo 6 caracteres)", "new-password")}
          <p class="hint">${icon("info")}<span>Apenas emails autorizados pela coordenação podem criar conta.</span></p>
          <button type="submit" class="btn btn-primary btn-lg btn-block">Criar conta</button>
        </form>

        <form id="form-recuperar" class="auth-form" novalidate>
          ${campoEmail("rec-email")}
          <button type="submit" class="btn btn-primary btn-lg btn-block">Enviar link de redefinição</button>
          <button type="button" class="btn btn-ghost btn-block" data-modo-link="login">${icon("arrowLeft")}Voltar para o login</button>
        </form>

        <form id="form-nova-senha" class="auth-form" novalidate>
          ${campoSenha("nova-senha", "Nova senha", "new-password")}
          ${campoSenha("nova-senha-2", "Repita a nova senha", "new-password")}
          <button type="submit" class="btn btn-primary btn-lg btn-block">Salvar nova senha</button>
        </form>

        <div class="auth-msg" id="auth-msg" role="alert" hidden></div>

        <button type="button" class="btn btn-soft btn-block auth-install" id="auth-install" hidden>
          ${icon("smartphone")}Instalar o app no celular
        </button>
      </main>
      <p class="auth-footer">${ESCOLA_NOME}</p>
    </div>`);

  const $ = (s) => root.querySelector(s);
  const msg = $("#auth-msg");
  const forms = {
    login: $("#form-login"),
    cadastro: $("#form-cadastro"),
    recuperar: $("#form-recuperar"),
    "nova-senha": $("#form-nova-senha"),
  };
  const subs = {
    login: "Entre para fazer a chamada das suas turmas.",
    cadastro: "Crie sua conta de professor.",
    recuperar: "Informe seu email e enviaremos um link para criar uma nova senha.",
    "nova-senha": "Crie uma nova senha para sua conta.",
  };

  function mostrarMsg(texto, tipo = "error") {
    if (!texto) {
      msg.hidden = true;
      return;
    }
    msg.hidden = false;
    msg.className = `auth-msg auth-msg-${tipo}`;
    msg.innerHTML = String(html`${icon(tipo === "error" ? "alert" : "checkCircle")}<span>${texto}</span>`);
  }

  function setModo(m) {
    Object.entries(forms).forEach(([k, f]) => (f.hidden = k !== m));
    $("#auth-tabs").hidden = !(m === "login" || m === "cadastro");
    root.querySelectorAll("#auth-tabs [data-modo]").forEach((b) => {
      const ativo = b.dataset.modo === m;
      b.classList.toggle("active", ativo);
      b.setAttribute("aria-selected", String(ativo));
    });
    $("#auth-sub").textContent = subs[m];
    mostrarMsg("");
    const first = forms[m].querySelector("input");
    if (first && window.matchMedia("(pointer: fine)").matches) first.focus();
  }

  root.querySelectorAll("[data-modo]").forEach((b) => b.addEventListener("click", () => setModo(b.dataset.modo)));
  root.querySelectorAll("[data-modo-link]").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.modoLink === "recuperar") $("#rec-email").value = $("#login-email").value;
      setModo(b.dataset.modoLink);
    })
  );
  root.querySelectorAll("[data-toggle-pw]").forEach((b) =>
    b.addEventListener("click", () => {
      const input = root.querySelector(`#${b.dataset.togglePw}`);
      const mostrar = input.type === "password";
      input.type = mostrar ? "text" : "password";
      b.innerHTML = String(icon(mostrar ? "eyeOff" : "eye"));
      b.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
    })
  );

  function validar(form) {
    const invalid = [...form.querySelectorAll("input")].find((i) => !i.checkValidity());
    if (invalid) {
      const label = invalid.closest(".field")?.querySelector(".field-label")?.textContent || "campo";
      if (invalid.validity.valueMissing) mostrarMsg(`Preencha o campo “${label}”.`);
      else if (invalid.type === "email") mostrarMsg("Informe um email válido.");
      else if (invalid.validity.tooShort) mostrarMsg("A senha precisa ter pelo menos 6 caracteres.");
      else mostrarMsg("Verifique os dados informados.");
      invalid.focus();
      return false;
    }
    return true;
  }

  forms.login.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validar(forms.login)) return;
    const btn = forms.login.querySelector("[type=submit]");
    setBusy(btn, true, "Entrando...");
    mostrarMsg("");
    try {
      await signIn({ email: $("#login-email").value, password: $("#login-senha").value });
      // A troca de tela acontece pelo listener de autenticação.
    } catch (err) {
      mostrarMsg(mensagemErro(err));
      setBusy(btn, false);
    }
  });

  forms.cadastro.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validar(forms.cadastro)) return;
    const btn = forms.cadastro.querySelector("[type=submit]");
    setBusy(btn, true, "Criando conta...");
    try {
      const email = $("#cad-email").value;
      const data = await signUp({ nome: $("#cad-nome").value, email, password: $("#cad-senha").value });
      if (!data.session) {
        setModo("login");
        $("#login-email").value = email;
        mostrarMsg("Conta criada! Se for pedido, confirme o cadastro pelo link enviado ao seu email e depois entre.", "success");
      }
    } catch (err) {
      mostrarMsg(mensagemErro(err));
    } finally {
      setBusy(btn, false);
    }
  });

  forms.recuperar.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validar(forms.recuperar)) return;
    const btn = forms.recuperar.querySelector("[type=submit]");
    setBusy(btn, true, "Enviando...");
    try {
      await enviarLinkRedefinicao($("#rec-email").value);
      mostrarMsg("Pronto! Se o email estiver cadastrado, você receberá um link para criar uma nova senha.", "success");
    } catch (err) {
      mostrarMsg(mensagemErro(err));
    } finally {
      setBusy(btn, false);
    }
  });

  forms["nova-senha"].addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validar(forms["nova-senha"])) return;
    if ($("#nova-senha").value !== $("#nova-senha-2").value) {
      mostrarMsg("As senhas não são iguais.");
      return;
    }
    const btn = forms["nova-senha"].querySelector("[type=submit]");
    setBusy(btn, true, "Salvando...");
    try {
      await definirNovaSenha($("#nova-senha").value);
      toast("Senha alterada com sucesso!");
      location.hash = "#/";
      location.reload();
    } catch (err) {
      mostrarMsg(mensagemErro(err));
      setBusy(btn, false);
    }
  });

  const installBtn = $("#auth-install");
  const syncInstall = () => (installBtn.hidden = !podeInstalar());
  syncInstall();
  const off = onInstallChange(syncInstall);
  installBtn.addEventListener("click", instalarApp);

  setModo(modo);
  if (aviso) mostrarMsg(aviso.texto, aviso.tipo || "error");
  return () => off();
}

export function renderErroPerfil(root, { mensagem, onRetry, onLogout }) {
  root.innerHTML = String(html`
    <div class="auth-screen">
      <div class="auth-bg" aria-hidden="true"></div>
      <main class="auth-card">
        <div class="empty-state error">
          <div class="empty-icon">${icon("alert")}</div>
          <h3>Não foi possível abrir sua conta</h3>
          <p>${mensagem}</p>
          <div class="btn-row center">
            <button type="button" class="btn btn-primary" data-retry>${icon("refresh")}Tentar novamente</button>
            <button type="button" class="btn btn-ghost" data-logout>${icon("logout")}Sair</button>
          </div>
        </div>
      </main>
    </div>`);
  root.querySelector("[data-retry]").addEventListener("click", onRetry);
  root.querySelector("[data-logout]").addEventListener("click", onLogout);
}

