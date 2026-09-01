/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel's file tracer doesn't reliably detect ffmpeg-static/ffprobe-static's
  // binaries since they're resolved dynamically (lib/social/videoOutro.ts) -
  // without this, the route can build fine locally but 500 in production
  // with "spawn ENOENT" because the binary never made it into the bundle.
  outputFileTracingIncludes: {
    "/api/social/content/[id]/generate-video": ["./node_modules/ffmpeg-static/**", "./node_modules/ffprobe-static/**"],
  },
};

export default nextConfig;
