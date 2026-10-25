import { LockKeyIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { StatusPanel } from "@/components/admin/StatusPanel";
import { buttonClasses } from "@/components/ui/button-classes";
import { adminHref } from "@/lib/admin-host";

export default function AdminForbidden() {
  return (
    <StatusPanel
      icon={LockKeyIcon}
      title="Your role can’t open this"
      actions={
        <Link href={adminHref("/admin")} className={buttonClasses("dark", "", "sm")}>
          Go to the overview
        </Link>
      }
    >
      <p>If you need it for your work, ask an admin who manages roles to add the permission.</p>
    </StatusPanel>
  );
}
