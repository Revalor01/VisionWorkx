import Navbar from "@/components/nav/Navbar";
import Footer from "@/components/nav/Footer";
import PartnerApplicationForm from "@/components/partners/PartnerApplicationForm";

export const metadata = {
  title: "Partner With VisionWorkx",
  description: "Apply to become a VisionWorkx partner and get a tiered discount on your app.",
};

export default function PartnersPage() {
  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-navy-dark mb-2">Partner With VisionWorkx</h1>
          <p className="text-gray-500 text-sm">
            Tell us about your business. We review every application and assign a partnership tier — the bigger
            your reach, the bigger your discount.
          </p>
        </div>
        <PartnerApplicationForm />
      </main>
      <Footer />
    </div>
  );
}
