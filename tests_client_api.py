import os, json, time, hmac, hashlib, secrets, requests, re

BASE = re.search(r'REACT_APP_BACKEND_URL=(.+)', open('/app/frontend/.env').read()).group(1).strip().strip('"')
env = open('/app/backend/.env').read()
KEY = re.search(r'CLIENT_API_KEY="(.+)"', env).group(1)
SECRET = re.search(r'CLIENT_API_SECRET="(.+)"', env).group(1)
print("BASE", BASE)

s = requests.Session()
r = s.post(f"{BASE}/api/auth/login", json={"email": "admin@vqt.gg", "password": "lobaczus2009"})
print("admin login", r.status_code)
atok = r.json()["token"]
AH = {"Authorization": f"Bearer {atok}"}

# coupon
code = "TEST" + secrets.token_hex(2).upper()
r = s.post(f"{BASE}/api/admin/coupons", headers=AH, json={"code": code, "type": "percent", "value": 20, "max_uses": 5})
print("create coupon", r.status_code, r.json())

# version
r = s.post(f"{BASE}/api/admin/version", headers=AH, json={"version": "1.2.3", "notes": "test build", "mandatory": True})
print("set version", r.status_code, r.json().get("version"))

# demo user login + purchase with coupon
r = s.post(f"{BASE}/api/auth/login", json={"email": "demo@bratclient.gg", "password": "demo12345"})
print("demo login", r.status_code)
utok = r.json()["token"]
UH = {"Authorization": f"Bearer {utok}"}

r = s.post(f"{BASE}/api/coupons/validate", headers=UH, json={"code": code, "item_type": "plan", "item_id": "30d"})
print("validate", r.status_code, r.json())

r = s.post(f"{BASE}/api/licenses/purchase", headers=UH, json={"plan": "30d", "coupon": code})
print("purchase", r.status_code, json.dumps(r.json().get("order"), indent=None))

r = s.post(f"{BASE}/api/addons/purchase", headers=UH, json={"addon": "hwid_reset"})
print("addon", r.status_code, r.json().get("order", {}).get("total"))

r = s.get(f"{BASE}/api/orders/my", headers=UH)
print("orders/my", r.status_code, len(r.json()))

r = s.get(f"{BASE}/api/admin/orders", headers=AH, params={"q": code})
print("admin orders search", r.status_code, len(r.json()))
oid = r.json()[0]["id"]
r = s.patch(f"{BASE}/api/admin/orders/{oid}", headers=AH, json={"status": "refunded"})
print("order status", r.status_code, r.json()["status"])

r = s.get(f"{BASE}/api/admin/stats", headers=AH)
print("stats", r.status_code, r.json())


def signed(path, body):
    raw = json.dumps(body).encode()
    ts = str(int(time.time()))
    nonce = secrets.token_hex(8)
    sig = hmac.new(SECRET.encode(), f"{ts}.{nonce}.".encode() + raw, hashlib.sha256).hexdigest()
    return requests.post(f"{BASE}{path}", data=raw, headers={
        "Content-Type": "application/json", "X-Client-Key": KEY,
        "X-Timestamp": ts, "X-Nonce": nonce, "X-Signature": sig})


HWID = "AABBCCDDEEFF00112233445566778899"
print("\n--- CLIENT API ---")
r = signed("/api/client/version", {"version": "1.0.0"})
print("version", r.status_code, r.json())

r = signed("/api/client/auth", {"identifier": "demo@bratclient.gg", "password": "demo12345", "hwid": HWID, "version": "1.2.3"})
print("auth bind", r.status_code, r.json())
sess = r.json().get("session_token")

r = signed("/api/client/auth", {"identifier": "demo@bratclient.gg", "password": "demo12345", "hwid": "9999999999999999", "version": "1.2.3"})
print("auth other hwid", r.status_code, r.json())

r = signed("/api/client/auth", {"license_key": "BRAT-DEMO-DEMO-DEMO", "hwid": HWID})
print("auth by key", r.status_code, r.json().get("code"), r.json().get("plan"))

r = signed("/api/client/auth", {"identifier": "demo@bratclient.gg", "password": "zle", "hwid": HWID})
print("bad pass", r.status_code, r.json())

r = signed("/api/client/heartbeat", {"session_token": sess, "hwid": HWID})
print("heartbeat", r.status_code, r.json())

# security checks
raw = json.dumps({"version": "1.0.0"}).encode()
ts = str(int(time.time())); nonce = secrets.token_hex(8)
sig = hmac.new(SECRET.encode(), f"{ts}.{nonce}.".encode() + raw, hashlib.sha256).hexdigest()
hdr = {"Content-Type": "application/json", "X-Client-Key": KEY, "X-Timestamp": ts, "X-Nonce": nonce, "X-Signature": sig}
print("replay 1st", requests.post(f"{BASE}/api/client/version", data=raw, headers=hdr).status_code)
print("replay 2nd", requests.post(f"{BASE}/api/client/version", data=raw, headers=hdr).status_code,
      requests.post(f"{BASE}/api/client/version", data=raw, headers=hdr).json())
print("bad key", requests.post(f"{BASE}/api/client/version", data=raw, headers={**hdr, "X-Client-Key": "nope", "X-Nonce": secrets.token_hex(8)}).status_code)
print("bad sig", requests.post(f"{BASE}/api/client/version", data=raw, headers={**hdr, "X-Signature": "de"*32, "X-Nonce": secrets.token_hex(8)}).status_code)
old_ts = str(int(time.time()) - 9999); n2 = secrets.token_hex(8)
s2 = hmac.new(SECRET.encode(), f"{old_ts}.{n2}.".encode() + raw, hashlib.sha256).hexdigest()
print("stale ts", requests.post(f"{BASE}/api/client/version", data=raw, headers={**hdr, "X-Timestamp": old_ts, "X-Nonce": n2, "X-Signature": s2}).status_code)
print("no headers", requests.post(f"{BASE}/api/client/version", json={"version": "1"}).status_code)

# hwid reset frees the bind
r = s.post(f"{BASE}/api/users/me/hwid/reset", headers=UH)
print("user hwid reset", r.status_code, r.json())
r = signed("/api/client/heartbeat", {"session_token": sess, "hwid": HWID})
print("heartbeat after reset", r.status_code, r.json())
r = signed("/api/client/auth", {"identifier": "demo@bratclient.gg", "password": "demo12345", "hwid": "NEWHWID1234567890", "version": "1.2.3"})
print("rebind new hwid", r.status_code, r.json().get("code"), r.json().get("hwid"))

r = s.get(f"{BASE}/api/admin/client/logs", headers=AH)
print("client logs", r.status_code, len(r.json()))
r = s.get(f"{BASE}/api/admin/client/credentials", headers=AH)
print("creds", r.status_code, list(r.json().keys()))
r = s.get(f"{BASE}/api/build/info")
print("build info", r.status_code, r.json())

# --- Supabase Storage: upload .exe + download ---
import io as _io
exe = b"MZ" + b"\x90\x00" + b"\x00"*60 + b"BRATCLIENT TEST BUILD"
r = s.post(f"{BASE}/api/admin/build", headers=AH,
           files={"file": ("BratClient-Setup.exe", _io.BytesIO(exe), "application/octet-stream")})
print("upload build", r.status_code, r.json() if r.status_code == 200 else r.text[:300])
r = s.get(f"{BASE}/api/download/client", headers=UH)
print("download build", r.status_code, len(r.content), r.content[:20])
print("health", s.get(f"{BASE}/api/health").json())
