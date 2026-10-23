import "server-only";
import { z } from "zod";
import { checkDateOfBirth } from "@/lib/age";
import { COMMON_PASSWORDS } from "./common-passwords";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "That email address is too long.")
  .pipe(z.email("Enter a valid email address."));

/** For new passwords. Login uses a looser schema so old rules never lock anyone out. */
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`)
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), "That password is too common. Choose another.");

const nameSchema = z.string().trim().min(1, "Enter your name.").max(80, "Use at most 80 characters.");

export const MISSING_DOB_MESSAGE = "Enter your date of birth.";
export const INVALID_DOB_MESSAGE = "That date doesn't look right. Check the day, month and year.";
export const UNDER_AGE_MESSAGE = "Sorry, you need to be 18 to make a DuMeGud page.";

/** `YYYY-MM-DD`, a real date, and 18 or older today. Shared by sign-up and KYC. */
export function dateOfBirthSchema(underAgeMessage = UNDER_AGE_MESSAGE) {
  return z.string().superRefine((v, ctx) => {
    const check = checkDateOfBirth(v);
    if (check === "invalid") ctx.addIssue({ code: "custom", message: v ? INVALID_DOB_MESSAGE : MISSING_DOB_MESSAGE });
    else if (check === "under_age") ctx.addIssue({ code: "custom", message: underAgeMessage });
  });
}

// Field allow-lists: z.object strips unknown keys, so a form can't smuggle in `role`/`status`.

export const registerSchema = z
  .object({ name: nameSchema, email: emailSchema, dateOfBirth: dateOfBirthSchema(), password: newPasswordSchema })
  .refine((v) => v.password.toLowerCase() !== v.email, {
    path: ["password"],
    message: "Your password can't be your email address.",
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, "This link is invalid or has expired.");

export const verifyEmailSchema = z.object({ token: tokenSchema });

export const resetPasswordSchema = z
  .object({ token: tokenSchema, password: newPasswordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords don't match.",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(PASSWORD_MAX),
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords don't match.",
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
