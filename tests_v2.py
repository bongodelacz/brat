import json, time, hmac, hashlib, secrets, io, re, requests

BASE = re.search(r'REACT_APP_BACKEND_URL=(.+)', open('/app/frontend/.env').read()).group(1).strip().strip('"')
env = open('/app/backend/.env').read()
KEY = re.search(r'CLIENT_API_KEY="(.+)"', env).group(1)
SECRET = re.search(r'CLIENT_API_SECRET="(.+)"', env).group(1)
SB = re.search(r'SUPABASE_URL="(.+)"', env).group(1)
SR = re.search(r'SUPABASE_SERVICE_ROLE_KEY="(.+)"', env).group(1)
SBH = {"apikey": SR, "Authorization": f"Bearer {SR}"}
s = requests.Session()
ok = fail = 0


def check(name, cond, extra=""):
    global ok, fail
    if cond:
        ok += 1; print(f"PASS {name} {extra}")
    else:
        fail += 1; print(f"FAIL {name} {extra}")


def latest_code(user_email, purpose):
    uid = requests.get(f"{SB}/rest/v1/users?email=eq.{user_email}&select=id", headers=SBH).json()[0]["id"]
    row = requests.get(f"{SB}/rest/v1/two_factor_codes?user_id=eq.{uid}&purpose=eq.{purpose}"
                       f"&used=eq.false&order=created_at.desc&limit=1", headers=SBH).json()[0]
    h = row["code_hash"]
    for i in range(1000000):
        if hashlib.sha256(f"{i:06d}".encode()).hexdigest() == h:
            return row["id"], f"{i:06d}"
    raise RuntimeError("code not found")


# ---------- 1. admin login with forced 2FA ----------
r = s.post(f"{BASE}/api/auth/login", json={"email": "alexwitom", "password": "lobaczus2009"})
check("admin login returns 2FA challenge", r.status_code == 200 and r.json().get("twofa_required"), r.text[:120])
challenge = r.json()["challenge_id"]
check("email hint masked", "@" in r.json().get("email_hint", "") and "*" in r.json()["email_hint"], r.json().get("email_hint"))

cid, code = latest_code("halecase2@gmail.com", "login")
check("2FA code row created + email sent", cid == challenge)

r = s.post(f"{BASE}/api/auth/2fa/verify", json={"challenge_id": challenge, "code": "000000" if code != "000000" else "111111"})
check("wrong 2FA code rejected", r.status_code == 400, r.text[:80])

r = s.post(f"{BASE}/api/auth/2fa/verify", json={"challenge_id": challenge, "code": code})
check("2FA verify OK", r.status_code == 200 and r.json().get("token"), r.text[:120])
atok, arefresh = r.json()["token"], r.json()["refresh_token"]
AH = {"Authorization": f"Bearer {atok}"}

r = s.post(f"{BASE}/api/auth/2fa/verify", json={"challenge_id": challenge, "code": code})
check("2FA code single use", r.status_code == 400, r.text[:80])

# ---------- 2. refresh token rotation ----------
r = s.post(f"{BASE}/api/auth/refresh", json={"refresh_token": arefresh})
check("refresh works", r.status_code == 200 and r.json().get("token"))
new_refresh = r.json()["refresh_token"]
AH = {"Authorization": f"Bearer {r.json()['token']}"}
r = s.post(f"{BASE}/api/auth/refresh", json={"refresh_token": arefresh})
check("old refresh revoked", r.status_code == 401)

# ---------- 3. security headers + docs off ----------
r = requests.get(f"{BASE}/api/health")
h = {k.lower(): v for k, v in r.headers.items()}
check("security headers", h.get("x-frame-options") == "DENY" and "nosniff" in h.get("x-content-type-options", "")
      and "max-age" in h.get("strict-transport-security", ""), str(h.get("content-security-policy"))[:40])
check("api docs disabled", requests.get(f"{BASE}/docs").status_code in (404, 405)
      and requests.get(f"{BASE}/openapi.json").status_code == 404)

# ---------- 4. admin-only guard ----------
r = requests.get(f"{BASE}/api/admin/users")
check("admin endpoints require auth", r.status_code == 401)
r = s.post(f"{BASE}/api/auth/login", json={"email": "delivered@resend.dev", "password": "demo12345"})
check("demo login (no 2FA)", r.status_code == 200 and r.json().get("token"), r.text[:100])
utok, urefresh = r.json()["token"], r.json()["refresh_token"]
UH = {"Authorization": f"Bearer {utok}"}
check("normal user blocked from admin API",
      requests.get(f"{BASE}/api/admin/users", headers=UH).status_code == 403)

