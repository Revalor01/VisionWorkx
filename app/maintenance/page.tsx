const DEFAULT_MESSAGE = "We're performing scheduled maintenance and will be back shortly.";

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 py-16 text-center">
      <span className="text-xl font-bold text-navy-dark">
        Vision Workx <span className="text-blue-300 font-medium text-base">- A Revalor Company</span>
      </span>
      <h1 className="mt-6 text-2xl font-semibold text-navy-dark">Be right back</h1>
      <p className="mt-2 max-w-md text-sm text-zinc-600">{message || DEFAULT_MESSAGE}</p>
    </div>
  );
}
