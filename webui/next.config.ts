import type { NextConfig } from "next";
import path from "node:path";

const repositoryRoot = path.resolve(__dirname, "..");

// Next changes its working directory to `webui/`. Keep all runtime storage
// anchored at the repository root unless the operator provides an override.
process.env.EIDO_ROOT_DIR ||= repositoryRoot;

const nextConfig: NextConfig = {
  outputFileTracingRoot: repositoryRoot,
  turbopack: {
    root: repositoryRoot,
  },
};

export default nextConfig;
