import { motion, useScroll, useTransform, useMotionValue, useSpring } from "framer-motion";
import { useMemo, useRef } from "react";
import { useLang } from "@/i18n";

function BlockLine({ children, delay, className }) {
  return (
    <span className="relative block overflow-hidden pb-1">
      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.42, duration: 0.01 }}
        className={`block ${className}`}>
        {children}
      </motion.span>
      <motion.span initial={{ x: "-102%" }} animate={{ x: ["-102%", "0%", "102%"] }}
        transition={{ duration: 0.85, delay, times: [0, 0.45, 1], ease: "easeInOut" }}
        className="absolute inset-0 bg-white" />
    </span>
  );
}

function Pixels() {
  const pixels = useMemo(() => Array.from({ length: 18 }, () => ({
    left: Math.random() * 100,
    size: 5 + Math.random() * 9,
    dur: 8 + Math.random() * 9,
    delay: Math.random() * 10,
    bright: Math.random() > 0.6,
  })), []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pixels.map((p, i) => (
        <span key={i} className="absolute -bottom-5 block"
          style={{
            left: `${p.left}%`, width: p.size, height: p.size,
            background: p.bright ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.16)",
            animation: `pixel-rise ${p.dur}s linear ${p.delay}s infinite`,
          }} />
      ))}
    </div>
  );
}

const FACES = [
  "rotateY(0deg) translateZ(110px)",
  "rotateY(90deg) translateZ(110px)",
  "rotateY(180deg) translateZ(110px)",
  "rotateY(-90deg) translateZ(110px)",
  "rotateX(90deg) translateZ(110px)",
  "rotateX(-90deg) translateZ(110px)",
];

function PixelFace({ transform, seed }) {
  const cells = useMemo(() => {
    let s = seed;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    return Array.from({ length: 64 }, () => {
      const v = rnd();
      return v > 0.88 ? "rgba(255,255,255,0.95)" : v > 0.62 ? "rgba(255,255,255,0.5)"
        : v > 0.35 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.07)";
    });
  }, [seed]);
  return (
    <div className="absolute inset-0 grid grid-cols-8 grid-rows-8 border-2 border-white/70 bg-black"
      style={{ transform }}>
      {cells.map((c, i) => <span key={i} style={{ background: c }} />)}
    </div>
  );
}

function Cube3D() {
  return (
    <div className="cube-scene flex h-[340px] w-[340px] items-center justify-center" data-testid="hero-cube">
      <div className="cube h-[220px] w-[220px]">
        {FACES.map((t, i) => <PixelFace key={t} transform={t} seed={i * 137 + 11} />)}
      </div>
    </div>
  );
}

export default function Hero() {
  const { t } = useLang();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [10, -10]), { stiffness: 60, damping: 15 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-12, 12]), { stiffness: 60, damping: 15 });

  const onMouse = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };

  return (
    <section ref={ref} onMouseMove={onMouse} className="relative overflow-hidden pt-16" data-testid="hero-section">
      <Pixels />
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-12 px-6 pb-20 pt-16 md:grid-cols-[1.2fr_0.8fr] md:pt-28">
        <div>
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="mb-8 inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/5 px-4 py-2 backdrop-blur"
            data-testid="hero-tag">
            <span className="inline-block h-2 w-2 animate-blink rounded-full bg-white" />
            <span className="label-mono !text-white/70">{t("hero.tag")}</span>
          </motion.div>
          <h1 className="font-display text-5xl font-extrabold uppercase leading-[0.95] tracking-tighter sm:text-7xl lg:text-8xl">
            <BlockLine delay={0.35}>{t("hero.l1")}</BlockLine>
            <BlockLine delay={0.55} className="text-stroke">{t("hero.l2")}</BlockLine>
            <BlockLine delay={0.75}>
              <span className="inline-block rounded-2xl bg-white px-4 text-black">
                {t("hero.l3")}<span className="animate-blink">_</span>
              </span>
            </BlockLine>
          </h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3, duration: 0.7 }}
            className="mt-8 max-w-md text-base leading-relaxed text-white/60" data-testid="hero-sub">
            {t("hero.sub")}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.45, duration: 0.7 }}
            className="mt-10 flex flex-wrap gap-4">
            <a href="#pricing" data-testid="hero-buy-btn"
              className="rounded-full bg-white px-8 py-4 font-mono2 text-sm font-bold uppercase tracking-widest text-black transition-colors duration-150 hover:bg-white/70">
              {t("hero.cta1")}
            </a>
            <a href="#manifesto" data-testid="hero-showcase-btn"
              className="rounded-full border border-white/20 px-8 py-4 font-mono2 text-sm uppercase tracking-widest text-white transition-colors duration-150 hover:border-white hover:bg-white hover:text-black">
              {t("hero.cta2")}
            </a>
          </motion.div>
        </div>
        <motion.div style={{ y, rotateX: rx, rotateY: ry }} initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1, duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="relative hidden items-center justify-center md:flex" data-testid="hero-mockup">
          <Cube3D />
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5, duration: 0.6 }}
            className="animate-floaty absolute bottom-2 right-2 flex flex-col gap-2 font-mono2 text-[10px] uppercase tracking-widest">
            <span className="rounded-full border border-white/15 bg-black/80 px-3 py-1.5 backdrop-blur-md">fps: 487</span>
            <span className="rounded-full border border-white/15 bg-black/80 px-3 py-1.5 backdrop-blur-md">ping: 12ms</span>
            <span className="rounded-full bg-white px-3 py-1.5 font-bold text-black">undetected</span>
          </motion.div>
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }}
            className="animate-floaty absolute left-4 top-8 rounded-full border border-white/20 bg-black/80 px-3 py-1.5 font-mono2 text-[10px] uppercase tracking-widest text-white/70 backdrop-blur-md">
            120+ modules
          </motion.span>
        </motion.div>
      </div>
      <div className="relative border-t border-white/10">
        <div className="mx-auto grid max-w-7xl grid-cols-2 md:grid-cols-4">
          {t("hero.stats").map(([v, l], i) => (
            <motion.div key={l} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.1, duration: 0.6 }}
              className="border-r border-white/10 px-6 py-8 last:border-r-0" data-testid={`hero-stat-${i}`}>
              <div className="font-display text-3xl font-bold text-white">{v}</div>
              <div className="label-mono mt-2">{l}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
