import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["ws"],
  experimental: {
    // Production must rebuild CSS from the current checkout, including on hosts
    // that restore an earlier .next directory between deployments.
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
