"""BratClient — bot obecności Discord (24/7 online + status).

To jest LEKKI bot, którego jedynym zadaniem jest być online z ładnym statusem.
Nadawanie/zabieranie ról robi backend przez REST (discord_integration.py) — bot
tego nie duplikuje, żeby nie było dwóch źródeł prawdy.
"""
from dotenv import load_dotenv
load_dotenv()

import os
import logging
import discord

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bratclient.bot")

TOKEN = os.environ["DISCORD_BOT_TOKEN"]
# Tekst statusu (np. "bloodnetauth.wtf"). Zmień wedle uznania.
STATUS_TEXT = os.environ.get("DISCORD_STATUS_TEXT", "bloodnetauth.wtf")
# Typ aktywności: playing | watching | listening | competing
ACTIVITY_KIND = os.environ.get("DISCORD_ACTIVITY_KIND", "watching").lower()

_ACTIVITY_MAP = {
    "playing": discord.ActivityType.playing,
    "watching": discord.ActivityType.watching,
    "listening": discord.ActivityType.listening,
    "competing": discord.ActivityType.competing,
}

intents = discord.Intents.default()  # domyślne wystarczą do samej obecności
client = discord.Client(intents=intents)


@client.event
async def on_ready():
    activity = discord.Activity(
        type=_ACTIVITY_MAP.get(ACTIVITY_KIND, discord.ActivityType.watching),
        name=STATUS_TEXT,
    )
    await client.change_presence(status=discord.Status.online, activity=activity)
    logger.info("Bot online jako %s | status: %s %s", client.user, ACTIVITY_KIND, STATUS_TEXT)


if __name__ == "__main__":
    client.run(TOKEN, log_handler=None)
