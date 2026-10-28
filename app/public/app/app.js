import {
  FORMATOS, FILTROS, ajustesPadrao, carregarFoto, desenhar, areaCorte, paraBlob, paraBase64Pequeno,
} from "./editor.js";

const tela = document.getElementById("tela");
const menu = document.getElementById("menu");
const estado = { usuario: null, negocio: null, ia: false, objetivos: {} };

// ---------- Utilidades ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const $ = (sel, raiz = tela) => raiz.querySelector(sel);
const $$ = (sel, raiz = tela) => [...raiz.querySelectorAll(sel)];

const ICONES = {
  voltar: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  galeria: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  magica: '<svg viewBox="0 0 24 24"><path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5"/></svg>',
  enviar: '<svg viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>',
  copiar: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  baixar: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  ok: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
};

let temporizadorAviso;
function aviso(msg, tipo = "") {
  const el = document.getElementById("aviso");
  el.textContent = msg;
  el.className = `aviso ${tipo === "erro" ? "erro-aviso" : ""}`;
  el.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => (el.hidden = true), tipo === "erro" ? 5000 : 3200);
}

async function api(metodo, url, corpo, cabecalhos = {}) {
  const opcoes = { method: metodo, headers: { ...cabecalhos }, credentials: "same-origin" };
  if (corpo instanceof Blob) {
    opcoes.body = corpo;
  } else if (corpo !== undefined) {
    opcoes.headers["Content-Type"] = "application/json";
    opcoes.body = JSON.stringify(corpo);
  }
  const r = await fetch(url, opcoes);
  const dados = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.startsWith("/api/entrar")) {
    estado.usuario = null;
    location.hash = "#/entrar";
    throw new Error(dados.erro || "Sessão expirada.");
  }
  if (!r.ok) throw new Error(dados.erro || "Algo deu errado. Tente de novo.");
  return dados;
}

function botaoCarregando(btn, texto) {
  btn.disabled = true;
  btn.dataset.original = btn.innerHTML;
  btn.innerHTML = `<span class="carregando" aria-hidden="true"></span> ${esc(texto)}`;
  return () => { btn.disabled = false; btn.innerHTML = btn.dataset.original; };
}

function topo(titulo, voltarPara) {
  return `<header class="topo">
    ${voltarPara ? `<a class="voltar" href="${voltarPara}" aria-label="Voltar">${ICONES.voltar}</a>` : ""}
    <h1>${esc(titulo)}</h1>
  </header>`;
}

function isoParaLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function localParaIso(v) { return v ? new Date(v).toISOString() : null; }

function quando(iso) {
  if (!iso) return "Sem data";
  const d = new Date(iso);
  const dia = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dia} às ${hora}`;
}

function seloStatus(p) {
  if (p.status === "publicado") return '<span class="selo selo-publicado">Publicado</span>';
  if (p.agendado_para && new Date(p.agendado_para) < new Date()) return '<span class="selo selo-atrasado">Atrasado</span>';
  if (p.status === "pronto") return '<span class="selo selo-pronto">Pronto</span>';
  return '<span class="selo selo-rascunho">Rascunho</span>';
}

function textoFinal(legenda, hashtags) {
  return [legenda?.trim(), hashtags?.trim()].filter(Boolean).join("\n\n");
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const t = document.createElement("textarea");
    t.value = texto;
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}

function perfilIncompleto() {
  const n = estado.negocio || {};
  return !n.nome || !n.segmento;
}

// ---------- Rotas ----------
const rotas = {
  entrar: telaEntrar,
  cadastro: telaCadastro,
  inicio: telaInicio,
  novo: telaNovo,
  post: telaPost,
  perfil: telaPerfil,
};

async function navegar() {
  const [nome, param] = location.hash.replace(/^#\/?/, "").split("/");
  const publica = nome === "entrar" || nome === "cadastro";
  if (!estado.usuario && !publica) {
    try {
      const eu = await api("GET", "/api/eu");
      Object.assign(estado, eu);
    } catch {
      location.hash = "#/entrar";
      return;
    }
  }
  const rota = rotas[nome] ? nome : estado.usuario ? "inicio" : "entrar";
  if (!rotas[nome]) { location.hash = `#/${rota}`; return; }
  menu.hidden = publica;
  document.body.classList.toggle("sem-menu", publica);
  for (const a of $$("a", menu)) a.classList.toggle("ativo", a.dataset.rota === rota);
  window.scrollTo(0, 0);
  await rotas[rota](param);
}
window.addEventListener("hashchange", navegar);

// ---------- Entrar / Cadastro ----------
function telaEntrar() {
  tela.innerHTML = `
    <section class="entrada">
      <div class="logo">VGA<span>.</span></div>
      <p class="frase">Suas redes sociais organizadas, direto do celular.</p>
      <form id="f" novalidate>
        <label class="campo"><span>E-mail</span><input type="email" name="email" autocomplete="email" required></label>
        <label class="campo"><span>Senha</span><input type="password" name="senha" autocomplete="current-password" required></label>
        <p class="erro" id="erro" hidden></p>
        <button class="btn btn-verde btn-largo" type="submit">Entrar</button>
      </form>
      <p class="trocar">Ainda não tem conta? <a href="#/cadastro">Criar conta grátis</a></p>
    </section>`;
  $("#f").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const fim = botaoCarregando($("button", e.target), "Entrando...");
    try {
      await api("POST", "/api/entrar", { email: fd.get("email"), senha: fd.get("senha") });
      Object.assign(estado, await api("GET", "/api/eu"));
      location.hash = "#/inicio";
    } catch (err) {
      $("#erro").textContent = err.message;
      $("#erro").hidden = false;
      fim();
    }
  });
}

