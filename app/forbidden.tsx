import { LockKeyIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { StatusBlock, StatusPage } from "@/components/checkout/StatusScreen";
import { buttonClasses } from "@/components/ui/button-classes";

export default function Forbidden() {
  return (
    <StatusPage>
      <StatusBlock icon={<LockKeyIcon weight="bold" className="size-8" />} title="You don't have access to this page">
        <p>If you think this is a mistake, log in with the right account.</p>
      </StatusBlock>
      <Link href="/dashboard" className={buttonClasses("primary", "w-full", "lg")}>
        Go to your dashboard
      </Link>
    </StatusPage>
  );
}
