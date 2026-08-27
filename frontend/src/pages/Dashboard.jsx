import { useState, useEffect } from "react";
import { Navigate, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { User, ShieldCheck, CreditCard, Download, Languages, LogOut, BadgeCheck, Shield, Sliders } from "lucide-react";
import { useLang } from "@/i18n";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import ProfileTab from "@/components/dashboard/ProfileTab";
import SecurityTab from "@/components/dashboard/SecurityTab";
import PaymentsTab from "@/components/dashboard/PaymentsTab";
import ConfigsTab from "@/components/dashboard/ConfigsTab";
import DownloadTab from "@/components/dashboard/DownloadTab";
import LanguageTab from "@/components/dashboard/LanguageTab";

const TABS = [
  { id: "profile", icon: User, key: "dash.tabs.profile" },
  { id: "security", icon: ShieldCheck, key: "dash.tabs.security" },
  { id: "payments", icon: CreditCard, key: "dash.tabs.payments" },
  { id: "configs", icon: Sliders, key: "dash.tabs.configs" },
  { id: "download", icon: Download, key: "dash.tabs.download" },
  { id: "language", icon: Languages, key: "dash.tabs.language" },
];

export default function Dashboard() {
  const { t } = useLang();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("profile");
  const [license, setLicense] = useState(null);

  useEffect(() => {
    if (user) api.get("/licenses/my").then(({ data }) => setLicense(data.find((l) => l.status === "active") || null)).catch(() => {});
  }, [user]);

  if (user === undefined) return <div className="flex min-h-screen items-center justify-center bg-[#050505]"><span className="h-3 w-3 animate-blink rounded-full bg-white" /></div>;
  if (user === null) return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen bg-[#050505] text-white" data-testid="dashboard">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050505]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" data-testid="dash-logo" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white font-display text-sm font-bold text-black">B</span>
            <span className="font-display text-lg font-bold">BRAT<span className="text-white/40">CLIENT</span></span>
          </Link>
          <div className="flex items-center gap-3">
            {user.role === "admin" && (
              <button data-testid="dash-admin-btn" onClick={() => navigate("/admin")}
                className="flex items-center gap-2 rounded-full bg-white px-5 py-1.5 font-mono2 text-xs font-bold uppercase text-black transition-colors hover:bg-white/70">
                <Shield size={14} /> Admin
              </button>
            )}
            <button data-testid="dash-logout-btn" onClick={logout}
            className="flex items-center gap-2 rounded-full border border-white/10 px-5 py-1.5 font-mono2 text-xs uppercase text-white/60 transition-colors hover:border-white hover:text-white">
            <LogOut size={14} /> {t("nav.logout")}
          </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0A0A0A] p-8 md:p-10" data-testid="dash-user-card">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/5 blur-2xl" />
          <div className="flex flex-col items-start gap-6 md:flex-row md:items-center">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15 }}
              className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-black">
              {user.avatar
                ? <img src={user.avatar} alt="avatar" className="h-full w-full object-cover" />
                : <span className="font-display text-4xl font-bold text-white">{user.username[0]?.toUpperCase()}</span>}
            </motion.div>
            <div className="min-w-0 flex-1">
              <p className="label-mono mb-1">{t("dash.title")}</p>
              <h1 className="truncate font-display text-3xl font-bold uppercase md:text-4xl" data-testid="dash-username">{user.username}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 font-mono2 text-[10px] tracking-widest text-white/70" data-testid="dash-uid">{user.uid}</span>
                <span className="rounded-full border border-white/10 px-3 py-1 font-mono2 text-[10px] tracking-widest text-white/50" data-testid="dash-user-email">{user.email}</span>
                {user.tester && (
                  <span className="rounded-full border border-white bg-white px-3 py-1 font-mono2 text-[10px] font-bold uppercase tracking-widest text-black" data-testid="dash-tester-badge">Tester</span>
                )}
                {license ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 font-mono2 text-[10px] font-bold uppercase tracking-widest text-black" data-testid="dash-license-badge">
                    <BadgeCheck size={12} /> {license.plan === "lifetime" ? "LIFETIME" : license.plan === "custom" ? `${license.days} ${t("dash.download.daysShort")}` : license.plan}
                  </span>
                ) : (
                  <span className="rounded-full border border-white/15 px-3 py-1 font-mono2 text-[10px] uppercase tracking-widest text-white/40" data-testid="dash-license-badge">no license</span>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        <motion.nav initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }}
          className="mt-8 flex gap-2 overflow-x-auto pb-1" data-testid="dash-tabs">
          {TABS.map(({ id, icon: Icon, key }) => (
            <button key={id} data-testid={`dash-tab-${id}`} onClick={() => setTab(id)}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-5 py-2.5 font-mono2 text-xs uppercase tracking-widest transition-all duration-150
                ${tab === id ? "border-white bg-white text-black" : "border-white/10 bg-[#0A0A0A] text-white/50 hover:border-white/40 hover:text-white"}`}>
              <Icon size={14} /> {t(key)}
            </button>
          ))}
        </motion.nav>

        <motion.div key={tab} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mt-6">
          {tab === "profile" && <ProfileTab />}
          {tab === "security" && <SecurityTab />}
          {tab === "payments" && <PaymentsTab />}
          {tab === "configs" && <ConfigsTab />}
          {tab === "download" && <DownloadTab />}
          {tab === "language" && <LanguageTab />}
        </motion.div>
      </div>
    </div>
  );
}
