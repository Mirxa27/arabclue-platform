"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { isToolRunning, type TheaterToolEvent } from "@/lib/agents/platform/mission-tool-parts";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  glitter: boolean;
};

type Spark = {
  id: number;
  x: number;
  y: number;
  born: number;
};

function spawnBurst(x: number, y: number, count: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 0.6 + Math.random() * 3.2;
    out.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 0.4,
      life: 1,
      maxLife: 0.55 + Math.random() * 0.7,
      size: 1.2 + Math.random() * 2.8,
      hue: 160 + Math.random() * 40,
      glitter: Math.random() > 0.35,
    });
  }
  return out;
}

/**
 * Futuristic glitter cursor + ambient particle field that intensifies
 * while the Voice Mission Control agent is executing tools.
 */
export function MissionPerformanceStage({
  locale,
  performing,
  tools,
  children,
  className,
}: {
  locale: "ar" | "en";
  performing: boolean;
  tools: TheaterToolEvent[];
  children: ReactNode;
  className?: string;
}) {
  const ar = locale === "ar";
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const pointerRef = useRef({ x: -9999, y: -9999, inside: false });
  const rafRef = useRef<number>(0);
  const sparkIdRef = useRef(0);
  const [cursor, setCursor] = useState({ x: 0, y: 0, visible: false });
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [reducedMotion, setReducedMotion] = useState(false);

  const runningTools = useMemo(
    () => tools.filter((t) => isToolRunning(t.state) || t.preliminary),
    [tools]
  );
  const activeLabel = runningTools[0]?.name ?? null;
  const intensity = performing ? (runningTools.length > 0 ? 1 : 0.72) : 0.18;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Burst glitter when a tool finishes
  const prevDoneRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (reducedMotion) return;
    const doneIds = new Set(
      tools
        .filter((t) => t.state === "output-available" || t.state === "SUCCEEDED")
        .map((t) => t.id)
    );
    const newborn: string[] = [];
    for (const id of doneIds) {
      if (!prevDoneRef.current.has(id)) newborn.push(id);
    }
    prevDoneRef.current = doneIds;
    if (!newborn.length || !pointerRef.current.inside) return;
    const { x, y } = pointerRef.current;
    particlesRef.current.push(...spawnBurst(x, y, 28));
    const spark: Spark = {
      id: ++sparkIdRef.current,
      x,
      y,
      born: Date.now(),
    };
    setSparks((s) => [...s.slice(-6), spark]);
  }, [tools, reducedMotion]);

  // Continuous trail while performing
  useEffect(() => {
    if (reducedMotion || !performing) return;
    const id = window.setInterval(() => {
      if (!pointerRef.current.inside) return;
      const { x, y } = pointerRef.current;
      particlesRef.current.push(...spawnBurst(x, y, 3));
    }, 90);
    return () => window.clearInterval(id);
  }, [performing, reducedMotion]);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      pointerRef.current = { x, y, inside: true };
      setCursor({ x, y, visible: true });
      if (!reducedMotion && performing && Math.random() > 0.55) {
        particlesRef.current.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 1.2,
          vy: -0.4 - Math.random() * 1.4,
          life: 1,
          maxLife: 0.45 + Math.random() * 0.35,
          size: 1 + Math.random() * 2.2,
          hue: 170 + Math.random() * 35,
          glitter: true,
        });
      }
    },
    [performing, reducedMotion]
  );

  const onPointerLeave = useCallback(() => {
    pointerRef.current.inside = false;
    setCursor((c) => ({ ...c, visible: false }));
  }, []);

  // Canvas particle loop
  useEffect(() => {
    if (reducedMotion) return;
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = root.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(root);

    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { width, height } = root.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);

      // Ambient drifting glitter field
      if (performing) {
        if (particlesRef.current.length < 90 && Math.random() > 0.7) {
          particlesRef.current.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * 0.35,
            vy: -0.15 - Math.random() * 0.45,
            life: 1,
            maxLife: 1.2 + Math.random(),
            size: 0.8 + Math.random() * 1.8,
            hue: 155 + Math.random() * 50,
            glitter: true,
          });
        }
      }

      const next: Particle[] = [];
      for (const p of particlesRef.current) {
        p.life -= dt / p.maxLife;
        if (p.life <= 0) continue;
        p.x += p.vx * (60 * dt);
        p.y += p.vy * (60 * dt);
        p.vy += 0.02;
        const alpha = Math.max(0, p.life) * (0.35 + intensity * 0.65);
        if (p.glitter) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.life * 6);
          ctx.fillStyle = `hsla(${p.hue}, 90%, 72%, ${alpha})`;
          ctx.shadowColor = `hsla(${p.hue}, 100%, 70%, ${alpha * 0.9})`;
          ctx.shadowBlur = 8 + intensity * 10;
          const s = p.size * (0.6 + intensity);
          ctx.fillRect(-s / 2, -s / 2, s, s);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.fillStyle = `hsla(${p.hue}, 85%, 65%, ${alpha})`;
          ctx.arc(p.x, p.y, p.size * (0.5 + intensity * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
        next.push(p);
      }
      particlesRef.current = next.slice(-160);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [performing, intensity, reducedMotion]);

  // Clean old ripples
  useEffect(() => {
    if (!sparks.length) return;
    const id = window.setInterval(() => {
      const cutoff = Date.now() - 1200;
      setSparks((s) => s.filter((x) => x.born > cutoff));
    }, 400);
    return () => window.clearInterval(id);
  }, [sparks.length]);

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex-1 min-h-0 flex flex-col rounded-2xl",
        performing && "mission-stage-performing",
        !reducedMotion && "mission-custom-cursor",
        className
      )}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {/* Ambient holographic field */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 overflow-hidden rounded-2xl z-0",
          performing ? "opacity-100" : "opacity-40"
        )}
      >
        <div className="absolute inset-0 mission-grid-glow" />
        <div
          className={cn(
            "absolute -inset-[20%] mission-aurora",
            performing && "mission-aurora-fast"
          )}
        />
        {performing ? <div className="absolute inset-0 mission-scanlines" /> : null}
        {performing ? (
          <div className="absolute inset-x-0 top-0 h-px mission-energy-beam" />
        ) : null}
      </div>

      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] rounded-2xl"
      />

      {/* Glitter cursor */}
      {!reducedMotion && cursor.visible ? (
        <div
          aria-hidden
          className="pointer-events-none absolute z-[40] mix-blend-screen"
          style={{
            left: cursor.x,
            top: cursor.y,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div
            className={cn(
              "relative size-8 rounded-full border border-cyan-300/70",
              performing && "mission-cursor-ring"
            )}
          >
            <span className="absolute inset-[30%] rounded-full bg-gradient-to-br from-teal-200 via-cyan-300 to-emerald-200 shadow-[0_0_18px_rgba(34,211,238,0.85)]" />
            <span className="absolute -inset-2 rounded-full border border-teal-300/30 mission-cursor-orbit" />
            {performing ? (
              <span className="absolute -inset-4 rounded-full border border-dashed border-cyan-200/40 mission-cursor-orbit-slow" />
            ) : null}
          </div>
          {performing && activeLabel ? (
            <div className="absolute start-6 top-4 whitespace-nowrap rounded-md border border-cyan-300/40 bg-slate-950/70 px-2 py-1 text-[10px] font-mono text-cyan-100 backdrop-blur-sm shadow-[0_0_20px_rgba(34,211,238,0.35)]">
              <span className="me-1 inline-block size-1.5 rounded-full bg-emerald-300 animate-pulse" />
              {activeLabel}
            </div>
          ) : null}
          {performing ? (
            <div className="absolute -bottom-5 start-1/2 -translate-x-1/2 text-[9px] uppercase tracking-[0.2em] text-cyan-200/80">
              {ar ? "ينفّذ" : "live"}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Completion ripples */}
      {sparks.map((s) => (
        <span
          key={s.id}
          aria-hidden
          className="pointer-events-none absolute z-[30] size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/80 mission-ripple"
          style={{ left: s.x, top: s.y }}
        />
      ))}

      {/* Performing banner */}
      {performing ? (
        <div className="pointer-events-none absolute top-3 start-1/2 z-[35] -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full border border-cyan-300/40 bg-slate-950/55 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-50 backdrop-blur-md shadow-[0_0_24px_rgba(45,212,191,0.35)]">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-300/80" />
              <span className="relative size-2 rounded-full bg-emerald-300" />
            </span>
            {ar ? "الوكيل ينفّذ أمامك" : "Agent performing live"}
            {runningTools.length > 0 ? (
              <span className="font-mono normal-case tracking-normal text-teal-200/90">
                · {runningTools.length} tool{runningTools.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="relative z-[2] flex flex-1 min-h-0 flex-col">{children}</div>
    </div>
  );
}
