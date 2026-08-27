import { motion } from "framer-motion";
import { useLang } from "@/i18n";

const chapters = [
  { n: "01", tKey: "manifesto.c1t", dKey: "manifesto.c1d" },
  { n: "02", tKey: "manifesto.c2t", dKey: "manifesto.c2d" },
  { n: "03", tKey: "manifesto.c3t", dKey: "manifesto.c3d" },
];

export default function Manifesto() {
  const { t } = useLang();
  return (
    <section id="manifesto" className="border-b border-white/10" data-testid="manifesto-section">
      <div className="mx-auto max-w-7xl px-6 py-28">
        <motion.h2 initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-4xl font-extrabold uppercase tracking-tight md:text-6xl">
          {t("manifesto.title")}<span className="text-white/40">.</span>
        </motion.h2>
        <div className="mt-16 space-y-6">
          {chapters.map((c, i) => (
            <motion.div key={c.n}
              initial={{ opacity: 0, y: 60 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.8, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ x: 8 }}
              className="group grid grid-cols-1 gap-6 rounded-3xl border border-white/10 bg-[#0A0A0A] p-10 transition-colors duration-200 hover:border-white/40 md:grid-cols-[0.2fr_1fr_1fr] md:gap-12"
              data-testid={`manifesto-chapter-${c.n}`}>
              <div className="font-display text-5xl font-bold text-stroke">{c.n}</div>
              <h3 className="font-display text-3xl font-bold uppercase tracking-tight md:text-4xl">{t(c.tKey)}</h3>
              <p className="max-w-md self-center text-base leading-relaxed text-white/60">{t(c.dKey)}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
