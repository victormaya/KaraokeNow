# KaraokeNow — Backend

API REST em Python/FastAPI responsável por buscar músicas no YouTube, fazer proxy do stream de áudio e remover vocais via Replicate (Demucs).

## Pré-requisitos

- Python 3.12+
- Conta no [Replicate](https://replicate.com) com crédito disponível

## Instalação

```bash
# 1. Crie e ative o ambiente virtual
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac

# 2. Instale as dependências
pip install -r requirements.txt
```

## Configuração

Defina a variável de ambiente com seu token do Replicate antes de iniciar:

```powershell
# PowerShell
$env:REPLICATE_API_TOKEN = "r8_seu_token_aqui"
```

```cmd
:: CMD
set REPLICATE_API_TOKEN=r8_seu_token_aqui
```

Seu token está disponível em: https://replicate.com/account/api-tokens

## Rodando

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

O servidor estará disponível em `http://localhost:8000`.

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/search?q=...&limit=12` | Busca músicas no YouTube |
| `GET` | `/api/stream/{video_id}` | Proxy do stream de áudio |
| `POST` | `/api/process/{video_id}` | Inicia remoção de vocais |
| `GET` | `/api/job/{job_id}` | Consulta status do job |
| `GET` | `/api/audio/{job_id}` | Retorna o MP3 instrumental |
| `DELETE` | `/api/job/{job_id}` | Remove arquivos temporários |
| `GET` | `/api/lyrics?artist=...&title=...` | Busca letra da música |
| `GET` | `/health` | Health check |

## Fluxo de remoção de vocais

1. Download do áudio via `yt-dlp`
2. Upload para o Replicate
3. Processamento com modelo Demucs (`mdx_q`)
4. Download do instrumental gerado

> **Nota:** Com saldo abaixo de $5 no Replicate, o rate limit é restrito (burst de 1 request). O backend faz retry automático em até 5 tentativas com espera progressiva de 15s entre cada uma.
