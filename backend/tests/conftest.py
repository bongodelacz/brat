import os
import secrets

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
BASE_URL = base_url.rstrip("/")

ADMIN_LOGIN = "alexwitom"
ADMIN_PASSWORD = "lobaczus2009"
DEMO_EMAIL = "demo@bratclient.gg"
DEMO_PASSWORD = "demo12345"


def api(path):
    return f"{BASE_URL}/api{path}"


def new_session(token=None):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def login(identifier, password):
    r = requests.post(api("/auth/login"), json={"email": identifier, "password": password}, timeout=30)
    return r


@pytest.fixture(scope="session")
def admin_token():
    r = login(ADMIN_LOGIN, ADMIN_PASSWORD)
    if r.status_code != 200:
        pytest.fail(f"Admin login failed {r.status_code}: {r.text[:300]}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_client(admin_token):
    return new_session(admin_token)


@pytest.fixture(scope="session")
def demo_token():
    r = login(DEMO_EMAIL, DEMO_PASSWORD)
    if r.status_code != 200:
        pytest.fail(f"Demo login failed {r.status_code}: {r.text[:300]}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def demo_client(demo_token):
    return new_session(demo_token)


@pytest.fixture(scope="session")
def temp_user(admin_client):
    """Fresh throwaway account, deleted at session end."""
    suffix = secrets.token_hex(4)
    email = f"TEST_qa_{suffix}@qa-bratclient.com"
    password = "qapass12345"
    r = requests.post(api("/auth/register"), json={
        "email": email, "password": password, "username": f"TESTqa{suffix}"}, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"temp user register failed {r.status_code}: {r.text[:300]}")
    data = r.json()
    info = {"email": email, "password": password,
            "id": data["user"]["id"], "token": data["token"],
            "username": data["user"]["username"]}
    yield info
    admin_client.delete(api(f"/admin/users/{info['id']}"), timeout=30)
