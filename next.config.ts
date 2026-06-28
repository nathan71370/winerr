import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep the Postgres driver external (not bundled) so its Node built-in
  // imports (crypto/net/tls) resolve at runtime instead of being bundled.
  serverExternalPackages: ["postgres"],
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
