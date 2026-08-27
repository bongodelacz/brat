import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Copy, Trash2, Download, Globe, Lock, Sliders, Search } from "lucide-react";
import { useLang } from "@/i18n";
import api, { errMsg } from "@/lib/api";
import ConfirmModal from "@/components/ConfirmModal";

export default function ConfigsTab() {
  const { t } = useLang();
  const [configs, setConfigs] = useState(null);
  const [del, setDel] = useState(null);
  const [lookup, setLookup] = useState("");
  const [found, setFound] = useState(null);

  const load = () => api.get("/configs/my").then(({ data }) => setConfigs(data)).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { load(); }, []);

  const copy = (code) => {
    navigator.clipboard.writeText(`#${code}`);
    toast.success(t("dash.configs.copied"));
  };

  const togglePublic = async (c) => {
    try {
      await api.patch(`/configs/${c.id}`, { is_public: !c.is_public });
      toast.success(c.is_public ? t("dash.configs.nowPrivate") : t("dash.configs.nowPublic"));
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const downloadJson = async (c) => {
    try {
      const { data } = await api.get(`/configs/${c.code}`);
      const blob = new Blob([JSON.stringify(data.settings, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${c.name.replace(/[^A-Za-z0-9_-]/g, "_")}-${c.code}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const search = async () => {
    const code = lookup.trim().replace(/^#/, "").toUpperCase();
    if (!code) return;
    try {
      const { data } = await api.get(`/configs/${code}`);
      setFound(data);
    } catch (e) { setFound(null); toast.error(errMsg(e)); }
  };

  const kb = (b) => `${Math.max(1, Math.round((b || 0) / 1024))} KB`;
  const btn = "flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 font-mono2 text-[10px] uppercase tracking-widest text-white/70 transition-colors hover:border-white hover:text-white";

  return (
    <div className="space-y-6" data-testid="configs-tab">
      <div className="rounded-3xl border border-white/10 bg-[#0A0A0A] p-8">
        <p className="label-mono flex items-center gap-2"><Sliders size={12} /> {t("dash.configs.title")}</p>
        <p className="mt-2 max-w-2xl text-sm text-white/50">{t("dash.configs.desc")}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <div className="flex flex-1 items-center gap-3 rounded-full border border-white/15 bg-black px-5 py-3">
            <Search size={14} className="text-white/40" />
            <input data-testid="config-lookup-input" value={lookup}
              onChange={(e) => setLookup(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder={t("dash.configs.lookupPlaceholder")}
              className="w-full bg-transparent font-mono2 text-xs uppercase tracking-widest text-white outline-none placeholder:text-white/30" />
          </div>
          <button data-testid="config-lookup-btn" onClick={search}
            className="rounded-full bg-white px-6 py-3 font-mono2 text-[10px] font-bold uppercase tracking-widest text-black transition-colors hover:bg-white/70">
            {t("dash.configs.lookup")}
          </button>
        </div>
        {found && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/15 p-5"
            data-testid="config-lookup-result">
            <div>
              <p className="font-display text-lg font-bold">{found.name}</p>
              <p className="label-mono mt-1">#{found.code} · {found.author} · {found.modules_count} {t("dash.configs.modules")}</p>
            </div>
            <button onClick={() => downloadJson(found)} className={btn}>
              <Download size={11} /> {t("dash.configs.json")}
            </button>
          </motion.div>
        )}
      </div>

      <div className="rounded-3xl border border-white/10 bg-[#0A0A0A]">
        <p className="label-mono border-b border-white/10 px-6 py-4">{t("dash.configs.mine")}</p>
        {!configs ? null : configs.length === 0 ? (
          <p className="px-6 py-8 font-mono2 text-sm text-white/40" data-testid="configs-empty">{t("dash.configs.empty")}</p>
        ) : (
          <div className="divide-y divide-white/5">
            {configs.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex flex-wrap items-center justify-between gap-4 px-6 py-5"
                data-testid={`config-row-${c.code}`}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-lg font-bold">{c.name}</p>
                    <button data-testid={`config-copy-${c.code}`} onClick={() => copy(c.code)}
                      className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 font-mono2 text-[10px] font-bold uppercase tracking-widest text-black transition-opacity hover:opacity-80">
                      #{c.code} <Copy size={10} />
                    </button>
                    <span className={`flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono2 text-[9px] uppercase tracking-widest
                      ${c.is_public ? "border-white/25 text-white/70" : "border-white/15 text-white/40"}`}
                      data-testid={`config-visibility-${c.code}`}>
                      {c.is_public ? <><Globe size={10} /> {t("dash.configs.public")}</> : <><Lock size={10} /> {t("dash.configs.private")}</>}
                    </span>
                  </div>
                  {c.description && <p className="mt-2 max-w-lg text-xs text-white/40">{c.description}</p>}
                  <p className="label-mono mt-2">
                    {c.modules_count} {t("dash.configs.modules")} · {kb(c.size_bytes)} · {c.downloads} {t("dash.configs.downloads")}
                    {c.client_version ? ` · v${c.client_version}` : ""} · {new Date(c.updated_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button data-testid={`config-toggle-${c.code}`} onClick={() => togglePublic(c)} className={btn}>
                    {c.is_public ? <><Lock size={11} /> {t("dash.configs.makePrivate")}</> : <><Globe size={11} /> {t("dash.configs.makePublic")}</>}
                  </button>
                  <button data-testid={`config-download-${c.code}`} onClick={() => downloadJson(c)} className={btn}>
                    <Download size={11} /> {t("dash.configs.json")}
                  </button>
                  <button data-testid={`config-delete-${c.code}`} onClick={() => setDel(c)}
                    className="rounded-full border border-white/15 p-2.5 text-white/60 transition-colors hover:border-white hover:bg-white hover:text-black">
                    <Trash2 size={12} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal testId="config-confirm" open={!!del}
        title={t("dash.configs.confirmDeleteTitle")} desc={t("dash.configs.confirmDelete")}
        onCancel={() => setDel(null)}
        onConfirm={async () => {
          const c = del; setDel(null);
          if (!c) return;
          try { await api.delete(`/configs/${c.id}`); toast.success(t("dash.configs.deleted")); load(); }
          catch (e) { toast.error(errMsg(e)); }
        }} />
    </div>
  );
}