function telaCadastro() {
  tela.innerHTML = `
    <section class="entrada">
      <div class="logo">VGA<span>.</span></div>
      <p class="frase">Crie sua conta e monte a gestão das redes do seu negócio em minutos.</p>
      <form id="f" novalidate>
        <label class="campo"><span>Seu nome</span><input type="text" name="nome" autocomplete="name" required></label>
        <label class="campo"><span>E-mail</span><input type="email" name="email" autocomplete="email" required></label>
        <label class="campo"><span>Senha (mínimo 8 caracteres)</span><input type="password" name="senha" autocomplete="new-password" minlength="8" required></label>
        <p class="erro" id="erro" hidden></p>
        <button class="btn btn-verde btn-largo" type="submit">Criar conta</button>
      </form>
      <p class="trocar">Já tem conta? <a href="#/entrar">Entrar</a></p>
    </section>`;
  $("#f").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const fim = botaoCarregando($("button", e.target), "Criando...");
    try {
      await api("POST", "/api/cadastro", { nome: fd.get("nome"), email: fd.get("email"), senha: fd.get("senha") });
      Object.assign(estado, await api("GET", "/api/eu"));
      aviso("Conta criada! Agora conte um pouco sobre o seu negócio.");
      location.hash = "#/perfil";
    } catch (err) {
      $("#erro").textContent = err.message;
      $("#erro").hidden = false;
      fim();
    }
  });
}

// ---------- Início ----------
let abaInicio = "proximos";

async function telaInicio() {
  const primeiroNome = (estado.usuario?.nome || "").split(" ")[0];
  tela.innerHTML = `
    <h1 class="saudacao">Olá, ${esc(primeiroNome)}!</h1>
    <p class="sub">${esc(estado.negocio?.nome || "Vamos cuidar das suas redes hoje?")}</p>
    <a class="novo-grande" href="#/novo">
      <div class="ic">${ICONES.camera}</div>
      <div><strong>Criar novo post</strong><span>Tire a foto e o resto a gente ajuda</span></div>
    </a>
    ${perfilIncompleto() ? `
      <div class="cartao alerta-perfil">
        <p>Complete o perfil do seu negócio para as legendas saírem com a sua cara.</p>
        <a class="btn btn-laranja btn-peq" href="#/perfil">Completar</a>
      </div>` : ""}
    <div class="bloco"><div class="numeros" id="numeros"></div></div>
    <div class="bloco">
      <div class="abas" role="tablist">
        <button role="tab" data-aba="proximos" aria-selected="${abaInicio === "proximos"}">Próximos</button>
        <button role="tab" data-aba="publicados" aria-selected="${abaInicio === "publicados"}">Publicados</button>
      </div>
      <div class="lista-posts" id="lista"><p class="vazio">Carregando...</p></div>
    </div>`;

  let posts = [];
  try {
    posts = (await api("GET", "/api/posts")).posts;
  } catch (e) {
    $("#lista").innerHTML = `<p class="vazio">${esc(e.message)}</p>`;
    return;
  }
  const agora = new Date();
  const doMes = posts.filter((p) => p.status === "publicado" && p.publicado_em && new Date(p.publicado_em).getMonth() === agora.getMonth() && new Date(p.publicado_em).getFullYear() === agora.getFullYear());
  $("#numeros").innerHTML = `
    <div><strong>${posts.filter((p) => p.status === "pronto").length}</strong><span>Prontos</span></div>
    <div><strong>${posts.filter((p) => p.status === "rascunho").length}</strong><span>Rascunhos</span></div>
    <div><strong>${doMes.length}</strong><span>Publicados no mês</span></div>`;

  const mostrar = () => {
    const filtrados = posts.filter((p) => (abaInicio === "publicados" ? p.status === "publicado" : p.status !== "publicado"));
    $("#lista").innerHTML = filtrados.length
      ? filtrados.map((p) => `
        <a class="item-post" href="#/post/${p.id}">
          ${p.imagens[0] ? `<img src="${esc(p.imagens[0])}" alt="" loading="lazy">` : '<div class="sem-foto"></div>'}
          <div class="info">
            <div class="quando">${esc(quando(p.status === "publicado" ? p.publicado_em : p.agendado_para))} ${seloStatus(p)}</div>
            <p>${esc(p.legenda.split("\n")[0] || "(sem legenda)")}</p>
          </div>
        </a>`).join("")
      : `<p class="vazio">${abaInicio === "publicados" ? "Nenhum post publicado ainda." : "Nenhum post planejado. Que tal criar o primeiro?"}</p>`;
  };
  for (const b of $$(".abas button")) {
    b.addEventListener("click", () => {
      abaInicio = b.dataset.aba;
      for (const x of $$(".abas button")) x.setAttribute("aria-selected", String(x === b));
      mostrar();
    });
  }
  mostrar();
}

// ---------- Novo post (passo a passo) ----------
function novoRascunho() {
  return {
    passo: 1, formato: "feed", fotos: [], ativa: 0,
    arte: { titulo: "", posicao: "baixo", marca: true },
    objetivo: "", briefing: "", resultado: null, escolhida: -1,
    legenda: "", hashtags: "", agendado: "",
  };
}
let rascunho = novoRascunho();

const PASSOS = ["Fotos", "Tratamento", "Legenda", "Agendar"];
const MAX_FOTOS_IA = 10; // igual ao limite do servidor

