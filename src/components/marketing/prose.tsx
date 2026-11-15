export function MarketingPage({ eyebrow, title, intro, children }: { eyebrow?: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      {eyebrow ? <p className="mb-2 text-sm font-medium uppercase tracking-wider text-teal">{eyebrow}</p> : null}
      <h1 className="font-display text-4xl tracking-tight sm:text-5xl">{title}</h1>
      {intro ? <p className="mt-4 text-lg text-muted-foreground">{intro}</p> : null}
      <div className="mt-10 space-y-10 text-[15px] leading-relaxed text-foreground/90 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3 [&_ul]:space-y-1.5">{children}</div>
    </div>
  );
}
