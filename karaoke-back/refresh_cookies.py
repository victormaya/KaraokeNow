#!/usr/bin/env python3
"""
Keeps YouTube cookies alive by visiting YouTube with the existing cookies file.
Playwright loads the cookies, navigates to YouTube (which issues fresh session
tokens), then exports the updated cookies back in Netscape format.

Run on a schedule (e.g. every 48 h) so yt-dlp always has a fresh session.
If GOOGLE_EMAIL + GOOGLE_PASSWORD are set and the session has expired,
the script will attempt a full re-login automatically.
"""

import os
import sys
import time
import urllib.parse
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

COOKIES_FILE       = Path(os.environ.get("COOKIES_FILE", "/app/cookies.txt"))
REFRESH_INTERVAL   = int(os.environ.get("COOKIE_REFRESH_INTERVAL", str(48 * 3600)))
GOOGLE_EMAIL       = os.environ.get("GOOGLE_EMAIL", "")
GOOGLE_PASSWORD    = os.environ.get("GOOGLE_PASSWORD", "")
YTDLP_PROXY        = os.environ.get("YTDLP_PROXY", "")


def _playwright_proxy() -> dict | None:
    """Parse YTDLP_PROXY (http://user:pass@host:port) into Playwright proxy dict."""
    if not YTDLP_PROXY:
        return None
    p = urllib.parse.urlparse(YTDLP_PROXY)
    proxy: dict = {"server": f"{p.scheme}://{p.hostname}:{p.port}"}
    if p.username:
        proxy["username"] = urllib.parse.unquote(p.username)
    if p.password:
        proxy["password"] = urllib.parse.unquote(p.password)
    print(f"[proxy] Using {p.scheme}://{p.hostname}:{p.port}")
    return proxy

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
            "domain": domain,
            "path": path_,
            "secure": secure == "TRUE",
            "expires": exp if exp > 0 else -1,
            "name": name,
            "value": value,
            "httpOnly": False,
            "sameSite": "Lax",
        })
    return cookies


def export_netscape(cookies: list[dict], path: Path) -> None:
    lines = ["# Netscape HTTP Cookie File\n"]
    for c in cookies:
        domain = c.get("domain", "")
        sub    = "TRUE" if domain.startswith(".") else "FALSE"
        path_  = c.get("path", "/")
        secure = "TRUE" if c.get("secure") else "FALSE"
        exp    = c.get("expires") or 0
        if exp < 0:
            exp = 0
        lines.append(
            f"{domain}\t{sub}\t{path_}\t{secure}\t{exp}\t{c['name']}\t{c['value']}\n"
        )
    path.write_text("".join(lines))


