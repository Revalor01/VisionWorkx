"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export default function GuidedSuccessClient({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<"confirming" | "done" | "error">("confirming");
  const [message, setMessage] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const res = await fetch("/api/guided/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setState("done");
        } else {
          setState("error");
          setMessage(data.error ?? "We couldn't confirm your payment.");
        }
      } catch {
        setState("error");
        setMessage("Network error confirming your payment.");
      }
    })();
  }, [sessionId]);

  if (state === "confirming") {
    return <p className="mt-8 text-sm text-gray-500">Confirming your payment…</p>;
  }

  if (state === "error") {
    return (
      <div className="mt-8">
        <p className="text-sm text-red-700">{message}</p>
        <p className="mt-3 text-xs text-gray-500">
          If you were charged, don&apos;t pay again — email{" "}
          <a href="mailto:info@revalorllc.com" className="text-navy underline">
            info@revalorllc.com
          </a>{" "}
          and we&apos;ll sort it out.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="text-5xl mb-5">✅</div>
      <h1 className="text-2xl font-bold text-navy-dark mb-3">You&apos;re booked in</h1>
      <p className="text-gray-600 text-sm leading-relaxed mb-6">
        Payment received. We&apos;ll work out what your app should do and send your build brief and
        a live preview to your email. Your $10 is credited to your first month if you subscribe.
      </p>
      <Link
        href="/guided/booked"
        className="inline-block bg-navy-dark text-white font-semibold px-6 py-3 rounded-xl hover:bg-navy transition-colors"
      >
        View your booking →
      </Link>
      <p className="mt-3 text-xs text-gray-400">
        We emailed this link too — open it on any device to pick up where you left off.
      </p>
    </div>
  );
}
