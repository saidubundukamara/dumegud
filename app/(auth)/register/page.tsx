import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GoogleOption } from "../google-button";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create your account" };

export default function RegisterPage() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Create your DuMeGud</h1>
        <p className="text-muted">Get support for your work and sell your digital creations.</p>
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
