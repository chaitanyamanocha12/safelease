import { HalifaxHouses, Stars } from "@/components/marketing/halifax-scene";

export function MarketingPage({ eyebrow, title, intro, children }: { eyebrow?: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <>
      <section className="px-2 pt-2 sm:px-3 sm:pt-3">
        <div className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#060b14] text-white sm:rounded-[2.5rem]">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_70%_90%_at_80%_0%,rgb(20_184_166/0.3),transparent_60%),radial-gradient(ellipse_60%_80%_at_10%_0%,rgb(99_102_241/0.22),transparent_60%)]" />
          <Stars count={36} />
          <div className="relative z-10 mx-auto max-w-4xl px-5 pb-10 pt-16 sm:px-6 sm:pt-24">
            {eyebrow ? <p className="eyebrow text-teal-strong">{eyebrow}</p> : null}
            <h1 className="mt-4 font-display text-5xl leading-[0.95] tracking-tight sm:text-7xl">{title}</h1>
            {intro ? <p className="mt-5 max-w-2xl text-lg text-white/60">{intro}</p> : null}
          </div>
          <div aria-hidden className="relative opacity-50 [mask-image:linear-gradient(to_bottom,transparent,black_70%)]">
            <HalifaxHouses className="relative left-1/2 min-w-[900px] -translate-x-1/2" />
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-3xl px-5 py-16 sm:px-6">
        <div className="space-y-12 text-[15px] leading-relaxed text-foreground/85 [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-3xl [&_h2]:tracking-tight [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_li]:marker:text-teal [&_p]:mb-3 [&_ul]:space-y-1.5">
          {children}
        </div>
      </div>
    </>
  );
}
