// Tratamento de fotos no próprio aparelho (sem enviar a foto original para o servidor).

export const FORMATOS = {
  feed: { w: 1080, h: 1350, rotulo: "Feed 4:5" },
  quadrado: { w: 1080, h: 1080, rotulo: "Quadrado 1:1" },
  story: { w: 1080, h: 1920, rotulo: "Stories/Reels 9:16" },
};

// Cada filtro soma valores aos controles manuais.
export const FILTROS = {
  natural: { rotulo: "Natural" },
  vivo: { rotulo: "Vivo", contraste: 12, saturacao: 25 },
  quente: { rotulo: "Quente", temperatura: 22, saturacao: 8 },
  frio: { rotulo: "Frio", temperatura: -20, brilho: 2 },
  suave: { rotulo: "Suave", contraste: -14, brilho: 6, saturacao: -8 },
  dramatico: { rotulo: "Dramático", contraste: 30, brilho: -6, saturacao: -10 },
  pb: { rotulo: "P&B", saturacao: -100, contraste: 15 },
};

export function ajustesPadrao() {
  return {
    auto: true, filtro: "natural",
    brilho: 0, contraste: 0, saturacao: 0, temperatura: 0,
    zoom: 1, x: 0.5, y: 0.5,
  };
}

const LADO_MAX_ORIGEM = 2400;

// Abre a foto do arquivo, já na orientação certa, e reduz se for gigante.
export async function carregarFoto(arquivo) {
  let bmp;
  try {
    bmp = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  } catch {
    bmp = await new Promise((ok, falha) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => falha(new Error("Não foi possível abrir esta imagem."));
      img.src = URL.createObjectURL(arquivo);
    });
  }
  const w0 = bmp.width, h0 = bmp.height;
  const escala = Math.min(1, LADO_MAX_ORIGEM / Math.max(w0, h0));
  const c = document.createElement("canvas");
  c.width = Math.round(w0 * escala);
  c.height = Math.round(h0 * escala);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return { canvas: c, auto: analisarNiveis(c) };
}

// Calcula a correção automática (níveis e exposição) a partir de uma versão pequena da foto.
function analisarNiveis(origem) {
  const lado = 256;
  const esc = Math.min(1, lado / Math.max(origem.width, origem.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(origem.width * esc));
  c.height = Math.max(1, Math.round(origem.height * esc));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(origem, 0, 0, c.width, c.height);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let somaLum = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    hist[0][data[i]]++; hist[1][data[i + 1]]++; hist[2][data[i + 2]]++;
    somaLum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const percentil = (h, p) => {
    const alvo = n * p;
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += h[v]; if (acc >= alvo) return v; }
    return 255;
  };
  const canais = hist.map((h) => ({
    baixo: Math.min(percentil(h, 0.005), 50),
    alto: Math.max(percentil(h, 0.995), 190),
  }));
  // Exposição: puxa o meio-tom em direção a um brilho médio agradável.
  const media = somaLum / n / 255;
  let gama = media > 0.02 ? Math.log(0.48) / Math.log(media) : 1;
  gama = Math.min(1.35, Math.max(0.75, gama));
  return { canais, gama };
}

