# KaraokeNow

Busque qualquer música do YouTube e remova os vocais instantaneamente via IA.

## Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e rodando
- Uma chave da [Replicate API](https://replicate.com/account/api-tokens) (grátis para criar conta)

## Como rodar

1. Clone o repositório:
   ```bash
   git clone <url-do-repositorio>
   cd karaoke
   ```

2. Copie o arquivo de variáveis de ambiente e preencha sua chave:
   ```bash
   cp .env.example .env
   ```
   Abra o `.env` e substitua `your_replicate_api_token_here` pela sua chave da Replicate.

3. Suba os containers:
   ```bash
   docker compose up --build
   ```

4. Acesse [http://localhost:3000](http://localhost:3000) no navegador.

## Estrutura

| Serviço   | Porta | Descrição                              |
|-----------|-------|----------------------------------------|
| frontend  | 3000  | Interface Next.js                      |
| backend   | 8000  | API FastAPI (busca YT + remoção vocal) |
