import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Users, Receipt, Percent } from "lucide-react";
import { useLang } from "@/i18n";
import api from "@/lib/api";

const METRICS = [
  { id: "revenue", suffix: " PLN" },
  { id: "visits", suffix: "" },
  { id: "orders", suffix: "" },
  { id: "users", suffix: "" },
];

export default function AnalyticsPanel() {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [metric, setMetric] = useState("revenue");
  const [hover, setHover] = useState(null);

  useEffect(() => {
    api.get("/admin/analytics", { params: { days: 14 } })
      .then(({ data }) => setData(data)).catch(() => {});
  }, []);

  if (!data) return null;
  const series = data.series || [];
  const values = series.map((s) => s[metric] || 0);
  const max = Math.max(1, ...values);
  const W = 100, H = 42, PAD = 3;
  const x = (i) => (series.length <= 1 ? 0 : (i / (series.length - 1)) * (W - PAD * 2) + PAD);
  const y = (v) => H - 5 - (v / max) * (H - 12);
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `${PAD},${H - 5} ${line} ${W - PAD},${H - 5}`;
  const totals = data.totals || {};
  const active = hover !== null ? series[hover] : null;

  const kpis = [
    { icon: TrendingUp, label: t("admin.analytics.revenue14"), value: `${totals.revenue ?? 0} PLN` },
    { icon: Receipt, label: t("admin.analytics.orders14"), value: totals.orders ?? 0 },
    { icon: Users, label: t("admin.analytics.users14"), value: totals.users ?? 0 },
    { icon: Percent, label: t("admin.analytics.conversion"), value: `${totals.conversion ?? 0}%` },
  ];

  const th = "label-mono border-b border-white/10 px-4 py-3 text-left font-normal whitespace-nowrap";
  const td = "border-b border-white/5 px-4 py-3 font-mono2 text-xs whitespace-nowrap";

  return (
    <div className="space-y-4" data-testid="admin-analytics">
      <div className="rounded-3xl border border-white/10 bg-[#0A0A0A] p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="label-mono">{t("admin.analytics.title")}</p>
            <p className="mt-2 font-display text-4xl font-black leading-none" data-testid="analytics-headline">
              {active ? (active[metric] ?? 0) : (metric === "revenue" ? totals.revenue : totals[metric]) ?? 0}
              <span className="ml-2 font-mono2 text-xs uppercase tracking-widest text-white/40">
                {metric === "revenue" ? "PLN" : t(`admin.stats.${metric}`)}
              </span>
            </p>
            <p className="mt-1 font-mono2 text-[11px] uppercase tracking-widest text-white/30">
              {active ? active.date : t("admin.analytics.last14")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {METRICS.map((m) => (
              <button key={m.id} data-testid={`analytics-metric-${m.id}`} onClick={() => setMetric(m.id)}
                className={`rounded-full border px-4 py-2 font-mono2 text-[10px] uppercase tracking-widest transition-colors
                  ${metric === m.id ? "border-white bg-white text-black" : "border-white/15 text-white/50 hover:border-white/50 hover:text-white"}`}>
                {t(`admin.stats.${m.id}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mt-8">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-56 w-full overflow-visible"
            onMouseLeave={() => setHover(null)}>
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <line key={f} x1="0" y1={y(max * f)} x2={W} y2={y(max * f)}
                stroke="rgba(255,255,255,0.07)" strokeWidth="0.25" />
            ))}
            {values.map((v, i) => (
              <motion.rect key={`b${i}`} initial={{ height: 0, y: H - 5 }}
                animate={{ height: Math.max(0.6, (H - 5) - y(v)), y: y(v) }}
                transition={{ duration: 0.7, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }}
                x={x(i) - 1.6} width="3.2" rx="0.8"
                fill={hover === i ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.16)"} />
            ))}
            <motion.polygon initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.2 }}
              points={area} fill="rgba(255,255,255,0.07)" />
            <motion.polyline initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, ease: "easeOut" }} points={line} fill="none" stroke="#ffffff"
              strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
            {values.map((v, i) => (
              <circle key={`p${i}`} cx={x(i)} cy={y(v)} r={hover === i ? 1.6 : 1}
                fill="#050505" stroke="#ffffff" strokeWidth="0.6" />
            ))}
            {series.map((s, i) => (
              <rect key={`h${i}`} x={x(i) - (W / series.length) / 2} y="0" width={W / series.length} height={H}
                fill="transparent" onMouseEnter={() => setHover(i)} data-testid={`analytics-hover-${i}`} />
            ))}
            {hover !== null && (
              <line x1={x(hover)} y1="0" x2={x(hover)} y2={H - 5}
                stroke="rgba(255,255,255,0.35)" strokeWidth="0.3" strokeDasharray="1 1" />
            )}
          </svg>
          <div className="mt-3 flex justify-between font-mono2 text-[10px] uppercase tracking-widest text-white/25">
            {series.filter((_, i) => i % 3 === 0 || i === series.length - 1).map((s) => (
              <span key={s.date}>{s.date.slice(5)}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map(({ icon: Icon, label, value }, i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }} className="rounded-3xl border border-white/10 bg-[#0A0A0A] p-6"
            data-testid={`analytics-kpi-${i}`}>
            <Icon size={14} className="text-white/40" />
            <p className="mt-4 font-display text-2xl font-extrabold">{value}</p>
            <p className="label-mono mt-1">{label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="overflow-x-auto rounded-3xl border border-white/10 bg-[#0A0A0A]">
          <p className="label-mono border-b border-white/10 px-6 py-4">{t("admin.analytics.daily")}</p>
          <table className="w-full min-w-[420px]" data-testid="analytics-table">
            <thead><tr>
              <th className={th}>{t("admin.orders.date")}</th>
              <th className={th}>{t("admin.stats.visits")}</th>
              <th className={th}>{t("admin.stats.orders")}</th>
              <th className={th}>{t("admin.stats.revenue")}</th>
              <th className={th}>{t("admin.stats.users")}</th>
            </tr></thead>
            <tbody>
              {[...series].reverse().map((s) => (
                <tr key={s.date} className="transition-colors hover:bg-white/[0.02]">
                  <td className={`${td} text-white/50`}>{s.date}</td>
                  <td className={`${td} text-white/70`}>{s.visits}</td>
                  <td className={`${td} text-white/70`}>{s.orders}</td>
                  <td className={`${td} font-bold text-white`}>{s.revenue} PLN</td>
                  <td className={`${td} text-white/70`}>{s.users}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-[#0A0A0A]">
            <p className="label-mono border-b border-white/10 px-6 py-4">{t("admin.analytics.top")}</p>
            {(data.top_products || []).length === 0 ? (
              <p className="px-6 py-6 font-mono2 text-xs text-white/40">{t("admin.orders.empty")}</p>
            ) : (
              <div className="divide-y divide-white/5" data-testid="analytics-top">
                {data.top_products.map((p) => (
                  <div key={p.item} className="flex items-center justify-between px-6 py-4">
                    <div>
                      <p className="font-mono2 text-xs text-white">{p.item}</p>
                      <p className="label-mono mt-1">×{p.count}</p>
                    </div>
                    <p className="font-display text-lg font-bold">{p.revenue} PLN</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-3xl border border-white/10 bg-[#0A0A0A]">
            <p className="label-mono border-b border-white/10 px-6 py-4">{t("admin.analytics.recent")}</p>
            {(data.recent_orders || []).length === 0 ? (
              <p className="px-6 py-6 font-mono2 text-xs text-white/40">{t("admin.orders.empty")}</p>
            ) : (
              <div className="divide-y divide-white/5" data-testid="analytics-recent">
                {data.recent_orders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between px-6 py-3.5">
                    <div>
                      <p className="font-mono2 text-[11px] font-bold text-white">{o.order_id}</p>
                      <p className="label-mono mt-1">{o.username} · {o.item}</p>
                    </div>
                    <p className="font-mono2 text-xs font-bold">{o.total} {o.currency}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
