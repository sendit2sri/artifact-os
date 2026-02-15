/**
 * 2026 Calm UI: density modes for comfortable (>= lg) vs compact (< lg).
 * Use with getDensityClasses(isLg) and apply to content wrappers.
 */

export type DensityMode = "comfortable" | "compact";

export function getDensityMode(isLg: boolean): DensityMode {
  return isLg ? "comfortable" : "compact";
}

/** Tailwind classes for content area padding: comfortable p-8, compact p-4 */
export function getContentPadding(isLg: boolean): string {
  return isLg ? "p-6 sm:p-8" : "p-4 sm:p-6";
}

/** Tailwind classes for vertical gap between sections: comfortable gap-6, compact gap-4 */
export function getContentGap(isLg: boolean): string {
  return isLg ? "gap-6" : "gap-4";
}

/** Card inner padding: comfortable px-6 py-4, compact px-4 py-3 */
export function getCardPadding(isLg: boolean): string {
  return isLg ? "px-6 py-4" : "px-4 py-3";
}

/** Combined content wrapper classes */
export function getDensityClasses(isLg: boolean): {
  contentPadding: string;
  contentGap: string;
  cardPadding: string;
} {
  return {
    contentPadding: getContentPadding(isLg),
    contentGap: getContentGap(isLg),
    cardPadding: getCardPadding(isLg),
  };
}
