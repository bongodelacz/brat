import { motion } from "framer-motion";
import { MessageCircle, Mail, Clock } from "lucide-react";
import { useLang } from "@/i18n";

export default function Contact() {
  const { t } = useLang();
  return (
    <section id="kontakt" className="border-b border-white/10" data-testid="contact-section">
      <div className="mx-auto max-w-7xl px-6 py-28">
        <motion.div initial={{ opacity: 0, y: 60 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0A0A0A] p-10 md:p-16">
          <span className="text-stroke pointer-events-none absolute -right-8 -top-10 select-none font-display text-[12rem] font-extrabold leading-none opacity-40">
            ?
          </span>
          <div className="relative grid items-center gap-10 md:grid-cols-2">
            <div>
              <h2 className="font-display text-4xl font-extrabold uppercase tracking-tight md:text-6xl">
                {t("contact.title")}<span className="text-white/40">.</span>
              </h2>
              <p className="mt-4 max-w-sm text-base text-white/60">{t("contact.sub")}</p>
              <div className="mt-6 flex items-center gap-2 font-mono2 text-[10px] uppercase tracking-widest text-white/40">
                <Clock size={12} /> {t("contact.note")}
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <motion.a whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                href="https://discord.gg/brat" target="_blank" rel="noreferrer" data-testid="contact-discord-btn"
                className="flex items-center justify-between rounded-2xl bg-white px-6 py-5 text-black transition-colors hover:bg-white/80">
                <span className="flex items-center gap-3 font-mono2 text-sm font-bold uppercase tracking-widest">
                  <MessageCircle size={18} /> {t("contact.join")}
                </span>
                <span className="font-display text-xl font-extrabold">→</span>
              </motion.a>
              <motion.a whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                href="mailto:support@bratclient.gg" data-testid="contact-email-btn"
                className="flex items-center justify-between rounded-2xl border border-white/15 px-6 py-5 text-white transition-colors hover:border-white">
                <span className="flex items-center gap-3 font-mono2 text-sm uppercase tracking-widest">
                  <Mail size={18} /> {t("contact.emailLabel")}
                </span>
                <span className="font-mono2 text-xs text-white/50">support@bratclient.gg</span>
              </motion.a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
