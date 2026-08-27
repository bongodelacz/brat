import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, ShieldCheck, Terminal } from "lucide-react";
import { useLang } from "@/i18n";
import api from "@/lib/api";

const BASE = process.env.REACT_APP_BACKEND_URL;

const ENDPOINTS = [
  ["POST", "/api/client/auth", "{ identifier, password, hwid, version }  lub  { license_key, hwid, version }"],
  ["POST", "/api/client/heartbeat", "{ session_token, hwid }"],
  ["POST", "/api/client/version", "{ version }"],
  ["POST", "/api/client/logout", "{ session_token }"],
];

const CODES = [
  ["OK", "wszystko gra — licencja aktywna, HWID zgodny"],
  ["INVALID_CREDENTIALS", "złe dane logowania / nieznany klucz licencji"],
  ["NO_LICENSE", "konto istnieje, ale nigdy nie miało licencji"],
  ["LICENSE_EXPIRED", "licencja wygasła"],
  ["HWID_MISMATCH", "inny komputer niż zbindowany"],
  ["ACCOUNT_BLOCKED", "konto zbanowane w panelu admina"],
];

const SECURITY = [
  "HMAC-SHA256 podpis każdego żądania — bez CLIENT_API_SECRET nie da się podrobić zapytania.",
  "X-Timestamp ± 120 s + jednorazowy X-Nonce — zapytanie nie da się odtworzyć (replay attack).",
  "Rate limit 90 żądań/min na IP oraz 20 prób logowania/min.",
  "Bindowanie HWID: pierwszy komputer zapisuje się na koncie, kolejne dostają HWID_MISMATCH.",
  "Sesja clienta (session_token) wygasa po 24 h; blokada konta i reset HWID natychmiast ją kasują.",
  "Heartbeat co 60 s w trakcie gry — po banie albo wygaśnięciu licencji client traci dostęp od razu.",
];

const JAVA_SNIPPET = (base) => `// Java — podpis HMAC + logowanie
String base   = "${base}";
String apiKey = "TWOJ_X_CLIENT_KEY";
String secret = "TWOJ_CLIENT_API_SECRET";

String body  = "{\\"identifier\\":\\"" + login + "\\",\\"password\\":\\"" + pass
             + "\\",\\"hwid\\":\\"" + hwid + "\\",\\"version\\":\\"1.0.0\\"}";
String ts    = String.valueOf(System.currentTimeMillis() / 1000);
String nonce = UUID.randomUUID().toString().replace("-", "");

Mac mac = Mac.getInstance("HmacSHA256");
mac.init(new SecretKeySpec(secret.getBytes(UTF_8), "HmacSHA256"));
byte[] raw = mac.doFinal((ts + "." + nonce + "." + body).getBytes(UTF_8));
StringBuilder sig = new StringBuilder();
for (byte b : raw) sig.append(String.format("%02x", b));

HttpRequest req = HttpRequest.newBuilder(URI.create(base + "/api/client/auth"))
    .header("Content-Type", "application/json")
    .header("X-Client-Key", apiKey)
    .header("X-Timestamp", ts)
    .header("X-Nonce", nonce)
    .header("X-Signature", sig.toString())
    .POST(HttpRequest.BodyPublishers.ofString(body)).build();
// odpowiedz: {"valid":true,"plan":"lifetime","session_token":"...","latest_version":"1.0.0", ...}`;

const HWID_SNIPPET = `// Przykladowy HWID (Windows) — polacz kilka zrodel i zahashuj SHA-256
// wmic csproduct get uuid   +   numer seryjny dysku   +   MAC
String hwid = sha256(machineGuid + diskSerial + cpuId).substring(0, 32);`;

