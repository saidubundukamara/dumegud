import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Alert } from "@/components/ui/Alert";

export const metadata: Metadata = pageMetadata({
  title: "Creator terms",
  description: "The terms creators agree to before fans can support them on DuMeGud.",
  path: "/legal/creator-terms",
});

// Placeholder until the reviewed legal text lands (implementation.md Phase 10, "Legal & content").
export default function CreatorTermsPage() {
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col px-4 pb-16 pt-28 sm:px-6 md:pt-36">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <h1 className="text-title">Creator terms</h1>
        <Alert tone="warning">
          Draft: the final creator terms will be published before launch. By accepting now you agree to use DuMeGud
          honestly, to only sell work you own, and to follow our content policy.
        </Alert>
      </div>
    </main>
  );
}
