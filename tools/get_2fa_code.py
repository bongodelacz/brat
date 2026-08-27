"""Local test helper: prints the current 2FA code for an account (brute-forces the sha256 hash).

Usage:  python3 /app/tools/get_2fa_code.py <email> [login|enable|disable]
Only works locally with the service-role key from backend/.env.
"""
import hashlib
import re
import sys

import requests

env = open("/app/backend/.env").read()
SB = re.search(r'SUPABASE_URL="(.+)"', env).group(1)
SR = re.search(r'SUPABASE_SERVICE_ROLE_KEY="(.+)"', env).group(1)
H = {"apikey": SR, "Authorization": f"Bearer {SR}"}

email = sys.argv[1] if len(sys.argv) > 1 else "halecase2@gmail.com"
purpose = sys.argv[2] if len(sys.argv) > 2 else "login"

users = requests.get(f"{SB}/rest/v1/users?email=eq.{email}&select=id", headers=H).json()
if not users:
    sys.exit(f"no user with email {email}")
uid = users[0]["id"]
rowsp = requests.get(
    f"{SB}/rest/v1/two_factor_codes?user_id=eq.{uid}&purpose=eq.{purpose}"
    f"&used=eq.false&order=created_at.desc&limit=1", headers=H).json()
if not rowsp:
    sys.exit(f"no pending {purpose} code for {email}")
target = rowsp[0]["code_hash"]
for i in range(1000000):
    c = f"{i:06d}"
    if hashlib.sha256(c.encode()).hexdigest() == target:
        print(c)
        break
else:
    sys.exit("code not found")
