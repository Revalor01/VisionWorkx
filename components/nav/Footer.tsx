import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer id="contact" className="bg-navy-dark text-blue-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <p className="text-xl font-bold text-white whitespace-nowrap">
              Vision Workx <span className="text-blue-300 font-medium text-base">- A Revalor Company</span>
            </p>
            <a
              href="mailto:info@revalorllc.com"
              className="mt-10 inline-block border border-blue-500/60 text-blue-200 font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-blue-900/40 hover:text-white transition-colors"
            >
              Contact Us →
            </a>
            <div className="flex items-center gap-3 mt-5">
              <a
                href="https://www.facebook.com/profile.php?id=61591555628574"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Vision Workx on Facebook"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white hover:bg-gray-100 transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="#1877F2" className="w-[18px] h-[18px]">
                  <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.23.2 2.23.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
                </svg>
              </a>
              <a
                href="https://www.instagram.com/visonworkx01?igsh=MTJmcGRkN2l5cWVldw=="
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Vision Workx on Instagram"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white hover:bg-gray-100 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]">
                  <defs>
                    <linearGradient id="ig-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#FED576" />
                      <stop offset="26%" stopColor="#F47133" />
                      <stop offset="61%" stopColor="#BC3081" />
                      <stop offset="100%" stopColor="#4F5BD5" />
                    </linearGradient>
                  </defs>
                  <path fill="url(#ig-gradient)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </a>
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Vision Workx on X"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white hover:bg-gray-100 transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="#000000" className="w-[16px] h-[16px]">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://revalor-automation.vercel.app/revalorllc_redesign"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Revalor LLC"
                className="inline-flex items-center bg-white rounded-full h-9 px-4 ml-3 hover:bg-gray-100 transition-colors"
              >
                <Image src="/revalor-logo.png" alt="Revalor" width={140} height={40} className="h-5 w-auto" />
              </a>
              <a
                href="mailto:info@revalorllc.com"
                className="text-sm text-blue-200 hover:text-white transition-colors ml-1"
              >
                info@revalorllc.com
              </a>
            </div>
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
