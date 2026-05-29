import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverRuntimeConfig: {
    apiUrl: process.env.API_URL || "http://localhost:3000",
  },
  publicRuntimeConfig: {
    apiUrl:
      typeof window === "undefined"
        ? "http://localhost:3000"
        : process.env.NEXT_PUBLIC_API_URL || "",
  },
};

export default nextConfig;
