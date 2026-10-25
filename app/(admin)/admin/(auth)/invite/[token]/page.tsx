import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Alert } from "@/components/ui/Alert";
import { services } from "@/server/services";
import { AcceptInviteForm } from "@/app/(admin)/admin/auth-forms";

export const metadata: Metadata = { title: "Accept invite", referrer: "no-referrer" };

export default function AcceptInvitePage({ params }: PageProps<"/admin/invite/[token]">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Join the DuMeGud admin</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Invite params={params} />
      </Suspense>
    </main>
  );
}

async function Invite({ params }: Pick<PageProps<"/admin/invite/[token]">, "params">) {
  const { token } = await params;
  await connection(); // the database read below is request-time only (see getSession)
  const invite = token.length <= 128 ? await services.adminAccounts.openInvite(token) : null;
  if (!invite) return <Alert tone="danger">This invite was already used, withdrawn or has expired. Ask a super admin for a new one.</Alert>;
  return (
    <>
      <p className="text-muted">
        You&apos;re joining as <span className="font-semibold text-text">{invite.email}</span>. Next you&apos;ll set up an authenticator app.
      </p>
      <AcceptInviteForm token={token} email={invite.email} />
    </>
  );
}
