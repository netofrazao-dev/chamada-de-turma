/* Aba "Chamada": marcar presença/falta de um dia. */
import {
  html, el, mensagemErro, hojeISO, addDias, isValidISODate, formatarDataLonga, formatarHoras,
  horasPorTipo, isAulaExtra, TIPOS_AULA, statusAula, sameId, compararNomes, plural,
} from "../../utils.js";
import { icon } from "../../icons.js";
import { confirmar, toast, toastErro, setBusy, spinner, errorState, emptyState, avatar } from "../../components.js";
import { listarAlunos, obterChamadaPorData, salvarChamada, removerChamada } from "../../api.js";
import { getProfessores } from "../../session.js";
import { setLeaveGuard, updateQuery } from "../../router.js";
import { alunoNaData } from "../../stats.js";

export async function renderChamada(box, ctx) {
  const { turma, ehDono, professorNome } = ctx;
  const st = {
    data: isValidISODate(ctx.query.data) ? ctx.query.data : hojeISO(),
    alunos: [],
    chamada: null,
    tipo: "normal",
    quem: "eu", // eu | sub:<id> | externo | cancelada
    externo: "",
    marcas: new Map(), // alunoId(string) -> true/false
    dirty: false,
    carregando: false,
  };

  box.innerHTML = String(spinner("Carregando alunos..."));
  let professores = [];
  try {
    [st.alunos, professores] = await Promise.all([listarAlunos(turma.id), getProfessores()]);
  } catch (err) {
    if (!ctx.isActive()) return;
    box.innerHTML = String(errorState(mensagemErro(err)));
    box.querySelector("[data-retry]").addEventListener("click", () => renderChamada(box, ctx));
    return;
  }
  if (!ctx.isActive()) return;
  st.alunos.sort((a, b) => compararNomes(a.nome, b.nome));

  if (!st.alunos.length) {
    box.innerHTML = String(
      emptyState({
        iconName: "userPlus",
        title: "Nenhum aluno nesta turma",
        text: "Cadastre os alunos para poder fazer a chamada.",
        action: html`<a class="btn btn-primary" href="#/turma/${turma.id}/alunos">${icon("userPlus")}Adicionar alunos</a>`,
      })
    );
    return;
  }

  const substitutos = professores.filter((p) => !sameId(p.id, turma.professor_id));
  const nomeDono = ehDono ? "você" : professorNome || "o professor da turma";

  box.innerHTML = String(html`
    <div class="chamada">
      <div class="card date-card">
        <div class="date-nav">
          <button type="button" class="icon-btn" data-dia="-1" aria-label="Dia anterior">${icon("chevronLeft")}</button>
          <input type="date" id="ch-data" class="date-input" aria-label="Data da chamada" required>
          <button type="button" class="icon-btn" data-dia="1" aria-label="Próximo dia">${icon("chevronRight")}</button>
          <button type="button" class="btn btn-soft btn-sm" id="ch-hoje">Hoje</button>
        </div>
        <div class="date-info">
          <strong id="ch-data-longa"></strong>
          <span id="ch-status"></span>
        </div>
      </div>

      <div class="card">
        <div class="form-grid two">
          <div class="field">
            <span class="field-label">Tipo de aula</span>
            <div class="segmented" id="ch-tipo" role="radiogroup" aria-label="Tipo de aula">
              ${Object.entries(TIPOS_AULA).map(([k, v]) => html`<button type="button" role="radio" data-tipo="${k}">${v}</button>`)}
            </div>
          </div>
          <label class="field">
            <span class="field-label">Quem deu a aula?</span>
            <select id="ch-quem">
              <option value="eu">${ehDono ? "Eu dei a aula" : `${professorNome || "Professor da turma"} (professor da turma)`}</option>
              ${substitutos.length
                ? html`<optgroup label="Substituto (professor do sistema)">
                    ${substitutos.map((p) => html`<option value="sub:${p.id}">${p.nome || p.email}</option>`)}
                  </optgroup>`
                : ""}
              <option value="externo">Outro substituto (de fora do sistema)</option>
              <option value="cancelada">A aula não aconteceu</option>
            </select>
          </label>
        </div>
        <label class="field" id="ch-externo-field" hidden>
          <span class="field-label">Nome do substituto</span>
          <input type="text" id="ch-externo" maxlength="80" placeholder="Nome completo do professor substituto">
        </label>
        <p class="info-line" id="ch-info"></p>
      </div>

      <div class="card list-card" id="ch-lista-card">
        <div class="list-head">
          <div>
            <h2 class="card-title">Alunos</h2>
            <p class="counts" id="ch-counts"></p>
          </div>
          <div class="btn-row">
            <button type="button" class="btn btn-soft btn-sm" id="ch-todos">${icon("check")}Todos presentes</button>
            <button type="button" class="btn btn-ghost btn-sm" id="ch-limpar">Limpar</button>
          </div>
        </div>
        <p class="note" id="ch-extra-note" hidden>${icon("info")}<span>Em reforço e reposição, marque só quem participou. Quem ficar sem marcação não recebe falta.</span></p>
        <ul class="aluno-list" id="ch-lista"></ul>
        <p class="note muted" id="ch-depois" hidden></p>
      </div>

      <div class="card cancel-card" id="ch-cancelada" hidden>
        ${icon("xCircle")}
        <div><strong>Aula não aconteceu</strong><p>Nenhuma presença será registrada e os alunos não recebem falta.</p></div>
      </div>

      <div class="savebar">
        <div class="savebar-inner">
          <span class="savebar-text" id="ch-savetext"></span>
          <button type="button" class="btn btn-danger-ghost" id="ch-excluir" hidden>${icon("trash")}<span class="hide-sm">Excluir</span></button>
          <button type="button" class="btn btn-primary btn-lg" id="ch-salvar">${icon("check")}Salvar chamada</button>
        </div>
      </div>
    </div>`);

  const $ = (s) => box.querySelector(s);
  const inputData = $("#ch-data");
  const lista = $("#ch-lista");

  /* ---------- helpers de estado ---------- */

  const elegiveis = () => st.alunos.filter((a) => alunoNaData(a, st.data));
  const extra = () => isAulaExtra(st.tipo);

  function setDirty(v = true) {
    st.dirty = v;
    atualizarRodape();
  }

  function contar() {
    let p = 0;
    let f = 0;
    let n = 0;
    elegiveis().forEach((a) => {
      const m = st.marcas.get(String(a.id));
      if (m === true) p++;
      else if (m === false) f++;
      else n++;
    });
    return { p, f, n };
  }

  /* ---------- renderização ---------- */

  function renderLista() {
    const els = elegiveis();
    lista.innerHTML = "";
    els.forEach((a) => {
      const li = el(html`
        <li class="aluno-row" data-id="${a.id}">
          ${avatar(a.nome)}
          <span class="aluno-nome">${a.nome}</span>
          <div class="pf" role="group" aria-label="Presença de ${a.nome}">
            <button type="button" class="pf-btn pf-p" data-v="1" aria-label="Presente">${icon("check")}<span>Presente</span></button>
            <button type="button" class="pf-btn pf-f" data-v="0" aria-label="Falta">${icon("x")}<span>Falta</span></button>
          </div>
        </li>`);
      lista.appendChild(li);
    });
    const depois = st.alunos.length - els.length;
    const notaDepois = $("#ch-depois");
    notaDepois.hidden = depois === 0;
    notaDepois.textContent = depois
      ? `${plural(depois, "aluno entrou", "alunos entraram")} na turma depois desta data e não ${depois === 1 ? "aparece" : "aparecem"} aqui.`
      : "";
    pintarMarcas();
  }

  function pintarMarcas() {
    lista.querySelectorAll(".aluno-row").forEach((li) => {
      const m = st.marcas.get(li.dataset.id);
      li.classList.toggle("is-p", m === true);
      li.classList.toggle("is-f", m === false);
      li.querySelector(".pf-p").setAttribute("aria-pressed", String(m === true));
      li.querySelector(".pf-f").setAttribute("aria-pressed", String(m === false));
    });
    const { p, f, n } = contar();
    $("#ch-counts").innerHTML = String(html`
      <span class="c-p">${icon("check")}${p} ${p === 1 ? "presente" : "presentes"}</span>
      <span class="c-f">${icon("x")}${f} ${f === 1 ? "falta" : "faltas"}</span>
      ${n ? html`<span class="c-n">${n} sem marcação</span>` : ""}`);
    atualizarRodape();
  }

  function renderOpcoes() {
    box.querySelectorAll("#ch-tipo [data-tipo]").forEach((b) => {
      const on = b.dataset.tipo === st.tipo;
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", String(on));
    });
    const sel = $("#ch-quem");
    if (st.quem.startsWith("sub:") && !sel.querySelector(`option[value="${CSS.escape(st.quem)}"]`)) {
      sel.appendChild(el(html`<option value="${st.quem}">Professor substituto</option>`));
    }
    sel.value = st.quem;
    $("#ch-externo-field").hidden = st.quem !== "externo";
    $("#ch-externo").value = st.externo;

    const cancelada = st.quem === "cancelada";
    $("#ch-lista-card").hidden = cancelada;
    $("#ch-cancelada").hidden = !cancelada;
    $("#ch-extra-note").hidden = !extra();

    const h = formatarHoras(horasPorTipo(st.tipo));
    const info = $("#ch-info");
    let tone = "ok";
    let txt;
    if (st.quem === "eu") txt = html`${icon("checkCircle")}<span>Esta aula conta <b>${h}</b> para ${nomeDono}.</span>`;
    else if (st.quem.startsWith("sub:")) {
      tone = "warn";
      const nome = sel.selectedOptions[0]?.textContent || "o substituto";
      txt = html`${icon("repeat")}<span>As <b>${h}</b> desta aula vão para <b>${nome}</b>.</span>`;
    } else if (st.quem === "externo") {
      tone = "warn";
      txt = html`${icon("repeat")}<span>Substituto de fora do sistema: as horas não entram em nenhum relatório.</span>`;
    } else {
      tone = "err";
      txt = html`${icon("xCircle")}<span>Nenhuma hora será contada.</span>`;
    }
    info.className = `info-line info-${tone}`;
    info.innerHTML = String(txt);
  }

  function atualizarRodape() {
    const t = $("#ch-savetext");
    if (st.dirty) t.innerHTML = String(html`<span class="dot-warn"></span>Alterações não salvas`);
    else if (st.chamada) t.innerHTML = String(html`${icon("checkCircle")}Chamada salva`);
    else t.textContent = "";
    t.classList.toggle("is-dirty", st.dirty);
    $("#ch-excluir").hidden = !st.chamada;
  }

  function renderStatusData() {
    $("#ch-data-longa").textContent = formatarDataLonga(st.data);
    const s = $("#ch-status");
    if (st.carregando) s.innerHTML = String(html`<span class="pill">Carregando...</span>`);
    else if (st.chamada) {
      const sa = statusAula(st.chamada);
      s.innerHTML = String(html`<span class="pill pill-success">${icon("check")}Chamada registrada</span>
        ${sa === "cancelada" ? html`<span class="pill pill-danger">Aula não aconteceu</span>` : ""}
        ${sa === "substituida" ? html`<span class="pill pill-purple">Com substituto</span>` : ""}
        ${isAulaExtra(st.chamada.tipo_aula) ? html`<span class="pill pill-info">${TIPOS_AULA[st.chamada.tipo_aula]}</span>` : ""}`);
    } else {
      s.innerHTML = String(html`<span class="pill">Nova chamada</span>${st.data > hojeISO() ? html`<span class="pill pill-warning">Data futura</span>` : ""}`);
    }
  }

  /* ---------- carregar dia ---------- */

  async function carregarDia(data) {
    st.data = data;
    inputData.value = data;
    updateQuery({ data: data === hojeISO() ? undefined : data });
    st.carregando = true;
    renderStatusData();
    box.querySelector(".chamada").classList.add("is-loading");
    try {
      const chamada = await obterChamadaPorData(turma.id, data);
      if (!ctx.isActive() || st.data !== data) return;
      st.chamada = chamada;
      st.marcas = new Map();
      if (chamada) {
        st.tipo = chamada.tipo_aula || "normal";
        const sa = statusAula(chamada);
        if (sa === "ministrada") st.quem = "eu";
        else if (sa === "cancelada") st.quem = "cancelada";
        else if (chamada.substituto_nome_manual) st.quem = "externo";
        else st.quem = `sub:${chamada.professor_substituto_id}`;
        st.externo = chamada.substituto_nome_manual || "";
        (chamada.chamada_presencas || []).forEach((p) => st.marcas.set(String(p.aluno_id), !!p.presente));
      } else {
        st.tipo = "normal";
        st.quem = "eu";
        st.externo = "";
      }
    } catch (err) {
      toastErro(mensagemErro(err));
    } finally {
      st.carregando = false;
      box.querySelector(".chamada")?.classList.remove("is-loading");
    }
    st.dirty = false;
    renderStatusData();
    renderOpcoes();
    renderLista();
  }

  async function trocarData(nova) {
    if (!isValidISODate(nova) || nova === st.data) {
      inputData.value = st.data;
      return;
    }
    if (st.dirty) {
      const ok = await confirmar({
        title: "Descartar alterações?",
        message: "A chamada deste dia ainda não foi salva. Se trocar de data, as marcações serão perdidas.",
        confirmText: "Trocar de data",
        danger: true,
      });
      if (!ok) {
        inputData.value = st.data;
        return;
      }
    }
    await carregarDia(nova);
  }

  /* ---------- eventos ---------- */

  box.querySelectorAll("[data-dia]").forEach((b) =>
    b.addEventListener("click", () => trocarData(addDias(st.data, Number(b.dataset.dia))))
  );
  $("#ch-hoje").addEventListener("click", () => trocarData(hojeISO()));
  inputData.addEventListener("change", () => trocarData(inputData.value));

  box.querySelectorAll("#ch-tipo [data-tipo]").forEach((b) =>
    b.addEventListener("click", () => {
      if (st.tipo === b.dataset.tipo) return;
      st.tipo = b.dataset.tipo;
      setDirty();
      renderOpcoes();
      pintarMarcas();
    })
  );
  $("#ch-quem").addEventListener("change", (e) => {
    st.quem = e.target.value;
    setDirty();
    renderOpcoes();
    if (st.quem === "externo") $("#ch-externo").focus();
  });
  $("#ch-externo").addEventListener("input", (e) => {
    st.externo = e.target.value;
    setDirty();
  });

  lista.addEventListener("click", (e) => {
    const btn = e.target.closest(".pf-btn");
    if (!btn) return;
    const id = btn.closest(".aluno-row").dataset.id;
    const v = btn.dataset.v === "1";
    if (st.marcas.get(id) === v) st.marcas.delete(id);
    else st.marcas.set(id, v);
    setDirty();
    pintarMarcas();
  });

  $("#ch-todos").addEventListener("click", () => {
    elegiveis().forEach((a) => st.marcas.set(String(a.id), true));
    setDirty();
    pintarMarcas();
  });
  $("#ch-limpar").addEventListener("click", () => {
    st.marcas = new Map();
    setDirty();
    pintarMarcas();
  });

  $("#ch-salvar").addEventListener("click", salvar);
  $("#ch-excluir").addEventListener("click", excluir);

  async function salvar() {
    const btn = $("#ch-salvar");
    const cancelada = st.quem === "cancelada";
    if (st.quem === "externo" && !st.externo.trim()) {
      toastErro("Informe o nome do professor substituto.");
      $("#ch-externo").focus();
      return;
    }

    let registros = [];
    if (!cancelada) {
      const els = elegiveis();
      if (!els.length) {
        toastErro("Nenhum aluno estava na turma nesta data.");
        return;
      }
      if (extra()) {
        registros = els
          .filter((a) => st.marcas.has(String(a.id)))
          .map((a) => ({ alunoId: a.id, presente: st.marcas.get(String(a.id)) }));
        if (!registros.length) {
          toastErro("Marque os alunos que participaram desta aula.");
          return;
        }
      } else {
        const { n } = contar();
        if (n > 0) {
          const ok = await confirmar({
            title: "Alunos sem marcação",
            message: `${plural(n, "aluno está", "alunos estão")} sem marcação e ${n === 1 ? "será registrado" : "serão registrados"} com falta. Deseja continuar?`,
            confirmText: "Salvar mesmo assim",
          });
          if (!ok) return;
        }
        registros = els.map((a) => ({ alunoId: a.id, presente: st.marcas.get(String(a.id)) === true }));
      }
    }

    setBusy(btn, true, "Salvando...");
    const wrap = box.querySelector(".chamada");
    wrap.classList.add("is-saving");
    try {
      await salvarChamada({
        turmaId: turma.id,
        data: st.data,
        tipoAula: st.tipo,
        horasAula: horasPorTipo(st.tipo),
        foiMinistrada: st.quem === "eu",
        professorSubstitutoId: st.quem.startsWith("sub:") ? st.quem.slice(4) : null,
        substitutoNomeManual: st.quem === "externo" ? st.externo.trim() : null,
        registros,
      });
      st.dirty = false;
      toast("Chamada salva com sucesso!");
      if (navigator.vibrate) navigator.vibrate(30);
      setBusy(btn, false);
      await carregarDia(st.data);
    } catch (err) {
      setBusy(btn, false);
      toastErro(mensagemErro(err, "Não foi possível salvar a chamada."));
    } finally {
      wrap.classList.remove("is-saving");
    }
  }

  async function excluir() {
    if (!st.chamada) return;
    const ok = await confirmar({
      title: "Excluir chamada?",
      message: `A chamada de ${formatarDataLonga(st.data)} será apagada. Esta ação não pode ser desfeita.`,
      confirmText: "Excluir chamada",
      danger: true,
    });
    if (!ok) return;
    const btn = $("#ch-excluir");
    setBusy(btn, true, "Excluindo...");
    try {
      await removerChamada(st.chamada.id);
      toast("Chamada excluída.");
      st.dirty = false;
      setBusy(btn, false);
      await carregarDia(st.data);
    } catch (err) {
      setBusy(btn, false);
      toastErro(mensagemErro(err));
    }
  }

  /* ---------- proteção contra sair sem salvar ---------- */

  setLeaveGuard(async () => {
    if (!st.dirty) return true;
    return confirmar({
      title: "Sair sem salvar?",
      message: "Você fez marcações nesta chamada que ainda não foram salvas.",
      confirmText: "Sair sem salvar",
      cancelText: "Continuar aqui",
      danger: true,
    });
  });
  const beforeUnload = (e) => {
    if (st.dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", beforeUnload);
  ctx.onCleanup?.(() => window.removeEventListener("beforeunload", beforeUnload));

  await carregarDia(st.data);
}
