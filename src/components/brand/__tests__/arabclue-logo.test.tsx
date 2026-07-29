import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ArabclueLogo } from "@/components/brand/arabclue-logo";
import {
  LOGO_COLORS,
  LOGO_ICON_PATH_FILLED,
  LOGO_ICON_PATH_KEYHOLE_SLOT,
  LOGO_SIZES,
  LOGO_WORDMARK,
  LOGO_UNIFIED_LOCKUP,
  buildStaticLogoSvg,
} from "@/components/brand/logo-variants";
import {
  getLogoAnimations,
  prefersReducedMotion,
} from "@/components/brand/logo-animations";

function render(props: React.ComponentProps<typeof ArabclueLogo>): string {
  return renderToStaticMarkup(<ArabclueLogo {...props} />);
}

/** Strip injected <style> so class-name assertions target DOM only. */
function renderHtml(props: React.ComponentProps<typeof ArabclueLogo>): string {
  const full = render(props);
  const styleEnd = full.indexOf("</style>");
  return styleEnd === -1 ? full : full.slice(styleEnd + "</style>".length);
}

describe("ArabclueLogo — variant rendering", () => {
  test("renders header lockup with icon and wordmark", () => {
    const html = renderHtml({
      variant: "header",
      locale: "en",
      showWordmark: true,
    });
    expect(html).toContain("arabclue-logo");
    expect(html).toContain("arabclue-logo__icon-mark");
    expect(html).toContain("arabclue-logo__wordmark");
    expect(html).toContain(`>${LOGO_WORDMARK.en}<`);
  });

  test("renders footer lockup", () => {
    const html = renderHtml({
      variant: "footer",
      locale: "en",
      showWordmark: true,
    });
    expect(html).toContain(`>${LOGO_WORDMARK.en}<`);
  });

  test("favicon is icon-only", () => {
    const html = renderHtml({ variant: "favicon" });
    expect(html).toContain("arabclue-logo__icon-mark");
    expect(html).not.toContain("arabclue-logo__wordmark");
    expect(html).not.toContain(`>${LOGO_WORDMARK.en}<`);
  });

  test("loading variant pulses", () => {
    const html = renderHtml({ variant: "loading", locale: "en" });
    expect(html).toContain("arabclue-logo--pulse");
  });

  test("print variant is static monochrome", () => {
    const html = renderHtml({
      variant: "print",
      locale: "en",
      showWordmark: true,
    });
    expect(html).toContain("arabclue-logo--print");
    expect(html).not.toContain("arabclue-logo--entrance-icon");
    expect(html).not.toContain("arabclue-logo--pulse");
  });
});

describe("ArabclueLogo — display modes", () => {
  test("static-ar shows Arabic wordmark", () => {
    const html = renderHtml({
      displayMode: "static-ar",
      locale: "en",
      showWordmark: true,
    });
    expect(html).toContain(`>${LOGO_WORDMARK.ar}<`);
    expect(html).not.toContain(`>${LOGO_WORDMARK.en}<`);
  });

  test("static-en shows English wordmark", () => {
    const html = renderHtml({
      displayMode: "static-en",
      locale: "ar",
      showWordmark: true,
    });
    expect(html).toContain(`>${LOGO_WORDMARK.en}<`);
    expect(html).not.toContain(`>${LOGO_WORDMARK.ar}<`);
  });

  test("unified mode shows Arab + دليل", () => {
    const html = renderHtml({
      displayMode: "unified",
      locale: "en",
      showWordmark: true,
    });
    expect(html).toContain(LOGO_UNIFIED_LOCKUP.englishPart);
    expect(html).toContain(LOGO_UNIFIED_LOCKUP.arabicPart);
  });

  test("cycle mode renders one language", () => {
    const html = renderHtml({
      displayMode: "cycle",
      locale: "en",
      variant: "header",
      showWordmark: true,
    });
    expect(
      html.includes(`>${LOGO_WORDMARK.en}<`) ||
        html.includes(`>${LOGO_WORDMARK.ar}<`),
    ).toBe(true);
  });
});

describe("ArabclueLogo — SVG paths", () => {
  test("arch path is present and absolute", () => {
    const html = renderHtml({
      variant: "header",
      locale: "en",
      showWordmark: true,
    });
    expect(html).toContain(LOGO_ICON_PATH_FILLED);
    expect(html).not.toContain("translate(");
  });

  test("handle line uses absolute coordinates", () => {
    const html = renderHtml({
      variant: "header",
      locale: "en",
      showWordmark: true,
    });
    expect(html).toContain('x1="107"');
    expect(html).toContain('y1="105"');
    expect(html).toContain('x2="123"');
    expect(html).toContain('y2="121"');
  });

  test("keyhole slot path is present", () => {
    const html = renderHtml({
      variant: "header",
      locale: "en",
      showWordmark: true,
    });
    expect(html).toContain(LOGO_ICON_PATH_KEYHOLE_SLOT);
  });

  test("viewBox and radius are correct", () => {
    const html = renderHtml({ variant: "header", locale: "en" });
    expect(html).toContain('viewBox="0 0 160 160"');
    expect(html).toContain('rx="36"');
  });

  test("static SVG builder emits valid markup", () => {
    const svg = buildStaticLogoSvg({ idPrefix: "test" });
    expect(svg).toContain(LOGO_ICON_PATH_FILLED);
    expect(svg).not.toContain("translate(");
  });
});

