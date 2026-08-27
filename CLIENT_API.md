> Wersja: 2026-08-27 · Wszystko, co potrzebne, aby podłączyć aplikację Minecraft do serwera BratClient.

# BratClient — pełna dokumentacja API dla clienta

**Base URL:** wartość `REACT_APP_BACKEND_URL` / `PUBLIC_APP_URL`
(preview: `https://cheat-shop-pro-1.preview.emergentagent.com`, po deployu — Twoja domena)

**Klucze:** Panel admina → **API clienta** (`X-Client-Key` + `CLIENT_API_SECRET`).
Wszystkie endpointy to `POST`, `Content-Type: application/json`.

---

## 1. Podpisywanie każdego żądania (obowiązkowe)

```
X-Client-Key: <CLIENT_API_KEY>
X-Timestamp:  <unix seconds>
X-Nonce:      <losowy string 8-64 znaków, nigdy nie powtórzony>
X-Signature:  hex( HMAC_SHA256( CLIENT_API_SECRET, "<X-Timestamp>.<X-Nonce>." + surowe_body ) )
```

Odrzucenia (HTTP 401): `BAD_API_KEY`, `MISSING_SIGNATURE`, `BAD_SIGNATURE`, `BAD_TIMESTAMP`,
`STALE_TIMESTAMP` (>120 s różnicy), `BAD_NONCE`, `REPLAY_DETECTED`.
HTTP 429 `RATE_LIMITED` — limit 90 żądań/min na IP, 20 logowań/min.

**Ważne:** podpisujesz **dokładnie te same bajty**, które wysyłasz. Nie formatuj JSON-a
ponownie po podpisaniu (żadnych dodatkowych spacji), inaczej podpis nie zgadza się.

---

## 2. Logowanie gracza — `POST /api/client/auth`

Wariant A (Login + Hasło — to, co gracz wpisuje w kliencie):
```json
{ "login": "alexwitom", "password": "haslo", "hwid": "<hwid>", "version": "1.0.0" }
```
Pola `login`, `username`, `identifier`, `email` są równoważne — możesz użyć dowolnego.
Login może być nazwą użytkownika **albo** e-mailem.

Wariant B (klucz licencji):
```json
{ "license_key": "BRAT-XXXX-XXXX-XXXX", "hwid": "<hwid>", "version": "1.0.0" }
```

Odpowiedź OK (HTTP 200):
```json
{
  "valid": true, "code": "OK",
  "username": "DemoPlayer", "uid": "BRAT-D3M001", "email": "gracz@mail.com",
  "plan": "lifetime", "license_key": "BRAT-...", "expires_at": null,
  "tester": false, "role": "user",
  "hwid": "<hwid>", "hwid_just_bound": true,
  "session_token": "…",            // trzymaj w pamięci, używaj do heartbeat i configów
  "latest_version": "1.0.0",
  "version_ok": true,
  "update_mandatory": true,
  "build_available": true           // false = admin zablokował build, nie startuj
}
```

Odmowa (HTTP 200, `valid: false`), pole `code`:
`INVALID_CREDENTIALS`, `NO_LICENSE`, `LICENSE_EXPIRED`, `HWID_MISMATCH`, `ACCOUNT_BLOCKED`.
HTTP 400 `BAD_HWID` — HWID krótszy niż 8 lub dłuższy niż 128 znaków.

### HWID
- Pierwszy HWID wysłany dla konta zostaje **zbindowany na stałe** (`hwid_just_bound: true`).
- Inny komputer → `HWID_MISMATCH`, dopóki gracz nie zrobi resetu w panelu
  (lifetime: darmowo raz na 7 dni, inne plany: dodatek „HWID Reset”) albo admin nie odbinduje.
- Generowanie (Windows): `sha256(MachineGuid + serial dysku + UUID płyty)`, weź 32 znaki hex.
  Ta sama maszyna musi zawsze dawać ten sam string.

---

## 3. Heartbeat — `POST /api/client/heartbeat`

Wołaj co ~60 s w trakcie gry.
```json
{ "session_token": "…", "hwid": "<hwid>" }
```
OK: `{"valid":true,"code":"OK","plan":"lifetime","expires_at":null,"tester":false,"latest_version":"1.0.0","update_mandatory":true}`
Błędy (`valid:false`): `INVALID_SESSION`, `HWID_MISMATCH`, `LICENSE_EXPIRED`, `ACCOUNT_BLOCKED`
→ natychmiast zamknij client.
Sesja żyje 24 h; ban konta, reset HWID i wygaśnięcie licencji ubijają ją od razu.

