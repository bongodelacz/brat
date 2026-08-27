# BratClient — deployment (Vercel + Render + Supabase)

Stack: **React (Vercel)** + **FastAPI (Render / Railway / Docker)** + **Supabase (Postgres + Storage)** + **Resend (e-mail/2FA)**.
Zależności od Emergent zostały usunięte — maile idą przez Resend, `requirements.txt` odchudzony.

> WAŻNE: backend NIE działa na Vercelu (upload .exe do 100 MB przebija limit 4.5 MB funkcji serverless).
> Na Vercel idzie tylko **frontend**. Backend stawiamy na Render (jest gotowy `render.yaml`).

---

## 0. Supabase (raz)

1. Utwórz projekt na https://supabase.com (region EU: Frankfurt). Zapamiętaj hasło do bazy.
2. **SQL Editor → New query → Run**, uruchom PO KOLEI (osobno, w tej kolejności):
   1. cała treść `backend/supabase_schema.sql`
   2. `backend/supabase_migration_002.sql`
   3. `backend/supabase_migration_003.sql`
3. **Project Settings → API** → skopiuj:
   - `Project URL` → `SUPABASE_URL`
   - klucz `service_role` (SEKRET) → `SUPABASE_SERVICE_ROLE_KEY`

Bucket `builds` (prywatny, 200 MB) tworzy się ze schematu. RLS jest włączone bez polityk →
dane widzi wyłącznie backend (service_role); klucz `anon` nie ma dostępu do niczego.

---

## 1. Resend — e-mail i 2FA (opcjonalne na start)

2FA i maile potwierdzające używają Resend (https://resend.com).

- **Nie masz jeszcze konta Resend?** Ustaw `REQUIRE_ADMIN_2FA=false` — admin loguje się
  samym hasłem, a projekt w pełni działa (maile są wtedy pomijane).
- **Masz Resend?** Utwórz API key, zweryfikuj domenę, ustaw:
  - `RESEND_API_KEY=re_...`
  - `EMAIL_FROM="BratClient <no-reply@twojadomena.pl>"` (domena musi być zweryfikowana;
    do testów działa `onboarding@resend.dev`)
  - `REQUIRE_ADMIN_2FA=true`

---

## 2. Backend (Render — Blueprint)

Repo zawiera `render.yaml`, więc:

1. Wypchnij repo na GitHub.
2. Render → **New → Blueprint** → wskaż repo (wykryje `render.yaml`, rootDir `backend`, plan free).
3. Uzupełnij sekrety (pola `sync: false`) — patrz tabela zmiennych niżej.
4. Deploy. Health check: `GET /api/health` → `{"status":"ok","database":"supabase"}`.
5. Zapisz URL backendu, np. `https://bratclient-api.onrender.com`.

Alternatywy:
- **Railway**: New Project → Deploy from GitHub → Root `backend`, start `uvicorn server:app --host 0.0.0.0 --port $PORT` (jest `Procfile`).
- **Docker**: `docker build -t bratclient-api backend; docker run -p 8001:8001 --env-file backend/.env bratclient-api`

### Zmienne środowiskowe backendu

| Zmienna | Wartość / opis |
|---|---|
| `SUPABASE_URL` | z Supabase (Project URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | z Supabase (service_role, sekret) |
| `SUPABASE_BUILD_BUCKET` | `builds` |
| `JWT_SECRET` | losowy hex (Render wygeneruje sam) |
| `CLIENT_API_KEY` | losowy hex (do aplikacji MC) |
| `CLIENT_API_SECRET` | losowy hex (do aplikacji MC) |
| `ADMIN_EMAIL` | Twój email logowania do panelu |
| `ADMIN_PASSWORD` | mocne hasło admina |
| `ADMIN_USERNAME` | np. `Admin` |
| `CORS_ORIGINS` | dokładny URL frontu, np. `https://twoj-front.vercel.app` (NIE `*`) |
| `PUBLIC_APP_URL` | URL frontu (do linków w mailach i `download_page`) |
| `COOKIE_SECURE` | `true` na produkcji (HTTPS) |
| `REQUIRE_ADMIN_2FA` | `false` bez Resend, `true` gdy masz `RESEND_API_KEY` |
| `RESEND_API_KEY` | z Resend (jeśli używasz maili) |
| `EMAIL_FROM` | `BratClient <onboarding@resend.dev>` lub własna domena |

Gotowe przykłady: `backend/.env.example`. Możesz użyć już wygenerowanych sekretów stamtąd.

---

## 3. Frontend (Vercel)

1. Vercel → **New Project** → import repo.
2. **Root Directory: `frontend`** (jest `vercel.json`: build `yarn build`, output `build`, SPA rewrites).
3. Environment Variable:
   - `REACT_APP_BACKEND_URL=https://bratclient-api.onrender.com` (BEZ `/api`, BEZ `/` na końcu)
4. Deploy.

---

## 4. Po deployu — checklista

- [ ] Wpisz URL frontu z Vercela do `CORS_ORIGINS` w backendzie i **zrestartuj backend**
      (przy `allow_credentials=true` wildcard `*` jest odrzucany przez przeglądarki).
- [ ] `GET /api/health` zwraca `{"status":"ok","database":"supabase"}`
- [ ] Logowanie adminem (`ADMIN_EMAIL` / `ADMIN_PASSWORD`). Jeśli `REQUIRE_ADMIN_2FA=true`,
      kod przyjdzie mailem (Resend).
- [ ] `/admin` → „Plik i wersja”: upload `.exe` (idzie do Supabase Storage)
- [ ] `/admin` → „API clienta”: skopiuj `X-Client-Key` i sekret do aplikacji MC (`CLIENT_API.md`)
- [ ] Konto testowe: `delivered@resend.dev` / `demo12345` (lifetime, klucz `BRAT-DEMO-DEMO-DEMO`)

---

## 5. Lokalnie

```bash
# backend
cd backend
cp .env.example .env          # uzupełnij SUPABASE_URL/KEY, ustaw COOKIE_SECURE=false
python -m pip install -r requirements.txt
uvicorn server:app --reload --port 8001

# frontend
cd frontend
cp .env.example .env          # REACT_APP_BACKEND_URL=http://localhost:8001
yarn install && yarn start
```
