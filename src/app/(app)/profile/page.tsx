import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { getProfile } from "@/server/services/profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ProfileForm } from "@/components/forms/profile-form";
import { NameForm, PasswordForm } from "@/components/forms/settings-forms";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const p = await getProfile(user.id);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Profile" description={<span>{user.email} · <Badge tone="outline">{user.role === "platform_admin" ? "Platform administrator" : "Renter"}</Badge>{user.isDemo ? <Badge tone="demo" className="ml-1">Demo account</Badge> : null}</span>} />
      <Card><CardHeader><CardTitle>Account</CardTitle></CardHeader><CardContent className="space-y-6"><NameForm name={user.name} /><PasswordForm /></CardContent></Card>
      <Card>
        <CardHeader><CardTitle>Rental preferences</CardTitle></CardHeader>
        <CardContent>
          <ProfileForm initial={{ city: p?.city ?? "", renterType: p?.renterType ?? "", budgetMax: p?.budgetMaxCents ? String(p.budgetMaxCents / 100) : "", bedrooms: p?.bedrooms ? String(p.bedrooms) : "", desiredLocation: p?.desiredLocation ?? "", moveInDate: p?.moveInDate ?? "", accessibilityNeeds: p?.accessibilityNeeds ?? "" }} />
        </CardContent>
      </Card>
    </div>
  );
}
