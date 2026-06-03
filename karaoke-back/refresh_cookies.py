#!/usr/bin/env python3
"""
Monitors YouTube cookie validity every N seconds via lightweight HTTP check.
Sends a Gmail alert when cookies expire. No browser needed.
"""

import os
import sys
import time
import smtplib
import yt_dlp
from email.mime.text import MIMEText
from pathlib import Path

COOKIES_FILE       = Path(os.environ.get("COOKIES_FILE", "/app/cookies.txt"))
REFRESH_INTERVAL   = int(os.environ.get("COOKIE_REFRESH_INTERVAL", str(300)))
NOTIFY_EMAIL       = os.environ.get("NOTIFY_EMAIL", "")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")
YTDLP_PROXY        = os.environ.get("YTDLP_PROXY", "")
ALERT_FLAG         = Path("/app/cookie_alert_sent.flag")

TEST_VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"



def _send_alert() -> None:
    if not NOTIFY_EMAIL or not GMAIL_APP_PASSWORD:
        print("[alert] Email não configurado — pulando notificação.")
        return
    if ALERT_FLAG.exists():
        print("[alert] Email já enviado — aguardando renovação manual.")
        return
    try:
        body = (
            "As cookies do YouTube expiraram no VOKAO.\n\n"
            "Para renovar (2 minutos):\n"
            "1. Abra o Chrome logado com sua conta Google\n"
            "2. Exporte as cookies do youtube.com com a extensão 'Get cookies.txt LOCALLY'\n"
            "3. Execute no terminal:\n\n"
            "   scp cookies.txt root@46.62.148.54:/app/karaoke/cookies.txt\n"
            "   ssh root@46.62.148.54 'cd /app/karaoke && docker compose restart backend'\n\n"
            "Após renovar, o monitoramento retoma automaticamente."
        )
        msg = MIMEText(body)
        msg["Subject"] = "⚠️ VOKAO — Cookies do YouTube expiraram"
        msg["From"]    = NOTIFY_EMAIL
        msg["To"]      = NOTIFY_EMAIL
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(NOTIFY_EMAIL, GMAIL_APP_PASSWORD)
            server.send_message(msg)
        ALERT_FLAG.touch()
        print(f"[alert] Email enviado para {NOTIFY_EMAIL}")
    except Exception as exc:
        print(f"[alert] Falha ao enviar email: {exc}")


def _check_cookies() -> bool:
    if not COOKIES_FILE.exists() or COOKIES_FILE.stat().st_size < 100:
        print("[check] Arquivo de cookies ausente ou vazio.")
        return False

    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "cookiefile": str(COOKIES_FILE),
    }
    if YTDLP_PROXY:
        opts["proxy"] = YTDLP_PROXY

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.extract_info(TEST_VIDEO, download=False)
        print("[check] yt-dlp OK — cookies válidas.")
        return True
    except yt_dlp.utils.DownloadError as e:
        err = str(e).lower()
        if "sign in" in err or "bot" in err or "confirm" in err:
            print(f"[check] yt-dlp: sessão expirada — {e}")
            return False
        # Outros erros (rede, vídeo indisponível) — não alertar
        print(f"[check] yt-dlp erro não relacionado a auth: {e} — assumindo válido.")
        return True
    except Exception as exc:
        print(f"[check] Erro inesperado: {exc} — assumindo válido.")
        return True


def check_once() -> None:
    valid = _check_cookies()
    if valid:
        print("[refresh] OK — cookies válidas.")
        ALERT_FLAG.unlink(missing_ok=True)
    else:
        print("[refresh] Cookies inválidas ou sessão expirada.")
        _send_alert()


if __name__ == "__main__":
    one_shot = "--once" in sys.argv
    print(f"[refresh] Iniciando {'(uma vez)' if one_shot else f'(a cada {REFRESH_INTERVAL}s)'}…")

    while True:
        check_once()
        if one_shot:
            break
        print(f"[refresh] Próxima checagem em {REFRESH_INTERVAL}s.")
        time.sleep(REFRESH_INTERVAL)
