import type { Metadata } from "next";
import { CheckCircle2, Lock, XCircle } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getProfile } from "@/server/services/profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { ProfileForm } from "@/components/forms/profile-form";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const p = await getProfile(user.id);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Welcome to SafeLease" title={`Hi ${user.name.split(" ")[0]} — let's set things up`} description="A few optional details help us pre-fill searches. Everything can be changed later." />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Your search (optional)</CardTitle></CardHeader>
          <CardContent>
            <ProfileForm onboarding redirectTo="/dashboard" initial={{ city: p?.city ?? "Halifax", renterType: p?.renterType ?? "", budgetMax: p?.budgetMaxCents ? String(p.budgetMaxCents / 100) : "", bedrooms: p?.bedrooms ? String(p.bedrooms) : "", desiredLocation: p?.desiredLocation ?? "", moveInDate: p?.moveInDate ?? "", accessibilityNeeds: p?.accessibilityNeeds ?? "" }} />
          </CardContent>
        </Card>
        <div className="space-y-4 text-sm">
          <Card>
            <CardContent className="space-y-2 p-5">
              <h2 className="font-semibold">What SafeLease can check</h2>
              {["Contradictions between the listing, messages and lease", "Nova Scotia rules on deposits, application fees and rent increases — with official citations", "Common warning signs, like pressure to pay before a viewing", "Whether photos match other images in SafeLease"].map((t) => (
                <p key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />{t}</p>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 p-5">
              <h2 className="font-semibold">What SafeLease cannot verify</h2>
              {["Who owns a property or whether someone may rent it (registry access is restricted)", "That a listing is genuine or that a payment is safe", "Legal outcomes — results are information, not legal advice"].map((t) => (
                <p key={t} className="flex gap-2"><XCircle className="mt-0.5 size-4 shrink-0 text-neutral" aria-hidden />{t}</p>
              ))}
              <p className="text-muted-foreground">Always confirm important facts independently.</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex gap-2 p-5">
              <Lock className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden />
              <p><span className="font-semibold">Your data stays private.</span> Uploads are stored privately and only you can open them. Organizations, including your school, can't see your cases unless you share one. You can export or delete your data at any time.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
