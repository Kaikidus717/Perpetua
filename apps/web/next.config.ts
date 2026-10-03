import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@perpetua/shared", "@perpetua/valuation"],
};

export default nextConfig;
