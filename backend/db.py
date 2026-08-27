"""Supabase (Postgres + Storage) data layer for BratClient."""
from dotenv import load_dotenv
load_dotenv()

import os
import logging
from datetime import datetime, timezone

from fastapi import Request
from supabase import acreate_client, AsyncClient

logger = logging.getLogger("bratclient.db")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUILD_BUCKET = os.environ.get("SUPABASE_BUILD_BUCKET", "builds")
BUILD_PATH = "bratclient/client.exe"

_client: AsyncClient | None = None


async def sb() -> AsyncClient:
    global _client
    if _client is None:
        _client = await acreate_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _client


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_dt(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for") or request.headers.get("x-real-ip")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def is_unique_violation(err: Exception) -> bool:
    return "23505" in str(getattr(err, "code", "")) or "duplicate key" in str(err).lower()


async def ensure_bucket():
    client = await sb()
    try:
        buckets = await client.storage.list_buckets()
        if any(getattr(b, "id", None) == BUILD_BUCKET or (isinstance(b, dict) and b.get("id") == BUILD_BUCKET) for b in buckets):
            return
        await client.storage.create_bucket(
            BUILD_BUCKET, options={"public": False, "file_size_limit": 209715200})
        logger.info("Storage bucket '%s' created", BUILD_BUCKET)
    except Exception as e:
        logger.warning("bucket ensure failed: %s", e)


async def upload_build(data: bytes, path: str | None = None,
                       content_type: str = "application/octet-stream") -> str:
    client = await sb()
    target = path or BUILD_PATH
    await client.storage.from_(BUILD_BUCKET).upload(
        target, data, {"content-type": content_type, "x-upsert": "true"})
    return target


async def delete_build(path: str):
    client = await sb()
    try:
        await client.storage.from_(BUILD_BUCKET).remove([path])
    except Exception as e:
        logger.warning("storage delete failed for %s: %s", path, e)


async def download_build(path: str | None = None) -> bytes:
    client = await sb()
    return await client.storage.from_(BUILD_BUCKET).download(path or BUILD_PATH)


async def db_ready() -> bool:
    try:
        client = await sb()
        await client.table("users").select("id").limit(1).execute()
        return True
    except Exception as e:
        logger.error("Supabase schema not ready: %s", e)
        return False
