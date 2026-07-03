"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase-browser";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState({
    fullName: "",
    companyName: "",
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) setForm((prev) => ({ ...prev, email: emailParam }));
  }, [searchParams]);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createBrowserClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.fullName,
          company_name: form.companyName,
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      // Email confirmation disabled in Supabase dashboard — session is live immediately
      router.push("/dashboard");
      router.refresh();
    } else {
      // Email confirmation required — ask the user to check their inbox
      setCheckEmail(true);
    }
  }

  if (checkEmail) {
    return (
      <div className="min-h-screen bg-off-white flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <div className="text-5xl mb-5">📬</div>
          <h1 className="text-2xl font-bold text-navy-dark mb-3">
            Check your email
          </h1>
          <p className="text-gray-600 text-sm leading-relaxed mb-6">
            We sent a confirmation link to{" "}
            <strong className="text-navy-dark">{form.email}</strong>. Click the
            link to activate your account and get started.
          </p>
          <p className="text-xs text-gray-400">
            Didn&apos;t receive it? Check your spam folder or{" "}
            <button
              onClick={() => setCheckEmail(false)}
              className="text-navy underline"
            >
              try a different email
            </button>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-off-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-navy-dark">
            Vision Workx
          </Link>
          <p className="text-sm text-gray-500 mt-1">A Revalor Company</p>
          <h1 className="text-2xl font-bold text-navy-dark mt-6">
            Start your free trial
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            14 days free · No credit card required
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-navy-dark mb-1.5">
                Your name
              </label>
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(e) => update("fullName", e.target.value)}
                placeholder="Jane Smith"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-navy-dark mb-1.5">
                Business name
              </label>
              <input
                type="text"
                required
                value={form.companyName}
                onChange={(e) => update("companyName", e.target.value)}
                placeholder="Radiance Hair Studio"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-navy-dark mb-1.5">
                Email address
              </label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="you@yourbusiness.com"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-navy-dark mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder="At least 8 characters"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-navy-dark text-white font-semibold py-3 rounded-xl hover:bg-navy transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Creating account…" : "Create Free Account"}
            </button>

            <p className="text-xs text-center text-gray-500">
              By signing up you agree to our Terms of Service and Privacy Policy.
            </p>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link href="/login" className="text-navy font-semibold hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
