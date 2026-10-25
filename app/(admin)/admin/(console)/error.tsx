"use client";

import { WarningIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { StatusPanel } from "@/components/admin/StatusPanel";
import { buttonClasses } from "@/components/ui/button-classes";
import { adminHref } from "@/lib/admin-host";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StatusPanel
      icon={WarningIcon}
      title="This page didn’t load"
      actions={
        <>
          <button type="button" onClick={reset} className={buttonClasses("dark", "", "sm")}>
            Try again
          </button>
          <Link href={adminHref("/admin")} className={buttonClasses("secondary", "", "sm")}>
            Overview
          </Link>
        </>
      }
    >
      <p>Something went wrong on our side. Nothing you did was lost.</p>
      {error.digest ? <p className="mt-2 font-mono text-xs">Reference {error.digest}</p> : null}
    </StatusPanel>
  );
}
