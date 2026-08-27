import asyncio, os, secrets, requests, sys
sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
from supabase import acreate_client

BASE = "https://cheat-shop-pro-1.preview.emergentagent.com/api"


async def main():
    sb = await acreate_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    suffix = secrets.token_hex(4)
    email = f"test_lockdbg_{suffix}@qa-bratclient.com"
    r = requests.post(f"{BASE}/auth/register", json={"email": email, "password": "lockpass12345", "username": f"TESTld{suffix}"}, timeout=30)
    print("register", r.status_code)
    uid = r.json()["user"]["id"]
    for i in range(7):
        rr = requests.post(f"{BASE}/auth/login", json={"email": email, "password": "bad"}, timeout=30)
        print(f"attempt {i+1}: {rr.status_code} {rr.text[:80]}")
    res = await sb.table("login_attempts").select("*").ilike("key", f"%{email}%").execute()
    print("login_attempts rows:", res.data)
    await sb.table("login_attempts").delete().ilike("key", f"%{email}%").execute()
    await sb.table("users").delete().eq("id", uid).execute()

asyncio.run(main())
