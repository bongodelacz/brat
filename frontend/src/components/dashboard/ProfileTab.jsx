import { useState, useRef } from "react";
import { toast } from "sonner";
import { Copy, Upload, Trash2 } from "lucide-react";
import { useLang } from "@/i18n";
import { useAuth } from "@/context/AuthContext";
import api, { errMsg } from "@/lib/api";

export default function ProfileTab() {
  const { t } = useLang();
  const { user, setUser } = useAuth();
  const [username, setUsername] = useState(user.username);
  const [about, setAbout] = useState(user.about || "");
  const fileRef = useRef(null);
  const inputCls = "w-full rounded-xl border border-white/10 bg-black px-4 py-3 font-mono2 text-sm outline-none transition-colors focus:border-white/60";

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const c = document.createElement("canvas");
        c.width = c.height = 128;
        const ctx = c.getContext("2d");
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 128, 128);
        try {
          const { data } = await api.patch("/users/me", { avatar: c.toDataURL("image/png") });
          setUser(data);
          toast.success(t("dash.profile.saved"));
        } catch (err) { toast.error(errMsg(err)); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    try {
      const { data } = await api.patch("/users/me", { username, about });
      setUser(data);
      toast.success(t("dash.profile.saved"));
    } catch (err) { toast.error(errMsg(err)); }
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-[#0A0A0A] p-8" data-testid="profile-tab">
      <div className="flex flex-col gap-8 md:flex-row">
        <div className="shrink-0">
          <p className="label-mono mb-3">{t("dash.profile.avatar")}</p>
          <button data-testid="avatar-upload-btn" onClick={() => fileRef.current?.click()}
            className="group relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-black transition-colors hover:border-white/60">
            {user.avatar ? (
              <img src={user.avatar} alt="avatar" className="h-full w-full object-cover" data-testid="avatar-image" />
            ) : (
              <span className="font-display text-4xl font-bold text-white">{user.username[0]?.toUpperCase()}</span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/70 opacity-0 transition-opacity group-hover:opacity-100">
              <Upload size={20} />
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} data-testid="avatar-file-input" />
          {user.avatar && (
            <button data-testid="avatar-delete-btn" onClick={async () => {
              try {
                const { data } = await api.patch("/users/me", { avatar: "" });
                setUser(data);
                toast.success(t("dash.profile.saved"));
              } catch (err) { toast.error(errMsg(err)); }
            }}
              className="mt-3 flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 font-mono2 text-[10px] uppercase tracking-widest text-white/50 transition-colors hover:border-red-500 hover:text-red-400">
              <Trash2 size={12} /> {t("dash.profile.remove")}
            </button>
          )}
        </div>
        <div className="flex-1 space-y-5">
          <div>
            <label className="label-mono mb-2 block">UID</label>
            <div className="flex items-center gap-2">
              <span className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 font-mono2 text-sm text-white/80" data-testid="profile-uid">{user.uid}</span>
              <button data-testid="uid-copy-btn" onClick={() => { navigator.clipboard.writeText(user.uid); toast.success(t("dash.profile.copied")); }}
                className="rounded-xl border border-white/10 p-3 text-white/50 transition-colors hover:border-white hover:text-white">
                <Copy size={15} />
              </button>
            </div>
          </div>
          <div>
            <label className="label-mono mb-2 block">{t("dash.profile.name")}</label>
            <input data-testid="profile-username-input" className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} />
          </div>
          <div>
            <label className="label-mono mb-2 block">{t("dash.profile.about")}</label>
            <textarea data-testid="profile-about-input" rows={3} className={inputCls} value={about} onChange={(e) => setAbout(e.target.value)} maxLength={300} />
          </div>
          <button data-testid="profile-save-btn" onClick={save}
            className="rounded-full bg-white px-8 py-3 font-mono2 text-xs font-bold uppercase tracking-widest text-black transition-colors hover:bg-white/70">
            {t("dash.profile.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
