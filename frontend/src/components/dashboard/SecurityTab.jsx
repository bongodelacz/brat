import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { ShieldCheck, Mail, X } from "lucide-react";
import { useLang } from "@/i18n";
import { useAuth } from "@/context/AuthContext";
import api, { errMsg } from "@/lib/api";
import { CodeInput } from "@/components/TwoFactorPanel";

const inputCls = "w-full rounded-xl border border-white/10 bg-black px-4 py-3 font-mono2 text-sm outline-none transition-colors focus:border-white/60";

export default function SecurityTab() {
  const { t } = useLang();
  const { user, setUser } = useAuth();
  const { refreshUser } = useAuth();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  // Powrót z autoryzacji Discord (?discord=connected|taken|error)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("discord");
    if (!p) return;
    if (p === "connected") { toast.success(t("dash.security.connected")); refreshUser?.(); }
    else if (p === "taken") toast.error("To konto Discord jest już połączone z innym kontem.");
    else if (p === "error") toast.error("Nie udało się połączyć Discorda. Spróbuj ponownie.");
    window.history.replaceState({}, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changePw = async () => {
    try {
      await api.post("/users/me/password", { current_password: cur, new_password: next });
      toast.success(t("dash.security.changed"));
      setCur(""); setNext("");
    } catch (e) { toast.error(errMsg(e)); }
  };

  const connectDiscord = async () => {
    try {
      const { data } = await api.get("/discord/connect");
      window.location.href = data.url; // przekierowanie do autoryzacji Discord
    } catch (e) { toast.error(errMsg(e)); }
  };

  const disconnectDiscord = async () => {
    try {
      await api.post("/discord/disconnect");
      setUser({ ...user, discord_connected: false, discord_id: null, discord_username: null });
      toast.success(t("dash.security.disconnected"));
    } catch (e) { toast.error(errMsg(e)); }
  };

  const toggleDiscord = () => (user.discord_connected ? disconnectDiscord() : connectDiscord());

  const requestCode = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/users/me/2fa/request");
      setChallenge(data);
      setCode("");
      toast.success(t("dash.security.tfaSent"));
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const confirmCode = async (value) => {
    setBusy(true);
    try {
      const { data } = await api.post("/users/me/2fa/confirm", {
        challenge_id: challenge.challenge_id, code: value,
      });
      setUser({ ...user, twofa_enabled: data.twofa_enabled });
      setChallenge(null);
      toast.success(data.twofa_enabled ? t("dash.security.tfaOn") : t("dash.security.tfaOff"));
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const isAdmin = user.role === "admin";

  return (
    <div className="space-y-6" data-testid="security-tab">
      <div className="rounded-3xl border border-white/10 bg-[#0A0A0A] p-8">
        <p className="label-mono mb-2">{t("dash.security.email")}</p>
        <p className="font-mono2 text-sm" data-testid="security-email">{user.email}</p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-[#0A0A0A] p-8">
        <p className="label-mono mb-4">{t("dash.security.passChange")}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <input data-testid="current-password-input" type="password" placeholder={t("dash.security.current")} className={inputCls} value={cur} onChange={(e) => setCur(e.target.value)} />
          <input data-testid="new-password-input" type="password" placeholder={t("dash.security.new")} className={inputCls} value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <p className="mt-3 font-mono2 text-[10px] uppercase tracking-widest text-white/30">{t("auth.pwHint")}</p>
        <button data-testid="change-password-btn" onClick={changePw} disabled={!cur || next.length < 8}
          className="mt-4 rounded-full bg-white px-6 py-3 font-mono2 text-xs font-bold uppercase tracking-widest text-black transition-colors hover:bg-white/70 disabled:opacity-40">
          {t("dash.security.changeBtn")}
        </button>
      </div>

      <div className="flex items-center justify-between rounded-3xl border border-white/10 bg-[#0A0A0A] p-8">
        <div>
          <p className="font-mono2 text-sm font-bold uppercase tracking-widest">{t("dash.security.discord")}</p>
          <p className={`mt-1 font-mono2 text-xs ${user.discord_connected ? "text-white" : "text-white/40"}`} data-testid="discord-toggle-btn-status">
            {user.discord_connected ? t("dash.security.connected") : t("dash.security.disconnected")}
          </p>
        </div>
        <button data-testid="discord-toggle-btn" onClick={toggleDiscord}
          className={`rounded-full px-6 py-3 font-mono2 text-xs font-bold uppercase tracking-widest transition-colors
            ${user.discord_connected ? "border border-white/20 text-white hover:border-white" : "bg-white text-black hover:bg-white/70"}`}>
          {user.discord_connected ? t("dash.security.disconnect") : t("dash.security.connect")}
        </button>
      </div>

      <div className="rounded-3xl border border-white/10 bg-[#0A0A0A] p-8" data-testid="tfa-card">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="flex items-center gap-2 font-mono2 text-sm font-bold uppercase tracking-widest">
              <ShieldCheck size={14} /> {t("dash.security.tfa")}
            </p>
            <p className={`mt-1 font-mono2 text-xs ${user.twofa_enabled ? "text-white" : "text-white/40"}`} data-testid="2fa-toggle-btn-status">
              {user.twofa_enabled ? t("dash.security.tfaOn") : t("dash.security.tfaOff")}
            </p>
            <p className="mt-3 max-w-md text-sm text-white/50">{t("dash.security.tfaDesc")}</p>
            {isAdmin && (
              <p className="mt-3 inline-block rounded-full bg-white px-3 py-1 font-mono2 text-[10px] font-bold uppercase tracking-widest text-black" data-testid="2fa-admin-forced">
                {t("dash.security.tfaAdmin")}
              </p>
            )}
          </div>
          <button data-testid="2fa-toggle-btn" onClick={requestCode} disabled={busy || isAdmin}
            className={`rounded-full px-6 py-3 font-mono2 text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-30
              ${user.twofa_enabled ? "border border-white/20 text-white hover:border-white" : "bg-white text-black hover:bg-white/70"}`}>
            {user.twofa_enabled ? t("dash.security.tfaDisable") : t("dash.security.tfaEnable")}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {challenge && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
            data-testid="tfa-modal" onClick={() => setChallenge(null)}>
            <motion.div initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }} onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md rounded-3xl border border-white/15 bg-[#0A0A0A] p-8">
              <button onClick={() => setChallenge(null)} data-testid="tfa-modal-close"
                className="absolute right-5 top-5 rounded-full border border-white/15 p-2 text-white/50 transition-colors hover:border-white hover:text-white">
                <X size={14} />
              </button>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-black">
                <Mail size={18} />
              </span>
              <h3 className="mt-5 font-display text-2xl font-bold uppercase">
                {challenge.purpose === "enable" ? t("dash.security.tfaEnableTitle") : t("dash.security.tfaDisableTitle")}
              </h3>
              <p className="mt-2 text-sm text-white/50">
                {t("auth.tfaSub")} <span className="font-mono2 text-white">{challenge.email_hint}</span>
              </p>
              <div className="mt-6">
                <CodeInput value={code} onChange={(v) => { setCode(v); if (v.length === 6) confirmCode(v); }}
                  disabled={busy} testId="tfa-setup-code" />
              </div>
              <button data-testid="tfa-modal-confirm" onClick={() => confirmCode(code)} disabled={busy || code.length !== 6}
                className="mt-6 w-full rounded-full bg-white px-6 py-4 font-mono2 text-xs font-bold uppercase tracking-widest text-black transition-colors hover:bg-white/70 disabled:opacity-40">
                {busy ? "..." : t("auth.tfaVerify")}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
