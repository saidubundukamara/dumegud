import "server-only";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { after } from "next/server";
import { authConfig } from "@/auth.config";
import { getEnv } from "@/server/env";
import { RateLimitedError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import { getRequestContext } from "@/server/lib/request";
import { createAuthAdapter } from "@/server/repositories/authAdapter";
import { services } from "@/server/services";

/** Surfaced to the login action as `error.code === "rate_limited"`. */
class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

// Config is built per request (lazy) so `next build` never needs env values or a database.
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const env = getEnv();
  const googleEnabled = Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);

  return {
    ...authConfig,
    adapter: createAuthAdapter(),
    logger: {
      error(error) {
        // Wrong passwords are expected, and already recorded in auth_events.
        if (error instanceof CredentialsSignin) return;
        logger.error("auth.js error", { err: error });
      },
      warn(code) {
        logger.warn("auth.js warning", { code });
      },
      debug() {},
    },
    providers: [
      ...(googleEnabled
        ? [
            Google({
              clientId: env.AUTH_GOOGLE_ID,
              clientSecret: env.AUTH_GOOGLE_SECRET,
              // Never auto-link a Google login to an existing password account by email.
              allowDangerousEmailAccountLinking: false,
            }),
          ]
        : []),
      Credentials({
        credentials: { email: {}, password: {} },
        async authorize(raw, request) {
          try {
            return await services.auth.verifyCredentials(raw, getRequestContext(request.headers));
          } catch (err) {
            if (err instanceof RateLimitedError) throw new RateLimitedSignin();
            throw err;
          }
        },
      }),
    ],
    callbacks: {
      ...authConfig.callbacks,
      async signIn({ account, profile }) {
        if (account?.provider !== "google") return true;
        if (profile?.email_verified !== true || typeof profile.email !== "string") return false;
        const current = await auth();
        return services.auth.canUseGoogleSignIn(profile.email, current?.user?.id);
      },
    },
    events: {
      async createUser({ user }) {
        const userId = user.id;
        if (userId) after(() => services.auth.onUserCreated(userId));
      },
      async linkAccount({ user, account }) {
        if (account.provider === "google" && user.id) await services.auth.onGoogleLinked(user.id);
      },
      async signIn({ user, account, isNewUser }) {
        // Credentials logins are recorded (with IP) inside verifyCredentials.
        if (account?.provider === "google" && user.id && !isNewUser) await services.auth.recordLogin(user.id);
      },
    },
  };
});

export function isGoogleSignInEnabled(): boolean {
  const env = getEnv();
  return Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
}
