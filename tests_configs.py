import json, time, hmac, hashlib, secrets, re, requests

BASE = re.search(r'REACT_APP_BACKEND_URL=(.+)', open('/app/frontend/.env').read()).group(1).strip().strip('"')
env = open('/app/backend/.env').read()
KEY = re.search(r'CLIENT_API_KEY="(.+)"', env).group(1)
SECRET = re.search(r'CLIENT_API_SECRET="(.+)"', env).group(1)
s = requests.Session()
ok = fail = 0


def check(name, cond, extra=""):
    global ok, fail
    if cond:
        ok += 1; print(f"PASS {name} {extra}")
    else:
        fail += 1; print(f"FAIL {name} {extra}")


def signed(path, body):
    raw = json.dumps(body, separators=(",", ":")).encode()
    ts = str(int(time.time())); nonce = secrets.token_hex(8)
    sig = hmac.new(SECRET.encode(), f"{ts}.{nonce}.".encode() + raw, hashlib.sha256).hexdigest()
    return requests.post(f"{BASE}{path}", data=raw, headers={
        "Content-Type": "application/json", "X-Client-Key": KEY,
        "X-Timestamp": ts, "X-Nonce": nonce, "X-Signature": sig})


# realistic 210-module dump
SETTINGS = {f"Module{i}": {"enabled": i % 3 == 0, "range": 3.0 + i / 100,
                           "mode": ["Switch", "Single", "Multi"][i % 3],
                           "cps": 8 + i % 12, "targets": ["players", "mobs"]}
            for i in range(210)}
SETTINGS["KillAura"] = {"enabled": True, "range": 4.2, "cps": 12, "mode": "Switch"}

# ---- login (session token) ----
HWID = "CFG" + secrets.token_hex(14).upper()
r = signed("/api/client/auth", {"login": "DemoPlayer", "password": "demo12345", "hwid": HWID, "version": "3.0.0"})
j = r.json()
if j.get("code") == "HWID_MISMATCH":
    # unbind via user API then retry
    lg = s.post(f"{BASE}/api/auth/login", json={"email": "delivered@resend.dev", "password": "demo12345"}).json()
    s.post(f"{BASE}/api/users/me/hwid/reset", headers={"Authorization": f"Bearer {lg['token']}"})
    r = signed("/api/client/auth", {"login": "DemoPlayer", "password": "demo12345", "hwid": HWID, "version": "3.0.0"})
    j = r.json()
check("client login for configs", j.get("valid") is True, str(j.get("code")))
SESSION = j["session_token"]

# ---- save ----
r = signed("/api/client/configs/save", {
    "session_token": SESSION, "name": "PVP Anarchia", "description": "killaura + scaffold",
    "version": "3.0.0", "is_public": True, "settings": SETTINGS})
j = r.json()
check("save config (211 modules)", r.status_code == 200 and j.get("valid") and len(j["code"]) == 5, str(j)[:160])
CODE = j["code"]
check("modules_count computed", j["modules_count"] == 211, str(j.get("modules_count")))
check("size_bytes reported", j["size_bytes"] > 10000, str(j.get("size_bytes")))
check("author attached to account", j["author"] == "DemoPlayer")

# ---- get by code, exact roundtrip ----
for variant in [CODE, f"#{CODE}", CODE.lower()]:
    r = signed("/api/client/configs/get", {"code": variant})
    j2 = r.json()
    check(f"import by '{variant}'", j2.get("valid") is True and j2["config"]["settings"] == SETTINGS,
          f"modules={j2.get('config', {}).get('modules_count')}")

r = signed("/api/client/configs/get", {"config_id": CODE})
check("import via config_id alias", r.json().get("valid") is True)
r = signed("/api/client/configs/get", {"code": "ZZZZZ"})
check("unknown code -> CONFIG_NOT_FOUND", r.json().get("code") == "CONFIG_NOT_FOUND")

# ---- downloads counter ----
r = signed("/api/client/configs/get", {"code": CODE})
check("downloads counter increments", r.json()["config"]["downloads"] >= 4, str(r.json()["config"]["downloads"]))