function telaNovo() {
  const r = rascunho;
  tela.innerHTML = `
    ${topo("Novo post", r.passo > 1 ? null : "#/inicio")}
    <div class="passos" aria-hidden="true">${PASSOS.map((_, i) => `<span class="${i < r.passo ? "feito" : ""}"></span>`).join("")}</div>
    <p class="passo-titulo">Passo ${r.passo} de 4 · ${PASSOS[r.passo - 1]}</p>
    <div id="conteudo"></div>`;
  if (r.passo > 1) {
    const voltar = document.createElement("button");
    voltar.className = "voltar";
    voltar.setAttribute("aria-label", "Passo anterior");
    voltar.innerHTML = ICONES.voltar;
    voltar.addEventListener("click", () => { r.passo -= 1; telaNovo(); });
    $(".topo").prepend(voltar);
  }
  [passoFotos, passoTratamento, passoLegenda, passoAgendar][r.passo - 1]($("#conteudo"));
  window.scrollTo(0, 0);
}

function irPara(passo) { rascunho.passo = passo; telaNovo(); }

function passoFotos(alvo) {
  const r = rascunho;
  alvo.innerHTML = `
    <div class="bloco">
      <div class="captura">
        <label>${ICONES.camera}Tirar foto
          <input type="file" accept="image/*" capture="environment" id="camera"></label>
        <label>${ICONES.galeria}Escolher da galeria
          <input type="file" accept="image/*" multiple id="galeria"></label>
      </div>
      <p class="dica-campo">Até 10 fotos. Com mais de uma, o post vira carrossel.</p>
    </div>
    <div class="bloco" id="selecionadas"></div>
    <div class="bloco">
      <h2>Onde vai postar?</h2>
      <div class="chips" id="formatos">
        ${Object.entries(FORMATOS).map(([k, f]) => `<button class="chip" data-f="${k}" aria-pressed="${r.formato === k}">${f.rotulo}</button>`).join("")}
      </div>
    </div>
    <div class="rodape-fixo">
      <button class="btn btn-verde btn-largo" id="seguir" ${r.fotos.length ? "" : "disabled"}>Continuar</button>
    </div>`;

  const mostrar = () => {
    $("#selecionadas").innerHTML = r.fotos.length
      ? `<h2>${r.fotos.length} foto${r.fotos.length > 1 ? "s" : ""}</h2><div class="miniaturas" id="minis"></div>`
      : "";
    const minis = $("#minis");
    r.fotos.forEach((f, i) => {
      const b = document.createElement("div");
      b.className = "mini";
      const c = document.createElement("canvas");
      c.width = 152; c.height = 152;
      const ctx = c.getContext("2d");
      const o = f.foto.canvas, lado = Math.min(o.width, o.height);
      ctx.drawImage(o, (o.width - lado) / 2, (o.height - lado) / 2, lado, lado, 0, 0, 152, 152);
      b.append(c);
      b.insertAdjacentHTML("beforeend", `<span class="num">${i + 1}</span><button class="tirar" aria-label="Remover foto ${i + 1}">×</button>`);
      $(".tirar", b).addEventListener("click", () => { r.fotos.splice(i, 1); r.ativa = 0; mostrar(); });
      minis.append(b);
    });
    $("#seguir").disabled = !r.fotos.length;
  };

  const receber = async (e) => {
    const arquivos = [...e.target.files].slice(0, 10 - r.fotos.length);
    e.target.value = "";
    if (!arquivos.length) { if (r.fotos.length >= 10) aviso("Máximo de 10 fotos por post."); return; }
    aviso(`Abrindo ${arquivos.length} foto${arquivos.length > 1 ? "s" : ""}...`);
    for (const a of arquivos) {
      try {
        r.fotos.push({ foto: await carregarFoto(a), ajustes: ajustesPadrao() });
      } catch (err) {
        aviso(err.message, "erro");
      }
    }
    mostrar();
  };
  $("#camera").addEventListener("change", receber);
  $("#galeria").addEventListener("change", receber);
  for (const b of $$("#formatos .chip")) {
    b.addEventListener("click", () => {
      r.formato = b.dataset.f;
      for (const x of $$("#formatos .chip")) x.setAttribute("aria-pressed", String(x === b));
    });
  }
  $("#seguir").addEventListener("click", () => irPara(2));
  mostrar();
}

function arteAtual() {
  const n = estado.negocio || {};
  return {
    titulo: rascunho.arte.titulo,
    posicao: rascunho.arte.posicao,
    marca: rascunho.arte.marca ? (n.instagram ? `@${n.instagram}` : n.nome) : "",
    corPrimaria: n.cor_primaria,
  };
}