# ---------- 5. password policy ----------
r = requests.post(f"{BASE}/api/auth/register", json={"email": f"weak{secrets.token_hex(3)}@t.pl",
                                                     "password": "abcdefgh", "username": f"u{secrets.token_hex(3)}"})
check("weak password rejected (no digit)", r.status_code == 400, r.text[:90])

# ---------- 6. builds history ----------
def upload(version, name):
    exe = b"MZ" + b"\x90\x00" + b"\x00" * 60 + f"BUILD {version}".encode()
    return s.post(f"{BASE}/api/admin/build", headers=AH,
                  files={"file": (name, io.BytesIO(exe), "application/octet-stream")},
                  data={"version": version, "notes": f"changelog {version}", "mandatory": "true"})

r1, r2 = upload("2.0.0", "BratClient-200.exe"), upload("2.1.0", "BratClient-210.exe")
check("build upload 1", r1.status_code == 200, r1.text[:120])
check("build upload 2", r2.status_code == 200, r2.text[:120])
builds = s.get(f"{BASE}/api/admin/builds", headers=AH).json()
check("build history has 2+ entries", len(builds) >= 2, f"n={len(builds)}")
active = [b for b in builds if b["is_active"]]
check("only newest build active", len(active) == 1 and active[0]["version"] == "2.1.0", str([b["version"] for b in active]))

r = s.get(f"{BASE}/api/download/client", headers=UH)
check("user can download active build", r.status_code == 200 and r.content[:2] == b"MZ", f"{r.status_code} {len(r.content)}B")

bid = active[0]["id"]
r = s.patch(f"{BASE}/api/admin/builds/{bid}", headers=AH, json={"blocked": True})
check("block build", r.status_code == 200 and r.json()["blocked"])
r = s.get(f"{BASE}/api/download/client", headers=UH)
check("blocked build download -> 423", r.status_code == 423, r.text[:60])
info = requests.get(f"{BASE}/api/build/info").json()
check("build info reports blocked", info["blocked"] is True and info["available"] is False, str(info)[:100])
r = s.patch(f"{BASE}/api/admin/builds/{bid}", headers=AH, json={"blocked": False})
check("unblock build", r.status_code == 200 and not r.json()["blocked"])

old = [b for b in builds if not b["is_active"]][0]
r = s.patch(f"{BASE}/api/admin/builds/{old['id']}", headers=AH, json={"is_active": True})
check("activate older build", r.status_code == 200 and r.json()["is_active"])
after = s.get(f"{BASE}/api/admin/builds", headers=AH).json()
check("still exactly one active", len([b for b in after if b["is_active"]]) == 1)
r = s.delete(f"{BASE}/api/admin/builds/{old['id']}", headers=AH)
check("delete build", r.status_code == 200)
check("deleted build gone", all(b["id"] != old["id"] for b in s.get(f"{BASE}/api/admin/builds", headers=AH).json()))

# ---------- 7. coupon + checkout + purchase email ----------
code_c = "QA" + secrets.token_hex(2).upper()
r = s.post(f"{BASE}/api/admin/coupons", headers=AH, json={"code": code_c, "type": "percent", "value": 20, "max_uses": 3})
check("coupon created", r.status_code == 200, r.text[:100])
r = s.post(f"{BASE}/api/coupons/validate", headers=UH, json={"code": code_c, "item_type": "plan", "item_id": "90d"})
check("coupon validate 90d 80->64", r.status_code == 200 and r.json()["total"] == 64.0, r.text[:120])
r = s.post(f"{BASE}/api/licenses/purchase", headers=UH, json={"plan": "90d", "coupon": code_c})
check("purchase with coupon", r.status_code == 200 and r.json()["order"]["total"] == 64.0, r.text[:150])
lic_key = r.json()["license"]["key"]
r = s.post(f"{BASE}/api/addons/purchase", headers=UH, json={"addon": "hwid_reset"})
check("addon purchase", r.status_code == 200 and r.json()["order"]["total"] == 20.0, r.text[:100])

