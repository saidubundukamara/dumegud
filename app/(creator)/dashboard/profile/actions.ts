"use server";

import { updateTag } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { verifySession } from "@/server/dal/session";
import { profileChangeTags } from "@/server/lib/cache-tags";
import { type ActionResult, toActionResult, ValidationError } from "@/server/lib/errors";
import { field, invalidForm, runForm } from "@/server/lib/form";
import { services } from "@/server/services";
import { avatarUploadSchema, profileSchema } from "@/server/validation/creator";

export async function saveProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await verifySession();
  const platforms = formData.getAll("linkPlatform").map(String);
  const urls = formData.getAll("linkUrl").map(String);
  const links = urls
    .map((url, i) => ({ platform: platforms[i] ?? "", url }))
    .filter((link) => link.url.trim() !== "");

  const parsed = profileSchema.safeParse({
    handle: field(formData, "handle"),
    displayName: field(formData, "displayName"),
    bio: field(formData, "bio"),
    categoryId: field(formData, "categoryId"),
    supportMessageEnabled: field(formData, "supportMessageEnabled") === "on",
    links,
  });
  if (!parsed.success) return invalidForm(parsed.error);

  return runForm(async () => {
    const change = await services.creators.saveProfile(actor, parsed.data);
    profileChangeTags(change).forEach((tag) => updateTag(tag));
    return { status: "success", message: "Saved." };
  });
}

function avatarService() {
  const avatars = services.avatars;
  if (!avatars) throw new ValidationError("Photo uploads aren't available yet.");
  return avatars;
}

/** Step 1: a short-lived presigned URL for the browser to PUT the file to. */
export async function requestAvatarUpload(input: {
  contentType: string;
  size: number;
}): Promise<ActionResult<{ key: string; url: string }>> {
  const { actor } = await verifySession();
  return toActionResult(async () => {
    const parsed = avatarUploadSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);
    return avatarService().requestUpload(actor, parsed.data);
  });
}

/** Step 2: validate and re-encode the uploaded file, then make it the profile photo. */
export async function confirmAvatarUpload(key: string): Promise<ActionResult<null>> {
  const { actor } = await verifySession();
  return toActionResult(async () => {
    if (typeof key !== "string") throw new ValidationError("That upload couldn't be found.");
    const change = await avatarService().confirmUpload(actor, key);
    profileChangeTags(change).forEach((tag) => updateTag(tag));
    return null;
  });
}

export async function removeAvatar(): Promise<ActionResult<null>> {
  const { actor } = await verifySession();
  return toActionResult(async () => {
    const change = await avatarService().removeAvatar(actor);
    if (change) profileChangeTags(change).forEach((tag) => updateTag(tag));
    return null;
  });
}
