"use client";

/**
 * Theme-aware wrappers around React Bits components (src/components/reactbits).
 * WebGL/canvas components need concrete colours, so they read the resolved
 * theme from next-themes instead of CSS variables. Every underlying component
 * honours prefers-reduced-motion.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { useTheme } from "next-themes";
import DotGrid from "@/components/reactbits/DotGrid/DotGrid";
import BlurText from "@/components/reactbits/BlurText/BlurText";
import SpotlightCard from "@/components/reactbits/SpotlightCard/SpotlightCard";
import ShinyText from "@/components/reactbits/ShinyText/ShinyText";
import Threads from "@/components/reactbits/Threads/Threads";
import CountUp from "@/components/reactbits/CountUp/CountUp";
import SoftAurora from "@/components/reactbits/SoftAurora/SoftAurora";
import Grainient from "@/components/reactbits/Grainient/Grainient";
import Radar from "@/components/reactbits/Radar/Radar";
import RotatingText from "@/components/reactbits/RotatingText/RotatingText";
import ScrollVelocity from "@/components/reactbits/ScrollVelocity/ScrollVelocity";

const noopSubscribe = () => () => {};

function useIsDark() {
  const { resolvedTheme } = useTheme();
  // false during SSR/hydration, true afterwards — avoids a theme mismatch flash.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return { mounted, dark: resolvedTheme === "dark" };
}

/** Interactive dot field behind the hero. Dots swell toward the cursor; click sends a shockwave. */
export function HeroBackground() {
  const { mounted, dark } = useIsDark();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_80%_70%_at_50%_0%,black,transparent_75%)]">
      {mounted ? (
        <DotGrid
          key={dark ? "dark" : "light"}
          dotSize={3}
          gap={26}
          baseColor={dark ? "#26375a" : "#c5cfdc"}
          activeColor={dark ? "#2dd4bf" : "#0d9488"}
          proximity={130}
          shockRadius={240}
          shockStrength={3}
          glow={dark ? 0.6 : 0.2}
        />
      ) : null}
    </div>
  );
}

/** Headline that resolves from blur, word by word. The real <h1> text stays in the DOM for SEO/AT. */
export function HeroHeadline({ text, className }: { text: string; className?: string }) {
  return (
    <>
      <h1 className="sr-only">{text}</h1>
      <div aria-hidden className={className}>
        <BlurText text={text} trigger="load" animateBy="words" direction="top" delay={110} stepDuration={0.4} distance={24} blur={12} />
      </div>
    </>
  );
}

export function HeroEyebrow({ children }: { children: string }) {
  const { mounted, dark } = useIsDark();
  if (!mounted) return <span>{children}</span>;
  return (
    <ShinyText
      key={dark ? "dark" : "light"}
      text={children}
      color={dark ? "#93a1b8" : "#5b6779"}
      shineColor={dark ? "#99f6e4" : "#0d9488"}
      speed={3}
      delay={1.5}
    />
  );
}

/** Card with a cursor-following teal spotlight. Surface/border/shadow come from the app's tokens. */
export function GlowCard({ children, className }: { children: ReactNode; className?: string }) {
  const { mounted, dark: isDark } = useIsDark();
  const dark = mounted && isDark;
  return (
    <SpotlightCard
      theme={dark ? "dark" : "light"}
      spotlightColor={dark ? "#2dd4bf" : "#14b8a6"}
      intensity={dark ? 0.18 : 0.55}
      spotlightSize={280}
      borderGlow={0.8}
      className={`rounded-xl! p-6! h-full ${className ?? ""}`}
      style={
        {
          "--spotlight-card-surface": "var(--card)",
          "--spotlight-card-border": "var(--border)",
          "--spotlight-card-shadow": "var(--shadow-card)",
        } as React.CSSProperties
      }
    >
      {children}
    </SpotlightCard>
  );
}

/** Softly flowing teal threads for the navy call-to-action panel (dark in both themes). */
export function CtaThreads() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,transparent,black_35%,black)]">
      <Threads color="#14b8a6" accentColor="#60a5fa" amplitude={1.2} distance={0.3} lineCount={60} speed={0.35} brightness={1.1} enableMouseInteraction />
    </div>
  );
}

export function Count({ to, suffix, className }: { to: number; suffix?: string; className?: string }) {
  return <CountUp to={to} suffix={suffix} duration={1.6} className={className} />;
}

/* ───────────── Cinematic landing pieces (always rendered on a dark surface) ───────────── */


/** Northern lights over the Halifax skyline. */
export function NightAurora() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[75%] opacity-90 [mask-image:linear-gradient(to_bottom,black_40%,transparent)]">
      <SoftAurora color1="#2dd4bf" color2="#6366f1" speed={0.5} brightness={1.1} bandHeight={0.5} bandSpread={1.1} enableMouseInteraction mouseInfluence={0.25} />
    </div>
  );
}

export function GrainBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 ${className ?? ""}`}>
      <Grainient colors={["#05101f", "#0d4f57", "#14b8a6", "#1e3a8a", "#05101f"]} speed={0.35} grainAmount={0.08} softness={0.8} interactive={false} />
    </div>
  );
}

export function RadarSweep() {
  return <Radar color="#2dd4bf" backgroundColor="#00000000" speed={0.6} ringCount={5} spokeCount={8} targets={5} glow={1.2} gridOpacity={0.35} mouseInteraction={false} />;
}

export function RotatingWords({ words }: { words: string[] }) {
  return (
    <RotatingText
      texts={words}
      effect="blur"
      rotationInterval={2600}
      staggerDuration={0.02}
      mainClassName="inline-flex overflow-hidden pb-2 -mb-2"
      elementLevelClassName="italic text-teal-strong"
    />
  );
}

export function Marquee({ items }: { items: string[] }) {
  const line = items.join("  ✦  ") + "  ✦  ";
  return <ScrollVelocity texts={[line, line]} velocity={40} numCopies={4} fadeEdges outlineAlternate className="font-display tracking-tight" fontSize="clamp(2.5rem, 7vw, 6rem)" />;
}
