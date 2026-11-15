import { cookies } from "next/headers";
import { LOCALES, translator, type Locale } from "./dictionaries";

export const LOCALE_COOKIE = "safelease_locale";

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return (LOCALES as readonly string[]).includes(c ?? "") ? (c as Locale) : "en";
}

export async function getT() {
  return translator(await getLocale());
}