def _do_login(browser) -> list[dict] | None:
    """
    Open a FRESH browser context (no existing cookies) and log in to Google.
    Returns the YouTube cookies on success, None on failure.
    """
    if not GOOGLE_EMAIL or not GOOGLE_PASSWORD:
        return None
    print("Attempting automatic re-login with fresh session…")
    proxy = _playwright_proxy()
    ctx = browser.new_context(
        user_agent=USER_AGENT,
        viewport={"width": 1280, "height": 800},
        locale="pt-BR",
        **({"proxy": proxy} if proxy else {}),
    )
    page = ctx.new_page()
    try:
        # Force the identifier step, bypassing accountchooser
        page.goto(
            "https://accounts.google.com/signin/v2/identifier"
            "?flowName=GlifWebSignIn&flowEntry=ServiceLogin&service=youtube",
            wait_until="domcontentloaded", timeout=30_000,
        )
        page.wait_for_timeout(2_500)
        print(f"[login] {page.url}")

        # If redirected to accountchooser, click "Use another account"
        if "accountchooser" in page.url or "AccountChooser" in page.url:
            print("[login] AccountChooser detected — clicking 'Use another account'")
            other = page.locator(
                'li[data-identifier="__emptyaccount__"], '
                '[data-action="useAnotherAccount"], '
                'button:has-text("Usar outra conta"), '
                'button:has-text("Use another account"), '
                'a:has-text("Usar outra conta")'
            ).first
            other.wait_for(state="visible", timeout=10_000)
            other.click()
            page.wait_for_timeout(2_000)
            print(f"[login] After click: {page.url}")

        # Email
        email_sel = 'input[name="identifier"], input[type="email"], input[autocomplete="username"]'
        email = page.locator(email_sel).first
        email.wait_for(state="visible", timeout=20_000)
        email.click()
        page.wait_for_timeout(500)
        page.keyboard.type(GOOGLE_EMAIL, delay=90)
        page.wait_for_timeout(700)
        page.keyboard.press("Enter")
        page.wait_for_timeout(2_500)

        # Password
        pwd = page.locator('input[type="password"], input[name="Passwd"]').first
        pwd.wait_for(state="visible", timeout=20_000)
        pwd.click()
        page.wait_for_timeout(500)
        page.keyboard.type(GOOGLE_PASSWORD, delay=90)
        page.wait_for_timeout(700)
        page.keyboard.press("Enter")
        page.wait_for_url("**youtube.com**", timeout=30_000)
        page.wait_for_timeout(3_000)

        cookies = ctx.cookies(["https://www.youtube.com", "https://.youtube.com"])
        print(f"Re-login successful — {len(cookies)} cookies obtained.")
        ctx.close()
        return cookies
    except Exception as exc:
        try:
            print(f"[login-debug] URL: {page.url} | Title: {page.title()}")
        except Exception:
            pass
        print(f"Re-login failed: {exc}")
        ctx.close()
        return None


def refresh_once() -> bool:
    if not COOKIES_FILE.exists() or COOKIES_FILE.stat().st_size < 100:
        print(f"[refresh] No valid cookies at {COOKIES_FILE} — skipping.")
        return False

    existing = parse_netscape(COOKIES_FILE)
    if not existing:
        print("[refresh] Could not parse cookies file — skipping.")
        return False

    with sync_playwright() as pw:
        proxy = _playwright_proxy()
        browser = pw.firefox.launch(headless=True)
        ctx = browser.new_context(
            user_agent=USER_AGENT,
            viewport={"width": 1280, "height": 800},
            locale="pt-BR",
            **({"proxy": proxy} if proxy else {}),
        )
        ctx.add_cookies(existing)
        page = ctx.new_page()

        try:
            page.goto("https://www.youtube.com", wait_until="domcontentloaded", timeout=30_000)
            page.wait_for_timeout(4_000)

            signed_out = page.locator('a[href*="accounts.google.com/ServiceLogin"]').count() > 0
            ctx.close()

            if signed_out:
                fresh_cookies = _do_login(browser)
                if not fresh_cookies:
                    print("[refresh] Signed out and re-login unavailable — keeping old cookies.")
                    browser.close()
                    return False
                export_netscape(fresh_cookies, COOKIES_FILE)
                print(f"[refresh] OK (re-login) — {len(fresh_cookies)} cookies saved.")
            else:
                # Session still valid — just re-export the refreshed cookies
                refreshed = ctx.cookies(["https://www.youtube.com", "https://.youtube.com"])
                if refreshed:
                    export_netscape(refreshed, COOKIES_FILE)
                    print(f"[refresh] OK — {len(refreshed)} cookies saved to {COOKIES_FILE}")
                else:
                    print("[refresh] No cookies returned — keeping original file.")
        except PWTimeout as exc:
            print(f"[refresh] Timeout: {exc}")
        except Exception as exc:
            print(f"[refresh] Error: {exc}")
        finally:
            browser.close()

    return True


if __name__ == "__main__":
    one_shot = "--once" in sys.argv
    print(f"[refresh] Starting {'(one-shot)' if one_shot else f'(every {REFRESH_INTERVAL // 3600}h)'}…")

    while True:
        refresh_once()
        if one_shot:
            break
        print(f"[refresh] Next run in {REFRESH_INTERVAL // 3600}h.")
        time.sleep(REFRESH_INTERVAL)