function passoTratamento(alvo) {
  const r = rascunho;
  if (!r.fotos.length) return irPara(1);
  r.ativa = Math.min(r.ativa, r.fotos.length - 1);
  const controles = [
    ["brilho", "Brilho", -50, 50],
    ["contraste", "Contraste", -50, 50],
    ["saturacao", "Cor", -60, 60],
    ["temperatura", "Temperatura", -40, 40],
  ];
  alvo.innerHTML = `
    <div class="bloco">
      ${r.fotos.length > 1 ? '<div class="miniaturas" id="minis"></div>' : ""}
      <div class="palco"><canvas id="previa" aria-label="Prévia da foto tratada"></canvas></div>
      <p class="dica-arrastar">Arraste a foto para enquadrar</p>
    </div>
    <div class="cartao bloco">
      <label class="alternar"><span>${ICONES.magica.replace("<svg", '<svg width="18" height="18" style="vertical-align:-3px;stroke:var(--verde);fill:none;stroke-width:2"')} Melhorar automaticamente</span>
        <input type="checkbox" id="auto"></label>
      <h2 style="font-size:15px;margin:8px 0">Filtro</h2>
      <div class="chips" id="filtros">
        ${Object.entries(FILTROS).map(([k, f]) => `<button class="chip" data-filtro="${k}">${f.rotulo}</button>`).join("")}
      </div>
      <div style="margin-top:12px">
        ${controles.map(([k, rot, min, max]) => `
          <label class="controle"><span>${rot}</span><input type="range" min="${min}" max="${max}" step="1" data-k="${k}"><output></output></label>`).join("")}
        <label class="controle"><span>Zoom</span><input type="range" min="1" max="3" step="0.05" data-k="zoom"><output></output></label>
      </div>
      <div class="linha-btns" style="margin-top:6px">
        <button class="btn btn-contorno btn-peq" id="zerar">Desfazer ajustes</button>
        ${r.fotos.length > 1 ? '<button class="btn btn-contorno btn-peq" id="todas">Usar em todas as fotos</button>' : ""}
      </div>
    </div>
    <div class="cartao bloco">
      <h2 style="font-size:15px;margin-bottom:10px">Texto na arte (opcional)</h2>
      <label class="campo"><span>Frase curta sobre a foto</span>
        <input type="text" id="titulo" maxlength="60" placeholder="Ex.: Promoção de sexta" value="${esc(r.arte.titulo)}"></label>
      <div class="chips" id="posicao">
        <button class="chip" data-p="baixo" aria-pressed="${r.arte.posicao === "baixo"}">Texto embaixo</button>
        <button class="chip" data-p="topo" aria-pressed="${r.arte.posicao === "topo"}">Texto em cima</button>
      </div>
      <label class="alternar" style="margin-top:6px"><span>Mostrar ${esc(arteAtual().marca || "a marca")} na foto</span>
        <input type="checkbox" id="marca" ${r.arte.marca ? "checked" : ""}></label>
      ${!estado.negocio?.instagram && !estado.negocio?.nome ? '<p class="dica-campo">Preencha o nome ou @ do negócio em "Meu negócio" para a etiqueta aparecer.</p>' : ""}
    </div>
    <div class="rodape-fixo">
      <button class="btn btn-verde btn-largo" id="seguir">Continuar</button>
    </div>`;

  const canvas = $("#previa");
  let pedido = 0;
  const redesenhar = () => {
    cancelAnimationFrame(pedido);
    pedido = requestAnimationFrame(() => {
      const f = r.fotos[r.ativa];
      desenhar(canvas, f.foto, f.ajustes, r.formato, arteAtual(), 0.5);
    });
  };

  const sincronizar = () => {
    const a = r.fotos[r.ativa].ajustes;
    $("#auto").checked = a.auto;
    for (const b of $$("#filtros .chip")) b.setAttribute("aria-pressed", String(b.dataset.filtro === a.filtro));
    for (const inp of $$("input[type=range]")) {
      inp.value = a[inp.dataset.k];
      inp.nextElementSibling.value = inp.dataset.k === "zoom" ? `${Number(a.zoom).toFixed(1)}x` : a[inp.dataset.k];
    }
    if ($("#minis")) for (const [i, m] of $$("#minis .mini").entries()) m.classList.toggle("ativa", i === r.ativa);
    redesenhar();
  };

  if ($("#minis")) {
    r.fotos.forEach((f, i) => {
      const b = document.createElement("button");
      b.className = "mini";
      b.setAttribute("aria-label", `Editar foto ${i + 1}`);
      const c = document.createElement("canvas");
      desenhar(c, f.foto, f.ajustes, r.formato, {}, 0.12);
      b.append(c);
      b.addEventListener("click", () => { r.ativa = i; sincronizar(); });
      $("#minis").append(b);
    });
  }

  $("#auto").addEventListener("change", (e) => { r.fotos[r.ativa].ajustes.auto = e.target.checked; redesenhar(); });
  for (const b of $$("#filtros .chip")) {
    b.addEventListener("click", () => { r.fotos[r.ativa].ajustes.filtro = b.dataset.filtro; sincronizar(); });
  }
  for (const inp of $$("input[type=range]")) {
    inp.addEventListener("input", () => {
      const a = r.fotos[r.ativa].ajustes;
      a[inp.dataset.k] = Number(inp.value);
      inp.nextElementSibling.value = inp.dataset.k === "zoom" ? `${Number(inp.value).toFixed(1)}x` : inp.value;
      redesenhar();
    });
  }
  $("#zerar").addEventListener("click", () => { r.fotos[r.ativa].ajustes = ajustesPadrao(); sincronizar(); });
  $("#todas")?.addEventListener("click", () => {
    const base = r.fotos[r.ativa].ajustes;
    for (const f of r.fotos) f.ajustes = { ...base, zoom: f.ajustes.zoom, x: f.ajustes.x, y: f.ajustes.y };
    aviso("Ajustes aplicados em todas as fotos.");
  });
  $("#titulo").addEventListener("input", (e) => { r.arte.titulo = e.target.value; redesenhar(); });
  for (const b of $$("#posicao .chip")) {
    b.addEventListener("click", () => {
      r.arte.posicao = b.dataset.p;
      for (const x of $$("#posicao .chip")) x.setAttribute("aria-pressed", String(x === b));
      redesenhar();
    });
  }
  $("#marca").addEventListener("change", (e) => { r.arte.marca = e.target.checked; redesenhar(); });

  // Arrastar para enquadrar
  let toque = null;
  canvas.addEventListener("pointerdown", (e) => {
    toque = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!toque) return;
    const f = r.fotos[r.ativa], a = f.ajustes;
    const { cw, ch, ow, oh } = areaCorte(f.foto, a, r.formato);
    const caixa = canvas.getBoundingClientRect();
    const dx = e.clientX - toque.x, dy = e.clientY - toque.y;
    toque = { x: e.clientX, y: e.clientY };
    if (ow > cw) a.x = Math.max(0, Math.min(1, a.x - (cw * dx / caixa.width) / (ow - cw)));
    if (oh > ch) a.y = Math.max(0, Math.min(1, a.y - (ch * dy / caixa.height) / (oh - ch)));
    redesenhar();
  });
  const soltar = () => { toque = null; };
  canvas.addEventListener("pointerup", soltar);
  canvas.addEventListener("pointercancel", soltar);

  $("#seguir").addEventListener("click", () => irPara(3));
  document.fonts?.load('700 40px "Space Grotesk"').then(redesenhar, () => {});
  sincronizar();
}

