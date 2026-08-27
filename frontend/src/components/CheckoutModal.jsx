import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { X, Ticket, Check, ShieldCheck, Zap, Copy, CreditCard } from "lucide-react";
import { useLang } from "@/i18n";
import api, { errMsg } from "@/lib/api";

const METHODS = [
  { id: "DEMO", label: "DEMO", note: "instant" },
];

export default function CheckoutModal({ open, item, onClose, onDone }) {
  const { t } = useLang();
  const [code, setCode] = useState("");
  const [coupon, setCoupon] = useState(null);
  const [checking, setChecking] = useState(false);
  const [terms, setTerms] = useState(false);
  const [paying, setPaying] = useState(false);
  const [method, setMethod] = useState("DEMO");
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (open) { setCode(""); setCoupon(null); setTerms(false); setDone(null); setPaying(false); }
  }, [open, item?.id]);

  if (!item) return null;

  const price = item.price;
  const discount = coupon
    ? Math.min(price, coupon.type === "percent" ? Math.round(price * coupon.value) / 100 : coupon.value)
    : 0;
  const total = Math.max(0, Math.round((price - discount) * 100) / 100);

  const applyCoupon = async () => {
    if (!code.trim()) return;
    setChecking(true);
    try {
      const { data } = await api.post("/coupons/validate", {
        code: code.trim(), item_type: item.type, item_id: item.id,
      });
      setCoupon({ code: data.code, type: data.type, value: data.value });
      toast.success(`${t("pricing.coupon.applied")}: ${data.code}`);
    } catch (e) {
      setCoupon(null);
      toast.error(errMsg(e));
    } finally { setChecking(false); }
  };

  const submit = async () => {
    setPaying(true);
    try {
      if (item.type === "plan") {
        const { data } = await api.post("/licenses/purchase", { plan: item.id, coupon: coupon?.code || null });
        setDone({ order: data.order, licenseKey: data.license?.key });
      } else {
        const { data } = await api.post("/addons/purchase", { addon: item.id, coupon: coupon?.code || null });
        setDone({ order: data.order, licenseKey: null });
      }
      onDone?.();
    } catch (e) {
      toast.error(errMsg(e));
    } finally { setPaying(false); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          data-testid="checkout-modal" onClick={onClose}>
          <motion.div initial={{ opacity: 0, y: 40, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/15 bg-[#0A0A0A]">
            <span className="pointer-events-none absolute -right-10 -top-14 select-none font-display text-[9rem] font-extrabold leading-none text-white/[0.03]">
              BRAT
            </span>
            <button onClick={onClose} data-testid="checkout-close"
              className="absolute right-5 top-5 z-10 rounded-full border border-white/15 p-2 text-white/50 transition-colors hover:border-white hover:text-white">
              <X size={14} />
            </button>

            {done ? (
              <div className="relative p-10 text-center" data-testid="checkout-success">
                <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 220, damping: 14 }}
                  className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-black">
                  <Check size={28} strokeWidth={3} />
                </motion.span>
                <h3 className="mt-6 font-display text-3xl font-extrabold uppercase">{t("checkout.successTitle")}</h3>
                <p className="mt-2 text-sm text-white/50">{t("checkout.successSub")}</p>
                <div className="mt-7 space-y-2 rounded-2xl border border-white/10 p-5 text-left">
                  <div className="flex justify-between font-mono2 text-xs">
                    <span className="text-white/40">{t("dash.payments.orderId")}</span>
                    <span className="font-bold" data-testid="checkout-order-id">{done.order?.order_id}</span>
                  </div>
                  <div className="flex justify-between font-mono2 text-xs">
                    <span className="text-white/40">{t("dash.payments.amount")}</span>
                    <span className="font-bold">{done.order?.total} {done.order?.currency}</span>
                  </div>
                  {done.licenseKey && (
                    <button data-testid="checkout-copy-key"
                      onClick={() => { navigator.clipboard.writeText(done.licenseKey); toast.success(t("dash.profile.copied")); }}
                      className="flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 font-mono2 text-xs font-bold text-black transition-opacity hover:opacity-80">
                      <span>{done.licenseKey}</span><Copy size={12} />
                    </button>
                  )}
                </div>
                <button data-testid="checkout-goto-panel" onClick={onClose}
                  className="mt-7 w-full rounded-full bg-white px-6 py-4 font-mono2 text-xs font-bold uppercase tracking-widest text-black transition-colors hover:bg-white/70">
                  {t("checkout.gotoPanel")}
                </button>
              </div>
            ) : (
              <div className="relative p-8">
                <p className="label-mono">{t("checkout.title")}</p>
                <h3 className="mt-3 font-display text-3xl font-extrabold uppercase" data-testid="checkout-item-name">
                  {item.name}
                </h3>
                {item.desc && <p className="mt-2 text-sm text-white/50">{item.desc}</p>}

                <div className="mt-6 flex flex-wrap gap-2 font-mono2 text-[10px] uppercase tracking-widest text-white/50">
                  <span className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5"><Zap size={11} className="text-white" /> {t("checkout.instant")}</span>
                  <span className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5"><ShieldCheck size={11} className="text-white" /> {t("checkout.secure")}</span>
                </div>

                <div className="mt-7">
                  <label className="label-mono mb-2 block">{t("pricing.coupon.label")}</label>
                  <div className="flex gap-2">
                    <div className="flex flex-1 items-center gap-3 rounded-2xl border border-white/15 bg-black px-4">
                      <Ticket size={14} className="text-white/40" />
                      <input data-testid="checkout-coupon-input" value={code} disabled={!!coupon}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                        placeholder={t("pricing.coupon.placeholder")}
                        className="w-full bg-transparent py-3.5 font-mono2 text-xs uppercase tracking-widest text-white outline-none placeholder:text-white/25 disabled:text-white/60" />
                    </div>
                    {coupon ? (
                      <button data-testid="checkout-coupon-remove" onClick={() => { setCoupon(null); setCode(""); }}
                        className="rounded-2xl border border-white/15 px-5 font-mono2 text-[10px] uppercase tracking-widest text-white/60 transition-colors hover:border-white hover:text-white">
                        {t("pricing.coupon.remove")}
                      </button>
                    ) : (
                      <button data-testid="checkout-coupon-apply" onClick={applyCoupon} disabled={checking || !code.trim()}
                        className="rounded-2xl bg-white px-6 font-mono2 text-[10px] font-bold uppercase tracking-widest text-black transition-colors hover:bg-white/70 disabled:opacity-40">
                        {t("pricing.coupon.apply")}
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-6">
                  <label className="label-mono mb-2 block">{t("checkout.method")}</label>
                  <div className="flex gap-2">
                    {METHODS.map((m) => (
                      <button key={m.id} data-testid={`checkout-method-${m.id}`} onClick={() => setMethod(m.id)}
                        className={`flex flex-1 items-center justify-between rounded-2xl border px-5 py-3.5 transition-colors
                          ${method === m.id ? "border-white bg-white text-black" : "border-white/15 text-white/60 hover:border-white/40"}`}>
                        <span className="flex items-center gap-2 font-mono2 text-xs font-bold uppercase tracking-widest">
                          <CreditCard size={13} /> {m.label}
                        </span>
                        <span className="font-mono2 text-[9px] uppercase tracking-widest opacity-60">{m.note}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-7 space-y-2 rounded-2xl border border-white/10 p-5">
                  <div className="flex justify-between font-mono2 text-xs text-white/50">
                    <span>{t("checkout.subtotal")}</span><span>{price.toFixed(2)} PLN</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between font-mono2 text-xs" data-testid="checkout-discount">
                      <span className="text-white/50">{t("dash.payments.discount")} · {coupon.code}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 font-bold text-black">−{discount.toFixed(2)} PLN</span>
                    </div>
                  )}
                  <div className="flex items-end justify-between border-t border-white/10 pt-3">
                    <span className="label-mono">{t("checkout.total")}</span>
                    <span className="font-display text-3xl font-black leading-none" data-testid="checkout-total">
                      {total.toFixed(2)} <span className="font-mono2 text-sm text-white/40">PLN</span>
                    </span>
                  </div>
                </div>

                <button type="button" data-testid="checkout-terms" onClick={() => setTerms(!terms)}
                  className="mt-5 flex w-full items-start gap-3 text-left">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors
                    ${terms ? "border-white bg-white text-black" : "border-white/25"}`}>
                    {terms && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="font-mono2 text-[11px] leading-relaxed text-white/40">{t("checkout.terms")}</span>
                </button>

                <button data-testid="checkout-pay-btn" onClick={submit} disabled={!terms || paying}
                  className="mt-6 w-full rounded-full bg-white px-6 py-5 font-mono2 text-sm font-bold uppercase tracking-widest text-black transition-colors hover:bg-white/70 disabled:opacity-30">
                  {paying ? t("checkout.processing") : `${t("checkout.pay")} ${total.toFixed(2)} PLN`}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
