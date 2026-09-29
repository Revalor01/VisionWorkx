"use client";

export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800">
      Print / Save PDF
    </button>
  );
}
