import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-semibold text-teal">404</p>
      <h1 className="text-2xl font-semibold">We couldn't find that page</h1>
      <p className="max-w-md text-sm text-muted-foreground">It may have been moved, deleted, or you may not have access to it.</p>
      <Button asChild><Link href="/">Go home</Link></Button>
    </main>
  );
}
