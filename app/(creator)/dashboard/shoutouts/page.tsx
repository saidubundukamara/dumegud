import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert } from "@/components/ui/Alert";
import { buttonClasses } from "@/components/ui/button-classes";
import { SelectField } from "@/components/ui/Field";
import { CAPTION_STYLE_LABELS, CAPTION_STYLES, SHOUTOUT_PLATFORM_LABELS, SHOUTOUT_PLATFORMS } from "@/lib/shoutout";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import { shoutoutOptionsSchema, type ShoutoutOptionsInput } from "@/server/validation/shoutout";
import { CaptionEditor, MarkPostedForm } from "./forms";

export const metadata: Metadata = { title: "Thank your supporters" };

const PERIOD_LABELS = {
  since_last: "Since my last thank-you",
  week: "Past 7 days",
  month: "Past 30 days",
} as const;

export default function ShoutoutsPage({ searchParams }: PageProps<"/dashboard/shoutouts">) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Thank your supporters</h1>
        <p className="text-muted">
          A shout-out makes supporters feel seen, and the people you tag often share it, which brings new supporters to your
          page. Only supporters who agreed to be mentioned appear here.
        </p>
      </div>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Shoutouts searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function imageUrl(opts: ShoutoutOptionsInput, size: "story" | "post") {
  const qs = new URLSearchParams({ period: opts.period, platform: opts.platform, size });
  if (opts.includeTop) qs.set("includeTop", "1");
  opts.exclude.forEach((id) => qs.append("exclude", id));
  return `/api/shoutouts/image?${qs}`;
}

async function Shoutouts({ searchParams }: Pick<PageProps<"/dashboard/shoutouts">, "searchParams">) {
  const { actor } = await verifySession();
  const raw = await searchParams;
  const opts = shoutoutOptionsSchema.parse(raw);
  const posted = typeof raw.posted === "string" ? Number(raw.posted) : null;
  const preview = await services.shoutouts.preview(actor, opts);
  const included = preview.people.filter((p) => !p.excluded);
  const platformLabel = SHOUTOUT_PLATFORM_LABELS[opts.platform];

  return (
    <>
      {posted !== null && Number.isFinite(posted) ? (
        <Alert tone="success">Done! {posted === 1 ? "1 supporter has" : `${posted} supporters have`} been thanked.</Alert>
      ) : null}

      <form method="get" className="flex flex-col gap-4 rounded-brand border border-border p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField label="Who" name="period" defaultValue={opts.period}>
            {Object.entries(PERIOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <SelectField label="Posting on" name="platform" defaultValue={opts.platform}>
            {SHOUTOUT_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {SHOUTOUT_PLATFORM_LABELS[p]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Style" name="style" defaultValue={opts.style}>
            {CAPTION_STYLES.map((s) => (
              <option key={s} value={s}>
                {CAPTION_STYLE_LABELS[s]}
              </option>
            ))}
          </SelectField>
        </div>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="includeTop" value="1" defaultChecked={opts.includeTop} className="mt-0.5 size-5 shrink-0" />
          <span>
            Highlight my top 3 supporters
            <span className="block text-sm text-muted">Ranked by how much they gave in this period. Amounts are never shown.</span>
          </span>
        </label>

        {preview.people.length ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-semibold">
              Supporters ({included.length} of {preview.people.length} included)
            </legend>
            <p className="text-sm text-muted">
              Usernames are typed in by supporters and aren&apos;t checked. Leave out anyone who looks wrong.
            </p>
            <ul className="flex flex-col gap-2">
              {preview.people.map((p) => (
                <li key={p.contributionId} className="flex items-center justify-between gap-4 rounded-brand bg-surface px-4 py-2">
                  <span className={p.excluded ? "text-muted line-through" : ""}>
                    {p.mention}
                    {p.thanked ? <span className="ml-2 text-sm text-muted">(thanked before)</span> : null}
                  </span>
                  <label className="flex shrink-0 items-center gap-2 text-sm">
                    <input type="checkbox" name="exclude" value={p.contributionId} defaultChecked={p.excluded} className="size-5" />
                    Leave out
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ) : null}

        <button type="submit" className={buttonClasses("primary", "self-start")}>
          Generate thank-you
        </button>
      </form>

      {!preview.people.length ? (
        <section className="flex flex-col gap-2 rounded-brand border border-border p-4 sm:p-6">
          <h2 className="text-xl font-bold">Nobody to thank yet</h2>
          <p className="text-muted">
            {opts.period === "since_last"
              ? "Everyone who agreed to a shout-out has been thanked. "
              : "No supporters who agreed to a shout-out in this period. "}
            Share your page link on {platformLabel}. Supporters can add their username when they support you.
          </p>
          <Link href="/dashboard" className="self-start font-semibold underline underline-offset-4">
            Get your share links
          </Link>
        </section>
      ) : included.length ? (
        <section aria-labelledby="post-heading" className="flex flex-col gap-6 rounded-brand border border-border p-4 sm:p-6">
          <h2 id="post-heading" className="text-xl font-bold">
            Your {platformLabel} post
          </h2>
          <CaptionEditor key={preview.caption} caption={preview.caption} />

          <div className="flex flex-col gap-3">
            <h3 className="font-semibold">Image</h3>
            {/* eslint-disable-next-line @next/next/no-img-element -- generated per request, owner-only */}
            <img
              src={imageUrl(opts, "post")}
              alt={`Thank-you card naming ${included.length} supporters`}
              width={1080}
              height={1350}
              className="h-auto w-full max-w-xs rounded-brand border border-border"
            />
            <div className="flex flex-wrap gap-3">
              <a href={imageUrl(opts, "story")} download="dumegud-thank-you-story.png" className={buttonClasses("secondary")}>
                Download for Stories
              </a>
              <a href={imageUrl(opts, "post")} download="dumegud-thank-you-post.png" className={buttonClasses("secondary")}>
                Download for a post
              </a>
            </div>
          </div>

          <MarkPostedForm
            period={opts.period}
            platform={opts.platform}
            style={opts.style}
            includeTop={opts.includeTop}
            exclude={opts.exclude}
            reviewed={preview.people.map((p) => p.contributionId)}
          />
        </section>
      ) : (
        <p className="text-muted">You&apos;ve left everyone out. Untick someone to build a post.</p>
      )}
    </>
  );
}
