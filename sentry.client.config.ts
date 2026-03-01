import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://498915677c87ca04eb2fc146290331bc@o4510956711444480.ingest.us.sentry.io/4510956786810880",
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
});