function passoLegenda(alvo) {
  const r = rascunho;
  alvo.innerHTML = `
    ${estado.ia
      ? `<div class="bloco">
          <h2>A IA vai olhar ${r.fotos.length > 1 ? `estas ${Math.min(r.fotos.length, MAX_FOTOS_IA)} fotos` : "esta foto"}</h2>
          <div class="miniaturas" id="fotosIA"></div>
        </div>`
      : '<p class="modo-demo bloco">Modo demonstração: as fotos ainda não são analisadas e as legendas vêm de modelos prontos. Para a legenda considerar o que aparece nas fotos, é preciso ligar a IA (chave <code>ANTHROPIC_API_KEY</code> no servidor).</p>'}
    <div class="bloco">
      <h2>Qual o objetivo deste post?</h2>
      <div class="chips" id="objetivos">
        ${Object.entries(estado.objetivos).map(([k, v]) => `<button class="chip" data-o="${k}" aria-pressed="${r.objetivo === k}">${esc(v)}</button>`).join("")}
      </div>
    </div>
    <div class="bloco">
      <label class="campo"><span>O que você quer dizer? Escreva do seu jeito, como mandaria numa mensagem.${estado.ia ? " Se preferir, deixe em branco: a IA escreve só a partir das fotos." : ""}</span>
        <textarea id="briefing" maxlength="2000" placeholder="Ex.: chegou o novo cardápio de verão, tem açaí na tigela e sucos naturais, quero chamar o pessoal pra vir no fim de semana">${esc(r.briefing)}</textarea></label>
      <button class="btn btn-laranja btn-largo" id="gerar">${ICONES.magica} ${r.resultado ? "Criar outras legendas" : "Criar legendas"}</button>
    </div>
    <div id="resultado"></div>
    <div class="bloco">
      <label class="campo"><span>Legenda final (pode editar à vontade)</span>
        <textarea id="legenda" maxlength="2200" style="min-height:180px">${esc(r.legenda)}</textarea></label>
      <label class="campo"><span>Hashtags</span>
        <textarea id="hashtags" maxlength="1000" style="min-height:80px">${esc(r.hashtags)}</textarea></label>
    </div>
    <div class="rodape-fixo">
      <button class="btn btn-verde btn-largo" id="seguir">Continuar</button>
    </div>`;

  const mostrarResultado = () => {
    const res = r.resultado;
    if (!res) { $("#resultado").innerHTML = ""; return; }
    $("#resultado").innerHTML = `
      <div class="bloco">
        ${res.fotos_descricao ? `<p class="sugestao visto"><b>O que a IA viu nas fotos:</b> ${esc(res.fotos_descricao)}</p>` : ""}
        <h2>Escolha uma opção</h2>
        ${res.aviso ? `<p class="sugestao">${esc(res.aviso)}</p>` : ""}
        ${res.opcoes.map((o, i) => `
          <button class="opcao-legenda" data-i="${i}" aria-pressed="${r.escolhida === i}">
            <strong>${esc(o.estilo)}</strong><p>${esc(o.legenda)}</p>
          </button>`).join("")}
        ${res.melhor_horario ? `<p class="sugestao"><b>Melhor horário:</b> ${esc(res.melhor_horario)}</p>` : ""}
        ${res.dica ? `<p class="sugestao"><b>Dica:</b> ${esc(res.dica)}</p>` : ""}
        ${res.titulo_arte && !r.arte.titulo ? `<p class="sugestao"><b>Sugestão de texto para a arte:</b> “${esc(res.titulo_arte)}” <button class="btn btn-contorno btn-peq" id="usarTitulo" style="margin-top:6px">Usar na foto</button></p>` : ""}
      </div>`;
    for (const b of $$(".opcao-legenda")) {
      b.addEventListener("click", () => {
        r.escolhida = Number(b.dataset.i);
        r.legenda = res.opcoes[r.escolhida].legenda;
        $("#legenda").value = r.legenda;
        for (const x of $$(".opcao-legenda")) x.setAttribute("aria-pressed", String(x === b));
      });
    }
    $("#usarTitulo")?.addEventListener("click", (e) => {
      r.arte.titulo = res.titulo_arte;
      e.target.closest("p").remove();
      aviso("Texto adicionado na arte.");
    });
  };

  // Miniaturas das fotos que a IA vai considerar (já com o tratamento aplicado).
  for (const f of r.fotos.slice(0, MAX_FOTOS_IA)) {
    const box = document.createElement("div");
    box.className = "mini";
    const c = document.createElement("canvas");
    desenhar(c, f.foto, f.ajustes, r.formato, {}, 0.12);
    box.append(c);
    $("#fotosIA")?.append(box);
  }

  for (const b of $$("#objetivos .chip")) {
    b.addEventListener("click", () => {
      r.objetivo = r.objetivo === b.dataset.o ? "" : b.dataset.o;
      for (const x of $$("#objetivos .chip")) x.setAttribute("aria-pressed", String(x.dataset.o === r.objetivo));
    });
  }
  $("#briefing").addEventListener("input", (e) => (r.briefing = e.target.value));
  $("#legenda").addEventListener("input", (e) => (r.legenda = e.target.value));
  $("#hashtags").addEventListener("input", (e) => (r.hashtags = e.target.value));

  $("#gerar").addEventListener("click", async (e) => {
    const fim = botaoCarregando(e.currentTarget, estado.ia ? "Olhando suas fotos e escrevendo..." : "Criando...");
    try {
      const imagens = estado.ia
        ? r.fotos.slice(0, MAX_FOTOS_IA).map((f) => paraBase64Pequeno(f.foto, f.ajustes, r.formato, arteAtual()))
        : [];
      r.resultado = await api("POST", "/api/legendas", { objetivo: r.objetivo, briefing: r.briefing, formato: r.formato, imagens });
      r.escolhida = 0;
      r.legenda = r.resultado.opcoes[0]?.legenda || "";
      r.hashtags = r.resultado.hashtags.join(" ");
      $("#legenda").value = r.legenda;
      $("#hashtags").value = r.hashtags;
      mostrarResultado();
      $("#resultado").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      aviso(err.message, "erro");
    } finally {
      fim();
    }
  });

  $("#seguir").addEventListener("click", () => {
    if (!r.legenda.trim()) return aviso("Escreva ou escolha uma legenda antes de continuar.", "erro");
    irPara(4);
  });
  mostrarResultado();
}

