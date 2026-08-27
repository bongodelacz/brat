from dotenv import load_dotenv
load_dotenv()

import os
import io
import re
import hmac
import json
import asyncio
import hashlib
import secrets
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
from fastapi import (FastAPI, APIRouter, HTTPException, Request, Response, Depends,
                     UploadFile, File, Form)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

from db import (sb, now_iso, parse_dt, client_ip, is_unique_violation, ensure_bucket,
                upload_build, download_build, delete_build, db_ready)
from emails import send_email, twofa_code_email, purchase_email
import discord_integration as discord
from fastapi.responses import RedirectResponse

logger = logging.getLogger("bratclient")
logging.basicConfig(level=logging.INFO)

JWT_ALG = "HS256"
ACCESS_TTL = timedelta(minutes=60)
REFRESH_TTL = timedelta(days=30)
TWOFA_TTL = timedelta(minutes=10)
TWOFA_MAX_ATTEMPTS = 5

PLANS = {
    "30d": {"label_pl": "30 dni", "label_en": "30 days", "days": 30, "price": 50},
    "90d": {"label_pl": "90 dni", "label_en": "90 days", "days": 90, "price": 80},
    "lifetime": {"label_pl": "Lifetime", "label_en": "Lifetime", "days": None, "price": 100},
}
ADDONS = {
    "hwid_reset": {"price": 20, "label": "HWID Reset"},
    "tester": {"price": 25, "label": "Tester"},
}
ORDER_STATUSES = ["pending", "completed", "refunded", "cancelled"]
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() == "true"
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
# Wymuszenie 2FA e-mailem dla adminów. Ustaw na "false", jeśli nie masz jeszcze
# skonfigurowanego RESEND_API_KEY — inaczej nie zalogujesz się do panelu admina.
REQUIRE_ADMIN_2FA = os.environ.get("REQUIRE_ADMIN_2FA", "true").lower() == "true"


# ---------------------------------------------------------------- helpers

def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_pw(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except ValueError:
        return False


def sha(v: str) -> str:
    return hashlib.sha256(v.encode()).hexdigest()


def validate_password(pw: str):
    if len(pw) < 8:
        raise HTTPException(400, "Hasło musi mieć min. 8 znaków / Password must be at least 8 characters")
    if not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw):
        raise HTTPException(400, "Hasło musi zawierać literę i cyfrę / Password needs a letter and a digit")


def make_access(uid: str) -> str:
    return jwt.encode({"sub": uid, "type": "access",
                       "exp": datetime.now(timezone.utc) + ACCESS_TTL},
                      os.environ["JWT_SECRET"], algorithm=JWT_ALG)


def set_auth_cookie(response: Response, token: str):
    response.set_cookie("access_token", token, httponly=True, secure=COOKIE_SECURE,
                        samesite="none" if COOKIE_SECURE else "lax",
                        max_age=int(ACCESS_TTL.total_seconds()), path="/")


def pub_user(u: dict) -> dict:
    out = dict(u)
    out.pop("password_hash", None)
    return out


def num(v) -> float:
    return round(float(v or 0), 2)


def safe_q(q: str) -> str:
    return "".join(c for c in q if c not in ',()*"\'\\%')[:60]


def mask_email(email: str) -> str:
    name, _, domain = email.partition("@")
    keep = name[:2] if len(name) > 2 else name[:1]
    return f"{keep}{'*' * max(3, len(name) - len(keep))}@{domain}"


async def rows(query):
    res = await query.execute()
    return res.data or []


async def one(query):
    data = await rows(query.limit(1))
    return data[0] if data else None


async def count(table: str) -> int:
    client = await sb()
    res = await client.table(table).select("id", count="exact").limit(1).execute()
    return res.count or 0


async def rate_limit(request: Request, bucket: str, limit: int, window_sec: int = 60):
    client = await sb()
    ip = client_ip(request)
    since = (datetime.now(timezone.utc) - timedelta(seconds=window_sec)).isoformat()
    await client.table("rate_events").insert({"bucket": bucket, "ip": ip, "ts": now_iso()}).execute()
    res = await client.table("rate_events").select("id", count="exact") \
        .eq("bucket", bucket).eq("ip", ip).gt("ts", since).limit(1).execute()
    if (res.count or 0) > limit:
        raise HTTPException(429, "Zbyt wiele żądań, spróbuj później / Too many requests")


async def get_user_by_id(uid: str) -> dict | None:
    client = await sb()
    try:
        return await one(client.table("users").select("*").eq("id", uid))
    except Exception:
        return None


async def active_license(user_id: str) -> dict | None:
    client = await sb()
    return await one(client.table("licenses").select("*")
                     .eq("user_id", user_id).eq("status", "active")
                     .or_(f"expires_at.is.null,expires_at.gt.{now_iso()}")
                     .order("created_at", desc=True))


async def current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    ah = request.headers.get("Authorization", "")
    if ah.startswith("Bearer "):
        token = ah[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(401, "Invalid token type")
    u = await get_user_by_id(payload["sub"])
    if not u:
        raise HTTPException(401, "User not found")
    if u.get("blocked"):
        raise HTTPException(403, "Account blocked")
    return u


async def require_admin(u=Depends(current_user)) -> dict:
    if u.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    return u


async def log_admin(admin: dict, action: str, request: Request,
                    target: str | None = None, details: dict | None = None):
    client = await sb()
    try:
        await client.table("admin_logs").insert({
            "admin_id": admin["id"], "admin_username": admin.get("username"),
            "action": action, "target": target, "details": details,
            "ip": client_ip(request), "ts": now_iso()}).execute()
    except Exception as e:
        logger.warning("admin log failed: %s", e)


# ---------------------------------------------------------------- tokens

async def issue_refresh(user_id: str, request: Request) -> str:
    client = await sb()
    token = secrets.token_urlsafe(48)
    await client.table("refresh_tokens").insert({
        "user_id": user_id, "token_hash": sha(token), "ip": client_ip(request),
        "user_agent": (request.headers.get("user-agent") or "")[:200],
        "expires_at": (datetime.now(timezone.utc) + REFRESH_TTL).isoformat(),
        "created_at": now_iso()}).execute()
    return token


async def auth_payload(user: dict, request: Request, response: Response) -> dict:
    client = await sb()
    access = make_access(user["id"])
    refresh = await issue_refresh(user["id"], request)
    set_auth_cookie(response, access)
    await client.table("users").update({
        "last_login_at": now_iso(), "last_login_ip": client_ip(request)}) \
        .eq("id", user["id"]).execute()
    return {"user": pub_user(user), "token": access, "refresh_token": refresh,
            "expires_in": int(ACCESS_TTL.total_seconds())}


# ---------------------------------------------------------------- 2FA

async def create_twofa(user: dict, purpose: str, request: Request) -> str:
    client = await sb()
    code = f"{secrets.randbelow(1000000):06d}"
    res = await client.table("two_factor_codes").insert({
        "user_id": user["id"], "code_hash": sha(code), "purpose": purpose,
        "ip": client_ip(request), "used": False, "attempts": 0,
        "expires_at": (datetime.now(timezone.utc) + TWOFA_TTL).isoformat(),
        "created_at": now_iso()}).execute()
    subject, html = twofa_code_email(user["username"], code, purpose)
    await send_email(to=user["email"], subject=subject, html=html)
    return res.data[0]["id"]


async def consume_twofa(challenge_id: str, code: str, purpose: str) -> dict:
    client = await sb()
    ch = await one(client.table("two_factor_codes").select("*").eq("id", challenge_id))
    if not ch or ch["purpose"] != purpose:
        raise HTTPException(400, "INVALID_CHALLENGE")
    if ch["used"]:
        raise HTTPException(400, "CODE_USED")
    if parse_dt(ch["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(400, "CODE_EXPIRED")
    if ch["attempts"] >= TWOFA_MAX_ATTEMPTS:
        raise HTTPException(429, "TOO_MANY_ATTEMPTS")
    if not hmac.compare_digest(ch["code_hash"], sha(code.strip())):
        await client.table("two_factor_codes").update({"attempts": ch["attempts"] + 1}) \
            .eq("id", challenge_id).execute()
        raise HTTPException(400, "INVALID_CODE")
    await client.table("two_factor_codes").update({"used": True}).eq("id", challenge_id).execute()
    user = await get_user_by_id(ch["user_id"])
    if not user:
        raise HTTPException(400, "INVALID_CHALLENGE")
    return user


# ---------------------------------------------------------------- models

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    username: str = Field(min_length=3, max_length=20, pattern=r"^[A-Za-z0-9_.\-]+$")


class LoginIn(BaseModel):
    email: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=72)


class TwoFAVerifyIn(BaseModel):
    challenge_id: str
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class TwoFACodeIn(BaseModel):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    challenge_id: str


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=10, max_length=200)


class ProfileIn(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=20, pattern=r"^[A-Za-z0-9_.\-]+$")
    about: str | None = Field(default=None, max_length=300)
    language: str | None = Field(default=None, pattern="^(pl|en)$")
    avatar: str | None = Field(default=None, max_length=400_000)


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=72)


