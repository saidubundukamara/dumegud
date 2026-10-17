"use client";

import { Field, SelectField } from "@/components/ui/Field";
import { SHOUTOUT_PLATFORM_LABELS, SHOUTOUT_PLATFORMS, type ShoutoutPlatform } from "@/lib/shoutout";

type Props = {
  platform: ShoutoutPlatform;
  onPlatformChange: (platform: ShoutoutPlatform) => void;
  handle: string;
  onHandleChange: (handle: string) => void;
  errors?: { socialPlatform?: string[]; socialHandle?: string[] };
};

/** Platform + username pair shared by the support form and the Thank-you page. */
export function ShoutoutFields({ platform, onPlatformChange, handle, onHandleChange, errors }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_1fr]">
      <SelectField
        label="Where"
        name="socialPlatform"
        value={platform}
        onChange={(e) => onPlatformChange(e.target.value as ShoutoutPlatform)}
        errors={errors?.socialPlatform}
      >
        {SHOUTOUT_PLATFORMS.map((p) => (
          <option key={p} value={p}>
            {SHOUTOUT_PLATFORM_LABELS[p]}
          </option>
        ))}
      </SelectField>
      <Field
        label={`Your ${SHOUTOUT_PLATFORM_LABELS[platform]} username`}
        name="socialHandle"
        placeholder="@username"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={80}
        value={handle}
        onChange={(e) => onHandleChange(e.target.value)}
        errors={errors?.socialHandle}
      />
    </div>
  );
}