# ---- update existing ----
NEW = dict(SETTINGS); NEW["KillAura"] = {"enabled": False, "range": 3.0}
r = signed("/api/client/configs/save", {"session_token": SESSION, "code": CODE,
                                        "name": "PVP Anarchia v2", "settings": NEW})
check("overwrite by code keeps same id", r.json().get("code") == CODE and r.json()["name"] == "PVP Anarchia v2", str(r.json())[:120])
r = signed("/api/client/configs/get", {"code": CODE})
check("updated settings returned", r.json()["config"]["settings"]["KillAura"]["enabled"] is False)

# ---- login+password auth instead of session ----
r = signed("/api/client/configs/save", {"login": "DemoPlayer", "password": "demo12345",
                                        "name": "Second", "settings": {"Sprint": {"enabled": True}}})
check("save with login+password", r.json().get("valid") is True, str(r.json().get("code")))
CODE2 = r.json()["code"]

# ---- list ----
r = signed("/api/client/configs/list", {"session_token": SESSION})
codes = [c["code"] for c in r.json().get("configs", [])]
check("list returns own configs", CODE in codes and CODE2 in codes, str(codes))
check("list has no settings payload", all("settings" not in c for c in r.json()["configs"]))

# ---- private config ----
r = signed("/api/client/configs/save", {"session_token": SESSION, "name": "Secret",
                                        "is_public": False, "settings": {"Fly": {"speed": 2}}})
PRIV = r.json()["code"]
r = signed("/api/client/configs/get", {"code": PRIV})
check("private config blocked without auth", r.json().get("code") == "CONFIG_PRIVATE", str(r.json())[:80])
r = signed("/api/client/configs/get", {"code": PRIV, "session_token": SESSION})
check("owner can read private config", r.json().get("valid") is True)

# ---- validation ----
r = signed("/api/client/configs/save", {"session_token": SESSION, "name": "x", "settings": {}})
check("empty settings rejected", r.status_code == 400 and "BAD_SETTINGS" in r.text)
big = {f"M{i}": {"blob": "x" * 400} for i in range(2000)}
r = signed("/api/client/configs/save", {"session_token": SESSION, "name": "big", "settings": big})
check("oversized config rejected (413)", r.status_code == 413, r.text[:60])
r = signed("/api/client/configs/save", {"session_token": "bogus-token", "name": "x", "settings": {"a": 1}})
check("bad session rejected", r.status_code == 401, r.text[:60])
r = signed("/api/client/configs/save", {"login": "DemoPlayer", "password": "zle", "name": "x", "settings": {"a": 1}})
check("bad password rejected", r.status_code == 401, r.text[:60])

# ---- panel endpoints ----
lg = s.post(f"{BASE}/api/auth/login", json={"email": "delivered@resend.dev", "password": "demo12345"}).json()
UH = {"Authorization": f"Bearer {lg['token']}"}
r = s.get(f"{BASE}/api/configs/my", headers=UH)
check("panel: my configs", r.status_code == 200 and any(c["code"] == CODE for c in r.json()), f"n={len(r.json())}")
r = s.get(f"{BASE}/api/configs/{CODE}", headers=UH)
check("panel: config detail has settings", r.status_code == 200 and "settings" in r.json())
r = s.patch(f"{BASE}/api/configs/{r.json()['id']}", headers=UH, json={"is_public": False})
check("panel: toggle private", r.status_code == 200 and r.json()["is_public"] is False)
r = s.delete(f"{BASE}/api/configs/{[c for c in s.get(f'{BASE}/api/configs/my', headers=UH).json() if c['code'] == CODE2][0]['id']}", headers=UH)
check("panel: delete config", r.status_code == 200)
r = signed("/api/client/configs/delete", {"session_token": SESSION, "code": PRIV})
check("client: delete own config", r.json().get("valid") is True)

# ---- other user's config protection ----
adm = s.post(f"{BASE}/api/auth/login", json={"email": "alexwitom", "password": "lobaczus2009"})
check("admin still needs 2FA (regression)", adm.json().get("twofa_required") is True)

print(f"\n==== {ok} passed, {fail} failed ====")
