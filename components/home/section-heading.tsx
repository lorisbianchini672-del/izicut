type SectionHeadingProps = {
  eyebrow: string;
  title: React.ReactNode;
  description?: string;
  align?: 'center' | 'left';
};

/** En-tête de section : repère « timecode », titre, chapeau. */
export function SectionHeading({ eyebrow, title, description, align = 'center' }: SectionHeadingProps) {
  const centered = align === 'center';
  return (
    <div className={centered ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p className="font-code text-xs uppercase tracking-[0.2em] text-neon">
        <span aria-hidden className="mr-2 text-fg-subtle">▍</span>
        {eyebrow}
      </p>
      <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-fg sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-pretty text-base leading-relaxed text-fg-muted sm:text-lg">{description}</p>
      ) : null}
    </div>
  );
}
