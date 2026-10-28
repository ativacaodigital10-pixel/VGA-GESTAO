import Anthropic from "@anthropic-ai/sdk";

const MODELO = "claude-opus-5-5";

export const OBJETIVOS = {
  promocao: "Promoção ou oferta",
  novidade: "Novidade ou lançamento",
  produto: "Mostrar produto ou serviço",
  bastidores: "Bastidores e equipe",
  dica: "Dica ou conteúdo útil",
  depoimento: "Depoimento de cliente",
  data: "Data comemorativa",
};

const ESQUEMA = {
  type: "object",
  properties: {
    opcoes: {
      type: "array",
      description: "Exatamente 3 legendas com estilos diferentes.",
      items: {
        type: "object",
        properties: {
          estilo: { type: "string", description: "Nome curto do estilo, ex.: Direta, Storytelling, Divertida" },
          legenda: { type: "string" },
        },
        required: ["estilo", "legenda"],
        additionalProperties: false,
      },
    },
    hashtags: { type: "array", items: { type: "string" }, description: "8 a 15 hashtags, cada uma começando com #" },
    titulo_arte: { type: "string", description: "Frase curta (até 6 palavras) para escrever sobre a foto" },
    melhor_horario: { type: "string", description: "Sugestão de dia e horário para postar, com o motivo em poucas palavras" },
    dica: { type: "string", description: "Uma dica prática para este post render mais" },
  },
  required: ["opcoes", "hashtags", "titulo_arte", "melhor_horario", "dica"],
  additionalProperties: false,
};

const SISTEMA = `Você é social media de uma agência brasileira que atende pequenos e médios negócios locais.
Escreve legendas para Instagram e Facebook em português do Brasil, naturais, sem clichês de marketing e sem exageros.
Regras:
- Use o tom de voz do negócio e fale com o público dele.
- Comece com uma primeira linha forte, que prenda a atenção no feed.
- Parágrafos curtos, emojis com moderação (no máximo 3 por legenda).
- Termine com uma chamada para ação clara (ex.: chamar no WhatsApp, visitar, comentar, salvar).
- Nunca invente preços, datas, endereços ou promoções que o empresário não informou.
- Se as fotos mostrarem algo, use o que aparece nelas para deixar a legenda concreta.
- Hashtags: misture locais (cidade/bairro), do segmento e da marca. Sem hashtags genéricas demais como #love.`;

export function iaDisponivel() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let cliente = null;
function obterCliente() {
  if (!cliente) cliente = new Anthropic();
  return cliente;
}

function descreverNegocio(n) {
  const linhas = [
    ["Negócio", n.nome],
    ["Segmento", n.segmento],
    ["Cidade/bairro", n.cidade],
    ["Público", n.publico],
    ["Tom de voz", n.tom],
    ["Diferenciais", n.diferenciais],
    ["Instagram", n.instagram],
    ["WhatsApp", n.whatsapp ? "sim, atende pelo WhatsApp" : ""],
    ["Hashtags da marca", n.hashtags],
  ];
  return linhas.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
}

// Gera legendas com o Claude. Se não houver chave de API, usa modelos prontos.
export async function gerarLegendas({ negocio, objetivo, briefing, formato, imagens }) {
  if (!iaDisponivel()) return { ...legendasModelo({ negocio, objetivo, briefing }), origem: "modelo" };

  const conteudo = [];
  for (const img of (imagens || []).slice(0, 4)) {
    conteudo.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img } });
  }
  conteudo.push({
    type: "text",
    text: `Dados do negócio:
${descreverNegocio(negocio) || "(perfil ainda não preenchido)"}

Objetivo do post: ${OBJETIVOS[objetivo] || objetivo || "não informado"}
Formato: ${formato === "story" ? "Stories/Reels (9:16)" : "post no feed"}
O que o empresário quer comunicar, nas palavras dele:
"""${briefing || "(não escreveu nada; use as fotos)"}"""

Crie 3 opções de legenda com estilos diferentes, as hashtags, um título curto para a arte, o melhor horário e uma dica.`,
  });

  const resposta = await obterCliente().beta.messages.create({
    model: MODELO,
    max_tokens: 16000,
    // Legenda é tarefa curta: esforço baixo deixa a resposta mais rápida no celular.
    output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
    // Se o modelo principal recusar, a API tenta automaticamente um modelo alternativo.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SISTEMA,
    messages: [{ role: "user", content: conteudo }],
  });

  if (resposta.stop_reason === "refusal") {
    return { ...legendasModelo({ negocio, objetivo, briefing }), origem: "modelo", aviso: "A IA não conseguiu gerar este texto. Usamos um modelo pronto." };
  }
  const texto = resposta.content.find((b) => b.type === "text")?.text;
  if (!texto || resposta.stop_reason === "max_tokens") throw new Error("Resposta da IA incompleta.");
  const dados = JSON.parse(texto);
  return { ...normalizar(dados), origem: "ia" };
}

