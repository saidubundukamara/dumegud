import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { StatusPanel } from "@/components/admin/StatusPanel";
import { buttonClasses } from "@/components/ui/button-classes";
import { adminHref } from "@/lib/admin-host";

export default function AdminNotFound() {
  return (
    <StatusPanel
      icon={MagnifyingGlassIcon}
      title="Nothing here"
      actions={
        <Link href={adminHref("/admin")} className={buttonClasses("dark", "", "sm")}>
          Go to the overview
        </Link>
      }
    >
      <p>The link may be wrong, or the record was deleted. Press ⌘K to search for a creator or page.</p>
    </StatusPanel>
  );
}
