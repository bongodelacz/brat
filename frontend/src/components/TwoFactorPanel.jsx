import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { useLang } from "@/i18n";

/** 6-digit e-mail code input. */
export const CodeInput = ({ value, onChange, disabled, testId = "code-input" }) => {
  const refs = useRef([]);
  const digits = value.padEnd(6, " ").slice(0, 6).split("");

  const setDigit = (i, d) => {
    const next = digits.map((c) => (c === " " ? "" : c));
    next[i] = d;
    onChange(next.join("").slice(0, 6));
    if (d && i < 5) refs.current[i + 1]?.focus();
  };

  return (
    <div className="flex gap-2" data-testid={testId}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          data-testid={`${testId}-${i}`}
          value={d.trim()}
          disabled={disabled}
          inputMode="numeric"
          maxLength={1}
          onChange={(e) => setDigit(i, e.target.value.replace(/\D/g, "").slice(-1))}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d.trim() && i > 0) refs.current[i - 1]?.focus();
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
            if (text) { e.preventDefault(); onChange(text); refs.current[Math.min(text.length, 5)]?.focus(); }
          }}
          className="h-14 w-full rounded-xl border border-white/15 bg-black text-center font-mono2 text-xl font-bold text-white outline-none transition-colors focus:border-white disabled:opacity-40"
        />
      ))}
    </div>
  );
};

export default function TwoFactorPanel({ emailHint, onSubmit, onCancel, loading, error }) {
  const { t } = useLang();
  const [code, setCode] = useState("");

  useEffect(() => {
    if (code.length === 6 && !loading) onSubmit(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className="space-y-6 p-8" data-testid="twofa-panel">
      <div>
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-black">
          <ShieldCheck size={18} />
        </span>
        <h3 className="mt-5 font-display text-2xl font-bold uppercase">{t("auth.tfaTitle")}</h3>
        <p className="mt-2 text-sm text-white/50">
          {t("auth.tfaSub")} <span className="font-mono2 text-white">{emailHint}</span>
        </p>
        <p className="mt-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 font-mono2 text-[11px] leading-relaxed text-white/40">
          {t("auth.tfaSpam")}
        </p>
      </div>
      <CodeInput value={code} onChange={setCode} disabled={loading} testId="twofa-code" />
      {error && <p className="font-mono2 text-xs text-white" data-testid="twofa-error">{error}</p>}
      <button type="button" data-testid="twofa-submit" disabled={loading || code.length !== 6}
        onClick={() => onSubmit(code)}
        className="w-full rounded-full bg-white px-6 py-4 font-mono2 text-sm font-bold uppercase tracking-widest text-black transition-colors hover:bg-white/70 disabled:opacity-40">
        {loading ? "..." : t("auth.tfaVerify")}
      </button>
      <button type="button" data-testid="twofa-cancel" onClick={onCancel}
        className="w-full text-center font-mono2 text-[11px] uppercase tracking-widest text-white/40 transition-colors hover:text-white">
        {t("auth.tfaBack")}
      </button>
    </motion.div>
  );
}
