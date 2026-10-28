# Receita para publicar o VGA (site + app) no Render, Railway ou qualquer serviço com Docker.
FROM node:22-slim

WORKDIR /srv

# Instala as dependências primeiro (fica em cache entre publicações).
COPY app/package.json app/package-lock.json app/
RUN cd app && npm ci --omit=dev && npm cache clean --force

COPY app app
COPY site site

ENV NODE_ENV=production \
    PORT=3000 \
    PASTA_DADOS=/data

# /data guarda o banco e as fotos. Na hospedagem, monte um disco/volume aqui.
RUN mkdir -p /data
EXPOSE 3000

CMD ["node", "--disable-warning=ExperimentalWarning", "app/server.js"]
