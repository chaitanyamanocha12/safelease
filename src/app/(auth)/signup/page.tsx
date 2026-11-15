import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignupForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="text-xl">Create your SafeLease account</CardTitle>
        <CardDescription>
          Already have one? <Link href="/login" className="text-blue hover:underline">Sign in</Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm />
      </CardContent>
    </Card>
  );
}