function limitar(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

// Monta uma tabela por canal com todos os ajustes que não dependem do pixel vizinho.
function montarTabelas(auto, a) {
  const f = FILTROS[a.filtro] || {};
  const brilho = (a.brilho + (f.brilho || 0)) * 1.6;
  const C = Math.max(-100, Math.min(100, a.contraste + (f.contraste || 0))) * 1.8;
  const fatorC = (259 * (C + 255)) / (255 * (259 - C));
  const temp = (a.temperatura + (f.temperatura || 0)) * 0.7;
  const forca = 0.75; // quanto da correção automática aplicar
  return [0, 1, 2].map((canal) => {
    const t = new Uint8ClampedArray(256);
    const { baixo, alto } = auto.canais[canal];
    for (let v = 0; v < 256; v++) {
      let x = v;
      if (a.auto) {
        let y = (v - baixo) / Math.max(1, alto - baixo);
        y = Math.max(0, Math.min(1, y));
        y = Math.pow(y, auto.gama) * 255;
        x = v + (y - v) * forca;
      }
      x += brilho;
      x = fatorC * (x - 128) + 128;
      if (canal === 0) x += temp;
      if (canal === 2) x -= temp;
      t[v] = limitar(x);
    }
    return t;
  });
}

// Desenha a foto tratada no canvas de destino, no tamanho do formato escolhido.
// escala < 1 serve para a prévia rápida na tela.
export function desenhar(destino, foto, ajustes, formato, arte = {}, escala = 1) {
  const F = FORMATOS[formato] || FORMATOS.feed;
  const W = Math.round(F.w * escala), H = Math.round(F.h * escala);
  if (destino.width !== W) destino.width = W;
  if (destino.height !== H) destino.height = H;
  const ctx = destino.getContext("2d", { willReadFrequently: true });

  const o = foto.canvas;
  const alvo = W / H, prop = o.width / o.height;
  let cw, ch;
  if (prop > alvo) { ch = o.height; cw = ch * alvo; } else { cw = o.width; ch = cw / alvo; }
  const zoom = Math.max(1, ajustes.zoom || 1);
  cw /= zoom; ch /= zoom;
  const sx = (o.width - cw) * clamp01(ajustes.x);
  const sy = (o.height - ch) * clamp01(ajustes.y);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(o, sx, sy, cw, ch, 0, 0, W, H);

  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const [tr, tg, tb] = montarTabelas(foto.auto, ajustes);
  const f = FILTROS[ajustes.filtro] || {};
  const sat = 1 + Math.max(-100, Math.min(100, ajustes.saturacao + (f.saturacao || 0))) / 100 + (ajustes.auto ? 0.06 : 0);
  for (let i = 0; i < d.length; i += 4) {
    let r = tr[d[i]], g = tg[d[i + 1]], b = tb[d[i + 2]];
    if (sat !== 1) {
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
  desenharArte(ctx, W, H, arte, escala, formato);
  return destino;
}

// Quanto da foto original aparece no recorte (usado para arrastar a foto com o dedo).
export function areaCorte(foto, ajustes, formato) {
  const F = FORMATOS[formato] || FORMATOS.feed;
  const o = foto.canvas, alvo = F.w / F.h;
  let cw, ch;
  if (o.width / o.height > alvo) { ch = o.height; cw = ch * alvo; } else { cw = o.width; ch = cw / alvo; }
  const zoom = Math.max(1, ajustes.zoom || 1);
  return { cw: cw / zoom, ch: ch / zoom, ow: o.width, oh: o.height };
}

function clamp01(v) { return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5)); }

// Texto sobre a foto e a etiqueta da marca, nas cores do negócio.
function desenharArte(ctx, W, H, arte, escala, formato) {
  const corP = arte.corPrimaria || "#39ff14";
  const titulo = (arte.titulo || "").trim();
  const margem = 64 * escala;
  const emCima = arte.posicao === "topo";
  const areaSegura = formato === "story" ? 220 * escala : 0; // fora da área dos botões do Stories

  if (titulo) {
    const tam = (formato === "story" ? 92 : 78) * escala;
    ctx.font = `700 ${tam}px "Space Grotesk", "Inter", sans-serif`;
    const linhas = quebrarTexto(ctx, titulo.toUpperCase(), W - margem * 2).slice(0, 4);
    const altLinha = tam * 1.12;
    const blocoH = linhas.length * altLinha;
    const grad = emCima
      ? ctx.createLinearGradient(0, 0, 0, blocoH + margem * 3 + areaSegura)
      : ctx.createLinearGradient(0, H, 0, H - blocoH - margem * 3 - areaSegura);
    grad.addColorStop(0, "rgba(0,0,0,.72)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    if (emCima) ctx.fillRect(0, 0, W, blocoH + margem * 3 + areaSegura);
    else ctx.fillRect(0, H - blocoH - margem * 3 - areaSegura, W, blocoH + margem * 3 + areaSegura);

    let y = emCima ? margem + areaSegura : H - margem - areaSegura - blocoH;
    // Faixa de destaque na cor da marca
    ctx.fillStyle = corP;
    ctx.fillRect(margem, y - 22 * escala, 90 * escala, 10 * escala);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0,0,0,.35)";
    ctx.shadowBlur = 12 * escala;
    for (const l of linhas) { ctx.fillText(l, margem, y); y += altLinha; }
    ctx.shadowBlur = 0;
  }

  const marca = (arte.marca || "").trim();
  if (marca) {
    const tam = 30 * escala;
    ctx.font = `600 ${tam}px "Inter", sans-serif`;
    const pad = 18 * escala;
    const larg = Math.min(ctx.measureText(marca).width + pad * 2, W - margem * 2);
    const alt = tam + pad * 1.3;
    const x = W - margem - larg;
    const y = emCima || !titulo ? H - margem - alt - areaSegura : margem + areaSegura;
    ctx.fillStyle = corP;
    arredondado(ctx, x, y, larg, alt, alt / 2);
    ctx.fill();
    ctx.fillStyle = corContraste(corP);
    ctx.textBaseline = "middle";
    ctx.fillText(marca, x + pad, y + alt / 2 + 1, larg - pad * 2);
  }
}

function quebrarTexto(ctx, texto, largura) {
  const palavras = texto.split(/\s+/);
  const linhas = [];
  let atual = "";
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(teste).width > largura && atual) { linhas.push(atual); atual = p; } else atual = teste;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function arredondado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function corContraste(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#0a0a0a" : "#ffffff";
}

export function paraBlob(canvas, qualidade = 0.92) {
  return new Promise((ok, falha) =>
    canvas.toBlob((b) => (b ? ok(b) : falha(new Error("Falha ao gerar a imagem."))), "image/jpeg", qualidade),
  );
}

// Versão pequena em base64, para a IA "ver" a foto ao escrever a legenda.
export function paraBase64Pequeno(foto, ajustes, formato, arte) {
  const c = document.createElement("canvas");
  desenhar(c, foto, ajustes, formato, { ...arte, titulo: "", marca: "" }, 0.6);
  return c.toDataURL("image/jpeg", 0.8).split(",")[1];
}
