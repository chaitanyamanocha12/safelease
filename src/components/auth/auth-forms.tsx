"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FlaskConical, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Callout } from "@/components/ui/misc";

const loginSchema = z.object({ email: z.string().email("Enter a valid email."), password: z.string().min(1, "Enter your password.") });
const signupSchema = z
  .object({
    name: z.string().min(2, "Enter your name.").max(80),
    email: z.string().email("Enter a valid email."),
    password: z.string().min(10, "Use at least 10 characters.").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match.", path: ["confirm"] });

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function LoginForm({ demo }: { demo: { email: string; password: string } | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [demoPending, setDemoPending] = useState(false);
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  async function signIn(email: string, password: string) {
    setError(null);
    const res = await authClient.signIn.email({ email, password });
    if (res.error) {
      setError(res.error.status === 429 ? "Too many attempts. Please wait a minute and try again." : "Email or password is incorrect.");
      return false;
    }
    router.push(safeNext(params.get("next")));
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-4">
      {params.get("signedOut") ? <Callout tone="ok">You've been signed out.</Callout> : null}
      {params.get("reset") ? <Callout tone="ok">Password updated. Sign in with your new password.</Callout> : null}
      <form onSubmit={form.handleSubmit((v) => signIn(v.email, v.password))} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={Boolean(form.formState.errors.email)} {...form.register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={form.formState.errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={Boolean(form.formState.errors.password)} {...form.register("password")} />
        </Field>
        {error ? <Callout tone="bad">{error}</Callout> : null}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null} Sign in
        </Button>
      </form>
      <div className="flex justify-between text-sm">
        <Link href="/forgot-password" className="text-blue hover:underline">Forgot password?</Link>
        <Link href="/signup" className="text-blue hover:underline">Create an account</Link>
      </div>
      {demo ? (
        <div className="rounded-lg border border-warn/40 bg-warn-bg p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-warn">
            <FlaskConical className="size-4" aria-hidden /> Demo mode is enabled
          </div>
          <p className="mt-1 text-xs text-foreground/80">
            Sign in to a seeded account with fictional cases. Demo credentials: <code className="font-mono">{demo.email}</code> / <code className="font-mono">{demo.password}</code>
          </p>
          <Button
            variant="outline"
            className="mt-3 w-full"
            disabled={demoPending}
            onClick={async () => {
              setDemoPending(true);
              const ok = await signIn(demo.email, demo.password);
              if (!ok) setError("Demo account not found. Run `npm run db:seed` first.");
              setDemoPending(false);
            }}
          >
            {demoPending ? <Loader2 className="animate-spin" /> : null} Continue with the demo student account
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof signupSchema>>({ resolver: zodResolver(signupSchema), defaultValues: { name: "", email: "", password: "", confirm: "" } });
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit(async (v) => {
        setError(null);
        const res = await authClient.signUp.email({ name: v.name, email: v.email, password: v.password });
        if (res.error) {
          setError(res.error.status === 429 ? "Too many attempts. Please wait and try again." : res.error.message ?? "Could not create the account. If you already have one, sign in instead.");
          return;
        }
        router.push("/onboarding");
        router.refresh();
      })}
    >
      <Field label="Name" htmlFor="name" error={form.formState.errors.name?.message}>
        <Input id="name" autoComplete="name" aria-invalid={Boolean(form.formState.errors.name)} {...form.register("name")} />
      </Field>
      <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={Boolean(form.formState.errors.email)} {...form.register("email")} />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters." error={form.formState.errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={Boolean(form.formState.errors.password)} {...form.register("password")} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={form.formState.errors.confirm?.message}>
        <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={Boolean(form.formState.errors.confirm)} {...form.register("confirm")} />
      </Field>
      {error ? <Callout tone="bad">{error}</Callout> : null}
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null} Create account
      </Button>
      <p className="text-xs text-muted-foreground">
        By creating an account you agree to the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy notice</Link>. Your cases stay private unless you choose to share them.
      </p>
    </form>
  );
}

export function ForgotForm({ available }: { available: boolean }) {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  if (!available) {
    return (
      <Callout tone="neutral" title="Password reset isn't available on this server">
        No email delivery provider is configured, so reset links can't be sent. An administrator can configure EMAIL_PROVIDER (see .env.example).
      </Callout>
    );
  }
  if (sent) return <Callout tone="ok">If an account exists for that email, a reset link has been issued. Check your inbox (or the server log in development).</Callout>;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        setPending(false);
        setSent(true);
      }}
    >
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null} Send reset link
      </Button>
    </form>
  );
}

export function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!token) return <Callout tone="bad">This reset link is missing its token or has expired. Request a new one.</Callout>;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pw.length < 10) return setError("Use at least 10 characters.");
        setPending(true);
        const res = await authClient.resetPassword({ newPassword: pw, token });
        setPending(false);
        if (res.error) return setError("This reset link is invalid or has expired.");
        router.push("/login?reset=1");
      }}
    >
      <Field label="New password" htmlFor="pw" error={error ?? undefined}>
        <Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>Update password</Button>
    </form>
  );
}
