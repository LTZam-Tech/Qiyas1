import { useEffect } from "react";

export default function usePageLoad(pageName) {
  useEffect(() => {
    const nav = window.performance.getEntriesByType("navigation")[0];
    if (!nav) {
      return;
    }

    const loadTime = Math.round(nav.loadEventEnd - nav.startTime);
    // Basic performance signal; replace with analytics endpoint later.
    console.info(`[Perf] ${pageName} loaded in ${loadTime}ms`);
  }, [pageName]);
}
