import Image from "next/image";
import { cn } from "@/lib/utils";
import type { LocalizedNode } from "./types";

export interface BilingualHeaderLogo {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface BilingualHeaderProps {
  title: LocalizedNode;
  subtitle?: LocalizedNode;
  eyebrow?: LocalizedNode;
  logo?: BilingualHeaderLogo;
  className?: string;
}

/**
 * A physical mirror header: English is anchored left, Arabic right, while the
 * brand mark remains unmirrored in the center.
 */
export function BilingualHeader({
  title,
  subtitle,
  eyebrow,
  logo,
  className,
}: BilingualHeaderProps) {
  return (
    <header className={cn("bilingual-header", className)}>
      {logo ? (
        <div className="bilingual-header__logo">
          <Image
            src={logo.src}
            alt={logo.alt}
            width={logo.width ?? 160}
            height={logo.height ?? 64}
            unoptimized={logo.src.startsWith("data:")}
          />
        </div>
      ) : (
        <div className="bilingual-header__divider" aria-hidden="true" />
      )}

      {eyebrow ? (
        <p className="bilingual-header__pair bilingual-header__eyebrow">
          <span lang="en" dir="ltr">
            {eyebrow.en}
          </span>
          <span aria-hidden="true" />
          <span lang="ar" dir="rtl">
            {eyebrow.ar}
          </span>
        </p>
      ) : null}

      <h1 className="bilingual-header__pair bilingual-header__title">
        <span lang="en" dir="ltr">
          {title.en}
        </span>
        <span aria-hidden="true" />
        <span lang="ar" dir="rtl">
          {title.ar}
        </span>
      </h1>

      {subtitle ? (
        <p className="bilingual-header__pair bilingual-header__subtitle">
          <span lang="en" dir="ltr">
            {subtitle.en}
          </span>
          <span aria-hidden="true" />
          <span lang="ar" dir="rtl">
            {subtitle.ar}
          </span>
        </p>
      ) : null}
    </header>
  );
}