function normalizar(d) {
  const hashtags = (d.hashtags || [])
    .map((h) => String(h).trim().replace(/\s+/g, ""))
    .filter(Boolean)
    .map((h) => (h.startsWith("#") ? h : `#${h}`));
  return {
    opcoes: (d.opcoes || []).slice(0, 3).map((o) => ({ estilo: String(o.estilo || ""), legenda: String(o.legenda || "") })),
    hashtags: semRepetir(hashtags).slice(0, 20),
    titulo_arte: String(d.titulo_arte || ""),
    melhor_horario: String(d.melhor_horario || ""),
    dica: String(d.dica || ""),
  };
}

// Remove hashtags repetidas sem diferenciar maiúsculas (#Sol e #sol são a mesma).
function semRepetir(lista) {
  const vistas = new Set();
  return lista.filter((h) => {
    const k = h.toLowerCase();
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

function semAcento(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

// Modelos prontos, usados sem chave de API (modo demonstração) ou se a IA recusar.
export function legendasModelo({ negocio, objetivo, briefing }) {
  const nome = negocio.nome || "nossa empresa";
  const msg = (briefing || "").trim();
  const cta = negocio.whatsapp ? "Chama a gente no WhatsApp pelo link da bio! 📲" : "Comenta aqui ou manda uma mensagem pra gente! 💬";
  const local = negocio.cidade ? ` em ${negocio.cidade}` : "";
  const ganchos = {
    promocao: "Oferta especial chegando! 🔥",
    novidade: "Tem novidade por aqui! ✨",
    produto: "Olha só o que preparamos pra você 👀",
    bastidores: "Bastidores: como tudo acontece por aqui",
    dica: "Uma dica rápida que pode te ajudar 💡",
    depoimento: "Nada melhor do que ouvir quem já conhece ❤️",
    data: "Hoje é dia de comemorar! 🎉",
  };
  const gancho = ganchos[objetivo] || "Passando para te mostrar uma coisa 👇";
  const corpo = msg || `Aqui na ${nome}, cada detalhe é pensado para você.`;

  const tagsBase = [
    negocio.nome && `#${semAcento(negocio.nome)}`,
    negocio.cidade && `#${semAcento(negocio.cidade)}`,
    negocio.segmento && `#${semAcento(negocio.segmento)}`,
    negocio.segmento && negocio.cidade && `#${semAcento(negocio.segmento)}${semAcento(negocio.cidade)}`,
    ...String(negocio.hashtags || "").split(/[\s,]+/),
    "#comerciolocal",
    "#apoieopequenonegocio",
  ];
  const hashtags = semRepetir(tagsBase.filter((h) => h && h.length > 1).map((h) => (h.startsWith("#") ? h : `#${h}`)));

  return {
    opcoes: [
      { estilo: "Direta", legenda: `${gancho}\n\n${corpo}\n\n${cta}` },
      { estilo: "Conversa", legenda: `Sabe aquele momento em que tudo dá certo? É isso que a gente quer pra você${local}.\n\n${corpo}\n\nMarca aqui quem precisa ver isso! 👇` },
      { estilo: "Curta", legenda: `${corpo}\n\n📍 ${nome}${local}\n${cta}` },
    ],
    hashtags,
    titulo_arte: { promocao: "Oferta especial", novidade: "Novidade!", data: "Dia especial" }[objetivo] || "",
    melhor_horario: "Dias de semana entre 11h e 13h ou entre 18h e 20h costumam ter mais alcance para negócios locais.",
    dica: "Responda os comentários na primeira hora depois de postar: isso ajuda o post a alcançar mais pessoas.",
  };
}
