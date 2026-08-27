import { motion, AnimatePresence } from "framer-motion";
import { useLang } from "@/i18n";

export default function ConfirmModal({ open, title, desc, onConfirm, onCancel, testId }) {
  const { t } = useLang();
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
          onClick={onCancel} data-testid={`${testId}-overlay`}>
          <motion.div initial={{ opacity: 0, scale: 0.9, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0A0A0A] p-8"
            data-testid={`${testId}-modal`}>
            <h3 className="font-display text-xl font-bold uppercase tracking-tight">{title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/50">{desc}</p>
            <div className="mt-8 flex gap-3">
              <button data-testid={`${testId}-confirm`} onClick={onConfirm}
                className="flex-1 rounded-full bg-white px-5 py-3 font-mono2 text-xs font-bold uppercase tracking-widest text-black transition-colors hover:bg-white/70">
                {t("modal.confirm")}
              </button>
              <button data-testid={`${testId}-cancel`} onClick={onCancel}
                className="flex-1 rounded-full border border-white/15 px-5 py-3 font-mono2 text-xs uppercase tracking-widest text-white/60 transition-colors hover:border-white hover:text-white">
                {t("modal.cancel")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
