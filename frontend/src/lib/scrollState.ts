// Tracks when the page last scrolled, so heavy visual updates can wait until scrolling stops. No dependencies.
let lastScroll = 0;
if (typeof window !== "undefined") window.addEventListener("scroll", () => { lastScroll = performance.now(); }, { passive: true });
export const msSinceScroll = () => performance.now() - lastScroll;
/** True while the page has scrolled in the last few frames. */
export const isScrolling = () => msSinceScroll() < 160;
