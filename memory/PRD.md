# BratClient (dawniej Vqt Client) — PRD

## Problem statement (oryginał)
Sklep/panel dla "BratClient" (client cheat do Minecrafta). Motyw 100% czarno-biały, zero gradientów,
bardzo dobre animacje, font Outfit. Licencje 30dni=50zł / 90dni=80zł / lifetime=100zł + dodatki
(HWID Reset 20zł, Tester 25zł). Logowanie/rejestracja. Panel użytkownika: język, profil (avatar, nazwa,
UID, o mnie), konto i bezpieczeństwo (email, hasło, Discord, 2FA), zamówienia, pobieranie .exe.
Panel admina: użytkownicy, własne dni licencji, upload .exe, zamówienia, kupony, wersja clienta, API clienta.
Tłumaczenie PL/EN (domyślnie PL). Integracja z aplikacją Minecraft przez API (licencja + HWID + wersja).

## Architektura
- Frontend: React + Tailwind + framer-motion + lenis. Routing: `/`, `/auth`, `/panel`, `/admin`, `/kontakt`.
- Backend: FastAPI + MongoDB (motor), JWT (bcrypt, cookie + Bearer), prefix `/api`.
- Object storage (Emergent) dla builda `.exe`.
- Płatności: MOCKED (metoda "DEMO" w zamówieniu) — brak realnej bramki.
- Client API (aplikacja MC): HMAC-SHA256 + timestamp + nonce + rate limit. Dokumentacja: `/app/CLIENT_API.md`.

## Kolekcje Mongo
users, licenses, orders, coupons, addons, visits, builds ("latest": version/mandatory/notes/filename/path),
client_logs, client_sessions, client_nonces (TTL), client_rate (TTL), login_attempts.

## Zrealizowane
- (2026-08-22..26) Landing (hero z blokiem 3D bedrock, manifest, opinie, cennik, stopka), auth JWT,
  panel użytkownika, panel admina (użytkownicy/licencje/blokady/odwiedziny/wykres), custom modale,
  upload realnego `.exe` do object storage, HWID reset (lifetime co 7 dni / kredyty), i18n PL/EN,
  motyw czarno-biały, kontakt jako podstrona.
- (2026-08-26, ta iteracja):
  - **Rebrand na BratClient** w całym UI (logo B / BRATCLIENT, klucze `BRAT-...`, UID `BRAT-...`,
    email support@bratclient.gg, migracja starych kluczy VQT- → BRAT-).
  - **Zamówienia (orders)** w bazie: Order ID / data / email / konto / metoda / produkt / kwota / status
    (+ subtotal, rabat, kupon). Widok w panelu użytkownika i panelu admina (szukanie, filtry statusów,
    zmiana statusu pending/completed/refunded/cancelled, usuwanie). Migracja starych `payments` → `orders`.
    Przychód w statystykach liczony ze zamówień `completed`.
  - **Kupony**: admin tworzy kod, typ (% lub kwotowy PLN), wartość, max użyć, datę wygaśnięcia;
    włączanie/wyłączanie, usuwanie, licznik użyć. Pole kuponu w cenniku na landingu z podglądem
    przeliczonych cen. Walidacja `POST /api/coupons/validate`.
  - **Wersja clienta**: admin ustawia numer wersji + changelog + flagę "aktualizacja wymagana".
    Wersja widoczna w panelu użytkownika i zwracana do aplikacji MC.
  - **API dla aplikacji Minecraft**: `POST /api/client/auth` (login+hasło albo klucz licencji + HWID),
    `/api/client/heartbeat`, `/api/client/version`, `/api/client/logout`. Kody: OK, INVALID_CREDENTIALS,
    NO_LICENSE, LICENSE_EXPIRED, HWID_MISMATCH, ACCOUNT_BLOCKED. Bindowanie HWID przy pierwszym
    uruchomieniu, reset z panelu usera lub admina. Zakładka "API clienta" w panelu admina
    (klucz, sekret, endpointy, snippet Java, logi logowań z clienta).
  - Poprawki: zakup dodatku HWID Reset (zły identyfikator addonu), brak zapytania /auth/me bez tokenu,
    statusy zamówień po polsku, race condition w formularzu wersji.

## Backlog
- P0: prawdziwe płatności (Stripe/Razorpay) — obecnie DEMO/MOCKED.
- P1: prawdziwy Discord OAuth (obecnie toggle MOCKED), prawdziwe 2FA TOTP (MOCKED).
- P1: obfuskacja/pinning po stronie aplikacji MC (do zrobienia w kodzie clienta, poza tym repo).
- P2: reset hasła przez email, FAQ, changelog na landingu, wybuch bloku 3D w hero po kliknięciu,
  prawdziwy link Discord, shadcn Select w tabeli zamówień.

## Credentials
`/app/memory/test_credentials.md`
