import posthog from "posthog-js";

/**
 * PostHog, following the contract every app on kalpkan.com uses (portfolio repo docs/analytics.md):
 * cookieless (`persistence: "memory"`), first-party through the /ingest rewrite in vercel.json,
 * autocapture on, inputs masked. Three custom events, none of which ever carries a frame or a
 * landmark:
 *   session_started    { mode: "camera" | "demo" }
 *   rep_counted        { good: boolean }
 *   demo_video_played  {}
 * Without VITE_PUBLIC_POSTHOG_KEY (local dev, a fork) every call is a silent no-op.
 */
let initialised = false;

export function initAnalytics(key: string | undefined = import.meta.env.VITE_PUBLIC_POSTHOG_KEY): void {
  if (initialised || !key) return;
  initialised = true;
  posthog.init(key, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST || "/ingest",
    ui_host: "https://us.posthog.com",
    persistence: "memory",
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    session_recording: { maskAllInputs: true },
    disable_surveys: true,
  });
}

type Events = {
  session_started: { mode: "camera" | "demo" };
  rep_counted: { good: boolean };
  demo_video_played: Record<string, never>;
};

export function capture<E extends keyof Events>(event: E, props: Events[E]): void {
  if (!initialised) return;
  posthog.capture(event, props, { send_instantly: true, transport: "sendBeacon" });
}
