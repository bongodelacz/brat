import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { LayoutGrid, Users, Eye, LogOut, Ban, Trash2, Undo2, KeyRound, Package, Receipt, Ticket, Plug, Cpu } from "lucide-react";
import { useLang } from "@/i18n";
import { useAuth } from "@/context/AuthContext";
import api, { errMsg } from "@/lib/api";
import ConfirmModal from "@/components/ConfirmModal";
import OrdersTab from "@/components/admin/OrdersTab";
import CouponsTab from "@/components/admin/CouponsTab";
import BuildsTab from "@/components/admin/BuildsTab";
import AnalyticsPanel from "@/components/admin/AnalyticsPanel";
import ApiTab from "@/components/admin/ApiTab";

const TABS = [
  { id: "overview", icon: LayoutGrid, key: "admin.tabs.overview" },
  { id: "users", icon: Users, key: "admin.tabs.users" },
  { id: "orders", icon: Receipt, key: "admin.tabs.orders" },
  { id: "coupons", icon: Ticket, key: "admin.tabs.coupons" },
  { id: "visits", icon: Eye, key: "admin.tabs.visits" },
  { id: "build", icon: Package, key: "admin.tabs.build" },
  { id: "api", icon: Plug, key: "admin.tabs.api" },
];

const planName = (id, t, days) =>
  id === "custom" ? `${days} ${t("dash.download.daysShort")}`
  : ({ "30d": t("pricing.d30"), "90d": t("pricing.d90"), lifetime: t("pricing.life") }[id] || id);

function Overview() {
  const { t } = useLang();
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/admin/stats").then(({ data }) => setS(data)).catch(() => {}); }, []);
  if (!s) return null;
  const cards = [["users", s.users], ["licenses", s.licenses], ["orders", s.orders], ["revenue", `${s.revenue} PLN`], ["visits", s.visits]];
  return (
    <div className="space-y-4" data-testid="admin-overview">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {cards.map(([k, v], i) => (
          <motion.div key={k} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className="rounded-3xl border border-white/10 bg-[#0A0A0A] p-6" data-testid={`admin-stat-${k}`}>
            <div className="font-display text-3xl font-extrabold md:text-4xl">{v}</div>
            <div className="label-mono mt-2">{t(`admin.stats.${k}`)}</div>
          </motion.div>
        ))}
      </div>
      <AnalyticsPanel />
    </div>
  );
}

