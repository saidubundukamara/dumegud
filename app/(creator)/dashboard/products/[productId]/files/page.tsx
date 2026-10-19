import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { buttonClasses } from "@/components/ui/button-classes";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import { AssetManager } from "../../asset-manager";
import { inSetup, productPath } from "../../labels";
import { BackLink, StepHeading, Stepper, WizardFooter } from "../../ui";

export const metadata: Metadata = { title: "Product files" };

export default function ProductFilesPage({ params }: PageProps<"/dashboard/products/[productId]/files">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Files params={params} />
    </Suspense>
  );
}

async function Files({ params }: Pick<PageProps<"/dashboard/products/[productId]/files">, "params">) {
  const { actor } = await verifySession();
  const { productId } = await params;
  const [product, settings] = await Promise.all([services.products.getOwn(actor, productId), services.settings.get()]);
  const setup = inSetup(product.status);
  const hub = productPath(product.id);
  const hasFile = product.assets.some((a) => a.kind === "file" && (a.status === "pending" || a.status === "clean"));
  const types = settings.allowedUploadTypes.join(", ").toUpperCase();
  const maxMb = Math.floor(settings.maxUploadBytes / 1024 / 1024);

  return (
    <>
      <div className="flex flex-col gap-3">
        <BackLink href={hub}>{product.title}</BackLink>
        <StepHeading title={setup ? "Add your files" : "Files"}>Buyers download the file straight after paying.</StepHeading>
      </div>
      {setup ? <Stepper current="files" productId={product.id} done={["details"]} /> : null}

      {services.products.uploadsEnabled ? (
        <>
          <section aria-labelledby="files-heading" className="flex flex-col gap-3">
            <h2 id="files-heading" className="text-lg font-bold">
              The file buyers get
            </h2>
            <AssetManager
              productId={product.id}
              kind="file"
              assets={product.assets}
              filesLocked={product.filesLocked}
              accept={settings.allowedUploadTypes.map((t) => `.${t}`).join(",")}
              hint={`${types}, up to ${maxMb} MB`}
            />
            {product.filesLocked ? (
              <p className="text-sm text-muted">Files can&apos;t be removed once a product has been on sale: earlier buyers still download them.</p>
            ) : null}
          </section>

          <section aria-labelledby="previews-heading" className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 id="previews-heading" className="text-lg font-bold">
                Preview images <span className="font-normal text-muted">(optional)</span>
              </h2>
              <p className="text-sm text-muted">Shown at the top of your product page. The first one is the cover.</p>
            </div>
            <AssetManager
              productId={product.id}
              kind="preview_image"
              assets={product.assets}
              filesLocked={false}
              accept=".jpg,.jpeg,.png,.webp"
              hint="JPG, PNG or WebP"
            />
          </section>
        </>
      ) : (
        <p className="text-muted">File uploads aren&apos;t available yet.</p>
      )}

      <WizardFooter>
        {setup ? (
          <>
            <Link href={productPath(product.id, "details")} className={buttonClasses("secondary", "shrink-0")}>
              Back
            </Link>
            {hasFile ? (
              <Link href={productPath(product.id, "publish")} className={buttonClasses("primary", "flex-1 sm:flex-none")}>
                Continue
              </Link>
            ) : (
              <span aria-disabled="true" className={buttonClasses("primary", "flex-1 cursor-not-allowed opacity-55 sm:flex-none")}>
                Upload a file to continue
              </span>
            )}
          </>
        ) : (
          <Link href={hub} className={buttonClasses("primary", "w-full sm:w-fit")}>
            Done
          </Link>
        )}
      </WizardFooter>
    </>
  );
}
