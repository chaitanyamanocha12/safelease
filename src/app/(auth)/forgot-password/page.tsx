import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotForm } from "@/components/auth/auth-forms";
import { passwordResetAvailable } from "@/server/providers/email";

export const metadata: Metadata = { title: "Reset password" };
export const dynamic = "force-dynamic";

export default function ForgotPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="text-xl">Reset your password</CardTitle>
        <CardDescription>We'll send a time-limited reset link.</CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotForm available={passwordResetAvailable()} />
      </CardContent>
    </Card>
  );
}
