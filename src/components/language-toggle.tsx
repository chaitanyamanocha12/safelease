"use client";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LanguageToggle({ locale }: { locale: "en" | "fr" }) {
  const router = useRouter();
  const next = locale === "en" ? "fr" : "en";
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={locale === "en" ? "Passer au français" : "Switch to English"}
      onClick={() => {
        document.cookie = `safelease_locale=${next}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
    >
      <Languages aria-hidden />
      {next.toUpperCase()}
    </Button>
  );
}