describe("ArabclueLogo — design tokens", () => {
  test("colors come from design tokens", () => {
    expect(LOGO_COLORS.primary).toBe("#0D9488");
    expect(LOGO_COLORS.accent).toBe("#D97706");
    expect(LOGO_COLORS.neutralDark).toBe("#171717");
  });

  test("gradients are referenced by id", () => {
    const html = renderHtml({ variant: "header", locale: "en" });
    expect(html).toContain("url(#arabclue-logo-primary-");
    expect(html).toContain("url(#arabclue-logo-gold-");
  });
});

describe("ArabclueLogo — size scaling", () => {
  for (const size of ["xs", "sm", "md", "lg", "xl"] as const) {
    test(`${size} lockup uses configured icon height`, () => {
      const html = renderHtml({
        variant: "header",
        size,
        locale: "en",
        showWordmark: true,
      });
      expect(html).toContain(`height="${LOGO_SIZES[size].iconHeight}"`);
    });
  }

  test("icon-only className lands on the SVG", () => {
    const html = renderHtml({
      variant: "header",
      locale: "en",
      className: "size-10 rounded-xl",
    });
    expect(html).toContain("size-10");
    expect(html).toContain("rounded-xl");
    expect(html.startsWith("<svg")).toBe(true);
  });
});

describe("ArabclueLogo — RTL/LTR", () => {
  test("Arabic lockup is rtl", () => {
    const html = renderHtml({
      variant: "header",
      locale: "ar",
      displayMode: "static-ar",
      showWordmark: true,
    });
    expect(html).toContain("direction:rtl");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('data-locale="ar"');
  });

  test("English lockup is ltr", () => {
    const html = renderHtml({
      variant: "header",
      locale: "en",
      displayMode: "static-en",
      showWordmark: true,
    });
    expect(html).toContain("direction:ltr");
    expect(html).toContain('dir="ltr"');
  });

  test("unified lockup stays ltr", () => {
    const html = renderHtml({
      displayMode: "unified",
      locale: "ar",
      showWordmark: true,
    });
    expect(html).toContain('dir="ltr"');
  });
});

describe("ArabclueLogo — reduced motion", () => {
  test("prefersReducedMotion is SSR-safe", () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  test("reduced-motion CSS does not blanket-kill SVG transforms", () => {
    const { css } = getLogoAnimations({
      reducedMotion: true,
      entrance: true,
      hover: true,
      cycle: true,
      pulse: true,
    });
    expect(css).toContain("animation: none !important");
    expect(css).toContain("arabclue-logo--reduced-motion");
    expect(css).not.toMatch(/\.arabclue-logo \*[^{]*\{[^}]*transform:\s*none/);
  });

  test("reduced-motion does not emit entrance class rules", () => {
    const { css, entranceClassName } = getLogoAnimations({
      reducedMotion: true,
      entrance: true,
      hover: false,
      cycle: false,
      pulse: false,
    });
    expect(entranceClassName).toBe("");
    expect(css).not.toContain(".arabclue-logo--draw-arch {");
  });
});

describe("ArabclueLogo — animation classes", () => {
  test("header lockup gets entrance + draw classes", () => {
    const html = renderHtml({
      variant: "header",
      locale: "en",
      showWordmark: true,
    });
    expect(html).toContain("arabclue-logo--entrance-icon");
    expect(html).toContain("arabclue-logo--draw-arch");
  });

  test("footer lockup has no entrance classes", () => {
    const html = renderHtml({
      variant: "footer",
      locale: "en",
      showWordmark: true,
    });
    expect(html).not.toContain("arabclue-logo--entrance-icon");
    expect(html).not.toContain("arabclue-logo--draw-arch");
  });

  test("favicon has no motion classes", () => {
    const html = renderHtml({ variant: "favicon" });
    expect(html).not.toContain("arabclue-logo--entrance-icon");
    expect(html).not.toContain("arabclue-logo--pulse");
    expect(html).not.toContain("arabclue-logo--draw-arch");
  });

  test("animated=false disables entrance", () => {
    const html = renderHtml({
      variant: "header",
      locale: "en",
      animated: false,
      showWordmark: true,
    });
    expect(html).not.toContain("arabclue-logo--entrance-icon");
    expect(html).not.toContain("arabclue-logo--draw-arch");
  });
});

describe("ArabclueLogo — interactivity & a11y", () => {
  test("header lockup is pointer-interactive", () => {
    const html = renderHtml({
      variant: "header",
      locale: "en",
      showWordmark: true,
    });
    expect(html).toContain("cursor:pointer");
  });

  test("onClick sets pointer cursor on icon-only", () => {
    const html = renderHtml({
      variant: "header",
      locale: "en",
      onClick: () => {},
    });
    expect(html).toContain("cursor:pointer");
  });

  test("accessible label is present", () => {
    const html = renderHtml({
      variant: "header",
      locale: "en",
      title: "Arabclue Logo",
    });
    expect(html).toContain('aria-label="Arabclue Logo"');
    expect(html).toContain('role="img"');
  });

  test("decorative nested icon is aria-hidden in lockup", () => {
    const html = renderHtml({
      variant: "header",
      locale: "en",
      showWordmark: true,
    });
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("getLogoAnimations", () => {
  test("emits entrance keyframes", () => {
    const { css } = getLogoAnimations({
      reducedMotion: false,
      entrance: true,
      hover: false,
      cycle: false,
      pulse: false,
    });
    expect(css).toContain("@keyframes arabclue-logo-fade-up");
    expect(css).toContain("@keyframes arabclue-logo-draw-arch");
  });

  test("emits hover scale/rotate", () => {
    const { css } = getLogoAnimations({
      reducedMotion: false,
      entrance: false,
      hover: true,
      cycle: false,
      pulse: false,
    });
    expect(css).toContain("scale(1.03)");
    expect(css).toContain("rotate(7deg)");
    expect(css).toContain("arabclue-logo__icon-motion");
  });
});