class PurchaseIn(BaseModel):
    plan: str
    coupon: str | None = Field(default=None, max_length=40)


class AddonIn(BaseModel):
    addon: str
    coupon: str | None = Field(default=None, max_length=40)


class CouponCheckIn(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    item_type: str = Field(pattern="^(plan|addon)$")
    item_id: str


class CouponIn(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    type: str = Field(pattern="^(percent|fixed)$")
    value: float = Field(gt=0, le=100000)
    max_uses: int = Field(default=0, ge=0, le=100000)
    expires_at: str | None = None


class CouponPatch(BaseModel):
    active: bool


class GrantIn(BaseModel):
    plan: str | None = None
    days: int | None = Field(default=None, ge=1, le=3650)


class TrackIn(BaseModel):
    path: str = Field(max_length=200)


class OrderPatch(BaseModel):
    status: str


class VersionIn(BaseModel):
    version: str = Field(min_length=1, max_length=20)
    notes: str | None = Field(default=None, max_length=500)
    mandatory: bool = True


class BuildPatch(BaseModel):
    is_active: bool | None = None
    blocked: bool | None = None
    mandatory: bool | None = None
    version: str | None = Field(default=None, min_length=1, max_length=20)
    notes: str | None = Field(default=None, max_length=500)


class ConfigPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=300)
    is_public: bool | None = None


CONFIG_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CONFIG_MAX_BYTES = 512 * 1024


def new_config_code() -> str:
    return "".join(secrets.choice(CONFIG_ALPHABET) for _ in range(5))


def public_config(c: dict, include_settings: bool = False) -> dict:
    out = {
        "id": c["id"], "code": c["code"], "name": c["name"],
        "description": c.get("description"), "author": c.get("author"),
        "modules_count": c.get("modules_count", 0), "client_version": c.get("client_version"),
        "is_public": c.get("is_public", True), "downloads": c.get("downloads", 0),
        "size_bytes": c.get("size_bytes", 0), "created_at": c.get("created_at"),
        "updated_at": c.get("updated_at"),
    }
    if include_settings:
        out["settings"] = c.get("settings")
    return out


# ---------------------------------------------------------------- shop logic

def new_license(user_id: str, plan_id: str, custom_days: int | None = None) -> dict:
    now = datetime.now(timezone.utc)
    key = "BRAT-" + "-".join(secrets.token_hex(2).upper() for _ in range(3))
    if plan_id == "custom":
        return {"user_id": user_id, "plan": "custom", "days": custom_days, "key": key,
                "price_pln": 0, "created_at": now.isoformat(),
                "expires_at": (now + timedelta(days=custom_days)).isoformat(),
                "status": "active"}
    plan = PLANS[plan_id]
    return {"user_id": user_id, "plan": plan_id, "days": plan["days"], "key": key,
            "price_pln": plan["price"], "created_at": now.isoformat(),
            "expires_at": (now + timedelta(days=plan["days"])).isoformat() if plan["days"] else None,
            "status": "active"}


def coupon_discount(coupon: dict, amount: float) -> float:
    if coupon["type"] == "percent":
        d = round(amount * float(coupon["value"]) / 100, 2)
    else:
        d = float(coupon["value"])
    return max(0.0, min(round(d, 2), float(amount)))


async def resolve_coupon(code: str | None, amount: float):
    if not code:
        return None, 0.0
    client = await sb()
    c = await one(client.table("coupons").select("*").eq("code", code.strip().upper()))
    if not c or not c.get("active", True):
        raise HTTPException(400, "Kupon nieprawidłowy / Invalid coupon")
    exp = parse_dt(c.get("expires_at"))
    if exp and exp < datetime.now(timezone.utc):
        raise HTTPException(400, "Kupon wygasł / Coupon expired")
    if c.get("max_uses", 0) and c.get("uses", 0) >= c["max_uses"]:
        raise HTTPException(400, "Limit użyć kuponu wyczerpany / Coupon usage limit reached")
    return c, coupon_discount(c, amount)


def item_price(item_type: str, item_id: str) -> tuple[float, str]:
    if item_type == "plan":
        if item_id not in PLANS:
            raise HTTPException(400, "Unknown plan")
        return float(PLANS[item_id]["price"]), PLANS[item_id]["label_pl"]
    if item_id not in ADDONS:
        raise HTTPException(400, "Unknown addon")
    return float(ADDONS[item_id]["price"]), ADDONS[item_id]["label"]


async def create_order(user: dict, item_type: str, item_id: str, item_label: str,
                       subtotal: float, discount: float, coupon: dict | None,
                       method: str = "DEMO", ref_id: str | None = None) -> dict:
    client = await sb()
    order = {
        "order_id": "BRAT-" + secrets.token_hex(4).upper(),
        "user_id": user["id"], "email": user["email"], "username": user.get("username"),
        "method": method, "item_type": item_type, "item_id": item_id, "item": item_label,
        "subtotal": num(subtotal), "discount": num(discount),
        "total": num(max(0.0, subtotal - discount)), "currency": "PLN",
        "coupon": coupon["code"] if coupon else None, "status": "completed",
        "ref_id": ref_id, "created_at": now_iso(),
    }
    res = await client.table("orders").insert(order).execute()
    created = res.data[0]
    if coupon:
        await client.table("coupons").update({"uses": (coupon.get("uses") or 0) + 1}) \
            .eq("id", coupon["id"]).execute()
    return created


async def notify_purchase(user: dict, order: dict, license_key: str | None,
                          expires_at: str | None):
    try:
        subject, html = purchase_email(user["username"], order["item"], float(order["total"]),
                                       order["order_id"], license_key, expires_at)
        await send_email(to=user["email"], subject=subject, html=html)
    except Exception as e:
        logger.warning("purchase email failed: %s", e)


# ---------------------------------------------------------------- builds

async def active_build() -> dict:
    client = await sb()
    return await one(client.table("builds").select("*").eq("is_active", True)
                     .order("uploaded_at", desc=True)) or {}


# ---------------------------------------------------------------- app

@asynccontextmanager
async def lifespan(app: FastAPI):
    if await db_ready():
        await ensure_bucket()
        await seed()
        if discord.is_configured():
            asyncio.create_task(discord_role_loop())
            logger.info("Discord role sync loop started")
        logger.info("BratClient backend ready (Supabase)")
    else:
        logger.error("SUPABASE SCHEMA MISSING — run backend/supabase_schema.sql")
    yield


async def discord_role_loop():
    """Co 30 min: nadaje rolę aktywnym licencjom, zabiera wygasłym."""
    while True:
        try:
            await asyncio.sleep(1800)
            client = await sb()
            linked = await rows(client.table("users").select("*").not_.is_("discord_id", "null"))
            for user in linked:
                await sync_discord_role(user)
        except Exception as e:
            logger.warning("discord_role_loop error: %s", e)



app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
api = APIRouter(prefix="/api")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    response.headers["Cross-Origin-Resource-Policy"] = "same-site"
    return response


@api.get("/health")
async def health():
    ok = await db_ready()
    return {"status": "ok" if ok else "db_schema_missing", "database": "supabase"}


# ---------------------------------------------------------------- auth

@api.post("/auth/register")
async def register(body: RegisterIn, request: Request, response: Response):
    await rate_limit(request, "register", 5, 600)
    validate_password(body.password)
    client = await sb()
    email = body.email.lower()
    if await one(client.table("users").select("id").eq("email", email)):
        raise HTTPException(409, "Email already registered")
    if await one(client.table("users").select("id").eq("username", body.username)):
        raise HTTPException(409, "Username already taken")
    doc = {
        "email": email, "password_hash": hash_pw(body.password), "username": body.username,
        "uid": "BRAT-" + secrets.token_hex(3).upper(), "about": "", "language": "pl",
        "role": "user", "created_at": now_iso(), "password_changed_at": now_iso(),
    }
    try:
        res = await client.table("users").insert(doc).execute()
    except Exception as e:
        if is_unique_violation(e):
            raise HTTPException(409, "Email already registered")
        raise
    return await auth_payload(res.data[0], request, response)


@api.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    await rate_limit(request, "login", 10, 60)
    client = await sb()
    ident = body.email.strip()
    key = f"{client_ip(request)}:{ident.lower()}"[:200]
    att = await one(client.table("login_attempts").select("*").eq("key", key))
    if att and (att.get("count") or 0) >= 5:
        locked = parse_dt(att.get("locked_until"))
        if locked and locked > datetime.now(timezone.utc):
            raise HTTPException(429, "Zbyt wiele prób. Spróbuj za 15 minut / Too many attempts")
    u = await one(client.table("users").select("*")
                  .or_(f"email.eq.{ident.lower()},username.eq.{ident}"))
    if not u or not verify_pw(body.password, u["password_hash"]):
        await client.table("login_attempts").upsert({
            "key": key, "count": ((att or {}).get("count") or 0) + 1,
            "locked_until": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
        }).execute()
        raise HTTPException(401, "Invalid credentials")
    if u.get("blocked"):
        raise HTTPException(403, "Account blocked")
    await client.table("login_attempts").delete().eq("key", key).execute()

    if u.get("twofa_enabled") or (REQUIRE_ADMIN_2FA and u.get("role") == "admin"):
        challenge_id = await create_twofa(u, "login", request)
        return {"twofa_required": True, "challenge_id": challenge_id,
                "email_hint": mask_email(u["email"])}
    return await auth_payload(u, request, response)


@api.post("/auth/2fa/verify")
async def twofa_verify(body: TwoFAVerifyIn, request: Request, response: Response):
    await rate_limit(request, "2fa", 15, 300)
    user = await consume_twofa(body.challenge_id, body.code, "login")
    if user.get("blocked"):
        raise HTTPException(403, "Account blocked")
    return await auth_payload(user, request, response)


@api.post("/auth/refresh")
async def refresh_token(body: RefreshIn, request: Request, response: Response):
    await rate_limit(request, "refresh", 60, 60)
    client = await sb()
    row = await one(client.table("refresh_tokens").select("*").eq("token_hash", sha(body.refresh_token)))
    if not row or row["revoked"] or parse_dt(row["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(401, "Invalid refresh token")
    await client.table("refresh_tokens").update({"revoked": True}).eq("id", row["id"]).execute()
    u = await get_user_by_id(row["user_id"])
    if not u or u.get("blocked"):
        raise HTTPException(401, "Invalid refresh token")
    access = make_access(u["id"])
    new_refresh = await issue_refresh(u["id"], request)
    set_auth_cookie(response, access)
    return {"user": pub_user(u), "token": access, "refresh_token": new_refresh,
            "expires_in": int(ACCESS_TTL.total_seconds())}


@api.post("/auth/logout")
async def logout(request: Request, response: Response):
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    token = (body or {}).get("refresh_token")
    if token:
        client = await sb()
        await client.table("refresh_tokens").update({"revoked": True}) \
            .eq("token_hash", sha(token)).execute()
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(u=Depends(current_user)):
    return pub_user(u)


@api.get("/plans")
async def plans():
    return [{"id": k, **v} for k, v in PLANS.items()]


@api.post("/track")
async def track(body: TrackIn, request: Request):
    client = await sb()
    await client.table("visits").insert({
        "ip": client_ip(request), "path": body.path, "ts": now_iso()}).execute()
    return {"ok": True}


# ---------------------------------------------------------------- user

@api.patch("/users/me")
async def update_profile(body: ProfileIn, u=Depends(current_user)):
    client = await sb()
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if upd.get("username") and upd["username"] != u["username"]:
        if await one(client.table("users").select("id").eq("username", upd["username"])):
            raise HTTPException(409, "Username already taken")
    if upd:
        res = await client.table("users").update(upd).eq("id", u["id"]).execute()
        if res.data:
            return pub_user(res.data[0])
    return pub_user(u)


@api.post("/users/me/password")
async def change_password(body: PasswordIn, request: Request, u=Depends(current_user)):
    await rate_limit(request, "password", 10, 600)
    if not verify_pw(body.current_password, u["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    validate_password(body.new_password)
    client = await sb()
    await client.table("users").update({
        "password_hash": hash_pw(body.new_password),
        "password_changed_at": now_iso()}).eq("id", u["id"]).execute()
    await client.table("refresh_tokens").update({"revoked": True}).eq("user_id", u["id"]).execute()
    return {"ok": True}


@api.post("/users/me/discord/toggle")
async def toggle_discord(u=Depends(current_user)):
    # Zachowane dla kompatybilności: pozwala tylko ROZŁĄCZYĆ Discord.
    # Łączenie idzie przez prawdziwy OAuth (/discord/connect).
    client = await sb()
    if u.get("discord_id"):
        await client.table("users").update({
            "discord_connected": False, "discord_id": None, "discord_username": None,
            "discord_role_active": False}).eq("id", u["id"]).execute()
        if discord.is_configured():
            try:
                await discord.remove_role(u["discord_id"])
            except Exception as e:
                logger.warning("discord role remove failed: %s", e)
    return {"discord_connected": False}


# ---------------------------------------------------------------- Discord OAuth

async def sync_discord_role(user: dict) -> bool:
    """Nadaje rolę gdy licencja aktywna, zabiera gdy brak. Zwraca aktualny stan roli."""
    if not discord.is_configured() or not user.get("discord_id"):
        return False
    client = await sb()
    lic = await active_license(user["id"])
    want = bool(lic)
    has = bool(user.get("discord_role_active"))
    try:
        if want and not has:
            await discord.add_role(user["discord_id"])
        elif not want and has:
            await discord.remove_role(user["discord_id"])
    except Exception as e:
        logger.warning("sync_discord_role failed: %s", e)
        return has
    if want != has:
        await client.table("users").update({"discord_role_active": want}).eq("id", user["id"]).execute()
    return want


@api.get("/discord/connect")
async def discord_connect(u=Depends(current_user)):
    if not discord.is_configured():
        raise HTTPException(503, "Discord integration not configured")
    # state = podpisany JWT z id usera (chroni przed CSRF, wiąże callback z kontem)
    state = jwt.encode({"sub": u["id"], "type": "discord_state",
                        "exp": datetime.now(timezone.utc) + timedelta(minutes=10)},
                       os.environ["JWT_SECRET"], algorithm=JWT_ALG)
    return {"url": discord.oauth_url(state)}


@api.get("/discord/callback")
async def discord_callback(code: str | None = None, state: str | None = None):
    front = (os.environ.get("PUBLIC_APP_URL", "") or "").rstrip("/")
    dest = f"{front}/panel"
    if not code or not state:
        return RedirectResponse(f"{dest}?discord=error")
    try:
        payload = jwt.decode(state, os.environ["JWT_SECRET"], algorithms=[JWT_ALG])
        if payload.get("type") != "discord_state":
            raise ValueError("bad state")
        user_id = payload["sub"]
    except Exception:
        return RedirectResponse(f"{dest}?discord=error")

    client = await sb()
    u = await get_user_by_id(user_id)
    if not u:
        return RedirectResponse(f"{dest}?discord=error")
    try:
        tok = await discord.exchange_code(code)
        access = tok["access_token"]
        d_user = await discord.get_discord_user(access)
        discord_id = d_user["id"]
        dname = d_user.get("username") or ""
        # jedno konto Discord = jedno konto BratClient
        taken = await one(client.table("users").select("id").eq("discord_id", discord_id))
        if taken and taken["id"] != user_id:
            return RedirectResponse(f"{dest}?discord=taken")
        await discord.add_member_to_guild(discord_id, access)
        await client.table("users").update({
            "discord_id": discord_id, "discord_username": dname,
            "discord_connected": True, "discord_linked_at": now_iso()}).eq("id", user_id).execute()
        u["discord_id"] = discord_id
        u["discord_role_active"] = False
        await sync_discord_role(u)
        return RedirectResponse(f"{dest}?discord=connected")
    except Exception as e:
        logger.error("discord callback failed: %s", e)
        return RedirectResponse(f"{dest}?discord=error")


@api.post("/discord/disconnect")
async def discord_disconnect(u=Depends(current_user)):
    client = await sb()
    if u.get("discord_id") and discord.is_configured():
        try:
            await discord.remove_role(u["discord_id"])
        except Exception as e:
            logger.warning("discord disconnect role remove failed: %s", e)
    await client.table("users").update({
        "discord_connected": False, "discord_id": None, "discord_username": None,
        "discord_role_active": False}).eq("id", u["id"]).execute()
    return {"discord_connected": False}



@api.post("/users/me/2fa/request")
async def twofa_request(request: Request, u=Depends(current_user)):
    await rate_limit(request, "2fa-setup", 5, 600)
    if u.get("role") == "admin" and u.get("twofa_enabled"):
        raise HTTPException(400, "2FA jest wymagane dla konta admina / 2FA is mandatory for admins")
    purpose = "disable" if u.get("twofa_enabled") else "enable"
    challenge_id = await create_twofa(u, purpose, request)
    return {"challenge_id": challenge_id, "purpose": purpose,
            "email_hint": mask_email(u["email"])}


@api.post("/users/me/2fa/confirm")
async def twofa_confirm(body: TwoFACodeIn, u=Depends(current_user)):
    purpose = "disable" if u.get("twofa_enabled") else "enable"
    user = await consume_twofa(body.challenge_id, body.code, purpose)
    if user["id"] != u["id"]:
        raise HTTPException(403, "Forbidden")
    client = await sb()
    enabled = purpose == "enable"
    await client.table("users").update({"twofa_enabled": enabled, "twofa_method": "email"}) \
        .eq("id", u["id"]).execute()
    return {"twofa_enabled": enabled}


@api.post("/users/me/hwid/reset")
async def hwid_reset(u=Depends(current_user)):
    client = await sb()
    now = datetime.now(timezone.utc)
    lic = await active_license(u["id"])
    if not lic:
        raise HTTPException(403, "Active license required")
    credits = u.get("hwid_credits") or 0
    last = parse_dt(u.get("hwid_last_reset"))
    if lic["plan"] == "lifetime":
        if last and last + timedelta(days=7) > now:
            raise HTTPException(429, "Free reset available every 7 days")
    else:
        if credits <= 0:
            raise HTTPException(402, "No HWID reset credits")
        credits -= 1
    await client.table("users").update({
        "hwid": None, "hwid_bound": False, "hwid_credits": credits,
        "hwid_last_reset": now.isoformat()}).eq("id", u["id"]).execute()
    await client.table("client_sessions").delete().eq("user_id", u["id"]).execute()
    return {"hwid": None, "hwid_bound": False,
            "hwid_last_reset": now.isoformat(), "hwid_credits": credits}


# ---------------------------------------------------------------- shop

@api.post("/coupons/validate")
async def validate_coupon(body: CouponCheckIn, request: Request, _=Depends(current_user)):
    await rate_limit(request, "coupon", 20, 60)
    amount, label = item_price(body.item_type, body.item_id)
    c, discount = await resolve_coupon(body.code, amount)
    return {"code": c["code"], "type": c["type"], "value": float(c["value"]),
            "subtotal": amount, "discount": discount,
            "total": num(amount - discount), "item": label}


@api.post("/licenses/purchase")
async def purchase(body: PurchaseIn, request: Request, u=Depends(current_user)):
    await rate_limit(request, "purchase", 15, 300)
    if body.plan not in PLANS:
        raise HTTPException(400, "Unknown plan")
    client = await sb()
    amount, label = item_price("plan", body.plan)
    coupon, discount = await resolve_coupon(body.coupon, amount)
    res = await client.table("licenses").insert(new_license(u["id"], body.plan)).execute()
    lic = res.data[0]
    order = await create_order(u, "plan", body.plan, f"Licencja {label}", amount,
                               discount, coupon, ref_id=lic["id"])
    asyncio.create_task(notify_purchase(u, order, lic["key"], lic.get("expires_at")))
    if u.get("discord_id"):
        asyncio.create_task(sync_discord_role(u))
    return {"license": lic, "order": order}


@api.post("/addons/purchase")
async def purchase_addon(body: AddonIn, request: Request, u=Depends(current_user)):
    await rate_limit(request, "purchase", 15, 300)
    if body.addon not in ADDONS:
        raise HTTPException(400, "Unknown addon")
    client = await sb()
    amount, label = item_price("addon", body.addon)
    coupon, discount = await resolve_coupon(body.coupon, amount)
    ares = await client.table("addons").insert({
        "user_id": u["id"], "addon": body.addon, "price_pln": amount,
        "created_at": now_iso()}).execute()
    if body.addon == "hwid_reset":
        await client.table("users").update({"hwid_credits": (u.get("hwid_credits") or 0) + 1}) \
            .eq("id", u["id"]).execute()
    elif body.addon == "tester":
        await client.table("users").update({"tester": True}).eq("id", u["id"]).execute()
    order = await create_order(u, "addon", body.addon, label, amount, discount,
                               coupon, ref_id=ares.data[0]["id"])
    asyncio.create_task(notify_purchase(u, order, None, None))
    return {"ok": True, "order": order}


@api.get("/licenses/my")
async def my_licenses(u=Depends(current_user)):
    client = await sb()
    out = await rows(client.table("licenses").select("*").eq("user_id", u["id"])
                     .order("created_at", desc=True))
    now = datetime.now(timezone.utc)
    for d in out:
        exp = parse_dt(d.get("expires_at"))
        if exp and exp < now:
            d["status"] = "expired"
    return out


@api.get("/orders/my")
async def my_orders(u=Depends(current_user)):
    client = await sb()
    return await rows(client.table("orders").select("*").eq("user_id", u["id"])
                      .order("created_at", desc=True))


@api.get("/payments/my")
async def my_payments(u=Depends(current_user)):
    return await my_orders(u)


# ---------------------------------------------------------------- build / download

@api.get("/build/info")
async def build_info():
    b = await active_build()
    return {"filename": b.get("filename"), "size": b.get("size"),
            "uploaded_at": b.get("uploaded_at"), "version": b.get("version"),
            "notes": b.get("notes"), "mandatory": b.get("mandatory", True),
            "blocked": bool(b.get("blocked")), "available": bool(b) and not b.get("blocked")}


@api.get("/download/client")
async def download_client(u=Depends(current_user)):
    lic = await active_license(u["id"])
    if not lic:
        raise HTTPException(403, "Active license required")
    b = await active_build()
    if b.get("blocked"):
        raise HTTPException(423, "BUILD_BLOCKED")
    if b.get("path"):
        try:
            data = await download_build(b["path"])
            return Response(content=data, media_type="application/octet-stream",
                            headers={"Content-Disposition": f'attachment; filename="{b["filename"]}"'})
        except Exception as e:
            logger.error("build fetch failed: %s", e)
    version = b.get("version") or "1.0.0"
    payload = (b"MZ" + b"\x90\x00" + b"\x00" * 60 +
               f"\nBRATCLIENT v{version} - DEMO BUILD PLACEHOLDER\n"
               f"Licensed to: {u['username']} ({u['uid']})\n"
               f"License key: {lic['key']}\nPlan: {lic['plan']}\n".encode())
    return StreamingResponse(io.BytesIO(payload), media_type="application/octet-stream",
                             headers={"Content-Disposition": f'attachment; filename="BratClient-Setup-v{version}.exe"'})


# ---------------------------------------------------------------- configs (panel)

@api.get("/configs/my")
async def my_configs(u=Depends(current_user)):
    client = await sb()
    data = await rows(client.table("configs").select("*").eq("user_id", u["id"])
                      .order("updated_at", desc=True))
    return [public_config(c) for c in data]


@api.get("/configs/{code}")
async def get_config(code: str, u=Depends(current_user)):
    client = await sb()
    c = await one(client.table("configs").select("*").eq("code", code.strip().upper().lstrip("#")))
    if not c:
        raise HTTPException(404, "CONFIG_NOT_FOUND")
    if not c.get("is_public") and c.get("user_id") != u["id"]:
        raise HTTPException(403, "CONFIG_PRIVATE")
    return public_config(c, include_settings=True)


@api.patch("/configs/{cid}")
async def patch_config(cid: str, body: ConfigPatch, u=Depends(current_user)):
    client = await sb()
    c = await one(client.table("configs").select("*").eq("id", cid))
    if not c:
        raise HTTPException(404, "CONFIG_NOT_FOUND")
    if c.get("user_id") != u["id"]:
        raise HTTPException(403, "Forbidden")
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if not upd:
        return public_config(c)
    upd["updated_at"] = now_iso()
    res = await client.table("configs").update(upd).eq("id", cid).execute()
    return public_config(res.data[0])


@api.delete("/configs/{cid}")
async def delete_config(cid: str, u=Depends(current_user)):
    client = await sb()
    c = await one(client.table("configs").select("id,user_id").eq("id", cid))
    if not c:
        raise HTTPException(404, "CONFIG_NOT_FOUND")
    if c.get("user_id") != u["id"]:
        raise HTTPException(403, "Forbidden")
    await client.table("configs").delete().eq("id", cid).execute()
    return {"ok": True}


# ---------------------------------------------------------------- client API (Minecraft app)

async def client_rate_limit(ip: str, bucket: str, limit: int = 90):
    client = await sb()
    since = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
    await client.table("client_rate").insert({"bucket": bucket, "ip": ip, "ts": now_iso()}).execute()
    res = await client.table("client_rate").select("id", count="exact") \
        .eq("bucket", bucket).eq("ip", ip).gt("ts", since).limit(1).execute()
    if (res.count or 0) > limit:
        raise HTTPException(429, "RATE_LIMITED")


async def cleanup_client_tables():
    client = await sb()
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=300)).isoformat()
    try:
        await client.table("client_nonces").delete().lt("ts", cutoff).execute()
        await client.table("client_rate").delete().lt("ts", cutoff).execute()
        await client.table("rate_events").delete().lt("ts", cutoff).execute()
        old = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        await client.table("client_sessions").delete().lt("created_at", old).execute()
    except Exception as e:
        logger.warning("cleanup failed: %s", e)


async def verify_client_request(request: Request) -> dict:
    client = await sb()
    ip = client_ip(request)
    await client_rate_limit(ip, "req", 90)

    if not hmac.compare_digest(request.headers.get("X-Client-Key", ""), os.environ["CLIENT_API_KEY"]):
        raise HTTPException(401, "BAD_API_KEY")

    raw = await request.body()
    ts = request.headers.get("X-Timestamp", "")
    nonce = request.headers.get("X-Nonce", "")
    sig = request.headers.get("X-Signature", "")
    if not (ts and nonce and sig):
        raise HTTPException(401, "MISSING_SIGNATURE")
    try:
        ts_int = int(ts)
    except ValueError:
        raise HTTPException(401, "BAD_TIMESTAMP")
    if abs(int(datetime.now(timezone.utc).timestamp()) - ts_int) > 120:
        raise HTTPException(401, "STALE_TIMESTAMP")
    if not (8 <= len(nonce) <= 64):
        raise HTTPException(401, "BAD_NONCE")

    expected = hmac.new(os.environ["CLIENT_API_SECRET"].encode(),
                        f"{ts}.{nonce}.".encode() + raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig.lower()):
        raise HTTPException(401, "BAD_SIGNATURE")
    try:
        await client.table("client_nonces").insert({"nonce": nonce, "ts": now_iso()}).execute()
    except Exception as e:
        if is_unique_violation(e):
            raise HTTPException(401, "REPLAY_DETECTED")
        raise

    body = json.loads(raw) if raw else {}
    if not isinstance(body, dict):
        raise HTTPException(400, "BAD_BODY")
    asyncio.create_task(cleanup_client_tables())
    return {"ip": ip, "body": body}


async def log_client(ip: str, result: str, hwid: str | None = None,
                     identifier: str | None = None, version: str | None = None,
                     user_id: str | None = None):
    client = await sb()
    await client.table("client_logs").insert({
        "ip": ip, "result": result, "hwid": hwid, "identifier": identifier,
        "version": version, "user_id": user_id, "ts": now_iso()}).execute()


def client_fail(code: str) -> dict:
    return {"valid": False, "code": code}


@api.post("/client/version")
async def client_version(ctx=Depends(verify_client_request)):
    b = await active_build()
    current = (ctx["body"].get("version") or "").strip()
    server_version = b.get("version") or "1.0.0"
    return {
        "version": server_version,
        "up_to_date": (current == server_version) if current else None,
        "mandatory": b.get("mandatory", True),
        "notes": b.get("notes"),
        "filename": b.get("filename"),
        "size": b.get("size"),
        "uploaded_at": b.get("uploaded_at"),
        "available": bool(b) and not b.get("blocked"),
        "download_page": (os.environ.get("PUBLIC_APP_URL", "") or "") + "/panel",
    }


@api.post("/client/auth")
async def client_auth(ctx=Depends(verify_client_request)):
    client = await sb()
    b, ip = ctx["body"], ctx["ip"]
    hwid = (b.get("hwid") or "").strip()
    version = (b.get("version") or "").strip() or None
    identifier = str(b.get("identifier") or b.get("login") or b.get("username")
                     or b.get("email") or "").strip()
    password = b.get("password") or ""
    license_key = str(b.get("license_key") or b.get("key") or "").strip().upper()
    if not hwid or len(hwid) < 8 or len(hwid) > 128:
        raise HTTPException(400, "BAD_HWID")
    await client_rate_limit(ip, "auth", 20)

    u = None
    if identifier and password:
        cand = await one(client.table("users").select("*")
                         .or_(f"email.eq.{identifier.lower()},username.eq.{identifier}"))
        if cand and verify_pw(password, cand["password_hash"]):
            u = cand
    elif license_key:
        lic = await one(client.table("licenses").select("*").eq("key", license_key))
        if lic:
            u = await get_user_by_id(lic["user_id"])
    if not u:
        await log_client(ip, "INVALID_CREDENTIALS", hwid, identifier or license_key, version)
        return client_fail("INVALID_CREDENTIALS")
    if u.get("blocked"):
        await log_client(ip, "ACCOUNT_BLOCKED", hwid, identifier or license_key, version, u["id"])
        return client_fail("ACCOUNT_BLOCKED")

    lic = await active_license(u["id"])
    if not lic:
        any_lic = await one(client.table("licenses").select("id").eq("user_id", u["id"]))
        code = "LICENSE_EXPIRED" if any_lic else "NO_LICENSE"
        await log_client(ip, code, hwid, identifier or license_key, version, u["id"])
        return client_fail(code)

    bound = u.get("hwid")
    if bound and u.get("hwid_bound"):
        if not hmac.compare_digest(bound, hwid):
            await log_client(ip, "HWID_MISMATCH", hwid, identifier or license_key, version, u["id"])
            return client_fail("HWID_MISMATCH")
        hwid_bound_now = False
    else:
        await client.table("users").update({
            "hwid": hwid, "hwid_bound": True, "hwid_bound_at": now_iso()}) \
            .eq("id", u["id"]).execute()
        hwid_bound_now = True

    build = await active_build()
    server_version = build.get("version") or "1.0.0"
    session_token = secrets.token_urlsafe(32)
    await client.table("client_sessions").insert({
        "token": session_token, "user_id": u["id"], "hwid": hwid, "ip": ip,
        "version": version, "created_at": now_iso()}).execute()
    await log_client(ip, "OK", hwid, identifier or license_key, version, u["id"])
    return {
        "valid": True, "code": "OK",
        "username": u["username"], "uid": u.get("uid"), "email": u["email"],
        "plan": lic["plan"], "license_key": lic["key"], "expires_at": lic.get("expires_at"),
        "tester": u.get("tester", False), "role": u.get("role", "user"),
        "hwid": hwid, "hwid_just_bound": hwid_bound_now,
        "session_token": session_token,
        "latest_version": server_version,
        "version_ok": (version == server_version) if version else None,
        "update_mandatory": build.get("mandatory", True),
        "build_available": bool(build) and not build.get("blocked"),
    }


@api.post("/client/heartbeat")
async def client_heartbeat(ctx=Depends(verify_client_request)):
    client = await sb()
    b, ip = ctx["body"], ctx["ip"]
    token = (b.get("session_token") or "").strip()
    hwid = (b.get("hwid") or "").strip()
    sess = await one(client.table("client_sessions").select("*").eq("token", token)) if token else None
    if not sess:
        return client_fail("INVALID_SESSION")
    if hwid and not hmac.compare_digest(sess["hwid"], hwid):
        return client_fail("HWID_MISMATCH")
    u = await get_user_by_id(sess["user_id"])
    if not u:
        return client_fail("INVALID_CREDENTIALS")
    if u.get("blocked"):
        await client.table("client_sessions").delete().eq("token", token).execute()
        return client_fail("ACCOUNT_BLOCKED")
    if u.get("hwid") != sess["hwid"]:
        await client.table("client_sessions").delete().eq("token", token).execute()
        return client_fail("HWID_MISMATCH")
    lic = await active_license(sess["user_id"])
    if not lic:
        await client.table("client_sessions").delete().eq("token", token).execute()
        return client_fail("LICENSE_EXPIRED")
    build = await active_build()
    await client.table("client_sessions").update({"last_seen": now_iso(), "ip": ip}) \
        .eq("token", token).execute()
    return {"valid": True, "code": "OK", "plan": lic["plan"],
            "expires_at": lic.get("expires_at"), "tester": u.get("tester", False),
            "latest_version": build.get("version") or "1.0.0",
            "update_mandatory": build.get("mandatory", True)}


@api.post("/client/logout")
async def client_logout(ctx=Depends(verify_client_request)):
    token = (ctx["body"].get("session_token") or "").strip()
    if token:
        client = await sb()
        await client.table("client_sessions").delete().eq("token", token).execute()
    return {"ok": True}


async def client_identify(body: dict) -> dict:
    """Resolve the account behind a client request: session_token or login+password."""
    client = await sb()
    token = str(body.get("session_token") or "").strip()
    if token:
        sess = await one(client.table("client_sessions").select("*").eq("token", token))
        if sess:
            u = await get_user_by_id(sess["user_id"])
            if u and not u.get("blocked"):
                return u
        raise HTTPException(401, "INVALID_SESSION")
    identifier = str(body.get("identifier") or body.get("login") or body.get("username")
                     or body.get("email") or "").strip()
    password = body.get("password") or ""
    if identifier and password:
        cand = await one(client.table("users").select("*")
                         .or_(f"email.eq.{identifier.lower()},username.eq.{identifier}"))
        if cand and verify_pw(password, cand["password_hash"]) and not cand.get("blocked"):
            return cand
    raise HTTPException(401, "INVALID_CREDENTIALS")


def count_modules(settings) -> int:
    if isinstance(settings, dict):
        inner = settings.get("modules")
        if isinstance(inner, (dict, list)):
            return len(inner)
        return len(settings)
    if isinstance(settings, list):
        return len(settings)
    return 0


@api.post("/client/configs/save")
async def client_config_save(ctx=Depends(verify_client_request)):
    client = await sb()
    b = ctx["body"]
    u = await client_identify(b)
    settings = b.get("settings")
    if not isinstance(settings, (dict, list)) or not settings:
        raise HTTPException(400, "BAD_SETTINGS")
    raw = json.dumps(settings, separators=(",", ":"))
    if len(raw.encode()) > CONFIG_MAX_BYTES:
        raise HTTPException(413, "CONFIG_TOO_LARGE")
    name = str(b.get("name") or "Config").strip()[:60] or "Config"
    payload = {
        "user_id": u["id"], "author": u["username"], "name": name,
        "description": (str(b.get("description")).strip()[:300] if b.get("description") else None),
        "settings": settings, "modules_count": count_modules(settings),
        "client_version": (str(b.get("version")).strip()[:20] if b.get("version") else None),
        "is_public": bool(b.get("is_public", True)),
        "size_bytes": len(raw.encode()), "updated_at": now_iso(),
    }

    code = str(b.get("code") or b.get("config_id") or "").strip().upper().lstrip("#")
    if code:
        existing = await one(client.table("configs").select("*").eq("code", code))
        if not existing:
            raise HTTPException(404, "CONFIG_NOT_FOUND")
        if existing["user_id"] != u["id"]:
            raise HTTPException(403, "NOT_YOUR_CONFIG")
        res = await client.table("configs").update(payload).eq("id", existing["id"]).execute()
        return {"valid": True, "code": existing["code"], **public_config(res.data[0])}

    for _ in range(6):
        candidate = new_config_code()
        try:
            res = await client.table("configs").insert({
                **payload, "code": candidate, "downloads": 0, "created_at": now_iso()}).execute()
            return {"valid": True, "code": candidate, **public_config(res.data[0])}
        except Exception as e:
            if not is_unique_violation(e):
                raise
    raise HTTPException(500, "CODE_GENERATION_FAILED")


@api.post("/client/configs/get")
async def client_config_get(ctx=Depends(verify_client_request)):
    client = await sb()
    b = ctx["body"]
    code = str(b.get("code") or b.get("config_id") or b.get("id") or "").strip().upper().lstrip("#")
    if not code:
        raise HTTPException(400, "MISSING_CODE")
    c = await one(client.table("configs").select("*").eq("code", code))
    if not c:
        return {"valid": False, "code": "CONFIG_NOT_FOUND"}
    if not c.get("is_public"):
        try:
            u = await client_identify(b)
        except HTTPException:
            return {"valid": False, "code": "CONFIG_PRIVATE"}
        if c["user_id"] != u["id"]:
            return {"valid": False, "code": "CONFIG_PRIVATE"}
    await client.table("configs").update({"downloads": (c.get("downloads") or 0) + 1}) \
        .eq("id", c["id"]).execute()
    return {"valid": True, "config": public_config(c, include_settings=True)}


@api.post("/client/configs/list")
async def client_config_list(ctx=Depends(verify_client_request)):
    client = await sb()
    u = await client_identify(ctx["body"])
    data = await rows(client.table("configs").select("*").eq("user_id", u["id"])
                      .order("updated_at", desc=True))
    return {"valid": True, "configs": [public_config(c) for c in data]}


@api.post("/client/configs/delete")
async def client_config_delete(ctx=Depends(verify_client_request)):
    client = await sb()
    b = ctx["body"]
    u = await client_identify(b)
    code = str(b.get("code") or b.get("config_id") or "").strip().upper().lstrip("#")
    c = await one(client.table("configs").select("*").eq("code", code)) if code else None
    if not c:
        return {"valid": False, "code": "CONFIG_NOT_FOUND"}
    if c["user_id"] != u["id"]:
        return {"valid": False, "code": "NOT_YOUR_CONFIG"}
    await client.table("configs").delete().eq("id", c["id"]).execute()
    return {"valid": True}


# ---------------------------------------------------------------- admin

@api.get("/admin/stats")
async def admin_stats(_=Depends(require_admin)):
    client = await sb()
    users = await count("users")
    now = now_iso()
    lic_res = await client.table("licenses").select("id", count="exact") \
        .eq("status", "active").or_(f"expires_at.is.null,expires_at.gt.{now}").limit(1).execute()
    orders = await rows(client.table("orders").select("total,status"))
    visits = await count("visits")
    revenue = sum(float(o["total"] or 0) for o in orders if o["status"] == "completed")
    return {"users": users, "licenses": lic_res.count or 0, "revenue": round(revenue, 2),
            "visits": visits, "orders": len(orders)}


@api.get("/admin/analytics")
async def admin_analytics(_=Depends(require_admin), days: int = 14):
    client = await sb()
    days = max(7, min(days, 60))
    start = datetime.now(timezone.utc) - timedelta(days=days - 1)
    start_day = start.date()
    since = start.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    visits = await rows(client.table("visits").select("ts").gt("ts", since))
    orders = await rows(client.table("orders").select("*").gt("created_at", since))
    users = await rows(client.table("users").select("created_at").gt("created_at", since))

    def bucket(items, field):
        out: dict[str, list] = {}
        for it in items:
            out.setdefault(str(it[field])[:10], []).append(it)
        return out

    v_by, o_by, u_by = bucket(visits, "ts"), bucket(orders, "created_at"), bucket(users, "created_at")
    series = []
    for i in range(days):
        day = str(start_day + timedelta(days=i))
        day_orders = o_by.get(day, [])
        series.append({
            "date": day,
            "visits": len(v_by.get(day, [])),
            "orders": len(day_orders),
            "revenue": round(sum(float(o["total"] or 0) for o in day_orders
                                 if o["status"] == "completed"), 2),
            "users": len(u_by.get(day, [])),
        })

    products: dict[str, dict] = {}
    for o in orders:
        p = products.setdefault(o["item"], {"item": o["item"], "count": 0, "revenue": 0.0})
        p["count"] += 1
        if o["status"] == "completed":
            p["revenue"] = round(p["revenue"] + float(o["total"] or 0), 2)
    top = sorted(products.values(), key=lambda p: p["revenue"], reverse=True)[:5]

    completed = [o for o in orders if o["status"] == "completed"]
    revenue = round(sum(float(o["total"] or 0) for o in completed), 2)
    return {
        "series": series,
        "top_products": top,
        "totals": {
            "revenue": revenue,
            "orders": len(orders),
            "users": len(users),
            "visits": len(visits),
            "avg_order": round(revenue / len(completed), 2) if completed else 0,
            "conversion": round(len(completed) / len(visits) * 100, 1) if visits else 0,
        },
        "recent_orders": sorted(orders, key=lambda o: o["created_at"], reverse=True)[:6],
    }


@api.get("/admin/users")
async def admin_users(_=Depends(require_admin)):
    client = await sb()
    users = await rows(client.table("users").select("*").order("created_at", desc=True))
    lics = await rows(client.table("licenses").select("*").order("created_at", desc=True))
    by_user: dict[str, list] = {}
    for l in lics:
        by_user.setdefault(l["user_id"], []).append(l)
    return [{
        "id": u["id"], "username": u["username"], "email": u["email"], "uid": u.get("uid"),
        "role": u.get("role", "user"), "blocked": u.get("blocked", False),
        "created_at": u.get("created_at"), "licenses": by_user.get(u["id"], []),
        "hwid": u.get("hwid"), "hwid_bound": u.get("hwid_bound", False),
        "twofa_enabled": u.get("twofa_enabled", False),
        "last_login_at": u.get("last_login_at"), "tester": u.get("tester", False),
    } for u in users]


@api.post("/admin/users/{user_id}/license")
async def admin_grant_license(user_id: str, body: GrantIn, request: Request, admin=Depends(require_admin)):
    client = await sb()
    u = await get_user_by_id(user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if body.days:
        lic = new_license(user_id, "custom", body.days)
    elif body.plan and body.plan in PLANS:
        lic = new_license(user_id, body.plan)
    else:
        raise HTTPException(400, "plan or days required")
    res = await client.table("licenses").insert(lic).execute()
    await log_admin(admin, "grant_license", request, u["username"],
                    {"plan": lic["plan"], "days": lic.get("days")})
    return res.data[0]


@api.post("/admin/users/{user_id}/hwid/reset")
async def admin_reset_hwid(user_id: str, request: Request, admin=Depends(require_admin)):
    client = await sb()
    u = await get_user_by_id(user_id)
    if not u:
        raise HTTPException(404, "User not found")
    await client.table("users").update({"hwid": None, "hwid_bound": False}).eq("id", user_id).execute()
    await client.table("client_sessions").delete().eq("user_id", user_id).execute()
    await log_admin(admin, "hwid_reset", request, u["username"])
    return {"ok": True}


@api.post("/admin/users/{user_id}/block")
async def admin_block_user(user_id: str, request: Request, admin=Depends(require_admin)):
    client = await sb()
    u = await get_user_by_id(user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if u["id"] == admin["id"]:
        raise HTTPException(400, "Cannot block yourself")
    if u.get("role") == "admin":
        raise HTTPException(400, "Cannot block another admin")
    new = not u.get("blocked", False)
    await client.table("users").update({"blocked": new}).eq("id", user_id).execute()
    if new:
        await client.table("client_sessions").delete().eq("user_id", user_id).execute()
        await client.table("refresh_tokens").update({"revoked": True}).eq("user_id", user_id).execute()
    await log_admin(admin, "block_user" if new else "unblock_user", request, u["username"])
    return {"blocked": new}


@api.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, request: Request, admin=Depends(require_admin)):
    client = await sb()
    u = await get_user_by_id(user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if u.get("role") == "admin":
        raise HTTPException(400, "Cannot delete an admin")
    await client.table("users").delete().eq("id", user_id).execute()
    await log_admin(admin, "delete_user", request, u["username"], {"email": u["email"]})
    return {"ok": True}


@api.get("/admin/orders")
async def admin_orders(_=Depends(require_admin), q: str | None = None, status: str | None = None):
    client = await sb()
    query = client.table("orders").select("*").order("created_at", desc=True).limit(500)
    if status and status in ORDER_STATUSES:
        query = query.eq("status", status)
    if q:
        term = safe_q(q.strip())
        if term:
            query = query.or_(",".join(
                f"{f}.ilike.%{term}%" for f in ("order_id", "email", "username", "item", "coupon")))
    return await rows(query)


@api.patch("/admin/orders/{oid}")
async def admin_order_status(oid: str, body: OrderPatch, request: Request, admin=Depends(require_admin)):
    if body.status not in ORDER_STATUSES:
        raise HTTPException(400, "Bad status")
    client = await sb()
    res = await client.table("orders").update({"status": body.status}).eq("id", oid).execute()
    if not res.data:
        raise HTTPException(404, "Order not found")
    await log_admin(admin, "order_status", request, res.data[0]["order_id"], {"status": body.status})
    return res.data[0]


@api.delete("/admin/orders/{oid}")
async def admin_order_delete(oid: str, request: Request, admin=Depends(require_admin)):
    client = await sb()
    res = await client.table("orders").delete().eq("id", oid).execute()
    if not res.data:
        raise HTTPException(404, "Order not found")
    await log_admin(admin, "order_delete", request, res.data[0]["order_id"])
    return {"ok": True}


@api.get("/admin/coupons")
async def admin_coupons(_=Depends(require_admin)):
    client = await sb()
    return await rows(client.table("coupons").select("*").order("created_at", desc=True))


@api.post("/admin/coupons")
async def admin_create_coupon(body: CouponIn, request: Request, admin=Depends(require_admin)):
    client = await sb()
    code = body.code.strip().upper()
    if await one(client.table("coupons").select("id").eq("code", code)):
        raise HTTPException(409, "Taki kupon już istnieje / Coupon already exists")
    if body.type == "percent" and body.value > 100:
        raise HTTPException(400, "Percent must be <= 100")
    expires = None
    if body.expires_at:
        dt = parse_dt(body.expires_at)
        if not dt:
            raise HTTPException(400, "Bad expires_at")
        expires = dt.isoformat()
    try:
        res = await client.table("coupons").insert({
            "code": code, "type": body.type, "value": body.value,
            "max_uses": body.max_uses, "uses": 0, "expires_at": expires,
            "active": True, "created_at": now_iso()}).execute()
    except Exception as e:
        if is_unique_violation(e):
            raise HTTPException(409, "Taki kupon już istnieje / Coupon already exists")
        raise
    await log_admin(admin, "coupon_create", request, code,
                    {"type": body.type, "value": body.value})
    return res.data[0]


@api.patch("/admin/coupons/{cid}")
async def admin_toggle_coupon(cid: str, body: CouponPatch, request: Request, admin=Depends(require_admin)):
    client = await sb()
    res = await client.table("coupons").update({"active": body.active}).eq("id", cid).execute()
    if not res.data:
        raise HTTPException(404, "Coupon not found")
    await log_admin(admin, "coupon_toggle", request, res.data[0]["code"], {"active": body.active})
    return res.data[0]


@api.delete("/admin/coupons/{cid}")
async def admin_delete_coupon(cid: str, request: Request, admin=Depends(require_admin)):
    client = await sb()
    res = await client.table("coupons").delete().eq("id", cid).execute()
    if not res.data:
        raise HTTPException(404, "Coupon not found")
    await log_admin(admin, "coupon_delete", request, res.data[0]["code"])
    return {"ok": True}


@api.get("/admin/visits")
async def admin_visits(_=Depends(require_admin)):
    client = await sb()
    return await rows(client.table("visits").select("*").order("ts", desc=True).limit(200))


@api.get("/admin/logs")
async def admin_action_logs(_=Depends(require_admin)):
    client = await sb()
    return await rows(client.table("admin_logs").select("*").order("ts", desc=True).limit(200))


@api.get("/admin/client/logs")
async def admin_client_logs(_=Depends(require_admin)):
    client = await sb()
    return await rows(client.table("client_logs").select("*").order("ts", desc=True).limit(200))


@api.get("/admin/client/credentials")
async def admin_client_credentials(_=Depends(require_admin)):
    return {"api_key": os.environ["CLIENT_API_KEY"],
            "api_secret": os.environ["CLIENT_API_SECRET"],
            "base_url": os.environ.get("PUBLIC_APP_URL", "") or ""}


@api.get("/admin/builds")
async def admin_builds(_=Depends(require_admin)):
    client = await sb()
    return await rows(client.table("builds").select("*").order("uploaded_at", desc=True))


@api.post("/admin/version")
async def admin_set_version(body: VersionIn, request: Request, admin=Depends(require_admin)):
    client = await sb()
    b = await active_build()
    if not b:
        raise HTTPException(400, "Najpierw wgraj plik .exe / Upload an .exe file first")
    res = await client.table("builds").update({
        "version": body.version.strip(), "mandatory": body.mandatory,
        "notes": body.notes}).eq("id", b["id"]).execute()
    await log_admin(admin, "build_version", request, body.version.strip())
    return res.data[0]


@api.post("/admin/build")
async def admin_upload_build(request: Request, file: UploadFile = File(...),
                             version: str = Form("1.0.0"), notes: str | None = Form(None),
                             mandatory: bool = Form(True), admin=Depends(require_admin)):
    data = await file.read()
    if len(data) > 100 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 100 MB)")
    if not (file.filename or "").lower().endswith(".exe"):
        raise HTTPException(400, "Only .exe files allowed")
    client = await sb()
    path = f"bratclient/{secrets.token_hex(8)}.exe"
    await upload_build(data, path)
    await client.table("builds").update({"is_active": False}).eq("is_active", True).execute()
    res = await client.table("builds").insert({
        "version": (version or "1.0.0").strip(), "filename": file.filename,
        "size": len(data), "path": path, "notes": notes, "mandatory": mandatory,
        "blocked": False, "is_active": True, "uploaded_at": now_iso(),
        "uploaded_by": admin["id"]}).execute()
    await log_admin(admin, "build_upload", request, file.filename,
                    {"version": version, "size": len(data)})
    return res.data[0]


@api.patch("/admin/builds/{bid}")
async def admin_patch_build(bid: str, body: BuildPatch, request: Request, admin=Depends(require_admin)):
    client = await sb()
    b = await one(client.table("builds").select("*").eq("id", bid))
    if not b:
        raise HTTPException(404, "Build not found")
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if not upd:
        return b
    if upd.get("is_active"):
        await client.table("builds").update({"is_active": False}).eq("is_active", True).execute()
    res = await client.table("builds").update(upd).eq("id", bid).execute()
    await log_admin(admin, "build_update", request, b["filename"], upd)
    return res.data[0]


@api.delete("/admin/builds/{bid}")
async def admin_delete_build(bid: str, request: Request, admin=Depends(require_admin)):
    client = await sb()
    b = await one(client.table("builds").select("*").eq("id", bid))
    if not b:
        raise HTTPException(404, "Build not found")
    await delete_build(b["path"])
    await client.table("builds").delete().eq("id", bid).execute()
    if b.get("is_active"):
        nxt = await one(client.table("builds").select("id").order("uploaded_at", desc=True))
        if nxt:
            await client.table("builds").update({"is_active": True}).eq("id", nxt["id"]).execute()
    await log_admin(admin, "build_delete", request, b["filename"], {"version": b["version"]})
    return {"ok": True}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS or ["http://localhost:3000"],
    allow_origin_regex=os.environ.get("CORS_ORIGIN_REGEX") or None,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def seed():
    client = await sb()
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_pw = os.environ["ADMIN_PASSWORD"]
    admin_username = os.environ.get("ADMIN_USERNAME", "Admin")
    existing = await one(client.table("users").select("*").eq("email", admin_email))
    if not existing:
        await client.table("users").insert({
            "email": admin_email, "password_hash": hash_pw(admin_pw),
            "username": admin_username, "uid": "BRAT-000001", "about": "",
            "language": "pl", "role": "admin", "twofa_enabled": REQUIRE_ADMIN_2FA,
            "created_at": now_iso()}).execute()
        logger.info("admin seeded: %s", admin_email)
    else:
        upd = {"username": admin_username, "blocked": False, "role": "admin",
               "twofa_enabled": REQUIRE_ADMIN_2FA}
        if not verify_pw(admin_pw, existing["password_hash"]):
            upd["password_hash"] = hash_pw(admin_pw)
        await client.table("users").update(upd).eq("id", existing["id"]).execute()

    demo_email = os.environ.get("DEMO_EMAIL", "delivered@resend.dev")
    demo = await one(client.table("users").select("*").eq("email", demo_email))
    if not demo:
        res = await client.table("users").insert({
            "email": demo_email, "password_hash": hash_pw("demo12345"),
            "username": "DemoPlayer", "uid": "BRAT-D3M001", "about": "Test account",
            "language": "pl", "role": "user", "created_at": now_iso()}).execute()
        await client.table("licenses").insert({
            "user_id": res.data[0]["id"], "plan": "lifetime", "key": "BRAT-DEMO-DEMO-DEMO",
            "price_pln": 100, "created_at": now_iso(), "expires_at": None,
            "status": "active"}).execute()
        logger.info("demo user seeded")