function UsersTab() {
  const { t } = useLang();
  const [users, setUsers] = useState(null);
  const [days, setDays] = useState({});
  const [modal, setModal] = useState(null);
  const load = () => api.get("/admin/users").then(({ data }) => setUsers(data)).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { load(); }, []);

  const grant = async (id, plan) => {
    try { await api.post(`/admin/users/${id}/license`, { plan }); toast.success(t("admin.users.granted")); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const grantCustom = async (id) => {
    const d = parseInt(days[id], 10);
    if (!d || d < 1) return;
    try { await api.post(`/admin/users/${id}/license`, { days: d }); toast.success(t("admin.users.granted")); setDays({ ...days, [id]: "" }); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const resetHwid = async (id) => {
    try { await api.post(`/admin/users/${id}/hwid/reset`); toast.success(t("admin.users.hwidResetOk")); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  if (!users) return null;
  const btn = "rounded-full border border-white/15 px-3 py-1 font-mono2 text-[10px] uppercase tracking-widest text-white/70 transition-colors hover:border-white hover:text-white";
  return (
    <div className="space-y-4" data-testid="admin-users">
      {users.map((u) => (
        <div key={u.id} className="rounded-3xl border border-white/10 bg-[#0A0A0A] p-6" data-testid={`admin-user-${u.uid}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white font-display text-sm font-bold text-black">
                  {u.username[0]?.toUpperCase()}
                </span>
                <div>
                  <p className="font-display text-base font-bold">{u.username}
                    {u.role === "admin" && <span className="ml-2 rounded-full bg-white px-2 py-0.5 font-mono2 text-[9px] uppercase text-black">admin</span>}
                  </p>
                  <p className="font-mono2 text-xs text-white/40">{u.email} · {u.uid}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 font-mono2 text-[10px] uppercase tracking-widest">
                <span className={`rounded-full px-2.5 py-1 ${u.blocked ? "bg-white text-black" : "border border-white/15 text-white/60"}`} data-testid={`admin-user-status-${u.uid}`}>
                  {u.blocked ? t("admin.users.blocked") : t("admin.users.active")}
                </span>
                <span className="text-white/40">{t("admin.users.licenses")}: {u.licenses.length === 0 ? t("admin.users.none") : u.licenses.map((l) => planName(l.plan, t, l.days)).join(", ")}</span>
                <span className="text-white/30">{t("admin.users.joined")}: {u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}</span>
              </div>
              <p className="mt-2 flex items-center gap-2 font-mono2 text-[10px] uppercase tracking-widest text-white/40" data-testid={`admin-user-hwid-${u.uid}`}>
                <Cpu size={11} /> {t("admin.users.hwid")}: {u.hwid_bound && u.hwid ? u.hwid : t("admin.users.hwidNone")}
              </p>
            </div>
            {u.role !== "admin" && (
              <div className="flex flex-col items-end gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="label-mono">{t("admin.users.grant")}</span>
                  {["30d", "90d", "lifetime"].map((p) => (
                    <button key={p} data-testid={`grant-${p}-${u.uid}`} onClick={() => grant(u.id, p)}
                      className="rounded-full bg-white px-3 py-1 font-mono2 text-[10px] font-bold uppercase tracking-widest text-black transition-colors hover:bg-white/70">
                      <KeyRound size={10} className="mr-1 inline" />{p}
                    </button>
                  ))}
                  <button data-testid={`hwid-reset-${u.uid}`} onClick={() => resetHwid(u.id)} className={btn}>
                    <Cpu size={10} className="mr-1 inline" />{t("admin.users.hwidReset")}
                  </button>
                  <button data-testid={`block-${u.uid}`} onClick={() => setModal({ type: "block", user: u })} className={btn}>
                    {u.blocked ? <><Undo2 size={10} className="mr-1 inline" />{t("admin.users.unblock")}</> : <><Ban size={10} className="mr-1 inline" />{t("admin.users.block")}</>}
                  </button>
                  <button data-testid={`delete-${u.uid}`} onClick={() => setModal({ type: "delete", user: u })}
                    className="rounded-full border border-white/15 px-3 py-1 font-mono2 text-[10px] uppercase tracking-widest text-white/70 transition-colors hover:border-white hover:bg-white hover:text-black">
                    <Trash2 size={10} className="mr-1 inline" />{t("admin.users.del")}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="label-mono">{t("admin.users.customDays")}</span>
                  <input data-testid={`custom-days-${u.uid}`} type="number" min="1" max="3650" value={days[u.id] || ""}
                    onChange={(e) => setDays({ ...days, [u.id]: e.target.value })}
                    className="w-20 rounded-full border border-white/15 bg-black px-3 py-1 font-mono2 text-[11px] outline-none focus:border-white/60" placeholder="45" />
                  <button data-testid={`grant-custom-${u.uid}`} onClick={() => grantCustom(u.id)}
                    className="rounded-full border border-white px-3 py-1 font-mono2 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-black">
                    {t("admin.users.grantBtn")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
      <ConfirmModal testId="admin-confirm" open={!!modal}
        title={modal?.type === "delete" ? t("admin.users.confirmDeleteTitle") : t("admin.users.confirmBlockTitle")}
        desc={modal?.type === "delete" ? t("admin.users.confirmDelete") : t("admin.users.confirmBlock")}
        onCancel={() => setModal(null)}
        onConfirm={async () => {
          const m = modal;
          setModal(null);
          if (!m) return;
          try {
            if (m.type === "delete") { await api.delete(`/admin/users/${m.user.id}`); toast.success(t("admin.users.deleted")); }
            else { await api.post(`/admin/users/${m.user.id}/block`); toast.success(t("admin.users.statusOk")); }
            load();
          } catch (e) { toast.error(errMsg(e)); }
        }} />
    </div>
  );
}

function VisitsTab() {
  const { t } = useLang();
  const [visits, setVisits] = useState(null);
  const [logs, setLogs] = useState(null);
  useEffect(() => {
    api.get("/admin/visits").then(({ data }) => setVisits(data)).catch(() => {});
    api.get("/admin/logs").then(({ data }) => setLogs(data)).catch(() => {});
  }, []);
  if (!visits) return null;
  const th = "label-mono border-b border-white/10 px-4 py-3 text-left font-normal";
  const td = "border-b border-white/5 px-4 py-3 font-mono2 text-sm";
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0A0A0A]" data-testid="admin-logs">
        <p className="label-mono border-b border-white/10 px-6 py-4">{t("admin.logs.title")}</p>
        {!logs || logs.length === 0 ? (
          <p className="px-6 py-8 font-mono2 text-sm text-white/40" data-testid="admin-logs-empty">{t("admin.logs.empty")}</p>
        ) : (
          <table className="w-full">
            <thead><tr>
              <th className={th}>{t("admin.visits.time")}</th>
              <th className={th}>{t("admin.logs.admin")}</th>
              <th className={th}>{t("admin.logs.action")}</th>
              <th className={th}>{t("admin.logs.target")}</th>
              <th className={th}>{t("admin.visits.ip")}</th>
            </tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} data-testid={`admin-log-${l.id}`}>
                  <td className={`${td} text-white/40`}>{new Date(l.ts).toLocaleString()}</td>
                  <td className={`${td} text-white`}>{l.admin_username}</td>
                  <td className={td}>
                    <span className="rounded-full bg-white px-2.5 py-1 font-mono2 text-[10px] font-bold uppercase text-black">{l.action}</span>
                  </td>
                  <td className={`${td} text-white/60`}>{l.target || "—"}</td>
                  <td className={`${td} text-white/40`}>{l.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0A0A0A]" data-testid="admin-visits">
        <p className="label-mono border-b border-white/10 px-6 py-4">{t("admin.tabs.visits")}</p>
        {visits.length === 0 ? (
          <p className="px-6 py-8 font-mono2 text-sm text-white/40">{t("admin.visits.empty")}</p>
        ) : (
          <table className="w-full">
            <thead><tr>
              <th className={th}>{t("admin.visits.ip")}</th>
              <th className={th}>{t("admin.visits.path")}</th>
              <th className={th}>{t("admin.visits.time")}</th>
            </tr></thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.id} data-testid={`visit-row-${v.id}`}>
                  <td className={`${td} text-white`}>{v.ip}</td>
                  <td className={`${td} text-white/60`}>{v.path}</td>
                  <td className={`${td} text-white/40`}>{new Date(v.ts).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { t } = useLang();
  const { user, logout } = useAuth();
  const [tab, setTab] = useState("overview");

  if (user === undefined) return <div className="flex min-h-screen items-center justify-center bg-[#050505]"><span className="h-3 w-3 animate-blink rounded-full bg-white" /></div>;
  if (!user || user.role !== "admin") return <Navigate to="/panel" replace />;

  return (
    <div className="min-h-screen bg-[#050505] text-white" data-testid="admin-page">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050505]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" data-testid="admin-logo" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white font-display text-sm font-bold text-black">B</span>
            <span className="font-display text-lg font-bold">BRAT<span className="text-white/40">CLIENT</span></span>
            <span className="ml-2 rounded-full bg-white px-2.5 py-0.5 font-mono2 text-[9px] font-bold uppercase tracking-widest text-black">admin</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/panel" data-testid="admin-panel-link" className="rounded-full border border-white/10 px-5 py-1.5 font-mono2 text-xs uppercase text-white/60 transition-colors hover:border-white hover:text-white">
              {t("nav.panel")}
            </Link>
            <button data-testid="admin-logout-btn" onClick={logout}
              className="flex items-center gap-2 rounded-full border border-white/10 px-5 py-1.5 font-mono2 text-xs uppercase text-white/60 transition-colors hover:border-white hover:text-white">
              <LogOut size={14} /> {t("nav.logout")}
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <p className="label-mono mb-1">{t("admin.title")}</p>
          <h1 className="font-display text-3xl font-extrabold uppercase md:text-4xl" data-testid="admin-title">{user.username}</h1>
        </motion.div>
        <nav className="mt-8 flex gap-2 overflow-x-auto pb-1" data-testid="admin-tabs">
          {TABS.map(({ id, icon: Icon, key }) => (
            <button key={id} data-testid={`admin-tab-${id}`} onClick={() => setTab(id)}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-5 py-2.5 font-mono2 text-xs uppercase tracking-widest transition-all duration-150
                ${tab === id ? "border-white bg-white text-black" : "border-white/10 bg-[#0A0A0A] text-white/50 hover:border-white/40 hover:text-white"}`}>
              <Icon size={14} /> {t(key)}
            </button>
          ))}
        </nav>
        <motion.div key={tab} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mt-6">
          {tab === "overview" && <Overview />}
          {tab === "users" && <UsersTab />}
          {tab === "orders" && <OrdersTab />}
          {tab === "coupons" && <CouponsTab />}
          {tab === "visits" && <VisitsTab />}
          {tab === "build" && <BuildsTab />}
          {tab === "api" && <ApiTab />}
        </motion.div>
      </div>
    </div>
  );
}
