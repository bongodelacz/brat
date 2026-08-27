import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { MessageCircle, Mail, Clock, ArrowLeft } from "lucide-react";
import { useLang } from "@/i18n";

export default function ContactPage() {
  const { t, lang, setLang } = useLang();
  return (
    <div className="relative flex min-h-screen flex-col bg-[#050505] text-white" data-testid="contact-page">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <Link to="/" data-testid="contact-logo" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white font-display text-sm font-bold text-black">B</span>
          <span className="font-display text-lg font-bold">BRAT<span className="text-white/40">CLIENT</span></span>
        </Link>
        <div className="flex overflow-hidden rounded-full border border-white/10">
          {["pl", "en"].map((l) => (
            <button key={l} data-testid={`contact-lang-${l}`} onClick={() => setLang(l)}
              className={`px-3 py-1.5 font-mono2 text-xs uppercase ${lang === l ? "bg-white text-black" : "text-white/50"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-[#0A0A0A] p-10 md:p-16">
          <span className="text-stroke pointer-events-none absolute -right-8 -top-12 select-none font-display text-[12rem] font-extrabold leading-none opacity-40">?</span>
          <div className="relative grid items-center gap-12 md:grid-cols-2">
            <div>
              <h1 className="font-display text-5xl font-extrabold uppercase tracking-tight md:text-7xl" data-testid="contact-title">
                {t("contact.title")}<span className="text-white/40">.</span>
              </h1>
              <p className="mt-5 max-w-sm text-base text-white/60">{t("contact.sub")}</p>
              <div className="mt-6 flex items-center gap-2 font-mono2 text-[10px] uppercase tracking-widest text-white/40">
                <Clock size={12} /> {t("contact.note")}
              </div>
              <Link to="/" data-testid="contact-back-link"
                className="mt-10 inline-flex items-center gap-2 font-mono2 text-xs uppercase tracking-widest text-white/50 transition-colors hover:text-white">
                <ArrowLeft size={14} /> {t("contact.back")}
              </Link>
            </div>
            <div className="flex flex-col gap-3">
              <motion.a whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                href="https://discord.gg/bratclient" target="_blank" rel="noreferrer" data-testid="contact-discord-btn"
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
    </div>
  );
}