function passoAgendar(alvo) {
  const r = rascunho;
  const n = estado.negocio || {};
  alvo.innerHTML = `
    <div class="bloco previa" aria-label="Prévia do post">
      <div class="cab"><div class="av"></div>${esc(n.instagram || n.nome || "seu_negocio")}</div>
      <div class="carrossel" id="carrossel"></div>
      ${r.fotos.length > 1 ? `<div class="pontos">${r.fotos.length} fotos · deslize para ver</div>` : ""}
      <div class="leg"><b>${esc(n.instagram || n.nome || "seu_negocio")}</b> ${esc(r.legenda)}${r.hashtags ? `\n\n<span class="tags">${esc(r.hashtags)}</span>` : ""}</div>
    </div>
    <div class="bloco cartao">
      <label class="campo"><span>Quando vai postar?</span>
        <input type="datetime-local" id="quando" value="${esc(r.agendado)}"></label>
      <p class="dica-campo">No dia e horário marcado, o post aparece no topo da sua lista, pronto para publicar.</p>
    </div>
    <div class="rodape-fixo">
      <div class="linha-btns">
        <button class="btn btn-contorno" id="salvarRascunho">Salvar rascunho</button>
        <button class="btn btn-verde" id="salvarPronto">${ICONES.ok} Post pronto</button>
      </div>
    </div>`;

  const car = $("#carrossel");
  for (const f of r.fotos) {
    const c = document.createElement("canvas");
    desenhar(c, f.foto, f.ajustes, r.formato, arteAtual(), 0.5);
    const img = document.createElement("img");
    img.alt = "";
    img.src = c.toDataURL("image/jpeg", 0.85);
    car.append(img);
  }
  $("#quando").addEventListener("input", (e) => (r.agendado = e.target.value));

  const salvar = async (status, botao) => {
    const outros = $$(".rodape-fixo button");
    outros.forEach((b) => (b.disabled = true));
    const fim = botaoCarregando(botao, "Salvando...");
    let postId;
    try {
      const { post } = await api("POST", "/api/posts", {
        formato: r.formato, objetivo: r.objetivo, briefing: r.briefing,
        legenda: r.legenda, hashtags: r.hashtags, status, agendado_para: localParaIso(r.agendado),
      });
      postId = post.id;
      for (let i = 0; i < r.fotos.length; i++) {
        botao.lastChild.textContent = ` Gerando foto ${i + 1} de ${r.fotos.length}...`;
        const f = r.fotos[i];
        const c = document.createElement("canvas");
        desenhar(c, f.foto, f.ajustes, r.formato, arteAtual(), 1);
        const blob = await paraBlob(c);
        await api("POST", `/api/posts/${postId}/imagens?ordem=${i}`, blob, { "Content-Type": "image/jpeg" });
      }
      rascunho = novoRascunho();
      aviso(status === "pronto" ? "Post pronto! Agora é só publicar." : "Rascunho salvo.");
      location.hash = `#/post/${postId}`;
    } catch (err) {
      // Não deixa post pela metade: se as fotos falharem, apaga o post criado.
      if (postId) await api("DELETE", `/api/posts/${postId}`).catch(() => {});
      aviso(err.message, "erro");
      fim();
      outros.forEach((b) => (b.disabled = false));
    }
  };
  $("#salvarRascunho").addEventListener("click", (e) => salvar("rascunho", e.currentTarget));
  $("#salvarPronto").addEventListener("click", (e) => salvar("pronto", e.currentTarget));
}

