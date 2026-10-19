import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { Suspense } from "react";
import { GoogleOption } from "../google-button";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = pageMetadata({
  title: "Create your account",
  shareTitle: "Make your free DuMeGud page",
  description: "Make a free page in two minutes. Fans send you gifts with Orange Money or AfriMoney, and you can sell your work too.",
  path: "/register",
});

export default function RegisterPage() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-title">Create your DuMeGud</h1>
        <p className="text-muted">Free to join. Your page can be ready in two minutes.</p>
      </div>
      <Suspense fallback={null}>
        <GoogleOption />
      </Suspense>
      <RegisterForm />
      <p className="text-center text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-text underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  );
}
