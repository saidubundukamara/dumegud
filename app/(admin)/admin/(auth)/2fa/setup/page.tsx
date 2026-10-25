import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { Suspense } from "react";
import { adminHref } from "@/lib/admin-host";
import { readPendingAdmin } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { EnrollForm } from "@/app/(admin)/admin/auth-forms";

export const metadata: Metadata = { title: "Set up two-step sign-in" };

export default function AdminEnrollPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Set up two-step sign-in</h1>
        <p className="text-muted">
          Every admin signs in with a password and a code from an authenticator app (Google Authenticator, 1Password, Authy or similar).
        </p>
      </div>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Enrollment />
      </Suspense>
    </main>
  );
}

async function Enrollment() {
  const pending = await readPendingAdmin("enroll");
  if (!pending) redirect(adminHref("/admin/login"));
  const enrollment = await services.adminAuth.enrollmentSecret(pending);
  if (!enrollment) redirect(adminHref("/admin/login"));
  // An SVG data URL: img-src already allows data:, and nothing leaves the server.
  const svg = await QRCode.toString(enrollment.otpauthUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const grouped = enrollment.secret.match(/.{1,4}/g)!.join(" ");
  return (
    <>
      <ol className="flex list-decimal flex-col gap-2 pl-5">
        <li>In your authenticator app, add an account and scan this code.</li>
        <li>Then enter the 6-digit code the app shows.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL, nothing to optimise */}
      <img src={src} alt="QR code to add DuMeGud admin to your authenticator app" width={208} height={208} className="self-center rounded-brand bg-white p-2" />
      <p className="text-sm text-muted">
        Can&apos;t scan? Enter this key instead: <code className="font-mono text-text">{grouped}</code>
      </p>
      <EnrollForm />
    </>
  );
}
