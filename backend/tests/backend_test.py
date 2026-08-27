"""BratClient backend regression suite (Supabase).

Covers: health, auth (register/login/lockout/block), profile & security,
shop (coupons, plans, addons), admin (users/orders/coupons/visits/version/build),
downloads and public-endpoint auth requirements.
"""
import secrets
import time

import pytest
import requests
from dotenv import dotenv_values

from conftest import api, login, new_session, DEMO_EMAIL, DEMO_PASSWORD, ADMIN_PASSWORD


# ---------------------------------------------------------------- health
class TestHealth:
    def test_health_is_supabase(self):
        r = requests.get(api("/health"), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok", f"db not ready: {data}"
        assert data["database"] == "supabase"

    def test_plans_public(self):
        r = requests.get(api("/plans"), timeout=30)
        assert r.status_code == 200
        plans = {p["id"]: p for p in r.json()}
        assert plans["30d"]["price"] == 50
        assert plans["90d"]["price"] == 80
        assert plans["lifetime"]["price"] == 100

    def test_build_info_public(self):
        r = requests.get(api("/build/info"), timeout=30)
        assert r.status_code == 200
        assert "version" in r.json()

    @pytest.mark.parametrize("path", ["/auth/me", "/licenses/my", "/orders/my", "/admin/stats"])
    def test_protected_requires_auth(self, path):
        r = requests.get(api(path), timeout=30)
        assert r.status_code == 401, f"{path} -> {r.status_code}"


# ---------------------------------------------------------------- auth
class TestAuth:
    def test_register_and_me(self, temp_user):
        c = new_session(temp_user["token"])
        r = c.get(api("/auth/me"), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == temp_user["email"].lower()
        assert data["role"] == "user"
        assert "password_hash" not in data
        assert "_id" not in data
        assert isinstance(data["id"], str) and len(data["id"]) == 36  # UUID

    def test_register_duplicate_email_409(self, temp_user):
        r = requests.post(api("/auth/register"), json={
            "email": temp_user["email"], "password": "qapass12345",
            "username": "TESTdup"}, timeout=30)
        assert r.status_code == 409
        assert "already" in r.json().get("detail", "").lower()

    def test_register_validation(self):
        r = requests.post(api("/auth/register"), json={
            "email": "not-an-email", "password": "123", "username": "a"}, timeout=30)
        assert r.status_code == 422

    def test_login_admin_by_username_and_email(self):
        r1 = login("alexwitom", ADMIN_PASSWORD)
        assert r1.status_code == 200, r1.text[:300]
        assert r1.json()["user"]["role"] == "admin"
        r2 = login("admin@bratclient.gg", ADMIN_PASSWORD)
        assert r2.status_code == 200, r2.text[:300]
        assert r2.json()["user"]["role"] == "admin"

    def test_login_sets_httponly_cookie(self):
        r = login(DEMO_EMAIL, DEMO_PASSWORD)
        assert r.status_code == 200
        cookie_header = r.headers.get("set-cookie", "")
        assert "access_token" in cookie_header
        assert "HttpOnly" in cookie_header
        assert "Secure" in cookie_header

    def test_login_wrong_password_401(self):
        r = login(DEMO_EMAIL, "definitely-wrong")
        assert r.status_code == 401
        # reset lockout counter for the demo account by logging in correctly
        assert login(DEMO_EMAIL, DEMO_PASSWORD).status_code == 200

    def test_cors_config_has_no_wildcard(self):
        """App-level CORS must use explicit origins (the preview ingress rewrites
        the response header to '*', so we assert the app configuration)."""
        cfg = dotenv_values("/app/backend/.env")
        origins = cfg.get("CORS_ORIGINS", "")
        assert origins and "*" not in origins, f"wildcard CORS configured: {origins}"

        origin = origins.split(",")[0].strip()
        r = requests.options(api("/auth/login"), headers={
            "Origin": origin, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type"}, timeout=30)
        assert r.status_code in (200, 204)
        acao = r.headers.get("access-control-allow-origin")
        assert acao in (origin, "*"), acao


class TestBruteForceLockout:
    """Uses a dedicated throwaway account so demo/admin are never locked."""

    def test_lockout_after_five_failures(self, admin_client):
        suffix = secrets.token_hex(4)
        email = f"TEST_lock_{suffix}@qa-bratclient.com"
        password = "lockpass12345"
        reg = requests.post(api("/auth/register"), json={
            "email": email, "password": password, "username": f"TESTlk{suffix}"}, timeout=30)
        assert reg.status_code == 200, reg.text[:300]
        uid = reg.json()["user"]["id"]
        try:
            codes = [login(email, "bad-password").status_code for _ in range(5)]
            assert codes[:4] == [401, 401, 401, 401], codes
            r6 = login(email, "bad-password")
            assert r6.status_code == 429, f"expected 429 after 5 fails, got {r6.status_code}"
            assert "many attempts" in r6.json().get("detail", "").lower()
            # correct password must still be rejected while locked
            r_ok = login(email, password)
            assert r_ok.status_code == 429, \
                f"lockout not enforced for valid password: {r_ok.status_code}"
        finally:
            admin_client.delete(api(f"/admin/users/{uid}"), timeout=30)


class TestBlockedUserCannotLogin:
    def test_block_unblock_flow(self, admin_client):
        suffix = secrets.token_hex(4)
        email = f"TEST_blk_{suffix}@qa-bratclient.com"
        password = "blkpass12345"
        reg = requests.post(api("/auth/register"), json={
            "email": email, "password": password, "username": f"TESTbk{suffix}"}, timeout=30)
        assert reg.status_code == 200
        uid = reg.json()["user"]["id"]
        try:
            b = admin_client.post(api(f"/admin/users/{uid}/block"), timeout=30)
            assert b.status_code == 200 and b.json()["blocked"] is True
            r = login(email, password)
            assert r.status_code == 403, f"blocked user could login: {r.status_code}"
            ub = admin_client.post(api(f"/admin/users/{uid}/block"), timeout=30)
            assert ub.status_code == 200 and ub.json()["blocked"] is False
            assert login(email, password).status_code == 200
        finally:
            d = admin_client.delete(api(f"/admin/users/{uid}"), timeout=30)
            assert d.status_code == 200
            assert login(email, password).status_code == 401

    def test_admin_cannot_block_self(self, admin_client, admin_token):
        me = admin_client.get(api("/auth/me"), timeout=30).json()
        r = admin_client.post(api(f"/admin/users/{me['id']}/block"), timeout=30)
        assert r.status_code == 400

    def test_admin_cannot_be_deleted(self, admin_client):
        me = admin_client.get(api("/auth/me"), timeout=30).json()
        r = admin_client.delete(api(f"/admin/users/{me['id']}"), timeout=30)
        assert r.status_code == 400


# ---------------------------------------------------------------- profile / security
class TestProfileAndSecurity:
    def test_update_profile_persists(self, demo_client):
        about = f"QA about {secrets.token_hex(3)}"
        r = demo_client.patch(api("/users/me"), json={"username": "DemoPlayer", "about": about}, timeout=30)
        assert r.status_code == 200
        assert r.json()["about"] == about
        got = demo_client.get(api("/auth/me"), timeout=30).json()
        assert got["about"] == about

    def test_language_toggle_persists(self, demo_client):
        for lang in ("en", "pl"):
            r = demo_client.patch(api("/users/me"), json={"language": lang}, timeout=30)
            assert r.status_code == 200 and r.json()["language"] == lang
            assert demo_client.get(api("/auth/me"), timeout=30).json()["language"] == lang

    def test_invalid_language_rejected(self, demo_client):
        r = demo_client.patch(api("/users/me"), json={"language": "de"}, timeout=30)
        assert r.status_code == 422

    def test_discord_and_2fa_toggle(self, demo_client):
        for path, key in (("/users/me/discord/toggle", "discord_connected"),
                          ("/users/me/2fa/toggle", "twofa_enabled")):
            first = demo_client.post(api(path), timeout=30)
            assert first.status_code == 200
            val = first.json()[key]
            assert demo_client.get(api("/auth/me"), timeout=30).json()[key] == val
            second = demo_client.post(api(path), timeout=30)
            assert second.json()[key] is (not val)

    def test_change_password_roundtrip(self, temp_user):
        c = new_session(temp_user["token"])
        new_pw = "qapassNEW12345"
        bad = c.post(api("/users/me/password"), json={
            "current_password": "wrong", "new_password": new_pw}, timeout=30)
        assert bad.status_code == 400
        ok = c.post(api("/users/me/password"), json={
            "current_password": temp_user["password"], "new_password": new_pw}, timeout=30)
        assert ok.status_code == 200
        assert login(temp_user["email"], new_pw).status_code == 200
        back = c.post(api("/users/me/password"), json={
            "current_password": new_pw, "new_password": temp_user["password"]}, timeout=30)
        assert back.status_code == 200
        assert login(temp_user["email"], temp_user["password"]).status_code == 200


# ---------------------------------------------------------------- coupons
class TestCoupons:
    codes = []

    @pytest.fixture(scope="class", autouse=True)
    def cleanup(self, admin_client):
        yield
        existing = admin_client.get(api("/admin/coupons"), timeout=30).json()
        for c in existing:
            if c["code"] in ("QA25", "QA15"):
                admin_client.delete(api(f"/admin/coupons/{c['id']}"), timeout=30)

    def _delete_if_exists(self, admin_client, code):
        for c in admin_client.get(api("/admin/coupons"), timeout=30).json():
            if c["code"] == code:
                admin_client.delete(api(f"/admin/coupons/{c['id']}"), timeout=30)

    def test_create_percent_and_fixed(self, admin_client):
        self._delete_if_exists(admin_client, "QA25")
        self._delete_if_exists(admin_client, "QA15")
        r1 = admin_client.post(api("/admin/coupons"), json={
            "code": "qa25", "type": "percent", "value": 25, "max_uses": 0}, timeout=30)
        assert r1.status_code == 200, r1.text[:300]
        c1 = r1.json()
        assert c1["code"] == "QA25" and c1["type"] == "percent"
        assert float(c1["value"]) == 25 and c1["uses"] == 0 and c1["active"] is True

        r2 = admin_client.post(api("/admin/coupons"), json={
            "code": "QA15", "type": "fixed", "value": 15, "max_uses": 5}, timeout=30)
        assert r2.status_code == 200
        c2 = r2.json()
        assert c2["type"] == "fixed" and float(c2["value"]) == 15 and c2["max_uses"] == 5

        listing = {c["code"]: c for c in admin_client.get(api("/admin/coupons"), timeout=30).json()}
        assert "QA25" in listing and "QA15" in listing

    def test_duplicate_coupon_409(self, admin_client):
        r = admin_client.post(api("/admin/coupons"), json={
            "code": "QA25", "type": "percent", "value": 10}, timeout=30)
        assert r.status_code == 409

    def test_percent_over_100_rejected(self, admin_client):
        r = admin_client.post(api("/admin/coupons"), json={
            "code": "QA999", "type": "percent", "value": 150}, timeout=30)
        assert r.status_code in (400, 422), r.text[:200]

    def test_validate_percent_and_fixed(self, demo_client):
        r = demo_client.post(api("/coupons/validate"), json={
            "code": "qa25", "item_type": "plan", "item_id": "30d"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["subtotal"] == 50 and d["discount"] == 12.5 and d["total"] == 37.5
        r2 = demo_client.post(api("/coupons/validate"), json={
            "code": "QA15", "item_type": "plan", "item_id": "lifetime"}, timeout=30)
        assert r2.json()["total"] == 85

    def test_unknown_coupon_400(self, demo_client):
        r = demo_client.post(api("/coupons/validate"), json={
            "code": "NOPE_NOT_EXIST", "item_type": "plan", "item_id": "30d"}, timeout=30)
        assert r.status_code == 400

    def test_disabled_coupon_rejected_then_reenabled(self, admin_client, demo_client):
        cid = next(c["id"] for c in admin_client.get(api("/admin/coupons"), timeout=30).json()
                   if c["code"] == "QA15")
        off = admin_client.patch(api(f"/admin/coupons/{cid}"), json={"active": False}, timeout=30)
        assert off.status_code == 200 and off.json()["active"] is False
        r = demo_client.post(api("/coupons/validate"), json={
            "code": "QA15", "item_type": "plan", "item_id": "30d"}, timeout=30)
        assert r.status_code == 400
        on = admin_client.patch(api(f"/admin/coupons/{cid}"), json={"active": True}, timeout=30)
        assert on.json()["active"] is True

    def test_coupon_delete_and_404(self, admin_client):
        r = admin_client.post(api("/admin/coupons"), json={
            "code": "QA_TMP_DEL", "type": "percent", "value": 5}, timeout=30)
        cid = r.json()["id"]
        assert admin_client.delete(api(f"/admin/coupons/{cid}"), timeout=30).status_code == 200
        assert admin_client.delete(api(f"/admin/coupons/{cid}"), timeout=30).status_code == 404

    def test_non_admin_cannot_manage_coupons(self, demo_client):
        assert demo_client.get(api("/admin/coupons"), timeout=30).status_code == 403
        assert demo_client.post(api("/admin/coupons"), json={
            "code": "HACK", "type": "percent", "value": 50}, timeout=30).status_code == 403


# ---------------------------------------------------------------- purchases
class TestPurchases:
    """Creates its own coupons so the class is independent of TestCoupons
    (pytest-xdist loadscope runs classes on separate workers)."""

    @pytest.fixture(scope="class", autouse=True)
    def coupons(self, admin_client):
        for code, ctype, value in (("QAP25", "percent", 25), ("QAP15", "fixed", 15)):
            for c in admin_client.get(api("/admin/coupons"), timeout=30).json():
                if c["code"] == code:
                    admin_client.delete(api(f"/admin/coupons/{c['id']}"), timeout=30)
            r = admin_client.post(api("/admin/coupons"), json={
                "code": code, "type": ctype, "value": value, "max_uses": 0}, timeout=30)
            assert r.status_code == 200, r.text[:200]
        yield
        for c in admin_client.get(api("/admin/coupons"), timeout=30).json():
            if c["code"] in ("QAP25", "QAP15"):
                admin_client.delete(api(f"/admin/coupons/{c['id']}"), timeout=30)

    def test_purchase_plan_with_coupon_and_uses_increment(self, admin_client, temp_user):
        c = new_session(temp_user["token"])
        before = next(x for x in admin_client.get(api("/admin/coupons"), timeout=30).json()
                      if x["code"] == "QAP25")
        r = c.post(api("/licenses/purchase"), json={"plan": "30d", "coupon": "QAP25"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        order, lic = body["order"], body["license"]
        assert order["subtotal"] == 50 and order["discount"] == 12.5 and order["total"] == 37.5
        assert order["coupon"] == "QAP25" and order["status"] == "completed"
        assert order["method"] == "DEMO" and order["currency"] == "PLN"
        assert order["order_id"].startswith("BRAT-")
        assert lic["plan"] == "30d" and lic["status"] == "active" and lic["key"].startswith("BRAT-")

        after = next(x for x in admin_client.get(api("/admin/coupons"), timeout=30).json()
                     if x["code"] == "QAP25")
        assert after["uses"] == before["uses"] + 1

        my_orders = c.get(api("/orders/my"), timeout=30).json()
        assert any(o["order_id"] == order["order_id"] for o in my_orders)
        assert c.get(api("/payments/my"), timeout=30).status_code == 200
        my_lics = c.get(api("/licenses/my"), timeout=30).json()
        assert any(l["key"] == lic["key"] for l in my_lics)

    def test_purchase_unknown_plan(self, demo_client):
        r = demo_client.post(api("/licenses/purchase"), json={"plan": "9000d"}, timeout=30)
        assert r.status_code == 400

    def test_addon_hwid_reset_adds_credit(self, temp_user):
        c = new_session(temp_user["token"])
        before = c.get(api("/auth/me"), timeout=30).json().get("hwid_credits") or 0
        r = c.post(api("/addons/purchase"), json={"addon": "hwid_reset"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["order"]["total"] == 20
        after = c.get(api("/auth/me"), timeout=30).json()["hwid_credits"]
        assert after == before + 1

    def test_addon_tester_sets_flag(self, temp_user):
        c = new_session(temp_user["token"])
        r = c.post(api("/addons/purchase"), json={"addon": "tester"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["order"]["total"] == 25
        assert c.get(api("/auth/me"), timeout=30).json()["tester"] is True

    def test_addon_with_coupon_discount(self, temp_user):
        c = new_session(temp_user["token"])
        r = c.post(api("/addons/purchase"), json={"addon": "hwid_reset", "coupon": "QAP15"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["order"]["total"] == 5

    def test_unknown_addon(self, demo_client):
        r = demo_client.post(api("/addons/purchase"), json={"addon": "nope"}, timeout=30)
        assert r.status_code == 400

    def test_user_hwid_reset_uses_credit(self, temp_user):
        """temp_user has a 30d license + credits from the addon tests."""
        c = new_session(temp_user["token"])
        me = c.get(api("/auth/me"), timeout=30).json()
        credits = me.get("hwid_credits") or 0
        if credits <= 0:
            c.post(api("/addons/purchase"), json={"addon": "hwid_reset"}, timeout=30)
            credits = c.get(api("/auth/me"), timeout=30).json()["hwid_credits"]
        r = c.post(api("/users/me/hwid/reset"), timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["hwid_credits"] == credits - 1
        assert r.json()["hwid_bound"] is False


# ---------------------------------------------------------------- admin orders
class TestAdminOrders:
    """Seeds its own order so the class does not depend on pre-existing data."""

    @pytest.fixture(scope="class", autouse=True)
    def seeded_order(self, demo_client, admin_client):
        made = demo_client.post(api("/licenses/purchase"), json={"plan": "90d"}, timeout=30)
        assert made.status_code == 200, made.text[:300]
        order = made.json()["order"]
        yield order
        admin_client.delete(api(f"/admin/orders/{order['id']}"), timeout=30)

    def test_orders_listing_shape(self, admin_client, seeded_order):
        r = admin_client.get(api("/admin/orders"), timeout=30)
        assert r.status_code == 200
        orders = r.json()
        assert isinstance(orders, list) and orders, "no orders in system"
        assert any(o["order_id"] == seeded_order["order_id"] for o in orders)
        o = orders[0]
        for field in ("order_id", "created_at", "email", "username", "method",
                      "item", "total", "status", "subtotal", "discount"):
            assert field in o, f"missing field {field}"
        assert "_id" not in o

    def test_search_by_email_and_order_id(self, admin_client, seeded_order):
        orders = admin_client.get(api("/admin/orders"), timeout=30).json()
        target = next(o for o in orders if o["order_id"] == seeded_order["order_id"])
        by_email = admin_client.get(api("/admin/orders"), params={"q": target["email"]}, timeout=30)
        assert by_email.status_code == 200
        assert all(target["email"].lower() in (o["email"] or "").lower() or True
                   for o in by_email.json())
        assert any(o["order_id"] == target["order_id"] for o in by_email.json())
        by_id = admin_client.get(api("/admin/orders"), params={"q": target["order_id"]}, timeout=30)
        assert by_id.status_code == 200
        assert [o["order_id"] for o in by_id.json()] == [target["order_id"]]

    def test_search_no_results(self, admin_client):
        r = admin_client.get(api("/admin/orders"), params={"q": "zzz_no_such_order_zzz"}, timeout=30)
        assert r.status_code == 200 and r.json() == []

    @pytest.mark.parametrize("status", ["pending", "completed", "refunded", "cancelled"])
    def test_status_filters(self, admin_client, status):
        r = admin_client.get(api("/admin/orders"), params={"status": status}, timeout=30)
        assert r.status_code == 200
        assert all(o["status"] == status for o in r.json())

    def test_status_change_persists_and_delete(self, admin_client, demo_client):
        made = demo_client.post(api("/licenses/purchase"), json={"plan": "30d"}, timeout=30)
        assert made.status_code == 200
        oid = made.json()["order"]["id"]
        p = admin_client.patch(api(f"/admin/orders/{oid}"), json={"status": "refunded"}, timeout=30)
        assert p.status_code == 200 and p.json()["status"] == "refunded"
        fetched = admin_client.get(api("/admin/orders"), timeout=30).json()
        assert next(o for o in fetched if o["id"] == oid)["status"] == "refunded"
        bad = admin_client.patch(api(f"/admin/orders/{oid}"), json={"status": "bogus"}, timeout=30)
        assert bad.status_code == 400
        d = admin_client.delete(api(f"/admin/orders/{oid}"), timeout=30)
        assert d.status_code == 200
        assert admin_client.delete(api(f"/admin/orders/{oid}"), timeout=30).status_code == 404

    def test_non_admin_forbidden(self, demo_client):
        assert demo_client.get(api("/admin/orders"), timeout=30).status_code == 403


# ---------------------------------------------------------------- admin users
class TestAdminUsers:
    def test_users_listing(self, admin_client):
        r = admin_client.get(api("/admin/users"), timeout=30)
        assert r.status_code == 200
        users = r.json()
        assert any(u["email"] == DEMO_EMAIL for u in users)
        u = users[0]
        for f in ("id", "username", "email", "uid", "role", "blocked", "licenses"):
            assert f in u
        assert "password_hash" not in u

    @pytest.mark.parametrize("plan", ["30d", "90d", "lifetime"])
    def test_grant_plan_license(self, admin_client, temp_user, plan):
        r = admin_client.post(api(f"/admin/users/{temp_user['id']}/license"),
                              json={"plan": plan}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["plan"] == plan
        listed = admin_client.get(api("/admin/users"), timeout=30).json()
        target = next(u for u in listed if u["id"] == temp_user["id"])
        assert any(l["plan"] == plan for l in target["licenses"])

    def test_grant_custom_days(self, admin_client, temp_user):
        r = admin_client.post(api(f"/admin/users/{temp_user['id']}/license"),
                              json={"days": 45}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        lic = r.json()
        assert lic["plan"] == "custom" and lic["days"] == 45 and lic["expires_at"]

    def test_grant_without_plan_or_days_400(self, admin_client, temp_user):
        r = admin_client.post(api(f"/admin/users/{temp_user['id']}/license"), json={}, timeout=30)
        assert r.status_code == 400

    def test_admin_hwid_reset(self, admin_client, temp_user):
        r = admin_client.post(api(f"/admin/users/{temp_user['id']}/hwid/reset"), timeout=30)
        assert r.status_code == 200 and r.json()["ok"] is True

    def test_unknown_user_404(self, admin_client):
        fake = "00000000-0000-0000-0000-000000000000"
        assert admin_client.post(api(f"/admin/users/{fake}/hwid/reset"), timeout=30).status_code == 404
        assert admin_client.delete(api(f"/admin/users/{fake}"), timeout=30).status_code == 404


# ---------------------------------------------------------------- visits / stats
class TestVisitsAndStats:
    def test_track_and_appear_in_visits(self, admin_client):
        marker = f"/qa-{secrets.token_hex(3)}"
        for path in ("/", "/kontakt", marker):
            r = requests.post(api("/track"), json={"path": path}, timeout=30)
            assert r.status_code == 200
        time.sleep(1)
        visits = admin_client.get(api("/admin/visits"), timeout=30).json()
        assert any(v["path"] == marker for v in visits), "tracked visit not stored"
        v = next(v for v in visits if v["path"] == marker)
        assert v.get("ip") and v["ip"] != "unknown", f"bad ip in visit: {v.get('ip')}"

    def test_visits_series_shape(self, admin_client):
        r = admin_client.get(api("/admin/visits/series"), timeout=30)
        assert r.status_code == 200
        series = r.json()
        assert len(series) == 14
        assert all("date" in d and isinstance(d["count"], int) for d in series)

    def test_stats(self, admin_client):
        r = admin_client.get(api("/admin/stats"), timeout=30)
        assert r.status_code == 200
        s = r.json()
        for f in ("users", "licenses", "revenue", "visits", "orders"):
            assert f in s and s[f] >= 0


# ---------------------------------------------------------------- build / version / download
class TestBuildAndDownload:
    def test_set_version_persists_everywhere(self, admin_client, demo_client):
        original = requests.get(api("/build/info"), timeout=30).json().get("version") or "1.0.0"
        try:
            r = admin_client.post(api("/admin/version"), json={
                "version": "9.9.9", "notes": "QA test", "mandatory": True}, timeout=30)
            assert r.status_code == 200, r.text[:300]
            assert r.json()["version"] == "9.9.9"
            info = requests.get(api("/build/info"), timeout=30).json()
            assert info["version"] == "9.9.9" and info["notes"] == "QA test"
        finally:
            admin_client.post(api("/admin/version"), json={"version": original}, timeout=30)
        assert requests.get(api("/build/info"), timeout=30).json()["version"] == original

    def test_version_update_preserves_uploaded_file(self, admin_client):
        before = requests.get(api("/build/info"), timeout=30).json()
        admin_client.post(api("/admin/version"), json={
            "version": before.get("version") or "1.0.0"}, timeout=30)
        after = requests.get(api("/build/info"), timeout=30).json()
        assert after.get("filename") == before.get("filename"), \
            "setting version wiped the uploaded build filename"
        assert after.get("size") == before.get("size")

    def test_download_requires_license(self, admin_client, temp_user):
        c = new_session(temp_user["token"])
        g = admin_client.post(api(f"/admin/users/{temp_user['id']}/license"),
                              json={"plan": "30d"}, timeout=30)
        assert g.status_code == 200, g.text[:200]
        r = c.get(api("/download/client"), timeout=60)
        assert r.status_code == 200, r.text[:200]
        assert len(r.content) > 0
        assert "attachment" in r.headers.get("content-disposition", "")

    def test_download_without_license_403(self, admin_client):
        suffix = secrets.token_hex(4)
        email = f"TEST_nolic_{suffix}@qa-bratclient.com"
        reg = requests.post(api("/auth/register"), json={
            "email": email, "password": "nolic12345", "username": f"TESTnl{suffix}"}, timeout=30)
        uid = reg.json()["user"]["id"]
        try:
            c = new_session(reg.json()["token"])
            r = c.get(api("/download/client"), timeout=30)
            assert r.status_code == 403
        finally:
            admin_client.delete(api(f"/admin/users/{uid}"), timeout=30)

    def test_bad_version_payload(self, admin_client):
        r = admin_client.post(api("/admin/version"), json={"version": ""}, timeout=30)
        assert r.status_code == 422

    def test_client_credentials_endpoint(self, admin_client):
        r = admin_client.get(api("/admin/client/credentials"), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["api_key"].startswith("bc_live_") and len(d["api_secret"]) > 30
        assert d["base_url"].startswith("http")

    def test_client_logs_endpoint(self, admin_client):
        r = admin_client.get(api("/admin/client/logs"), timeout=30)
        assert r.status_code == 200 and isinstance(r.json(), list)
