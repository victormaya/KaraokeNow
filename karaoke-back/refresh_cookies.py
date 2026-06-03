#!/usr/bin/env python3
"""
Monitors YouTube cookie validity every N seconds via lightweight HTTP check.
Sends a Gmail alert when cookies expire. No browser needed.
"""

import os
import sys
import time
import smtplib
import urllib.request
import urllib.error
from email.mime.text import MIMEText
from pathlib import Path

COOKIES_FILE       = Path(os.environ.get("COOKIES_FILE", "/app/cookies.txt"))
REFRESH_INTERVAL   = int(os.environ.get("COOKIE_REFRESH_INTERVAL", str(300)))
NOTIFY_EMAIL       = os.environ.get("NOTIFY_EMAIL", "")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")
YTDLP_PROXY        = os.environ.get("YTDLP_PROXY", "")
ALERT_FLAG         = Path("/app/cookie_alert_sent.flag")

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) "
    "Gecko/20100101 Firefox/126.0"
)


def parse_netscape(path: Path) -> list[dict]:
    cookies = []
    for line in path.read_text(errors="ignore").splitlines():
        if line.startswith("#") or not line.strip():
            continue
        parts = line.strip().split("\t")
        if len(parts) != 7:
            continue
        domain, _, path_, secure, expires, name, value = parts
        try:
            exp = int(expires)
        except ValueError:
            exp = -1
        cookies.append({
            "domain": domain, "path": path_,
            "secure": secure == "TRUE",
            "expires": exp if exp > 0 else -1,
            "name": name, "value": value,
        })
    return cookies


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

    cookies = parse_netscape(COOKIES_FILE)
    now = time.time()

    # Quick check: key auth cookies present and not timestamp-expired
    yt_cookies = {c["name"]: c for c in cookies if "youtube.com" in c.get("domain", "")}
    for name in ("SID", "HSID", "SSID"):
        c = yt_cookies.get(name)
        if not c:
            print(f"[check] Cookie '{name}' ausente.")
            return False
        if 0 < c.get("expires", -1) < now:
            print(f"[check] Cookie '{name}' expirado.")
            return False

    # HTTP check: lightweight request to verify server-side validity
    cookie_header = "; ".join(
        f"{c['name']}={c['value']}"
        for c in cookies
        if "youtube.com" in c.get("domain", "")
    )

    try:
        if YTDLP_PROXY:
            opener = urllib.request.build_opener(
                urllib.request.ProxyHandler({"http": YTDLP_PROXY, "https": YTDLP_PROXY})
            )
        else:
            opener = urllib.request.build_opener()

        req = urllib.request.Request(
            "https://www.youtube.com/",
            headers={
                "User-Agent": USER_AGENT,
                "Cookie": cookie_header,
                "Accept-Language": "pt-BR,pt;q=0.9",
            }
        )
        with opener.open(req, timeout=15) as resp:
            chunk = resp.read(16384).decode("utf-8", errors="ignore")
            signed_in = (
                '"SIGNED_IN"' in chunk
                or '"isSignedIn":true' in chunk
                or '"isSignedIn": true' in chunk
            )
            if not signed_in:
                print("[check] YouTube responde sem sessão autenticada.")
            return signed_in
    except Exception as exc:
        # On transient network errors, assume valid to avoid false alerts
        print(f"[check] Erro de rede: {exc} — assumindo válido.")
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
