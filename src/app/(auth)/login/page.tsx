import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/auth-forms";
import { getSessionUser } from "@/server/auth/session";
import { demoModeEnabled } from "@/server/env";
import { DEMO_ACCOUNTS } from "@/server/demo";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/dashboard");
  const demo = demoModeEnabled() ? { email: DEMO_ACCOUNTS.renter.email, password: DEMO_ACCOUNTS.renter.password } : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to continue your investigations.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense>
          <LoginForm demo={demo} />
        </Suspense>
      </CardContent>
    </Card>
  );
}
