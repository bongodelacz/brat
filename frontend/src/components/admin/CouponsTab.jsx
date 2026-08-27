import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ticket, Plus, Trash2, Power } from "lucide-react";
import { useLang } from "@/i18n";
import api, { errMsg } from "@/lib/api";
import ConfirmModal from "@/components/ConfirmModal";

const inputCls = "w-full rounded-2xl border border-white/15 bg-black px-4 py-3 font-mono2 text-xs text-white outline-none transition-colors focus:border-white placeholder:text-white/25";

export default function CouponsTab() {
  const { t } = useLang();
  const [coupons, setCoupons] = useState(null);
  const [form, setForm] = useState({ code: "", type: "percent", value: "", max_uses: "0", expires_at: "" });
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);

  const load = () => api.get("/admin/coupons").then(({ data }) => setCoupons(data)).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/admin/coupons", {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value: parseFloat(form.value),
        max_uses: parseInt(form.max_uses || "0", 10),
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      });
      toast.success(t("admin.coupons.created"));
      setForm({ code: "", type: "percent", value: "", max_uses: "0", expires_at: "" });
      load();
    } catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); }
  };

  const toggle = async (c) => {
    try { await api.patch(`/admin/coupons/${c.id}`, { active: !c.active }); toast.success(t("admin.coupons.toggled")); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  const expired = (c) => c.expires_at && new Date(c.expires_at) < new Date();

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]" data-testid="admin-coupons">
      <form onSubmit={submit} className="h-fit rounded-3xl border border-white/10 bg-[#0A0A0A] p-8" data-testid="coupon-form">
        <p className="label-mono flex items-center gap-2"><Ticket size={12} /> {t("admin.coupons.create")}</p>
        <div className="mt-6 space-y-4">
          <div>
            <label className="label-mono mb-2 block">{t("admin.coupons.code")}</label>
            <input required data-testid="coupon-code" value={form.code} placeholder="BRAT20"
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className={inputCls} />
          </div>
          <div>
            <label className="label-mono mb-2 block">{t("admin.coupons.type")}</label>
            <div className="flex rounded-full border border-white/15 p-1">
              {[["percent", t("admin.coupons.percent")], ["fixed", t("admin.coupons.fixed")]].map(([id, label]) => (
                <button key={id} type="button" data-testid={`coupon-type-${id}`} onClick={() => setForm({ ...form, type: id })}
                  className={`flex-1 rounded-full px-3 py-2 font-mono2 text-[10px] font-bold uppercase tracking-widest transition-colors
                    ${form.type === id ? "bg-white text-black" : "text-white/50 hover:text-white"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label-mono mb-2 block">{t("admin.coupons.value")}</label>
            <input required type="number" min="1" step="1" data-testid="coupon-value" value={form.value}
              placeholder={form.type === "percent" ? "20" : "10"}
              onChange={(e) => setForm({ ...form, value: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="label-mono mb-2 block">{t("admin.coupons.maxUses")}</label>
            <input type="number" min="0" data-testid="coupon-max-uses" value={form.max_uses}
              onChange={(e) => setForm({ ...form, max_uses: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="label-mono mb-2 block">{t("admin.coupons.expires")}</label>
            <input type="datetime-local" data-testid="coupon-expires" value={form.expires_at}
              onChange={(e) => setForm({ ...form, expires_at: e.target.value })} className={inputCls} />
          </div>
        </div>
        <button type="submit" disabled={busy} data-testid="coupon-submit"
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-4 font-mono2 text-xs font-bold uppercase tracking-widest text-black transition-colors hover:bg-white/70 disabled:opacity-40">
          <Plus size={14} /> {t("admin.coupons.submit")}
        </button>
      </form>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0A0A0A]">
        <p className="label-mono border-b border-white/10 px-6 py-4">{t("admin.coupons.title")}</p>
        {!coupons ? null : coupons.length === 0 ? (
          <p className="px-6 py-8 font-mono2 text-sm text-white/40" data-testid="coupons-empty">{t("admin.coupons.empty")}</p>
        ) : (
          <div className="divide-y divide-white/5">
            {coupons.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-5" data-testid={`coupon-row-${c.code}`}>
                <div>
                  <p className="font-display text-lg font-bold tracking-wide">{c.code}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 font-mono2 text-[10px] uppercase tracking-widest">
                    <span className="rounded-full bg-white px-2.5 py-1 font-bold text-black">
                      −{c.value}{c.type === "percent" ? "%" : " PLN"}
                    </span>
                    <span className="rounded-full border border-white/15 px-2.5 py-1 text-white/60">
                      {t("admin.coupons.uses")}: {c.uses}{c.max_uses ? ` / ${c.max_uses}` : ""}
                    </span>
                    <span className="rounded-full border border-white/15 px-2.5 py-1 text-white/60">
                      {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : t("admin.coupons.noExpiry")}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 ${c.active && !expired(c) ? "border border-white/15 text-white/60" : "bg-white/10 text-white/40"}`}
                      data-testid={`coupon-status-${c.code}`}>
                      {expired(c) ? t("admin.coupons.expiredLbl") : c.active ? t("admin.coupons.active") : t("admin.coupons.inactive")}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button data-testid={`coupon-toggle-${c.code}`} onClick={() => toggle(c)}
                    className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 font-mono2 text-[10px] uppercase tracking-widest text-white/70 transition-colors hover:border-white hover:text-white">
                    <Power size={11} /> {c.active ? t("admin.coupons.off") : t("admin.coupons.on")}
                  </button>
                  <button data-testid={`coupon-delete-${c.code}`} onClick={() => setDel(c)}
                    className="rounded-full border border-white/15 p-2.5 text-white/60 transition-colors hover:border-white hover:bg-white hover:text-black">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal testId="coupon-confirm" open={!!del}
        title={t("admin.coupons.confirmDeleteTitle")} desc={t("admin.coupons.confirmDelete")}
        onCancel={() => setDel(null)}
        onConfirm={async () => {
          const c = del; setDel(null);
          if (!c) return;
          try { await api.delete(`/admin/coupons/${c.id}`); toast.success(t("admin.coupons.deleted")); load(); }
          catch (e) { toast.error(errMsg(e)); }
        }} />
    </div>
  );
}
