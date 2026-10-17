import "server-only";
import { z } from "zod";
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

// Field allow-lists: z.object strips unknown keys, so a form can't smuggle in `role`/`status`.

export const registerSchema = z
  .object({ name: nameSchema, email: emailSchema, password: newPasswordSchema })
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