// ---------- Detalhe do post ----------
async function telaPost(id) {
  tela.innerHTML = `${topo("Post", "#/inicio")}<p class="vazio">Carregando...</p>`;
  let post;
  try {
    post = (await api("GET", `/api/posts/${encodeURIComponent(id)}`)).post;
  } catch (e) {
    tela.innerHTML = `${topo("Post", "#/inicio")}<p class="vazio">${esc(e.message)}</p>`;
    return;
  }
  const n = estado.negocio || {};
  const texto = textoFinal(post.legenda, post.hashtags);
  tela.innerHTML = `
    ${topo("Post", "#/inicio")}
    <p class="sub" style="margin:-10px 0 14px">${esc(quando(post.status === "publicado" ? post.publicado_em : post.agendado_para))} ${seloStatus(post)}</p>
    <div class="previa">
      <div class="cab"><div class="av"></div>${esc(n.instagram || n.nome || "seu_negocio")}</div>
      <div class="carrossel">${post.imagens.map((u, i) => `<img src="${esc(u)}" alt="Foto ${i + 1} do post">`).join("")}</div>
      ${post.imagens.length > 1 ? `<div class="pontos">${post.imagens.length} fotos · deslize para ver</div>` : ""}
      <div class="leg">${esc(post.legenda)}${post.hashtags ? `\n\n<span class="tags">${esc(post.hashtags)}</span>` : ""}</div>
    </div>

    <div class="bloco">
      ${post.status !== "publicado" ? `<button class="btn btn-verde btn-largo" id="postar">${ICONES.enviar} Postar agora</button>
      <p class="dica-campo" style="text-align:center;margin-top:6px">A legenda é copiada e as fotos vão para o app que você escolher (Instagram, Facebook...). É só colar a legenda.</p>` : ""}
      <div class="linha-btns" style="margin-top:12px">
        <button class="btn btn-contorno" id="copiar">${ICONES.copiar} Copiar legenda</button>
        <button class="btn btn-contorno" id="baixar">${ICONES.baixar} Baixar fotos</button>
      </div>
      <button class="btn ${post.status === "publicado" ? "btn-contorno" : "btn-laranja"} btn-largo" id="publicado" style="margin-top:12px">
        ${post.status === "publicado" ? "Voltar para não publicado" : `${ICONES.ok} Já publiquei`}</button>
    </div>

    <details class="bloco cartao">
      <summary style="cursor:pointer;font-weight:600">Editar texto e data</summary>
      <form id="editar" style="margin-top:14px">
        <label class="campo"><span>Legenda</span><textarea name="legenda" maxlength="2200" style="min-height:160px">${esc(post.legenda)}</textarea></label>
        <label class="campo"><span>Hashtags</span><textarea name="hashtags" maxlength="1000" style="min-height:70px">${esc(post.hashtags)}</textarea></label>
        <label class="campo"><span>Quando vai postar?</span><input type="datetime-local" name="quando" value="${esc(isoParaLocal(post.agendado_para))}"></label>
        <label class="campo"><span>Situação</span>
          <select name="status">
            <option value="rascunho" ${post.status === "rascunho" ? "selected" : ""}>Rascunho</option>
            <option value="pronto" ${post.status === "pronto" ? "selected" : ""}>Pronto para postar</option>
            <option value="publicado" ${post.status === "publicado" ? "selected" : ""}>Publicado</option>
          </select></label>
        <button class="btn btn-verde btn-largo" type="submit">Salvar alterações</button>
      </form>
    </details>
    <div class="bloco"><button class="btn btn-perigo btn-largo" id="excluir">Excluir post</button></div>`;

  // Já baixa as fotos para o botão de compartilhar responder na hora (exigência do celular).
  const arquivos = Promise.all(
    post.imagens.map(async (u, i) => {
      const b = await (await fetch(u, { credentials: "same-origin" })).blob();
      return new File([b], `vga-post-${post.id}-${i + 1}.jpg`, { type: "image/jpeg" });
    }),
  );
  let prontos = null;
  arquivos.then((a) => (prontos = a)).catch(() => {});

  const baixar = async () => {
    for (const f of prontos || (await arquivos)) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(f);
      a.download = f.name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
  };

  $("#postar")?.addEventListener("click", async () => {
    const copia = copiar(texto);
    if (prontos && navigator.canShare?.({ files: prontos })) {
      try {
        await navigator.share({ files: prontos, text: texto });
        await copia;
        aviso("Legenda copiada! Cole no Instagram. Depois toque em “Já publiquei”.");
      } catch (e) {
        if (e.name !== "AbortError") aviso("Não foi possível abrir o compartilhamento. Use “Baixar fotos”.", "erro");
      }
    } else {
      await baixar();
      await copia;
      aviso("Fotos baixadas e legenda copiada. Abra o Instagram e publique.");
    }
  });
  $("#copiar").addEventListener("click", async () => {
    if (await copiar(texto)) aviso("Legenda copiada!");
    else aviso("Não foi possível copiar.", "erro");
  });
  $("#baixar").addEventListener("click", async () => {
    try { await baixar(); aviso("Fotos baixadas."); } catch { aviso("Não foi possível baixar as fotos.", "erro"); }
  });
  $("#publicado").addEventListener("click", async () => {
    try {
      await api("PUT", `/api/posts/${post.id}`, { status: post.status === "publicado" ? "pronto" : "publicado" });
      aviso(post.status === "publicado" ? "Post voltou para a lista de próximos." : "Boa! Post marcado como publicado.");
      telaPost(post.id);
    } catch (e) { aviso(e.message, "erro"); }
  });
  $("#editar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api("PUT", `/api/posts/${post.id}`, {
        legenda: fd.get("legenda"), hashtags: fd.get("hashtags"),
        agendado_para: localParaIso(fd.get("quando")), status: fd.get("status"),
      });
      aviso("Alterações salvas.");
      telaPost(post.id);
    } catch (err) { aviso(err.message, "erro"); }
  });
  $("#excluir").addEventListener("click", async () => {
    if (!confirm("Excluir este post? Isso não pode ser desfeito.")) return;
    try {
      await api("DELETE", `/api/posts/${post.id}`);
      aviso("Post excluído.");
      location.hash = "#/inicio";
    } catch (e) { aviso(e.message, "erro"); }
  });
}

