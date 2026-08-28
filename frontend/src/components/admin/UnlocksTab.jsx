import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Unlock, Activity, Cpu, Clock } from "lucide-react";
import { useLang } from "@/i18n";
import api, { errMsg } from "@/lib/api";

export default function UnlocksTab() {
  const { t } = useLang();
  const [logs, setLogs] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/admin/unlock/logs").then(({ data }) => setLogs(data)).catch((e) => toast.error(errMsg(e)));
    api.get("/admin/unlock/stats").then(({ data }) => setStats(data)).catch(() => {});
  }, []);

  const th = "label-mono border-b border-white/10 px-4 py-3 text-left font-normal whitespace-nowrap";
  const td = "border-b border-white/5 px-4 py-3 font-mono2 text-xs whitespace-nowrap";

  const statCards = [
    ["today", stats?.today ?? 0],
    ["week", stats?.week ?? 0],
    ["total", stats?.total ?? 0],
    ["machines", stats?.unique_machines_week ?? 0],
  ];

  return (
    <div className="space-y-4" data-testid="admin-unlocks">
      <div className="rounded-3xl border border-white/10 bg-[#0A0A0A] p-8">
        <p className="label-mono mb-2 flex items-center gap-2"><Unlock size={12} /> {t("admin.unlocks.title")}</p>
        <p className="mb-6 max-w-2xl text-sm text-white/50">{t("admin.unlocks.desc")}</p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {statCards.map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-white/10 p-5" data-testid={`unlock-stat-${k}`}>
              <div className="flex items-center gap-2 text-white/40">
                {k === "machines" ? <Cpu size={13} /> : k === "today" ? <Clock size={13} /> : <Activity size={13} />}
                <span className="label-mono">{t(`admin.unlocks.${k}`)}</span>
              </div>
              <div className="mt-2 font-display text-3xl font-extrabold">{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-white/10 bg-[#0A0A0A]">
        <p className="label-mono border-b border-white/10 px-6 py-4">{t("admin.unlocks.title")}</p>
        {!logs ? null : logs.length === 0 ? (
          <p className="px-6 py-8 font-mono2 text-sm text-white/40" data-testid="unlocks-empty">{t("admin.unlocks.empty")}</p>
        ) : (
          <table className="w-full min-w-[900px]" data-testid="unlocks-table">
            <thead><tr>
              <th className={th}>{t("admin.unlocks.time")}</th>
              <th className={th}>{t("admin.unlocks.user")}</th>
              <th className={th}>{t("admin.unlocks.uid")}</th>
              <th className={th}>{t("admin.unlocks.plan")}</th>
              <th className={th}>{t("admin.unlocks.license")}</th>
              <th className={th}>{t("admin.unlocks.hwid")}</th>
              <th className={th}>{t("admin.unlocks.ip")}</th>
              <th className={th}>{t("admin.unlocks.version")}</th>
              <th className={th}>{t("admin.unlocks.firstBind")}</th>
            </tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} data-testid={`unlock-row-${l.id}`}>
                  <td className={`${td} text-white/40`}>{new Date(l.ts).toLocaleString()}</td>
                  <td className={`${td} text-white`}>{l.username || "—"}</td>
                  <td className={`${td} text-white/50`}>{l.uid || "—"}</td>
                  <td className={td}>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${l.plan === "lifetime" ? "bg-white text-black" : "bg-white/10 text-white/70"}`}>
                      {l.plan}
                    </span>
                  </td>
                  <td className={`${td} text-white/50`}>{l.license_key || "—"}</td>
                  <td className={`${td} text-white/40`}>{l.hwid || "—"}</td>
                  <td className={`${td} text-white/40`}>{l.ip}</td>
                  <td className={`${td} text-white/50`}>{l.version || "—"}</td>
                  <td className={td}>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${l.first_bound ? "bg-white text-black" : "border border-white/15 text-white/40"}`}>
                      {l.first_bound ? t("admin.unlocks.bound") : t("admin.unlocks.rebind")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}