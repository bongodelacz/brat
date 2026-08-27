import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { useLang } from "@/i18n";
import { useAuth } from "@/context/AuthContext";

function NavLink({ href, label, testId }) {
  return (
    <a href={href} data-testid={testId} className="group relative px-1 py-1">
      <span className="label-mono transition-colors group-hover:text-white">{label}</span>
      <span className="absolute -bottom-0.5 left-0 h-0.5 w-full origin-left scale-x-0 bg-white transition-transform duration-200 group-hover:scale-x-100" />
    </a>
  );
}

export default function Navbar() {
  const { t, lang, setLang } = useLang();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const prev = useRef(0);

  useMotionValueEvent(scrollY, "change", (y) => {
    setHidden(y > prev.current && y > 140);
    setScrolled(y > 30);
    prev.current = y;
  });

  return (
    <motion.header
      initial={{ y: -80 }} animate={{ y: hidden ? -80 : 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed left-0 right-0 top-0 z-50 border-b backdrop-blur-xl transition-colors duration-300
        ${scrolled ? "border-white/10 bg-[#050505]/85" : "border-transparent bg-transparent"}`}
      data-testid="navbar">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" data-testid="nav-logo" className="group flex items-center gap-2">
          <motion.span whileHover={{ rotate: 90 }} transition={{ duration: 0.3 }}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-white font-display text-sm font-bold text-black">B</motion.span>
          <span className="font-display text-lg font-bold tracking-tight">BRAT<span className="text-white/40">CLIENT</span></span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          <NavLink href="#pricing" label={t("nav.pricing")} testId="nav-pricing" />
          <NavLink href="#manifesto" label={t("nav.manifesto")} testId="nav-manifesto" />
          <Link to="/kontakt" data-testid="nav-contact" className="group relative px-1 py-1">
            <span className="label-mono transition-colors group-hover:text-white">{t("nav.contact")}</span>
            <span className="absolute -bottom-0.5 left-0 h-0.5 w-full origin-left scale-x-0 bg-white transition-transform duration-200 group-hover:scale-x-100" />
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden rounded-full border border-white/10" data-testid="lang-switch">
            {["pl", "en"].map((l) => (
              <button key={l} data-testid={`lang-${l}`} onClick={() => setLang(l)}
                className={`px-3 py-1.5 font-mono2 text-xs uppercase transition-colors ${lang === l ? "bg-white text-black" : "text-white/50 hover:text-white"}`}>
                {l}
              </button>
            ))}
          </div>
          {user ? (
            <>
              <button data-testid="nav-panel-btn" onClick={() => navigate("/panel")}
                className="rounded-full bg-white px-5 py-1.5 font-mono2 text-xs font-bold uppercase text-black transition-colors hover:bg-white/70">
                {t("nav.panel")}
              </button>
              <button data-testid="nav-logout-btn" onClick={logout}
                className="rounded-full border border-white/10 px-5 py-1.5 font-mono2 text-xs uppercase text-white/60 transition-colors hover:border-white hover:text-white">
                {t("nav.logout")}
              </button>
            </>
          ) : (
            <button data-testid="nav-login-btn" onClick={() => navigate("/auth")}
              className="rounded-full bg-white px-5 py-1.5 font-mono2 text-xs font-bold uppercase text-black transition-colors hover:bg-white/70">
              {t("nav.login")}
            </button>
          )}
        </div>
      </div>
    </motion.header>
  );
}
