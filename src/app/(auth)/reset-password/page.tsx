import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="text-xl">Choose a new password</CardTitle>
      </CardHeader>
      <CardContent>
        <Suspense>
          <ResetForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
