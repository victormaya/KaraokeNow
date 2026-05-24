# KaraokeNow

Busque qualquer música do YouTube, remova os vocais com IA e cante com a letra sincronizada — ou remova a bateria para praticar junto (modo Play Along).

## Serviços e contas necessárias

| Serviço | Para que serve | Link |
|---|---|---|
| **Replicate** | IA de separação vocal (Demucs) | replicate.com |
| **Hetzner Cloud** | Servidor VPS em produção | console.hetzner.cloud |
| **Webshare** | Proxy para o yt-dlp não ser bloqueado pelo YouTube | webshare.io |
| **lrclib.net** | API de letras sincronizadas (gratuita, sem chave) | lrclib.net |
| **GitHub** | Repositório do código | github.com/victormaya/KaraokeNow |

## Infraestrutura atual (produção)

- **Servidor:** Hetzner Cloud CX22 — IP `46.62.148.54`
- **Acesso SSH:** `ssh -i ~/.ssh/id_ed25519 root@46.62.148.54`
- **Chave pública:** `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEdNm8lC+I+zgg9vK7HGolzwN5u5EzOLqoPhkQha2Pxt karaoke-vps`
- **App rodando:** `http://46.62.148.54:3000`
- **Código no servidor:** `/app/karaoke`
- **Cache de áudio:** `/app/cache` (dentro do container `karaoke-backend-1`)

### Comandos úteis no servidor

```bash
# Ver status dos containers
ssh -i ~/.ssh/id_ed25519 root@46.62.148.54 "docker compose -f /app/karaoke/docker-compose.yml ps"

# Ver logs do backend
ssh -i ~/.ssh/id_ed25519 root@46.62.148.54 "docker logs karaoke-backend-1 --tail 50"

# Atualizar e rebuildar após push
ssh -i ~/.ssh/id_ed25519 root@46.62.148.54 "cd /app/karaoke && git pull && docker compose up -d --build"

# Limpar cache de músicas (força reprocessamento)
ssh -i ~/.ssh/id_ed25519 root@46.62.148.54 "docker exec karaoke-backend-1 find /app/cache -mindepth 1 -delete"

# Atualizar cookies do YouTube no servidor
scp -i ~/.ssh/id_ed25519 cookies.txt root@46.62.148.54:/app/karaoke/cookies.txt
```

## Variáveis de ambiente (`.env`)

```env
# Chave da API do Replicate (replicate.com/account/api-tokens)
REPLICATE_API_TOKEN=

# Origens permitidas pelo CORS (em produção: IP ou domínio do servidor)
CORS_ORIGINS=http://localhost:3000

# Proxy residencial para o yt-dlp — formato: http://user:pass@host:porta
# Obtenha em webshare.io (plano gratuito tem 10GB)
YTDLP_PROXY=
```

## Cookies do YouTube

O YouTube bloqueia downloads de IPs de datacenter. Os cookies autenticam as requisições.

**Quando renovar:** quando aparecer o erro `Sign in to confirm you're not a bot` (a cada 1-3 meses).

**Como exportar cookies frescos:**
1. Instale a extensão **[Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)** no Chrome
2. Acesse [youtube.com](https://youtube.com) **logado** na sua conta Google
3. Clique na extensão → **Export** → salve como `cookies.txt`
4. O arquivo deve ter mais de 100KB e conter cookies como `__Secure-1PSID` e `SAPISID`

**Enviar para o servidor:**
```powershell
scp -i ~/.ssh/id_ed25519 cookies.txt root@46.62.148.54:/app/karaoke/cookies.txt
docker compose -f /app/karaoke/docker-compose.yml restart backend
```

## Como rodar localmente

### Pré-requisitos
- Docker Desktop instalado e rodando
- Conta no Replicate com créditos
- `cookies.txt` do YouTube exportado (ver acima)

### Passo a passo

```bash
git clone https://github.com/victormaya/KaraokeNow.git
cd KaraokeNow
cp .env.example .env
# Preencha REPLICATE_API_TOKEN no .env
# Coloque o cookies.txt na raiz do projeto
docker compose up --build
```

Acesse [http://localhost:3000](http://localhost:3000).

## Arquitetura

```
Usuário → Next.js (3000) → FastAPI (8000) → Replicate (Demucs)
                                          → yt-dlp → YouTube (via proxy Webshare)
                                          → lrclib.net (letras sincronizadas)
```

| Container | Porta | Descrição |
|---|---|---|
| `karaoke-frontend` | 3000 | Interface Next.js 15 |
| `karaoke-backend` | 8000 | API FastAPI — busca, download, separação vocal e de bateria |

### Fluxo de processamento — modo Karaokê

1. Usuário busca uma música → yt-dlp pesquisa no YouTube via proxy
2. Usuário clica para processar → backend baixa o áudio via yt-dlp (proxy + cookies)
3. Áudio enviado ao Replicate (modelo Demucs, `stem="vocals"`) para separar vocais
4. Backend salva `instrumental.mp3` (sem vocals) e `original.mp3` (com vocals) no cache
5. Frontend carrega ambos como elementos `<audio>` — o toggle troca o mute entre eles
6. Letra sincronizada carregada via lrclib.net e avança com o tempo de reprodução

### Fluxo de processamento — modo Play Along (bateria)

1. Usuário acessa `/drums` e busca uma música
2. Backend baixa o áudio (ou reutiliza `original.mp3` já em cache)
3. Áudio enviado ao Replicate (modelo Demucs, `stem="drums"`) para isolar a bateria
4. Backend detecta o BPM via análise de energia de onset (numpy FFT) e salva em `bpm.json`
5. Backend salva `no_drums.mp3` (sem bateria) no cache
6. Frontend exibe BPM, toggle para ligar/desligar a bateria e controle de velocidade (0.5×–1.5×)

### Cache

Músicas processadas ficam em `/app/cache/{video_id}/`:
- `instrumental.mp3` — pista karaokê (sem vocals)
- `original.mp3` — pista original (com vocals e bateria)
- `no_drums.mp3` — pista play along (sem bateria)
- `bpm.json` — BPM detectado pelo backend

Na segunda vez que alguém tocar a mesma música, o processamento é instantâneo.
