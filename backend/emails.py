"""Transactional emails (Emergent managed email proxy)."""
from dotenv import load_dotenv
load_dotenv()

import os
import re
import ipaddress
import logging
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

from fastapi import HTTPException

logger = logging.getLogger("bratclient.emails")

# Resend (https://resend.com) — niezależny dostawca maili.
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_BASE_URL = "https://api.resend.com"
# Adres nadawcy MUSI pochodzić z domeny zweryfikowanej w Resend,
# np. "BratClient <no-reply@twojadomena.pl>". Do testów działa "onboarding@resend.dev".
EMAIL_FROM = os.environ.get("EMAIL_FROM", "BratClient <onboarding@resend.dev>")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "BratClient")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
APP_URL = (os.environ.get("PUBLIC_APP_URL") or "").rstrip("/")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> str | None:
    _assert_safe_email(subject, html)
    if not RESEND_API_KEY:
        logger.error("RESEND_API_KEY missing — email not sent")
        raise HTTPException(503, "Email service not configured")
    payload = {"from": EMAIL_FROM, "to": [to], "subject": subject, "html": html}
    if EMAIL_REPLY_TO:
        payload["reply_to"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{RESEND_BASE_URL}/emails",
                                     headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
                                     json=payload)
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error("Email send failed: %s %s", e.response.status_code, e.response.text)
        body = e.response.text.lower()
        if e.response.status_code in (403, 422) and ("invalid" in body or "not allowed" in body or "domain" in body):
            raise HTTPException(400, "Nie możemy wysłać kodu na ten adres e-mail — sprawdź, czy jest poprawny "
                                     "/ We cannot deliver a code to this e-mail address")
        raise HTTPException(502, "Nie udało się wysłać e-maila, spróbuj ponownie / Failed to send email")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Email send error: %s", e)
        raise HTTPException(500, "Failed to send email")


# ---------------------------------------------------------------- templates

def _shell(title: str, intro: str, blocks: str, footer_note: str) -> str:
    panel_link = f'<p style="margin:28px 0 0"><a href="{escape(APP_URL)}/panel" style="display:inline-block;background:#ffffff;color:#000000;text-decoration:none;padding:14px 28px;border-radius:999px;font:bold 12px/1 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase">Panel BratClient</a></p>' if APP_URL.startswith("https://") else ""
    return f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#050505;padding:32px 0">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:92%;background:#0A0A0A;border:1px solid #1c1c1c;border-radius:24px">
  <tr><td style="padding:36px 40px 8px">
    <p style="margin:0;font:bold 22px/1 Arial,sans-serif;color:#ffffff;letter-spacing:1px">BRAT<span style="color:#7a7a7a">CLIENT</span></p>
    <p style="margin:26px 0 0;font:bold 22px/1.3 Arial,sans-serif;color:#ffffff">{escape(title)}</p>
    <p style="margin:14px 0 0;font:14px/1.6 Arial,sans-serif;color:#9a9a9a">{intro}</p>
  </td></tr>
  <tr><td style="padding:8px 40px 0">{blocks}{panel_link}</td></tr>
  <tr><td style="padding:28px 40px 36px">
    <p style="margin:0;border-top:1px solid #1c1c1c;padding-top:18px;font:11px/1.6 Arial,sans-serif;color:#5a5a5a">
      Wiadomość wysłana przez {escape(EMAIL_FROM_NAME)}. {escape(footer_note)}
      Nigdy nie prosimy o hasło ani dane karty w e-mailu.
    </p>
  </td></tr>
</table>
</td></tr></table>"""


def twofa_code_email(username: str, code: str, purpose: str = "login") -> tuple[str, str]:
    titles = {
        "login": "Kod do logowania",
        "enable": "Kod potwierdzający włączenie 2FA",
        "disable": "Kod potwierdzający wyłączenie 2FA",
    }
    title = titles.get(purpose, "Kod weryfikacyjny")
    code_block = (
        f'<div style="margin:8px 0 0;background:#ffffff;border-radius:18px;padding:22px;text-align:center">'
        f'<p style="margin:0;font:bold 38px/1 Courier New,monospace;color:#000000;letter-spacing:12px">{escape(code)}</p>'
        f'</div>'
        f'<p style="margin:16px 0 0;font:13px/1.6 Arial,sans-serif;color:#7a7a7a">Kod jest ważny 10 minut i działa tylko raz. '
        f'Jeśli to nie Ty próbowałeś się zalogować, zmień hasło w panelu.</p>')
    intro = f"Cześć <strong style=\"color:#fff\">{escape(username)}</strong>, wpisz ten kod w oknie weryfikacji dwuetapowej:"
    return f"BratClient — {title}: {code}", _shell(title, intro, code_block,
                                                    "Kodu nigdy nikomu nie podawaj.")


def purchase_email(username: str, item: str, total: float, order_id: str,
                   license_key: str | None, expires_at: str | None) -> tuple[str, str]:
    rows = [("Numer zamówienia", order_id), ("Produkt", item), ("Kwota", f"{total:.2f} PLN")]
    if license_key:
        rows.append(("Klucz licencji", license_key))
    if expires_at:
        rows.append(("Wygasa", expires_at[:10]))
    table = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #1c1c1c;border-radius:18px">'
    for i, (k, v) in enumerate(rows):
        border = "" if i == 0 else "border-top:1px solid #1c1c1c;"
        table += (f'<tr><td style="{border}padding:14px 18px;font:11px/1 Arial,sans-serif;color:#6a6a6a;'
                  f'letter-spacing:2px;text-transform:uppercase">{escape(k)}</td>'
                  f'<td style="{border}padding:14px 18px;font:bold 13px/1 Courier New,monospace;color:#ffffff;text-align:right">{escape(str(v))}</td></tr>')
    table += "</table>"
    intro = f"Dzięki za zakup, <strong style=\"color:#fff\">{escape(username)}</strong>. Wszystko jest już aktywne na Twoim koncie."
    return (f"BratClient — potwierdzenie zamówienia {order_id}",
            _shell("Zamówienie zrealizowane", intro, table,
                   "Plik .exe pobierzesz w panelu w zakładce Pobierz plik."))
