/** @type {import('next').NextConfig} */
const nextConfig = {
  // ffmpeg-static/ffprobe-static compute their binary path via `__dirname`
  // inside their own index.js. Left in the default bundle, Next's
  // build-time bundler inlines that `__dirname` as a literal string
  // reflecting the *build container's* filesystem (seen in production logs
  // as "spawn /ROOT/node_modules/ffprobe-static/.../ffprobe ENOENT") -
  // which doesn't match the Lambda's actual runtime layout, so the path is
  // simply wrong no matter what's bundled at it. serverExternalPackages
  // keeps them un-bundled so `require()` + `__dirname` resolve normally at
  // real runtime instead.
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
  // outputFileTracingIncludes still separately ensures the binary files
  // themselves (not just resolvable code) land in each route's deployed
  // bundle - Vercel's file tracer doesn't reliably detect them on its own
  // since they're required dynamically (lib/social/videoOutro.ts).
  outputFileTracingIncludes: {
    "/api/social/content/[id]/generate-video": ["./node_modules/ffmpeg-static/**", "./node_modules/ffprobe-static/**"],
    "/api/social/linkedin/[id]/generate-video": ["./node_modules/ffmpeg-static/**", "./node_modules/ffprobe-static/**"],
  },
};

export default nextConfig;
