import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ships only the files the server needs — the container copies this.
  output: "standalone",
  // Pin the tracing root to this project. Without it, a lockfile higher up the
  // filesystem makes Next infer the wrong workspace root.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
