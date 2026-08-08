import Link from "next/link";

const NAV_LINKS = [
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#categories", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#why-choose-us", label: "Why Choose Us" },
  { href: "/login", label: "Log in" },
];

export default function Navbar() {
  return (
    <header className="bg-gray-100 text-navy-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 py-4 text-sm font-medium text-gray-600">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="whitespace-nowrap hover:text-navy-dark transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
