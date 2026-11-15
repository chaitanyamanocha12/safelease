"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const Icon = !mounted ? Monitor : theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <Button variant="ghost" size="icon" aria-label={`Theme: ${mounted ? theme : "system"}. Switch to ${next}`} onClick={() => setTheme(next)}>
      <Icon />
    </Button>
  );
}
