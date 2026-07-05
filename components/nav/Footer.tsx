import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-navy-dark text-blue-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <p className="text-xl font-bold text-white">Vision Workx</p>
            <p className="text-sm text-blue-300 mt-1">A Revalor Company</p>
            <p className="mt-4 text-sm leading-relaxed max-w-xs">
              AI-powered custom apps for small businesses. Describe it. We build
              it. No code. No agency.
            </p>
            <a
              href="https://www.facebook.com/profile.php?id=61591555628574"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Vision Workx on Facebook"
              className="inline-flex items-center justify-center w-9 h-9 mt-5 rounded-lg bg-white/10 hover:bg-white/20 text-blue-100 hover:text-white transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]">
                <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.23.2 2.23.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
              </svg>
            </a>
          </div>

          <div>
            <p className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Product
            </p>
            <ul className="space-y-2 text-sm">
              <li><Link href="/#how-it-works" className="hover:text-white transition-colors">How It Works</Link></li>
              <li><Link href="/#categories" className="hover:text-white transition-colors">Features</Link></li>
              <li><Link href="/#pricing" className="hover:text-white transition-colors">Pricing</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Account
            </p>
            <ul className="space-y-2 text-sm">
              <li><Link href="/login" className="hover:text-white transition-colors">Log In</Link></li>
              <li><Link href="/signup" className="hover:text-white transition-colors">Sign Up</Link></li>
              <li><Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-blue-800 mt-10 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-blue-400">
          <p>© {new Date().getFullYear()} Vision Workx · A Revalor Company. All rights reserved.</p>
          <p className="italic">Confidential</p>
        </div>
      </div>
    </footer>
  );
}
