/**
 * Better Auth configuration (email + password, database sessions,
 * HTTP-only secure cookies, built-in rate limiting).
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "../db/client";
import * as schema from "../db/schema";
import { env, isProduction } from "../env";
import { getEmailProvider } from "../providers/email";
import { audit } from "../services/audit";

function secret(): string {
  const s = env().BETTER_AUTH_SECRET;
  if (s && s.length >= 32) return s;
  if (isProduction()) {
    throw new Error("BETTER_AUTH_SECRET must be set (>= 32 chars) in production.");
  }
  // Development-only fallback so a fresh clone can boot; documented in README.
  return "dev-only-insecure-secret-change-me-0123456789abcdef";
}

export const auth = betterAuth({
  appName: "SafeLease",
  baseURL: env().APP_URL,
  secret: secret(),
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: true,
    resetPasswordTokenExpiresIn: 60 * 30,
    sendResetPassword: async ({ user, url }) => {
      const provider = getEmailProvider();
      const result = await provider.send({
        to: user.email,
        subject: "Reset your SafeLease password",
        text: `Someone requested a password reset for your SafeLease account.\n\nReset link (valid 30 minutes):\n${url}\n\nIf this wasn't you, you can ignore this email.`,
      });
      await audit({
        actorId: user.id,
        action: "auth.password_reset_requested",
        resourceType: "user",
        resourceId: user.id,
        metadata: { emailOutcome: result.outcome },
      });
    },
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "renter", input: false },
      locale: { type: "string", required: false, defaultValue: "en", input: false },
      isDemo: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    useSecureCookies: isProduction(),
    cookiePrefix: "safelease",
    database: { generateId: () => crypto.randomUUID() },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 120,
    customRules: {
      "/sign-in/email": { window: 60, max: 8 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
    },
  },
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
