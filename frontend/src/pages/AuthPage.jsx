import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { KeyRound, Zap, ShieldCheck } from "lucide-react";
import { useLang } from "@/i18n";
import { useAuth } from "@/context/AuthContext";
import { errMsg } from "@/lib/api";
import TwoFactorPanel from "@/components/TwoFactorPanel";

export default function AuthPage() {
  const { t, lang, setLang } = useLang();
  const { login, register, verify2fa } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [tfaError, setTfaError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const res = await login(email, password);
        if (res?.twofa_required) {
          setChallenge(res);
          toast.info(t("auth.tfaSent"));
          return;
        }
      } else {
        await register(email, password, username);
      }
      toast.success(t("auth.welcome"));
      navigate("/panel");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (code) => {
    setLoading(true);
    setTfaError("");
    try {
      await verify2fa(challenge.challenge_id, code);
      toast.success(t("auth.welcome"));
      navigate("/panel");
    } catch (err) {
      setTfaError(t(`auth.tfaErrors.${errMsg(err)}`) || errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full rounded-xl border border-white/10 bg-black px-4 py-3 font-mono2 text-sm text-white outline-none transition-colors focus:border-white/60";
  const chips = [
    { icon: KeyRound, label: "instant key" },
    { icon: ShieldCheck, label: "undetected" },
    { icon: Zap, label: "24/7 support" },
  ];

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#050505]" data-testid="auth-page">
      <span className="text-stroke pointer-events-none absolute -right-16 top-1/2 hidden -translate-y-1/2 select-none font-display text-[20rem] font-extrabold leading-none opacity-50 lg:block">
        BRAT
      </span>
      <div className="relative z-10 flex items-center justify-between border-b border-white/10 px-6 py-4">
        <Link to="/" data-testid="auth-logo" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white font-display text-sm font-bold text-black">B</span>
          <span className="font-display text-lg font-bold">BRAT<span className="text-white/40">CLIENT</span></span>
        </Link>
        <div className="flex overflow-hidden rounded-full border border-white/10">
          {["pl", "en"].map((l) => (
            <button key={l} data-testid={`auth-lang-${l}`} onClick={() => setLang(l)}
              className={`px-3 py-1.5 font-mono2 text-xs uppercase ${lang === l ? "bg-white text-black" : "text-white/50"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-14 px-6 py-14 md:grid-cols-2">
        <div className="hidden md:block">
          <h1 className="font-display text-6xl font-extrabold uppercase leading-[0.95] tracking-tighter">
            <span className="block overflow-hidden">
              <motion.span initial={{ y: "110%" }} animate={{ y: 0 }} transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }} className="block">
                {t("auth.sideTitle1")}
              </motion.span>
            </span>
            <span className="block overflow-hidden">
              <motion.span initial={{ y: "110%" }} animate={{ y: 0 }} transition={{ duration: 0.8, delay: 0.25, ease: [0.16, 1, 0.3, 1] }} className="block text-white">
                {t("auth.sideTitle2")}
              </motion.span>
            </span>
          </h1>
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6 }}
            className="mt-6 max-w-sm text-base text-white/50">
            {t("auth.sideSub")}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65, duration: 0.6 }}
            className="mt-8 flex flex-wrap gap-2">
            {chips.map(({ icon: Icon, label }, i) => (
              <span key={label} style={{ animationDelay: `${i * 0.8}s` }}
                className="animate-floaty flex items-center gap-2 rounded-full border border-white/10 bg-[#0A0A0A] px-4 py-2 font-mono2 text-[10px] uppercase tracking-widest text-white/60">
                <Icon size={12} className="text-white" /> {label}
              </span>
            ))}
          </motion.div>
        </div>
        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md justify-self-center rounded-3xl border border-white/10 bg-[#0A0A0A]">
          {challenge ? (
            <TwoFactorPanel emailHint={challenge.email_hint} loading={loading} error={tfaError}
              onSubmit={submitCode} onCancel={() => { setChallenge(null); setTfaError(""); }} />
          ) : (
          <>
          <div className="flex border-b border-white/10">
            {["login", "register"].map((m) => (
              <button key={m} data-testid={`auth-tab-${m}`} onClick={() => setMode(m)}
                className={`flex-1 px-4 py-4 font-mono2 text-xs font-bold uppercase tracking-widest transition-colors first:rounded-tl-3xl last:rounded-tr-3xl
                  ${mode === m ? "bg-white text-black" : "text-white/40 hover:text-white"}`}>
                {m === "login" ? t("auth.loginTitle") : t("auth.regTitle")}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-5 p-8" data-testid="auth-form">
            {mode === "register" && (
              <div>
                <label className="label-mono mb-2 block">{t("auth.username")}</label>
                <input data-testid="auth-username-input" className={inputCls} value={username}
                  onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={20} />
              </div>
            )}
            <div>
              <label className="label-mono mb-2 block">{t("auth.email")}</label>
              <input data-testid="auth-email-input" type="text" className={inputCls} value={email}
                onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label-mono mb-2 block">{t("auth.password")}</label>
              <input data-testid="auth-password-input" type="password" className={inputCls} value={password}
                onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              {mode === "register" && (
                <p className="mt-2 font-mono2 text-[10px] uppercase tracking-widest text-white/30">{t("auth.pwHint")}</p>
              )}
            </div>
            <button data-testid="auth-submit-btn" disabled={loading}
              className="w-full rounded-full bg-white px-6 py-4 font-mono2 text-sm font-bold uppercase tracking-widest text-black transition-colors duration-150 hover:bg-white/70 disabled:opacity-50">
              {loading ? "..." : mode === "login" ? t("auth.loginBtn") : t("auth.regBtn")}
            </button>
            <button type="button" data-testid="auth-switch-mode" onClick={() => setMode(mode === "login" ? "register" : "login")}
              className="w-full text-center font-mono2 text-[11px] uppercase tracking-widest text-white/40 transition-colors hover:text-white">
              {mode === "login" ? t("auth.noAcc") : t("auth.hasAcc")}
            </button>
          </form>
          </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
