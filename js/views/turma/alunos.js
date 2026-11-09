/* Aba "Alunos": cadastrar, editar, transferir e remover alunos. */
import {
  html, mensagemErro, hojeISO, formatarDataBR, compararNomes, normalizar, plural, sameId,
} from "../../utils.js";
import { icon } from "../../icons.js";
import { openModal, confirmar, toast, toastErro, setBusy, spinner, errorState, emptyState, avatar } from "../../components.js";
import {
  listarAlunos, criarAlunos, atualizarAluno, removerAluno, transferirAluno,
  listarHistoricoTransferencias, listarTurmas,
} from "../../api.js";
import { session, nomeProfessor } from "../../session.js";

export async function renderAlunos(box, ctx) {
  const { turma } = ctx;
  let alunos = [];
  let filtro = "";

  box.innerHTML = String(html`
    <div class="stack">
      <form class="card add-card" id="form-aluno" novalidate>
        <h2 class="card-title">${icon("userPlus")}Adicionar aluno</h2>
        <div class="add-row">
          <label class="field grow">
            <span class="field-label">Nome do aluno</span>
            <input type="text" name="nome" required maxlength="100" placeholder="Nome completo" autocomplete="off" enterkeyhint="done">
          </label>
          <label class="field">
            <span class="field-label">Entrou na turma em</span>
            <input type="date" name="data" required value="${hojeISO()}">
          </label>
          <button type="submit" class="btn btn-primary">${icon("plus")}Adicionar</button>
        </div>
        <div class="add-foot">
          <span class="field-hint">A presença só passa a contar a partir da data de entrada.</span>
          <button type="button" class="link-btn" id="add-varios">${icon("list")}Adicionar vários de uma vez</button>
        </div>
      </form>

      <div class="card list-card">
        <div class="list-head">
          <h2 class="card-title">Alunos da turma <span class="count" id="al-count"></span></h2>
          <label class="search search-sm" id="al-busca-wrap" hidden>${icon("search")}<input type="search" id="al-busca" placeholder="Buscar aluno" aria-label="Buscar aluno"></label>
        </div>
        <ul class="aluno-list" id="al-lista">${spinner("Carregando alunos...")}</ul>
      </div>
    </div>`);

  const form = box.querySelector("#form-aluno");
  const lista = box.querySelector("#al-lista");

  async function carregar() {
    try {
      alunos = await listarAlunos(turma.id);
      alunos.sort((a, b) => compararNomes(a.nome, b.nome));
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
    box.querySelector("#al-count").textContent = alunos.length;
    box.querySelector("#al-busca-wrap").hidden = alunos.length < 9;
    const f = normalizar(filtro);
    const visiveis = alunos.filter((a) => !f || normalizar(a.nome).includes(f));
    if (!alunos.length) {
      lista.innerHTML = String(html`<li>${emptyState({ iconName: "users", title: "Nenhum aluno cadastrado", text: "Use o formulário acima para adicionar os alunos desta turma." })}</li>`);
      return;
    }
    if (!visiveis.length) {
      lista.innerHTML = String(html`<li>${emptyState({ iconName: "search", title: "Nenhum aluno encontrado" })}</li>`);
      return;
    }
    lista.innerHTML = String(html`${visiveis.map((a) => html`
      <li class="aluno-row" data-id="${a.id}">
        ${avatar(a.nome)}
        <div class="aluno-info">
          <span class="aluno-nome">${a.nome}</span>
          <span class="aluno-sub">${a.data_entrada ? `Na turma desde ${formatarDataBR(a.data_entrada)}` : "Data de entrada não informada"}</span>
        </div>
        <div class="row-actions">
          <button type="button" class="icon-btn" data-act="editar" aria-label="Editar ${a.nome}" title="Editar">${icon("pencil")}</button>
          <button type="button" class="icon-btn" data-act="transferir" aria-label="Transferir ${a.nome}" title="Transferir de turma">${icon("transfer")}</button>
          <button type="button" class="icon-btn danger" data-act="remover" aria-label="Remover ${a.nome}" title="Remover da turma">${icon("trash")}</button>
        </div>
      </li>`)}`);
  }

  lista.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const aluno = alunos.find((a) => String(a.id) === btn.closest(".aluno-row").dataset.id);
    if (!aluno) return;
    if (btn.dataset.act === "editar") abrirEdicao(aluno);
    if (btn.dataset.act === "transferir") abrirTransferencia(aluno);
    if (btn.dataset.act === "remover") remover(aluno);
  });

  box.querySelector("#al-busca").addEventListener("input", (e) => {
    filtro = e.target.value;
    desenhar();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = form.nome.value.trim();
    const data = form.data.value;
    if (!nome) {
      form.nome.focus();
      toastErro("Digite o nome do aluno.");
      return;
    }
    if (!data) {
      toastErro("Informe a data de entrada na turma.");
      return;
    }
    if (alunos.some((a) => normalizar(a.nome) === normalizar(nome))) {
      const ok = await confirmar({ title: "Nome repetido", message: `Já existe “${nome}” nesta turma. Adicionar mesmo assim?`, confirmText: "Adicionar" });
      if (!ok) return;
    }
    const btn = form.querySelector("[type=submit]");
    setBusy(btn, true, "Adicionando...");
    try {
      await criarAlunos(turma.id, [nome], data);
      form.nome.value = "";
      form.nome.focus();
      toast(`${nome} adicionado(a).`);
      await carregar();
    } catch (err) {
      toastErro(mensagemErro(err));
    } finally {
      setBusy(btn, false);
    }
  });

  box.querySelector("#add-varios").addEventListener("click", () => {
    const m = openModal({
      title: "Adicionar vários alunos",
      content: html`
        <form id="form-varios" class="form-grid" novalidate>
          <label class="field">
            <span class="field-label">Nomes (um por linha)</span>
            <textarea name="nomes" rows="8" placeholder="Ana Souza&#10;Bruno Lima&#10;Carla Mendes" autofocus></textarea>
          </label>
          <label class="field">
            <span class="field-label">Entraram na turma em</span>
            <input type="date" name="data" required value="${form.data.value || hojeISO()}">
          </label>
          <p class="field-hint" id="varios-count">Nenhum nome.</p>
        </form>`,
      footer: html`
        <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
        <button type="submit" form="form-varios" class="btn btn-primary">${icon("plus")}Adicionar</button>`,
    });
    const f = m.body.querySelector("#form-varios");
    const nomes = () => f.nomes.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    f.nomes.addEventListener("input", () => {
      const n = nomes().length;
      m.body.querySelector("#varios-count").textContent = n ? `${plural(n, "aluno será adicionado", "alunos serão adicionados")}.` : "Nenhum nome.";
    });
    m.footer.querySelector("[data-cancel]").addEventListener("click", () => m.close());
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const lista = nomes();
      if (!lista.length) {
        toastErro("Digite pelo menos um nome.");
        return;
      }
      const btn = m.footer.querySelector("[type=submit]");
      setBusy(btn, true, "Adicionando...");
      try {
        await criarAlunos(turma.id, lista, f.data.value);
        toast(`${plural(lista.length, "aluno adicionado", "alunos adicionados")}!`);
        await m.close();
        await carregar();
      } catch (err) {
        toastErro(mensagemErro(err));
        setBusy(btn, false);
      }
    });
  });

  function abrirEdicao(aluno) {
    const m = openModal({
      title: "Editar aluno",
      content: html`
        <form id="form-edit-aluno" class="form-grid" novalidate>
          <label class="field">
            <span class="field-label">Nome</span>
            <input type="text" name="nome" required maxlength="100" value="${aluno.nome}" autofocus>
          </label>
          <label class="field">
            <span class="field-label">Entrou na turma em</span>
            <input type="date" name="data" value="${aluno.data_entrada || ""}">
            <span class="field-hint">Chamadas anteriores a esta data não contam para este aluno.</span>
          </label>
          <div class="historico" id="historico"><span class="muted small">Carregando histórico...</span></div>
        </form>`,
      footer: html`
        <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
        <button type="submit" form="form-edit-aluno" class="btn btn-primary">${icon("check")}Salvar</button>`,
    });
    const f = m.body.querySelector("#form-edit-aluno");
    m.footer.querySelector("[data-cancel]").addEventListener("click", () => m.close());

    listarHistoricoTransferencias(aluno.id)
      .then((hist) => {
        const h = m.body.querySelector("#historico");
        if (!h) return;
        h.innerHTML = hist.length
          ? String(html`<h3 class="mini-title">${icon("transfer")}Histórico de transferências</h3>
              <ul class="timeline">${hist.map((t) => html`<li><b>${formatarDataBR(t.data_transferencia)}</b> ${t.turma_origem?.nome || "?"} → ${t.turma_destino?.nome || "?"}</li>`)}</ul>`)
          : "";
      })
      .catch(() => {
        const h = m.body.querySelector("#historico");
        if (h) h.innerHTML = "";
      });

    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nome = f.nome.value.trim();
      if (!nome) {
        toastErro("O nome não pode ficar vazio.");
        return;
      }
      const btn = m.footer.querySelector("[type=submit]");
      setBusy(btn, true, "Salvando...");
      try {
        await atualizarAluno(aluno.id, { nome, data_entrada: f.data.value || null });
        toast("Aluno atualizado.");
        await m.close();
        await carregar();
      } catch (err) {
        toastErro(mensagemErro(err));
        setBusy(btn, false);
      }
    });
  }

  async function abrirTransferencia(aluno) {
    let turmas = [];
    try {
      turmas = await listarTurmas();
    } catch (err) {
      toastErro(mensagemErro(err));
      return;
    }
    const destinos = turmas
      .filter((t) => !sameId(t.id, turma.id))
      .sort((a, b) => compararNomes(a.nome, b.nome));

    const rotulo = (t) => {
      if (!session.isAdmin || sameId(t.professor_id, session.professor.id)) return t.nome;
      const p = nomeProfessor(t.professor_id);
      return p ? `${t.nome} — ${p}` : t.nome;
    };

    const m = openModal({
      title: "Transferir aluno",
      content: html`
        <form id="form-transf" class="form-grid" novalidate>
          <div class="transfer-head">
            ${avatar(aluno.nome)}
            <div><strong>${aluno.nome}</strong><span class="muted small">Turma atual: ${turma.nome}</span></div>
          </div>
          <label class="field">
            <span class="field-label">Nova turma</span>
            <select name="destino" required ${destinos.length ? "" : "disabled"}>
              <option value="">${destinos.length ? "Selecione..." : "Nenhuma outra turma disponível"}</option>
              ${destinos.map((t) => html`<option value="${t.id}">${rotulo(t)}</option>`)}
            </select>
          </label>
          <label class="field">
            <span class="field-label">Data da transferência</span>
            <input type="date" name="data" required value="${hojeISO()}">
            <span class="field-hint">O histórico fica registrado. Na nova turma, a presença conta a partir desta data.</span>
          </label>
        </form>`,
      footer: html`
        <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
        <button type="submit" form="form-transf" class="btn btn-primary" ${destinos.length ? "" : "disabled"}>${icon("transfer")}Transferir</button>`,
    });
    const f = m.body.querySelector("#form-transf");
    m.footer.querySelector("[data-cancel]").addEventListener("click", () => m.close());
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!f.destino.value) {
        toastErro("Escolha a turma de destino.");
        return;
      }
      if (!f.data.value) {
        toastErro("Informe a data da transferência.");
        return;
      }
      const btn = m.footer.querySelector("[type=submit]");
      setBusy(btn, true, "Transferindo...");
      try {
        await transferirAluno(aluno.id, f.destino.value, f.data.value);
        toast(`${aluno.nome} foi transferido(a).`);
        await m.close();
        await carregar();
      } catch (err) {
        toastErro(mensagemErro(err));
        setBusy(btn, false);
      }
    });
  }

  async function remover(aluno) {
    const ok = await confirmar({
      title: "Remover aluno?",
      message: `“${aluno.nome}” sairá da lista da turma. O histórico de presenças continua guardado.`,
      confirmText: "Remover",
      danger: true,
    });
    if (!ok) return;
    try {
      await removerAluno(aluno.id);
      toast("Aluno removido da turma.");
      await carregar();
    } catch (err) {
      toastErro(mensagemErro(err));
    }
  }

  await carregar();
}

