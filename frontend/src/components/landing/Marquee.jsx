import { useLang } from "@/i18n";

export default function Marquee({ inverted }) {
  const { t } = useLang();
  const text = t("marquee").repeat(6);
  return (
    <div className={`overflow-hidden border-y border-white/10 py-4 ${inverted ? "bg-white" : "bg-[#050505]"}`}
      data-testid={inverted ? "marquee-inverted" : "marquee"}>
      <div className="animate-marquee flex whitespace-nowrap">
        {[0, 1].map((n) => (
          <span key={n} className={`font-mono2 text-xs uppercase tracking-[0.3em] ${inverted ? "text-black" : "text-white/50"}`}>
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
