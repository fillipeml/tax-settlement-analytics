import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The root goes straight to the workspace (sign-in when there is no session, auto in demo mode)
      { source: "/", destination: "/app", permanent: false },
    ];
  },
};

export default nextConfig;
