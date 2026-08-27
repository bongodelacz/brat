import { useEffect, useState } from "react";
import { useLang } from "@/i18n";
import api from "@/lib/api";

const STATUSES = ["pending", "completed", "refunded", "cancelled"];

export default function PaymentsTab() {
  const { t } = useLang();
  const [orders, setOrders] = useState([]);
  const [licenses, setLicenses] = useState([]);

  useEffect(() => {
    api.get("/orders/my").then(({ data }) => setOrders(data)).catch(() => {});
    api.get("/licenses/my").then(({ data }) => setLicenses(data)).catch(() => {});
  }, []);

  const planName = (id, days) =>
    id === "custom" ? `${days} ${t("dash.download.daysShort")}`
    : ({ "30d": t("pricing.d30"), "90d": t("pricing.d90"), lifetime: t("pricing.life") }[id] || id);

  const th = "label-mono border-b border-white/10 px-4 py-3 text-left font-normal whitespace-nowrap";
  const td = "border-b border-white/5 px-4 py-4 font-mono2 text-xs whitespace-nowrap";

  return (
    <div className="space-y-8" data-testid="payments-tab">
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0A0A0A]">
        <p className="label-mono border-b border-white/10 px-6 py-4">{t("dash.payments.licenses")}</p>
        {licenses.length === 0 ? (
          <p className="px-6 py-8 font-mono2 text-sm text-white/40" data-testid="licenses-empty">{t("dash.payments.empty")}</p>
        ) : (
          <table className="w-full" data-testid="licenses-table">
            <thead><tr>
              <th className={th}>{t("dash.payments.plan")}</th>
              <th className={th}>{t("dash.payments.key")}</th>
              <th className={th}>{t("dash.payments.expires")}</th>
              <th className={th}>{t("dash.payments.status")}</th>
            </tr></thead>
            <tbody>
              {licenses.map((l) => (
                <tr key={l.id} data-testid={`license-row-${l.id}`}>
                  <td className={td}>{planName(l.plan, l.days)}</td>
                  <td className={`${td} text-white`}>{l.key}</td>
                  <td className={td}>{l.expires_at ? new Date(l.expires_at).toLocaleDateString() : t("dash.payments.never")}</td>
                  <td className={td}>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${l.status === "active" ? "bg-white text-black" : "bg-white/10 text-white/50"}`}>
                      {l.status === "active" ? t("dash.payments.active") : t("dash.payments.expired")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="overflow-x-auto rounded-3xl border border-white/10 bg-[#0A0A0A]">
        <p className="label-mono border-b border-white/10 px-6 py-4">{t("dash.payments.orders")}</p>
        {orders.length === 0 ? (
          <p className="px-6 py-8 font-mono2 text-sm text-white/40" data-testid="payments-empty">{t("dash.payments.empty")}</p>
        ) : (
          <table className="w-full min-w-[760px]" data-testid="orders-table">
            <thead><tr>
              <th className={th}>{t("dash.payments.orderId")}</th>
              <th className={th}>{t("dash.payments.date")}</th>
              <th className={th}>{t("dash.payments.plan")}</th>
              <th className={th}>{t("dash.payments.method")}</th>
              <th className={th}>{t("dash.payments.amount")}</th>
              <th className={th}>{t("dash.payments.status")}</th>
            </tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} data-testid={`payment-row-${o.order_id}`}>
                  <td className={`${td} font-bold text-white`}>{o.order_id}</td>
                  <td className={`${td} text-white/50`}>{o.created_at ? new Date(o.created_at).toLocaleString() : "—"}</td>
                  <td className={`${td} text-white/80`}>
                    {o.item}
                    {o.coupon && <span className="ml-2 rounded-full border border-white/20 px-2 py-0.5 text-[9px] uppercase text-white/60">{o.coupon}</span>}
                  </td>
                  <td className={`${td} text-white/50`}>{o.method}</td>
                  <td className={`${td} text-white`}>
                    {o.total} {o.currency}
                    {o.discount > 0 && <span className="ml-2 text-white/30 line-through">{o.subtotal}</span>}
                  </td>
                  <td className={`${td} uppercase text-white/70`}>{STATUSES.includes(o.status) ? t(`admin.orders.st.${o.status}`) : o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