// ---------- Meu negócio ----------
const TONS = ["Amigável", "Profissional", "Divertido", "Sofisticado", "Jovem e descolado", "Acolhedor"];

function telaPerfil() {
  const n = estado.negocio || {};
  const campo = (nome, rotulo, extra = "", tipo = "text") =>
    `<label class="campo"><span>${rotulo}</span><input type="${tipo}" name="${nome}" value="${esc(n[nome])}" ${extra}></label>`;
  tela.innerHTML = `
    ${topo("Meu negócio")}
    <p class="sub" style="margin-top:-10px">Essas informações deixam as legendas e as artes com a cara do seu negócio.</p>
    <form id="f" class="bloco">
      ${campo("nome", "Nome do negócio", 'maxlength="200" placeholder="Ex.: Padaria Sol"')}
      ${campo("segmento", "Ramo / segmento", 'maxlength="200" placeholder="Ex.: padaria e confeitaria"')}
      ${campo("cidade", "Cidade e bairro", 'maxlength="200" placeholder="Ex.: Vila Mariana, São Paulo"')}
      <label class="campo"><span>Quem são seus clientes?</span>
        <textarea name="publico" maxlength="600" placeholder="Ex.: famílias do bairro, trabalhadores que tomam café da manhã antes do serviço">${esc(n.publico)}</textarea></label>
      <label class="campo"><span>O que você tem de especial?</span>
        <textarea name="diferenciais" maxlength="600" placeholder="Ex.: pão de fermentação natural, entrega no bairro, 20 anos de tradição">${esc(n.diferenciais)}</textarea></label>
      <div class="campo"><span class="sub" style="display:block;margin-bottom:6px">Jeito de falar</span>
        <div class="chips" id="tons">${TONS.map((t) => `<button type="button" class="chip" aria-pressed="${n.tom === t.toLowerCase()}" data-t="${t.toLowerCase()}">${t}</button>`).join("")}</div>
        <input type="hidden" name="tom" value="${esc(n.tom)}">
      </div>
      ${campo("instagram", "@ do Instagram", 'maxlength="60" placeholder="seunegocio" autocapitalize="off"')}
      ${campo("whatsapp", "WhatsApp (com DDD)", 'maxlength="20" inputmode="tel" placeholder="11999999999"', "tel")}
      <label class="campo"><span>Hashtags que você sempre usa</span>
        <input type="text" name="hashtags" maxlength="200" value="${esc(n.hashtags)}" placeholder="#padariasol #paoquentinho" autocapitalize="off"></label>
      <div class="campo"><span class="sub" style="display:block;margin-bottom:6px">Cores da marca (usadas nas artes)</span>
        <div class="cores">
          <label><input type="color" name="cor_primaria" value="${esc(n.cor_primaria || "#39ff14")}"> Principal</label>
          <label><input type="color" name="cor_secundaria" value="${esc(n.cor_secundaria || "#ff7a1a")}"> Destaque</label>
        </div>
      </div>
      <button class="btn btn-verde btn-largo" type="submit">Salvar</button>
    </form>

    <div class="bloco">
      <h2 style="font-size:17px;margin-bottom:10px">Redes conectadas</h2>
      <div class="cartao em-breve">
        <p><b>Instagram e Facebook</b><span class="selo selo-rascunho">Em breve</span></p>
        <p class="sub">Em breve você conecta suas contas aqui e o app publica sozinho no horário marcado. Por enquanto, use o botão “Postar agora” em cada post.</p>
      </div>
    </div>

    <div class="bloco">
      <p class="sub" style="margin-bottom:10px">Conectado como ${esc(estado.usuario?.email)}</p>
      <button class="btn btn-contorno btn-largo" id="sair">Sair da conta</button>
    </div>`;

  for (const b of $$("#tons .chip")) {
    b.addEventListener("click", () => {
      $("input[name=tom]").value = b.dataset.t;
      for (const x of $$("#tons .chip")) x.setAttribute("aria-pressed", String(x === b));
    });
  }
  $("#f").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fim = botaoCarregando($("button[type=submit]", e.target), "Salvando...");
    try {
      const dados = Object.fromEntries(new FormData(e.target));
      estado.negocio = (await api("PUT", "/api/negocio", dados)).negocio;
      aviso("Perfil salvo!");
      location.hash = "#/inicio";
    } catch (err) {
      aviso(err.message, "erro");
      fim();
    }
  });
  $("#sair").addEventListener("click", async () => {
    await api("POST", "/api/sair").catch(() => {});
    estado.usuario = null;
    rascunho = novoRascunho();
    location.hash = "#/entrar";
  });
}

// ---------- Início do app ----------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
navegar();
