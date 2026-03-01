import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    domains: ['i.ytimg.com'],
  },
};

export default withSentryConfig(nextConfig, {
  // Suppresses source map uploading logs during build
  silent: true,
  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,
});
