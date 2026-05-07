# KaraokeNow

Busque qualquer música do YouTube e remova os vocais instantaneamente via IA.

## Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e rodando
- Uma chave da [Replicate API](https://replicate.com/account/api-tokens) (grátis para criar conta)
- Cookies do YouTube exportados do seu navegador (ver instruções abaixo)

## Como rodar

1. Clone o repositório:
   ```bash
   git clone https://github.com/victormaya/KaraokeNow.git
   cd KaraokeNow
   ```

2. Copie o arquivo de variáveis de ambiente e preencha sua chave:
   ```bash
   cp .env.example .env
   ```
   Abra o `.env` e substitua `your_replicate_api_token_here` pela sua chave da Replicate.

3. Exporte seus cookies do YouTube (necessário para evitar bloqueio de bot):

   - Instale a extensão **[Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)** no Chrome
   - Acesse [youtube.com](https://youtube.com) **logado** na sua conta Google
   - Clique na extensão e exporte como `cookies.txt`
   - Coloque o arquivo `cookies.txt` na raiz do projeto (mesma pasta do `docker-compose.yml`)

4. Suba os containers:
   ```bash
   docker compose up --build
   ```

5. Acesse [http://localhost:3000](http://localhost:3000) no navegador.

## Estrutura

| Serviço   | Porta | Descrição                              |
|-----------|-------|----------------------------------------|
| frontend  | 3000  | Interface Next.js                      |
| backend   | 8000  | API FastAPI (busca YT + remoção vocal) |
