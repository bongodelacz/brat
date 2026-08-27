import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { useLang } from "@/i18n";

export default function Footer() {
  const { t } = useLang();
  const linkCls = "font-mono2 text-xs text-white/50 transition-colors hover:text-white";
  return (
    <footer className="bg-[#050505]" data-testid="footer">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white font-display text-sm font-bold text-black">B</span>
              <span className="font-display text-2xl font-bold">BRAT<span className="text-white/40">CLIENT</span></span>
            </div>
            <p className="label-mono mt-4">{t("footer.tag")}</p>
            <a href="https://discord.gg/brat" target="_blank" rel="noreferrer" data-testid="footer-discord-btn"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 font-mono2 text-xs font-bold uppercase tracking-widest text-black transition-colors hover:bg-white/70">
              <MessageCircle size={14} /> {t("footer.discord")}
            </a>
          </div>
          <div>
            <p className="label-mono mb-4">{t("footer.shopTitle")}</p>
            <div className="flex flex-col gap-3">
              <a href="#pricing" data-testid="footer-link-pricing" className={linkCls}>{t("nav.pricing")}</a>
              <Link to="/panel" data-testid="footer-link-panel" className={linkCls}>{t("nav.panel")}</Link>
            </div>
          </div>
          <div>
            <p className="label-mono mb-4">{t("footer.helpTitle")}</p>
            <div className="flex flex-col gap-3">
              <a href="#" data-testid="footer-link-terms" className={linkCls}>{t("footer.terms")}</a>
              <a href="#" data-testid="footer-link-privacy" className={linkCls}>{t("footer.privacy")}</a>
              <a href="mailto:support@bratclient.gg" data-testid="footer-link-contact" className={linkCls}>{t("footer.contact")}</a>
            </div>
          </div>
          <div>
            <p className="label-mono mb-4">{t("footer.communityTitle")}</p>
            <div className="flex flex-col gap-3">
              <a href="https://discord.gg/brat" target="_blank" rel="noreferrer" data-testid="footer-link-discord" className={linkCls}>{t("footer.discord")}</a>
            </div>
          </div>
        </div>
        <div className="mt-16 flex items-center justify-between border-t border-white/10 pt-8">
          <p className="font-mono2 text-xs text-white/40">© 2026 BratClient. {t("footer.rights")}</p>
          <p className="font-mono2 text-xs text-white/30">MINECRAFT UTILITY</p>
        </div>
      </div>
    </footer>
  );
}
