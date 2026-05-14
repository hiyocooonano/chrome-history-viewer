import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@google-cloud/spanner",
    "@grpc/grpc-js",
    "@grpc/proto-loader",
    "google-gax",
  ],
};

export default nextConfig;
