const DEFAULT_REASON = "Your account has been temporarily paused. Contact support for details.";

export default async function AccountBlockedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 py-16 text-center">
      <span className="text-xl font-bold text-navy-dark">
        Vision Workx <span className="text-blue-300 font-medium text-base">- A Revalor Company</span>
      </span>
      <h1 className="mt-6 text-2xl font-semibold text-navy-dark">Account paused</h1>
      <p className="mt-2 max-w-md text-sm text-zinc-600">{reason || DEFAULT_REASON}</p>
      <a
        href="mailto:info@revalorllc.com"
        className="mt-6 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-dark"
      >
        Contact support
      </a>
    </div>
  );
}
