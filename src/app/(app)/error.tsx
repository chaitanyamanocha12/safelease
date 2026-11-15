"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-xl border border-border bg-card p-8 text-center">
      <AlertTriangle className="mx-auto mb-3 size-8 text-warn" aria-hidden />
      <h1 className="text-lg font-semibold">Something went wrong loading this page</h1>
      <p className="mt-2 text-sm text-muted-foreground">Your data hasn't been changed. Try again, or go back to the dashboard.{error.digest ? ` (Reference: ${error.digest})` : ""}</p>
      <div className="mt-5 flex justify-center gap-2"><Button onClick={reset}>Try again</Button><Button variant="outline" asChild><a href="/dashboard">Dashboard</a></Button></div>
    </div>
  );
}
