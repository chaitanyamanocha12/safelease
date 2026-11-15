import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getPreferences } from "@/server/services/notifications";
import { getEmailProvider } from "@/server/providers/email";
import { aiModeLabel } from "@/server/providers/registry";
import { getLocale } from "@/lib/i18n/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { ProviderBadge } from "@/components/status/status-badge";
import { LanguageForm, PreferencesForm } from "@/components/forms/settings-forms";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [prefs, locale] = await Promise.all([getPreferences(user.id), getLocale()]);
  const email = getEmailProvider().info();
  const ai = aiModeLabel();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" />
      <Link href="/settings/privacy" className="flex items-center justify-between rounded-lg border border-border bg-card p-4 hover:bg-muted"><div><div className="font-medium">Privacy & data</div><div className="text-sm text-muted-foreground">Sharing, export, retention and account deletion</div></div><ChevronRight className="size-4" /></Link>
      <Card><CardHeader><CardTitle>Notifications</CardTitle></CardHeader><CardContent><PreferencesForm initial={{ inApp: prefs.inApp, email: prefs.email, deadlineReminders: prefs.deadlineReminders, listingUpdates: prefs.listingUpdates, caseUpdates: prefs.caseUpdates }} emailAvailable={email.status === "LIVE"} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Language & appearance</CardTitle></CardHeader><CardContent className="space-y-4"><LanguageForm locale={locale} /><div className="flex items-center gap-3 text-sm">Theme <ThemeToggle /></div></CardContent></Card>
      <Card>
        <CardHeader><CardTitle>Service status</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">AI assistance <span className="text-muted-foreground">{ai.label}</span></div>
          <div className="flex items-center justify-between">Email delivery <ProviderBadge status={email.status} /></div>
        </CardContent>
      </Card>
    </div>
  );
}
