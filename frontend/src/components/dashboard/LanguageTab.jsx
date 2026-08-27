import { toast } from "sonner";
import { useLang } from "@/i18n";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

export default function LanguageTab() {
  const { t, lang, setLang } = useLang();
  const { user, setUser } = useAuth();

  const pick = async (l) => {
    setLang(l);
    try {
      const { data } = await api.patch("/users/me", { language: l });
      setUser(data);
      toast.success(l === "pl" ? "Język zapisany" : "Language saved");
    } catch {}
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-[#0A0A0A] p-8" data-testid="language-tab">
      <p className="label-mono mb-2">{t("dash.lang.title")}</p>
      <p className="mb-8 text-sm text-white/50">{t("dash.lang.desc")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {[["pl", "Polski", "PL"], ["en", "English", "EN"]].map(([code, name]) => (
          <button key={code} data-testid={`lang-option-${code}`} onClick={() => pick(code)}
            className={`flex items-center justify-between rounded-2xl border p-6 transition-colors duration-150
              ${lang === code ? "border-white bg-white/10" : "border-white/10 hover:border-white/40"}`}>
            <span className="font-display text-xl font-bold">{name}</span>
            <span className={`flex h-10 w-10 items-center justify-center rounded-full font-mono2 text-xs font-bold
              ${lang === code ? "bg-white text-black" : "border border-white/20 text-white/50"}`}>{code.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
