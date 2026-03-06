import { useEffect, useState } from "react";
import { BREAKPOINTS } from "../constants/index.js";

const getWidth = () => (typeof window === "undefined" ? BREAKPOINTS.desktop : window.innerWidth);

export default function useResponsive() {
  const [vw, setVw] = useState(getWidth);

  useEffect(() => {
    let timeoutId = null;
    const onResize = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        setVw(getWidth());
      }, 120);
    };

    window.addEventListener("resize", onResize);
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return {
    vw,
    isMobile: vw <= BREAKPOINTS.mobile,
    isTablet: vw <= BREAKPOINTS.tablet,
    isDesktop: vw > BREAKPOINTS.tablet,
  };
}
