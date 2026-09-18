/**
 * Lazy front for ./analytics: posthog-js (~95 KB gzipped) is only imported after the page has
 * loaded, so it never competes with the first paint. Events fired before it is ready are queued.
 */
type Capture = typeof import("./analytics").capture;
type Args = Parameters<Capture>;

let real: Capture | null = null;
const queue: Args[] = [];

export function capture(...args: Args): void {
  if (real) real(...args);
  else queue.push(args);
}

export function bootAnalytics(): void {
  const load = () =>
    import("./analytics").then((m) => {
      m.initAnalytics();
      real = m.capture;
      for (const args of queue.splice(0)) real(...args);
    });
  if (document.readyState === "complete") setTimeout(load, 0);
  else window.addEventListener("load", () => setTimeout(load, 0), { once: true });
}
