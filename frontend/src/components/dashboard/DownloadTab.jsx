import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Download, RefreshCcw, Cpu, Ban, X } from "lucide-react";
import { useLang } from "@/i18n";
import { useAuth } from "@/context/AuthContext";
import api, { errMsg } from "@/lib/api";
import ConfirmModal from "@/components/ConfirmModal";

export default function DownloadTab() {
  const { t } = useLang();
  const { user, setUser } = useAuth();
  const [license, setLicense] = useState(undefined);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    api.get("/licenses/my").then(({ data }) => setLicense(data.find((l) => l.status === "active") || null)).catch(() => setLicense(null));
    api.get("/build/info").then(({ data }) => setInfo(data)).catch(() => {});
  }, []);

  const download = async () => {
    if (info && info.available === false) { setBlocked(true); return; }
    setBusy(true);
    try {
      const res = await api.get("/download/client", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = info?.filename || `BratClient-Setup-v${info?.version || "1.0.0"}.exe`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      if (e.response?.status === 423) setBlocked(true);
      else toast.error(t("dash.download.noLic"));
    } finally {
      setBusy(false);
    }
  };

  const resetHwid = async () => {
    setResetting(true);
    try {
      const { data } = await api.post("/users/me/hwid/reset");
      setUser({ ...user, ...data });
      toast.success(t("dash.download.resetOk"));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setResetting(false);
    }
  };

  const isLifetime = license?.plan === "lifetime";
  const credits = user?.hwid_credits ?? 0;
  const cooldownDays = isLifetime && user?.hwid_last_reset
    ? Math.max(0, Math.ceil((new Date(user.hwid_last_reset).getTime() + 7 * 86400000 - Date.now()) / 86400000))
    : 0;
  const canReset = !!license && (isLifetime ? cooldownDays === 0 : credits > 0);
  const sizeMb = info?.size ? `${(info.size / 1024 / 1024).toFixed(1)} MB` : "24 MB";

  return (
    <div className="space-y-6" data-testid="download-tab">
      <div className="rounded-3xl border border-white/10 bg-[#0A0A0A] p-8">
        <div className="relative rounded-2xl border border-white/10 p-10">
          <div className="absolute -left-px -top-px h-4 w-4 rounded-tl-2xl border-l-2 border-t-2 border-white/60" />
          <div className="absolute -bottom-px -right-px h-4 w-4 rounded-br-2xl border-b-2 border-r-2 border-white/60" />
          <p className="label-mono">{info?.filename || "BRATCLIENT.EXE"}</p>
          <h3 className="mt-3 font-display text-2xl font-bold uppercase md:text-3xl">{t("dash.download.title")}</h3>
          <p className="mt-3 max-w-md text-sm text-white/50">{t("dash.download.desc")}</p>
          <div className="mt-6 flex gap-3 font-mono2 text-[10px] uppercase tracking-widest text-white/40">
            <span className="rounded-full border border-white/10 px-3 py-1.5">{t("dash.download.version")}: {info?.version || "1.0.0"}</span>
            <span className="rounded-full border border-white/10 px-3 py-1.5" data-testid="download-size">{t("dash.download.size")}: {sizeMb}</span>
          </div>
          <button data-testid="download-client-btn" onClick={download} disabled={busy || license === null}
            className="mt-8 flex items-center gap-3 rounded-full bg-white px-10 py-4 font-mono2 text-sm font-bold uppercase tracking-widest text-black transition-colors hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-30">
            <Download size={16} />
            {busy ? t("dash.download.downloading") : t("dash.download.btn")}
          </button>
          {license === null && (
            <p className="mt-4 font-mono2 text-xs text-white/40" data-testid="download-no-license">{t("dash.download.noLic")}</p>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-[#0A0A0A] p-8" data-testid="hwid-card">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="label-mono flex items-center gap-2"><Cpu size={12} /> {t("dash.download.hwid")}</p>
            <p className="mt-3 font-mono2 text-lg font-bold tracking-widest" data-testid="hwid-value">
              {user?.hwid_bound && user?.hwid ? user.hwid : <span className="text-white/40">{t("dash.download.notBound")}</span>}
            </p>
            <p className="mt-2 max-w-sm text-sm text-white/50">{t("dash.download.hwidDesc")}</p>
            <div className="mt-4 flex flex-wrap gap-2 font-mono2 text-[10px] uppercase tracking-widest">
              {isLifetime ? (
                <span className="rounded-full bg-white px-3 py-1 font-bold text-black" data-testid="hwid-mode">LIFETIME · CO 7 DNI</span>
              ) : (
                <span className="rounded-full border border-white/15 px-3 py-1 text-white/60" data-testid="hwid-mode">
                  {t("dash.download.credits")}: {credits}
                </span>
              )}
              {cooldownDays > 0 && (
                <span className="rounded-full border border-white/15 px-3 py-1 text-white/60" data-testid="hwid-cooldown">
                  {t("dash.download.cooldown")}: {cooldownDays} {t("dash.download.daysShort")}
                </span>
              )}
            </div>
          </div>
          <button data-testid="hwid-reset-btn" onClick={() => setConfirmReset(true)} disabled={!canReset || resetting}
            className="flex items-center gap-3 rounded-full bg-white px-8 py-4 font-mono2 text-sm font-bold uppercase tracking-widest text-black transition-colors hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-30">
            <RefreshCcw size={15} className={resetting ? "animate-spin" : ""} />
            {resetting ? t("dash.download.resetting") : t("dash.download.reset")}
          </button>
        </div>
        {license && !isLifetime && credits === 0 && (
          <p className="mt-4 font-mono2 text-xs text-white/40" data-testid="hwid-no-credits">{t("dash.download.noCredits")}</p>
        )}
      </div>

      <AnimatePresence>
        {blocked && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
            data-testid="build-blocked-modal" onClick={() => setBlocked(false)}>
            <motion.div initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }} onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md rounded-3xl border border-white/15 bg-[#0A0A0A] p-8 text-center">
              <button onClick={() => setBlocked(false)} data-testid="build-blocked-close"
                className="absolute right-5 top-5 rounded-full border border-white/15 p-2 text-white/50 transition-colors hover:border-white hover:text-white">
                <X size={14} />
              </button>
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-white text-black">
                <Ban size={24} />
              </span>
              <h3 className="mt-6 font-display text-2xl font-bold uppercase">{t("dash.download.blockedTitle")}</h3>
              <p className="mt-3 text-sm text-white/50">{t("dash.download.blockedDesc")}</p>
              <button data-testid="build-blocked-ok" onClick={() => setBlocked(false)}
                className="mt-7 w-full rounded-full bg-white px-6 py-4 font-mono2 text-xs font-bold uppercase tracking-widest text-black transition-colors hover:bg-white/70">
                OK
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal testId="hwid-reset-confirm" open={confirmReset}
        title={t("dash.download.resetConfirmTitle")} desc={t("dash.download.resetConfirmDesc")}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => { setConfirmReset(false); resetHwid(); }} />
    </div>
  );
}
