"""Test helper: clear login_attempts rows so QA runs are not blocked by lockout."""
import asyncio
import sys
sys.path.insert(0, "/app/backend")
from db import sb


async def main():
    client = await sb()
    res = await client.table("login_attempts").select("key,count").execute()
    print("rows before:", res.data)
    for row in res.data:
        await client.table("login_attempts").delete().eq("key", row["key"]).execute()
    print("cleared", len(res.data))


asyncio.run(main())