function Row({ label, value, secret, testId }) {
  const { t } = useLang();
  const [show, setShow] = useState(!secret);
  const copy = () => { navigator.clipboard.writeText(value || ""); toast.success(t("admin.api.copied")); };
  return (
    <div className="rounded-2xl border border-white/10 p-5">
      <p className="label-mono mb-3">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        <code className="flex-1 break-all font-mono2 text-xs text-white" data-testid={testId}>
          {show ? value || "—" : "•".repeat(48)}
        </code>
        {secret && (
          <button onClick={() => setShow(!show)} data-testid={`${testId}-toggle`}
            className="rounded-full border border-white/15 p-2.5 text-white/60 transition-colors hover:border-white hover:text-white">
            {show ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
        <button onClick={copy} data-testid={`${testId}-copy`}
          className="rounded-full border border-white/15 p-2.5 text-white/60 transition-colors hover:border-white hover:bg-white hover:text-black">
          <Copy size={13} />
        </button>
      </div>
    </div>
  );
}

export default function ApiTab() {
  const { t } = useLang();
  const [creds, setCreds] = useState(null);
  const [logs, setLogs] = useState(null);

  useEffect(() => {
    api.get("/admin/client/credentials").then(({ data }) => setCreds(data)).catch(() => {});
    api.get("/admin/client/logs").then(({ data }) => setLogs(data)).catch(() => {});
  }, []);

  const th = "label-mono border-b border-white/10 px-4 py-3 text-left font-normal whitespace-nowrap";
  const td = "border-b border-white/5 px-4 py-3 font-mono2 text-xs whitespace-nowrap";

  return (
    <div className="space-y-4" data-testid="admin-api">
      <div className="rounded-3xl border border-white/10 bg-[#0A0A0A] p-8">
        <p className="label-mono mb-2">{t("admin.api.title")}</p>
        <p className="mb-8 max-w-2xl text-sm text-white/50">{t("admin.api.desc")}</p>
        <div className="space-y-3">
          <Row label={t("admin.api.baseUrl")} value={BASE} testId="api-base-url" />
          <Row label={t("admin.api.key")} value={creds?.api_key} testId="api-key" />
          <Row label={t("admin.api.secret")} value={creds?.api_secret} secret testId="api-secret" />
          <Row label={`CONTENT KEY${creds?.content_key_version ? ` (v${creds.content_key_version})` : ""}`}
            value={creds?.content_key} secret testId="api-content-key" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-[#0A0A0A] p-8">
          <p className="label-mono mb-5 flex items-center gap-2"><Terminal size={12} /> {t("admin.api.endpoints")}</p>
          <div className="space-y-3" data-testid="api-endpoints">
            {ENDPOINTS.map(([m, path, payload]) => (
              <div key={path} className="rounded-2xl border border-white/10 p-4">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-white px-2.5 py-1 font-mono2 text-[9px] font-bold uppercase text-black">{m}</span>
                  <code className="font-mono2 text-xs text-white">{path}</code>
                </div>
                <code className="mt-2 block break-all font-mono2 text-[11px] text-white/40">{payload}</code>
              </div>
            ))}
          </div>
          <p className="label-mono mb-3 mt-8">{t("admin.api.headers")}</p>
          <pre className="overflow-x-auto rounded-2xl border border-white/10 p-4 font-mono2 text-[11px] leading-relaxed text-white/60">
{`X-Client-Key: <api key>
X-Timestamp:  <unix seconds>
X-Nonce:      <losowy string, min 8 znakow>
X-Signature:  hex( HMAC_SHA256( secret, "<ts>.<nonce>." + body ) )`}
          </pre>
          <p className="label-mono mb-3 mt-8">CODES</p>
          <div className="space-y-2">
            {CODES.map(([code, desc]) => (
              <div key={code} className="flex flex-wrap items-baseline gap-3">
                <code className="rounded-full border border-white/15 px-2.5 py-1 font-mono2 text-[10px] text-white">{code}</code>
                <span className="text-xs text-white/45">{desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-[#0A0A0A] p-8">
            <p className="label-mono mb-5 flex items-center gap-2"><ShieldCheck size={12} /> {t("admin.api.security")}</p>
            <ul className="space-y-3">
              {SECURITY.map((s) => (
                <li key={s} className="flex gap-3 text-sm leading-relaxed text-white/55">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white" />{s}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-white/10 bg-[#0A0A0A] p-8">
            <p className="label-mono mb-5">SNIPPET</p>
            <pre className="overflow-x-auto rounded-2xl border border-white/10 p-4 font-mono2 text-[10px] leading-relaxed text-white/60" data-testid="api-snippet">
{JAVA_SNIPPET(BASE)}
            </pre>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/10 p-4 font-mono2 text-[10px] leading-relaxed text-white/60">
{HWID_SNIPPET}
            </pre>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-white/10 bg-[#0A0A0A]">
        <p className="label-mono border-b border-white/10 px-6 py-4">{t("admin.api.logs")}</p>
        {!logs ? null : logs.length === 0 ? (
          <p className="px-6 py-8 font-mono2 text-sm text-white/40" data-testid="api-logs-empty">{t("admin.api.logsEmpty")}</p>
        ) : (
          <table className="w-full min-w-[820px]" data-testid="api-logs-table">
            <thead><tr>
              <th className={th}>{t("admin.api.logTime")}</th>
              <th className={th}>{t("admin.api.logResult")}</th>
              <th className={th}>{t("admin.api.logUser")}</th>
              <th className={th}>{t("admin.api.logHwid")}</th>
              <th className={th}>{t("admin.api.logIp")}</th>
              <th className={th}>{t("admin.api.logVer")}</th>
            </tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className={`${td} text-white/40`}>{new Date(l.ts).toLocaleString()}</td>
                  <td className={td}>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${l.result === "OK" ? "bg-white text-black" : "bg-white/10 text-white/60"}`}>
                      {l.result}
                    </span>
                  </td>
                  <td className={`${td} text-white/70`}>{l.identifier || "—"}</td>
                  <td className={`${td} text-white/40`}>{l.hwid ? `${l.hwid.slice(0, 16)}…` : "—"}</td>
                  <td className={`${td} text-white/40`}>{l.ip}</td>
                  <td className={`${td} text-white/40`}>{l.version || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