---

## 4. Wersja — `POST /api/client/version`

```json
{ "version": "1.0.0" }
```
```json
{
  "version": "1.0.1", "up_to_date": false, "mandatory": true,
  "notes": "changelog…", "filename": "BratClient.exe", "size": 26489776,
  "uploaded_at": "2026-08-27T07:57:45Z", "available": true,
  "download_page": "https://twoja-domena/panel"
}
```
`up_to_date: false` → pokaż „pobierz nowy .exe z panelu” (link: `download_page`).
`mandatory: true` → zablokuj start. `available: false` → build zablokowany przez admina.

---

## 5. Wylogowanie — `POST /api/client/logout`
```json
{ "session_token": "…" }
```

---

## 6. Configi modułów (chmura)

Autoryzacja w każdym z tych endpointów: **`session_token`** (z `/client/auth`) **albo**
`login` + `password`.

### 6.1 Zapis / aktualizacja — `POST /api/client/configs/save`

```json
{
  "session_token": "…",
  "name": "PVP Anarchia",
  "description": "killaura + scaffold pod anarchia.gg",
  "version": "1.0.0",
  "is_public": true,
  "settings": {
    "KillAura": { "enabled": true, "range": 4.2, "cps": 12, "mode": "Switch", "targets": ["players"] },
    "Scaffold": { "enabled": true, "tower": true, "expand": 2, "rotations": "Humanized" },
    "Velocity": { "enabled": false, "horizontal": 0.4, "vertical": 0.0 }
  }
}
```
- `settings` to **dowolny JSON** (obiekt albo lista) — wrzuć pełny dump wszystkich 200+ modułów
  w formacie, w jakim client już je serializuje. Serwer nic nie zmienia, oddaje 1:1.
- Limit: **512 KB** na config (`CONFIG_TOO_LARGE` przy przekroczeniu).
- `modules_count` liczy się automatycznie (liczba kluczy w `settings` albo w `settings.modules`).
- Aby **nadpisać** istniejący config, dołóż `"code": "DFVMG"` (musi być Twój, inaczej `NOT_YOUR_CONFIG`).

Odpowiedź:
```json
{ "valid": true, "code": "DFVMG", "id": "uuid", "name": "PVP Anarchia",
  "modules_count": 3, "size_bytes": 412, "is_public": true, "downloads": 0,
  "author": "alexwitom", "updated_at": "…" }
```
`code` to publiczne ID configu — pokaż graczowi jako **`#DFVMG`**.
Config od razu widać w panelu gracza w zakładce **Configi** (przypisany do konta).

### 6.2 Import po ID — `POST /api/client/configs/get`

```json
{ "code": "DFVMG" }
```
(`#DFVMG`, `DFVMG`, małe litery — wszystko przejdzie; pola `config_id` i `id` też działają)

```json
{
  "valid": true,
  "config": {
    "id": "uuid", "code": "DFVMG", "name": "PVP Anarchia", "author": "alexwitom",
    "description": "…", "modules_count": 3, "client_version": "1.0.0",
    "is_public": true, "downloads": 7, "size_bytes": 412,
    "created_at": "…", "updated_at": "…",
    "settings": { "KillAura": { "...": "..." } }
  }
}
```
Błędy: `{"valid": false, "code": "CONFIG_NOT_FOUND"}` albo `CONFIG_PRIVATE`
(prywatny config wymaga autoryzacji właściciela — dołóż `session_token`).
Każdy udany import zwiększa licznik `downloads`.

### 6.3 Lista configów gracza — `POST /api/client/configs/list`
```json
{ "session_token": "…" }
```
→ `{ "valid": true, "configs": [ { "code": "DFVMG", "name": "…", "modules_count": 217, … } ] }`
(bez `settings` — po treść wołaj `configs/get`)

### 6.4 Usunięcie — `POST /api/client/configs/delete`
```json
{ "session_token": "…", "code": "DFVMG" }
```
→ `{ "valid": true }` albo `code`: `CONFIG_NOT_FOUND` / `NOT_YOUR_CONFIG`

---

## 7. Rekomendowany przepływ w kliencie

