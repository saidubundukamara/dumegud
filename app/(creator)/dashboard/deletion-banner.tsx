import { Alert } from "@/components/ui/Alert";
import { formatDate } from "@/lib/dates";
import type { DeletionStatus } from "@/server/services/AccountDeletionService";
import { KeepAccountForm } from "./settings/delete-account";

/** Shown on Home and Settings during the 30-day grace period. */
export function DeletionBanner({ status }: { status: NonNullable<DeletionStatus> }) {
  return (
    <Alert tone="warning">
      <div className="flex flex-col gap-3">
        <p>
          <strong>Your account will be deleted on {formatDate(status.eraseAfter)}.</strong> Your page is offline until then.
          Changed your mind? Keep your account and nothing is deleted.
        </p>
        <KeepAccountForm />
      </div>
    </Alert>
  );
}
