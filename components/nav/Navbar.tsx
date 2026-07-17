import Link from "next/link";
import Image from "next/image";

export default function Navbar() {
  return (
    <header className="bg-navy-dark text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="bg-white rounded-lg p-1.5 flex items-center justify-center shrink-0">
                <Image src="/VisionWorks.png" alt="Vision Workx" width={48} height={48} className="rounded-sm" />
              </span>
              <span className="text-xl font-bold tracking-tight">Vision Workx</span>
            </Link>
            <a
              href="https://revalor-automation.vercel.app/"
              className="text-xs text-blue-300 hover:text-white transition-colors hidden sm:block"
            >
              by Revalor
            </a>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-blue-100">
            <Link href="/#how-it-works" className="hover:text-white transition-colors">
              How It Works
            </Link>
            <Link href="/#categories" className="hover:text-white transition-colors">
              Features
            </Link>
            <Link href="/#pricing" className="hover:text-white transition-colors">
              Pricing
            </Link>
            <Link href="/#why-choose-us" className="hover:text-white transition-colors">
              Why Choose Us
            </Link>
            <Link href="/#contact" className="hover:text-white transition-colors">
              Contact Us
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-blue-100 hover:text-white transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold bg-navy text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
