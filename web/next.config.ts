import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, ".."),
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
};

export default nextConfig;