1. **Start** → `/client/version` (jeśli `up_to_date == false` i `mandatory` → ekran „zaktualizuj”).
2. **Ekran logowania** (Login + Hasło) → `/client/auth` z `hwid` i `version`.
   - `valid: false` → pokaż komunikat wg tabeli kodów.
   - `valid: true` → zapisz `session_token`, wpuść gracza.
3. **W tle co 60 s** → `/client/heartbeat`. `valid: false` → wyłącz client.
4. **Zapis configu** (przycisk „Save”) → `/client/configs/save` → pokaż `#CODE` graczowi.
5. **Import configu** (przycisk „Import”, gracz wkleja ID) → `/client/configs/get` → wczytaj `settings`.
6. **Wyjście** → `/client/logout`.

## 8. Komunikaty dla gracza (propozycja)

| code | komunikat |
|---|---|
| `INVALID_CREDENTIALS` | Zły login lub hasło |
| `NO_LICENSE` | Brak licencji — kup ją na stronie |
| `LICENSE_EXPIRED` | Licencja wygasła — odnów w panelu |
| `HWID_MISMATCH` | Licencja przypisana do innego komputera — zrób reset HWID w panelu |
| `ACCOUNT_BLOCKED` | Konto zablokowane — napisz na Discordzie |
| `RATE_LIMITED` | Za dużo prób, odczekaj chwilę |
| `CONFIG_NOT_FOUND` | Nie ma configu o takim ID |
| `CONFIG_PRIVATE` | Ten config jest prywatny |
| `CONFIG_TOO_LARGE` | Config za duży (limit 512 KB) |

---

## 9. Java — gotowy klient HTTP

```java
public final class BratApi {
    private static final String BASE   = "https://twoja-domena";
    private static final String KEY    = "<CLIENT_API_KEY>";
    private static final String SECRET = "<CLIENT_API_SECRET>";
    private static final HttpClient HTTP = HttpClient.newHttpClient();

    public static String post(String path, String jsonBody) throws Exception {
        String ts    = String.valueOf(System.currentTimeMillis() / 1000);
        String nonce = UUID.randomUUID().toString().replace("-", "");

        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] raw = mac.doFinal((ts + "." + nonce + "." + jsonBody).getBytes(StandardCharsets.UTF_8));
        StringBuilder sig = new StringBuilder();
        for (byte b : raw) sig.append(String.format("%02x", b));

        HttpRequest req = HttpRequest.newBuilder(URI.create(BASE + path))
            .header("Content-Type", "application/json")
            .header("X-Client-Key", KEY)
            .header("X-Timestamp", ts)
            .header("X-Nonce", nonce)
            .header("X-Signature", sig.toString())
            .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
            .build();
        return HTTP.send(req, HttpResponse.BodyHandlers.ofString()).body();
    }

    // logowanie
    public static String login(String login, String pass, String hwid, String ver) throws Exception {
        String body = new Gson().toJson(Map.of(
            "login", login, "password", pass, "hwid", hwid, "version", ver));
        return post("/api/client/auth", body);
    }

    // zapis configu — settings to Twoja mapa modul -> ustawienia
    public static String saveConfig(String session, String name, Map<String, Object> settings) throws Exception {
        String body = new Gson().toJson(Map.of(
            "session_token", session, "name", name, "is_public", true, "settings", settings));
        return post("/api/client/configs/save", body);
    }

    // import configu po ID
    public static String importConfig(String code) throws Exception {
        return post("/api/client/configs/get", new Gson().toJson(Map.of("code", code)));
    }
}
```

## 10. Bezpieczeństwo — co po Twojej stronie

Serwer: HMAC + nonce + timestamp + rate limit + bind HWID + heartbeat + logi logowań
(widoczne w adminie). Czego serwer nie zrobi za Ciebie w `.exe` na komputerze gracza:
1. **Obfuskacja sekretu** (ConfuserEx / ProGuard / VMProtect) + szyfrowanie stringów.
2. **Certificate pinning** na HTTPS (żeby Fiddler/mitmproxy nie czytał ruchu).
3. **Nie ufaj samemu `valid: true`** — trzymaj część logiki/configów po stronie serwera,
   żeby crack nie miał czego odpalić.
4. **Reaguj na heartbeat** — `valid:false` = koniec sesji, zamknij proces.
5. Wykrywanie debuggerów/hooków.

## 11. Szybki test z konsoli (Python)

```bash
python3 /app/tests_v2.py          # 44+ asercji: 2FA, buildy, kupony, client API
python3 /app/tests_configs.py     # configi: zapis, import po ID, prywatność, limity
```
