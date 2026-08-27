import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Tag, CheckCircle2, Ban, Trash2, Play } from "lucide-react";
import { useLang } from "@/i18n";
import api, { errMsg } from "@/lib/api";
import ConfirmModal from "@/components/ConfirmModal";

const inputCls = "w-full rounded-2xl border border-white/15 bg-black px-4 py-3 font-mono2 text-xs text-white outline-none transition-colors focus:border-white placeholder:text-white/25";

export default function BuildsTab() {
  const { t } = useLang();
  const [builds, setBuilds] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ version: "1.0.0", notes: "", mandatory: true });
  const [del, setDel] = useState(null);
  const fileRef = useRef(null);

  const load = () => api.get("/admin/builds").then(({ data }) => setBuilds(data)).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { load(); }, []);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("version", form.version.trim() || "1.0.0");
      if (form.notes) fd.append("notes", form.notes);
      fd.append("mandatory", String(form.mandatory));
      await api.post("/admin/build", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(t("admin.build.uploaded"));
      load();
    } catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); e.target.value = ""; }
  };

  const patch = async (b, payload, msg) => {
    try {
      await api.patch(`/admin/builds/${b.id}`, payload);
      toast.success(msg);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const mb = (size) => (size ? `${(size / 1024 / 1024).toFixed(1)} MB` : "—");
  const btn = "flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 font-mono2 text-[10px] uppercase tracking-widest text-white/70 transition-colors hover:border-white hover:text-white";

  return (
    <div className="space-y-4" data-testid="admin-builds">
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="h-fit rounded-3xl border border-white/10 bg-[#0A0A0A] p-8">
          <p className="label-mono mb-2 flex items-center gap-2"><Upload size={12} /> {t("admin.build.title")}</p>
          <p className="mb-6 text-sm text-white/50">{t("admin.build.desc")}</p>
          <div className="space-y-4">
            <div>
              <label className="label-mono mb-2 block">{t("admin.build.version")}</label>
              <input data-testid="build-version-input" value={form.version} placeholder="1.0.1"
                onChange={(e) => setForm({ ...form, version: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="label-mono mb-2 block">{t("admin.build.notes")}</label>
              <textarea rows={3} data-testid="build-notes-input" value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${inputCls} resize-none`} />
            </div>
            <button type="button" data-testid="build-mandatory-toggle" onClick={() => setForm({ ...form, mandatory: !form.mandatory })}
              className="flex w-full items-center justify-between rounded-2xl border border-white/15 px-5 py-4 text-left transition-colors hover:border-white/40">
              <span className="font-mono2 text-xs text-white/70">{t("admin.build.mandatory")}</span>
              <span className={`flex h-6 w-11 items-center rounded-full p-1 transition-colors ${form.mandatory ? "bg-white" : "bg-white/15"}`}>
                <span className={`h-4 w-4 rounded-full transition-transform ${form.mandatory ? "translate-x-5 bg-black" : "bg-white/60"}`} />
              </span>
            </button>
          </div>
          <button data-testid="build-upload-btn" onClick={() => fileRef.current?.click()} disabled={busy}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-full bg-white px-8 py-4 font-mono2 text-sm font-bold uppercase tracking-widest text-black transition-colors hover:bg-white/70 disabled:opacity-40">
            <Upload size={16} /> {busy ? t("admin.build.uploading") : t("admin.build.upload")}
          </button>
          <input ref={fileRef} type="file" accept=".exe" className="hidden" onChange={upload} data-testid="build-file-input" />
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#0A0A0A]">
          <p className="label-mono border-b border-white/10 px-6 py-4">{t("admin.build.history")}</p>
          {!builds ? null : builds.length === 0 ? (
            <p className="px-6 py-8 font-mono2 text-sm text-white/40" data-testid="builds-empty">{t("admin.build.none")}</p>
          ) : (
            <div className="divide-y divide-white/5">
              {builds.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-5"
                  data-testid={`build-row-${b.version}`}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-lg font-bold">v{b.version}</p>
                      {b.is_active && !b.blocked && (
                        <span className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-mono2 text-[9px] font-bold uppercase tracking-widest text-black" data-testid={`build-active-${b.version}`}>
                          <CheckCircle2 size={10} /> {t("admin.build.active")}
                        </span>
                      )}
                      {b.blocked && (
                        <span className="flex items-center gap-1 rounded-full border border-white/25 px-2.5 py-1 font-mono2 text-[9px] uppercase tracking-widest text-white/60" data-testid={`build-blocked-${b.version}`}>
                          <Ban size={10} /> {t("admin.build.blocked")}
                        </span>
                      )}
                      {b.mandatory && (
                        <span className="rounded-full border border-white/15 px-2.5 py-1 font-mono2 text-[9px] uppercase tracking-widest text-white/40">
                          {t("admin.build.mandatoryShort")}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 font-mono2 text-[11px] text-white/50">{b.filename}</p>
                    <p className="label-mono mt-1">{mb(b.size)} · {new Date(b.uploaded_at).toLocaleString()}</p>
                    {b.notes && <p className="mt-2 max-w-md text-xs text-white/40">{b.notes}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!b.is_active && (
                      <button data-testid={`build-activate-${b.version}`} className={btn}
                        onClick={() => patch(b, { is_active: true, blocked: false }, t("admin.build.activated"))}>
                        <Play size={11} /> {t("admin.build.activate")}
                      </button>
                    )}
                    <button data-testid={`build-block-${b.version}`} className={btn}
                      onClick={() => patch(b, { blocked: !b.blocked }, b.blocked ? t("admin.build.unblocked") : t("admin.build.blockedOk"))}>
                      <Ban size={11} /> {b.blocked ? t("admin.build.unblock") : t("admin.build.block")}
                    </button>
                    <button data-testid={`build-delete-${b.version}`} onClick={() => setDel(b)}
                      className="rounded-full border border-white/15 p-2.5 text-white/60 transition-colors hover:border-white hover:bg-white hover:text-black">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-[#0A0A0A] p-6">
        <p className="label-mono flex items-center gap-2"><Tag size={12} /> {t("admin.build.versionTitle")}</p>
        <p className="mt-2 max-w-3xl text-sm text-white/50">{t("admin.build.versionDesc")}</p>
      </div>

      <ConfirmModal testId="build-confirm" open={!!del}
        title={t("admin.build.confirmDeleteTitle")} desc={t("admin.build.confirmDelete")}
        onCancel={() => setDel(null)}
        onConfirm={async () => {
          const b = del; setDel(null);
          if (!b) return;
          try { await api.delete(`/admin/builds/${b.id}`); toast.success(t("admin.build.deleted")); load(); }
          catch (e) { toast.error(errMsg(e)); }
        }} />
    </div>
  );
}
