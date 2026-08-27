import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, X, Sparkles, RefreshCcw, FlaskConical } from "lucide-react";
import { useLang } from "@/i18n";
import { useAuth } from "@/context/AuthContext";
import CheckoutModal from "@/components/CheckoutModal";

const PLANS = [
  { id: "30d", nameKey: "pricing.d30", price: 50 },
  { id: "90d", nameKey: "pricing.d90", price: 80 },
  { id: "lifetime", nameKey: "pricing.life", price: 100, hot: true },
];
const ADDON_ICONS = { hwid: RefreshCcw, tester: FlaskConical };
const ADDON_IDS = { hwid: "hwid_reset", tester: "tester" };

export default function Pricing() {
  const { t } = useLang();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [cat, setCat] = useState("subs");
  const [checkout, setCheckout] = useState(null);
  const [purchased, setPurchased] = useState(false);

  const openCheckout = (item) => {
    if (!user) {
      toast.info(t("pricing.needLogin"));
      navigate("/auth");
      return;
    }
    setCheckout(item);
  };

  return (
    <section id="pricing" className="border-b border-white/10" data-testid="pricing-section">
      <div className="mx-auto max-w-7xl px-6 py-28">
        <motion.h2 initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          transition={{ duration: 0.7 }} className="font-display text-4xl font-extrabold uppercase tracking-tight md:text-6xl">
          {t("pricing.browse")}
        </motion.h2>
        <p className="mt-4 text-white/50">{t("pricing.browseSub")}</p>

        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="mt-8 inline-flex rounded-full border border-white/15 bg-[#0A0A0A] p-1" data-testid="pricing-toggle">
          {[["subs", t("pricing.tabSubs")], ["addons", t("pricing.tabAddons")]].map(([id, label]) => (
            <button key={id} data-testid={`pricing-cat-${id}`} onClick={() => setCat(id)}
              className={`rounded-full px-6 py-2.5 font-mono2 text-xs font-bold uppercase tracking-widest transition-colors duration-150
                ${cat === id ? "bg-white text-black" : "text-white/50 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </motion.div>

        {cat === "subs" ? (
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {PLANS.map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0, y: 60 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.7, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                className={`relative flex flex-col rounded-3xl border p-8 transition-transform duration-200 hover:-translate-y-2 ${p.hot ? "border-white bg-white text-black" : "border-white/10 bg-[#0A0A0A] hover:border-white/30"}`}
                data-testid={`plan-card-${p.id}`}>
                {p.hot && (
                  <span className="absolute -top-3 left-6 rounded-full border border-white/20 bg-black px-3 py-1 font-mono2 text-[10px] font-bold uppercase tracking-widest text-white">
                    {t("pricing.popular")}
                  </span>
                )}
                <div className={`label-mono ${p.hot ? "!text-black/60" : ""}`}>{p.id.toUpperCase()}</div>
                <h3 className="mt-3 font-display text-2xl font-bold uppercase">{t(p.nameKey)}</h3>
                <div className="mt-6 flex items-end gap-2">
                  <span className="font-display text-6xl font-black leading-none" data-testid={`plan-price-${p.id}`}>{p.price}</span>
                  <span className={`mb-1 font-mono2 text-sm ${p.hot ? "text-black/50" : "text-white/40"}`}>PLN</span>
                </div>
                <ul className="mt-8 flex-1 space-y-3">
                  {t("pricing.f").map((f) => (
                    <li key={f} className={`flex items-start gap-3 text-sm ${p.hot ? "text-black/75" : "text-white/60"}`}>
                      <Check size={16} className={`mt-0.5 shrink-0 ${p.hot ? "text-black" : "text-white"}`} />
                      {f}
                    </li>
                  ))}
                  {t("pricing.fl").map((f) => (
                    <li key={f} className={`flex items-start gap-3 text-sm ${p.hot ? "text-black/75" : "text-white/30"}`}>
                      {p.hot
                        ? <Sparkles size={16} className="mt-0.5 shrink-0 text-black" />
                        : <X size={16} className="mt-0.5 shrink-0 text-white/25" />}
                      {f}
                    </li>
                  ))}
                </ul>
                <button data-testid={`buy-${p.id}-btn`}
                  onClick={() => openCheckout({ type: "plan", id: p.id, name: `${t("pricing.title")} ${t(p.nameKey)}`, price: p.price })}
                  className={`mt-10 rounded-full px-6 py-4 font-mono2 text-sm font-bold uppercase tracking-widest transition-colors duration-150
                    ${p.hot ? "bg-black text-white hover:bg-black/80" : "bg-white text-black hover:bg-white/70"}`}>
                  {t("pricing.buy")}
                </button>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
            {Object.entries(t("pricing.addons")).map(([id, a], i) => {
              const Icon = ADDON_ICONS[id];
              return (
                <motion.div key={id} initial={{ opacity: 0, y: 60 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.7, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col rounded-3xl border border-white/10 bg-[#0A0A0A] p-8 transition-all duration-200 hover:-translate-y-2 hover:border-white/30"
                  data-testid={`addon-card-${id}`}>
                  <div className="flex items-center justify-between">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-black">
                      <Icon size={20} />
                    </span>
                    <span className="label-mono">{t("pricing.onetime")}</span>
                  </div>
                  <h3 className="mt-6 font-display text-2xl font-bold uppercase">{a.name}</h3>
                  <p className="mt-2 text-sm text-white/50">{a.desc}</p>
                  <div className="mt-6 flex items-end gap-2">
                    <span className="font-display text-5xl font-black leading-none" data-testid={`addon-price-${id}`}>{a.price}</span>
                    <span className="mb-1 font-mono2 text-sm text-white/40">PLN</span>
                  </div>
                  <button data-testid={`buy-addon-${id}-btn`}
                    onClick={() => openCheckout({ type: "addon", id: ADDON_IDS[id], name: a.name, desc: a.desc, price: a.price })}
                    className="mt-8 rounded-full bg-white px-6 py-4 font-mono2 text-sm font-bold uppercase tracking-widest text-black transition-colors duration-150 hover:bg-white/70">
                    {t("pricing.buy")}
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <CheckoutModal open={!!checkout} item={checkout}
        onDone={() => { setPurchased(true); refreshUser?.().catch(() => {}); }}
        onClose={() => { setCheckout(null); if (purchased) { setPurchased(false); navigate("/panel"); } }} />
    </section>
  );
}