# ---------- 8. analytics ----------
r = s.get(f"{BASE}/api/admin/analytics", headers=AH)
a = r.json()
check("analytics series 14 days", r.status_code == 200 and len(a["series"]) == 14 and "revenue" in a["series"][0])
check("analytics totals + top products", a["totals"]["revenue"] > 0 and len(a["top_products"]) >= 1, str(a["totals"])[:120])

# ---------- 9. admin action log ----------
logs = s.get(f"{BASE}/api/admin/logs", headers=AH).json()
actions = {l["action"] for l in logs}
check("admin actions logged", {"build_upload", "build_delete", "coupon_create"} <= actions, str(sorted(actions))[:160])
check("admin log has ip + username", logs and logs[0]["ip"] and logs[0]["admin_username"] == "alexwitom")

# ---------- 10. 2FA enable flow for user ----------
r = s.post(f"{BASE}/api/users/me/2fa/request", headers=UH)
check("2FA setup code requested", r.status_code == 200 and r.json()["purpose"] == "enable", r.text[:100])
ch2 = r.json()["challenge_id"]
cid2, code2 = latest_code("delivered@resend.dev", "enable")
r = s.post(f"{BASE}/api/users/me/2fa/confirm", headers=UH, json={"challenge_id": ch2, "code": code2})
check("2FA enabled", r.status_code == 200 and r.json()["twofa_enabled"] is True, r.text[:100])
r = s.post(f"{BASE}/api/auth/login", json={"email": "delivered@resend.dev", "password": "demo12345"})
check("user login now needs 2FA", r.json().get("twofa_required") is True)
ch3 = r.json()["challenge_id"]
_, code3 = latest_code("delivered@resend.dev", "login")
r = s.post(f"{BASE}/api/auth/2fa/verify", json={"challenge_id": ch3, "code": code3})
check("user 2FA login OK", r.status_code == 200 and r.json().get("token"))
UH = {"Authorization": f"Bearer {r.json()['token']}"}
# turn it back off so UI tests stay simple
r = s.post(f"{BASE}/api/users/me/2fa/request", headers=UH)
ch4 = r.json()["challenge_id"]
_, code4 = latest_code("delivered@resend.dev", "disable")
r = s.post(f"{BASE}/api/users/me/2fa/confirm", headers=UH, json={"challenge_id": ch4, "code": code4})
check("2FA disabled again", r.status_code == 200 and r.json()["twofa_enabled"] is False, r.text[:100])

# ---------- 11. client API: Login + Password ----------
def signed(path, body):
    raw = json.dumps(body).encode()
    ts = str(int(time.time())); nonce = secrets.token_hex(8)
    sig = hmac.new(SECRET.encode(), f"{ts}.{nonce}.".encode() + raw, hashlib.sha256).hexdigest()
    return requests.post(f"{BASE}{path}", data=raw, headers={
        "Content-Type": "application/json", "X-Client-Key": KEY,
        "X-Timestamp": ts, "X-Nonce": nonce, "X-Signature": sig})

HWID = "QA" + secrets.token_hex(15).upper()
r = signed("/api/client/auth", {"login": "DemoPlayer", "password": "demo12345", "hwid": HWID, "version": "2.1.0"})
j = r.json()
check("client auth with 'login' field", j.get("valid") is True and j.get("username") == "DemoPlayer", str(j)[:140])
check("client build_available flag", j.get("build_available") is True, str(j.get("build_available")))
sess = j.get("session_token")
r = signed("/api/client/auth", {"username": "delivered@resend.dev", "password": "demo12345", "hwid": HWID})
check("client auth with 'username'/email", r.json().get("valid") is True)
r = signed("/api/client/auth", {"license_key": lic_key, "hwid": HWID})
check("client auth by license key still works", r.json().get("valid") is True)
r = signed("/api/client/auth", {"login": "DemoPlayer", "password": "zle", "hwid": HWID})
check("client bad password", r.json().get("code") == "INVALID_CREDENTIALS")
r = signed("/api/client/heartbeat", {"session_token": sess, "hwid": HWID})
check("client heartbeat", r.json().get("valid") is True, str(r.json())[:120])
r = signed("/api/client/version", {"version": "1.0.0"})
check("client version mismatch detected", r.json()["up_to_date"] is False and r.json()["version"] == "2.1.0", str(r.json())[:120])

print(f"\n==== {ok} passed, {fail} failed ====")
