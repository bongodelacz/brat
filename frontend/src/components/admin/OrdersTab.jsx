import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, Trash2 } from "lucide-react";
import { useLang } from "@/i18n";
import api, { errMsg } from "@/lib/api";
import ConfirmModal from "@/components/ConfirmModal";

const STATUSES = ["pending", "completed", "refunded", "cancelled"];

export default function OrdersTab() {
  const { t } = useLang();
  const [orders, setOrders] = useState(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [del, setDel] = useState(null);

  const load = () => api.get("/admin/orders", { params: { q: q || undefined, status: status || undefined } })
    .then(({ data }) => setOrders(data)).catch((e) => toast.error(errMsg(e)));

  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status]);

  const setOrderStatus = async (o, s) => {
    try {
      await api.patch(`/admin/orders/${o.id}`, { status: s });
      toast.success(t("admin.orders.statusChanged"));
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const th = "label-mono border-b border-white/10 px-4 py-3 text-left font-normal whitespace-nowrap";
  const td = "border-b border-white/5 px-4 py-3 font-mono2 text-xs whitespace-nowrap";

  return (
    <div className="space-y-4" data-testid="admin-orders">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 items-center gap-3 rounded-full border border-white/15 bg-[#0A0A0A] px-5 py-3">
          <Search size={14} className="text-white/40" />
          <input data-testid="orders-search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t("admin.orders.search")}
            className="w-full bg-transparent font-mono2 text-xs text-white outline-none placeholder:text-white/30" />
        </div>
        <div className="flex flex-wrap gap-2">
          {[["", t("admin.orders.all")], ...STATUSES.map((s) => [s, t(`admin.orders.st.${s}`)])].map(([id, label]) => (
            <button key={id || "all"} data-testid={`orders-filter-${id || "all"}`} onClick={() => setStatus(id)}
              className={`rounded-full border px-4 py-2 font-mono2 text-[10px] uppercase tracking-widest transition-colors
                ${status === id ? "border-white bg-white text-black" : "border-white/15 text-white/50 hover:border-white/50 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-white/10 bg-[#0A0A0A]">
        {!orders ? null : orders.length === 0 ? (
          <p className="px-6 py-8 font-mono2 text-sm text-white/40" data-testid="orders-empty">{t("admin.orders.empty")}</p>
        ) : (
          <table className="w-full min-w-[980px]" data-testid="orders-table">
            <thead><tr>
              {["id", "date", "email", "account", "method", "item", "total", "status"].map((k) => (
                <th key={k} className={th}>{t(`admin.orders.${k}`)}</th>
              ))}
              <th className={th}></th>
            </tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} data-testid={`order-row-${o.order_id}`} className="transition-colors hover:bg-white/[0.02]">
                  <td className={`${td} font-bold text-white`}>{o.order_id}</td>
                  <td className={`${td} text-white/50`}>{o.created_at ? new Date(o.created_at).toLocaleString() : "—"}</td>
                  <td className={`${td} text-white/70`}>{o.email}</td>
                  <td className={`${td} text-white/70`}>{o.username}</td>
                  <td className={`${td} text-white/50`}>{o.method}</td>
                  <td className={`${td} text-white`}>
                    {o.item}
                    {o.coupon && <span className="ml-2 rounded-full border border-white/20 px-2 py-0.5 text-[9px] uppercase text-white/60">{o.coupon} −{o.discount}</span>}
                  </td>
                  <td className={`${td} font-bold text-white`}>{o.total} {o.currency}</td>
                  <td className={td}>
                    <select data-testid={`order-status-${o.order_id}`} value={o.status}
                      onChange={(e) => setOrderStatus(o, e.target.value)}
                      className="cursor-pointer rounded-full border border-white/20 bg-black px-3 py-1.5 font-mono2 text-[10px] uppercase tracking-widest text-white outline-none focus:border-white">
                      {STATUSES.map((s) => <option key={s} value={s}>{t(`admin.orders.st.${s}`)}</option>)}
                    </select>
                  </td>
                  <td className={td}>
                    <button data-testid={`order-delete-${o.order_id}`} onClick={() => setDel(o)}
                      className="rounded-full border border-white/15 p-2 text-white/50 transition-colors hover:border-white hover:bg-white hover:text-black">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmModal testId="order-confirm" open={!!del}
        title={t("admin.orders.confirmDeleteTitle")} desc={t("admin.orders.confirmDelete")}
        onCancel={() => setDel(null)}
        onConfirm={async () => {
          const o = del; setDel(null);
          if (!o) return;
          try { await api.delete(`/admin/orders/${o.id}`); toast.success(t("admin.orders.deleted")); load(); }
          catch (e) { toast.error(errMsg(e)); }
        }} />
    </div>
  );
}
