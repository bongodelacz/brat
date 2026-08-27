"""Integracja Discord: OAuth2 (łączenie konta) + bot REST (nadawanie/zabieranie roli).

Bot i cała komunikacja z Discordem chodzą po stronie serwera (VPS) — token bota
nigdy nie trafia do przeglądarki. Frontend dostaje tylko URL do autoryzacji.
"""
from dotenv import load_dotenv
load_dotenv()

import os
import logging
import httpx

logger = logging.getLogger("bratclient.discord")

CLIENT_ID = os.environ.get("DISCORD_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("DISCORD_CLIENT_SECRET", "")
BOT_TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "")
GUILD_ID = os.environ.get("DISCORD_GUILD_ID", "")
CUSTOMER_ROLE_ID = os.environ.get("DISCORD_CUSTOMER_ROLE_ID", "")
# Dokąd Discord odsyła po autoryzacji — MUSI być identyczne z wpisem w Developer Portal.
REDIRECT_URI = os.environ.get("DISCORD_REDIRECT_URI", "")

API = "https://discord.com/api/v10"
OAUTH_SCOPES = "identify guilds.join"


def is_configured() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET and BOT_TOKEN and GUILD_ID and CUSTOMER_ROLE_ID and REDIRECT_URI)


def oauth_url(state: str) -> str:
    from urllib.parse import urlencode
    q = urlencode({
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": OAUTH_SCOPES,
        "state": state,
        "prompt": "consent",
    })
    return f"https://discord.com/oauth2/authorize?{q}"


async def exchange_code(code: str) -> dict:
    """Wymienia kod OAuth na token użytkownika."""
    data = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
    }
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{API}/oauth2/token", data=data,
                         headers={"Content-Type": "application/x-www-form-urlencoded"})
    r.raise_for_status()
    return r.json()


async def get_discord_user(access_token: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{API}/users/@me",
                        headers={"Authorization": f"Bearer {access_token}"})
    r.raise_for_status()
    return r.json()


async def add_member_to_guild(discord_id: str, access_token: str) -> bool:
    """Dodaje usera na serwer (jeśli jeszcze nie jest) — wymaga scope guilds.join."""
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.put(f"{API}/guilds/{GUILD_ID}/members/{discord_id}",
                        headers={"Authorization": f"Bot {BOT_TOKEN}",
                                 "Content-Type": "application/json"},
                        json={"access_token": access_token})
    # 201 = dodano, 204 = już był na serwerze
    if r.status_code in (201, 204):
        return True
    logger.warning("add_member_to_guild %s -> %s %s", discord_id, r.status_code, r.text)
    return False


async def add_role(discord_id: str) -> bool:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.put(f"{API}/guilds/{GUILD_ID}/members/{discord_id}/roles/{CUSTOMER_ROLE_ID}",
                        headers={"Authorization": f"Bot {BOT_TOKEN}"})
    if r.status_code in (201, 204):
        return True
    logger.warning("add_role %s -> %s %s", discord_id, r.status_code, r.text)
    return False


async def remove_role(discord_id: str) -> bool:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.delete(f"{API}/guilds/{GUILD_ID}/members/{discord_id}/roles/{CUSTOMER_ROLE_ID}",
                           headers={"Authorization": f"Bot {BOT_TOKEN}"})
    if r.status_code in (201, 204, 404):
        return True
    logger.warning("remove_role %s -> %s %s", discord_id, r.status_code, r.text)
    return False
