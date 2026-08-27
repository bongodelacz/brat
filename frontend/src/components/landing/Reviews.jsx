import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { useLang } from "@/i18n";

export default function Reviews() {
  const { t } = useLang();
  return (
    <section className="border-b border-white/10" data-testid="reviews-section">
      <div className="mx-auto max-w-7xl px-6 py-28">
        <motion.h2 initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-4xl font-extrabold uppercase tracking-tight md:text-6xl">
          {t("reviews.title")}<span className="text-white/40">.</span>
        </motion.h2>
        <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
          transition={{ delay: 0.15 }} className="mt-4 text-white/50">{t("reviews.sub")}</motion.p>
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {t("reviews.items").map((r, i) => (
            <motion.div key={r.name}
              initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.7, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-3xl border border-white/10 bg-[#0A0A0A] p-8 transition-colors duration-200 hover:border-white/40"
              data-testid={`review-card-${i}`}>
              <div className="flex gap-1">
                {[...Array(5)].map((_, s) => (
                  <Star key={s} size={14} className="fill-white text-white" />
                ))}
              </div>
              <p className="mt-5 text-base leading-relaxed text-white/80">„{r.text}”</p>
              <div className="mt-6 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img src={`https://mc-heads.net/avatar/${r.name.split("·")[1].trim()}/100`} alt={r.name}
                    className="h-10 w-10 rounded-xl border border-white/10" data-testid={`review-avatar-${i}`} />
                  <span className="font-display text-sm font-bold">{r.name}</span>
                </div>
                <span className="shrink-0 rounded-full border border-white/20 bg-white/5 px-3 py-1 font-mono2 text-[10px] uppercase tracking-widest text-white/70">{r.plan}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
