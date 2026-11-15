/**
 * Interface strings (EN/FR). Legal rule text stays in its official English
 * source language; French UI labels legal content as "texte officiel en anglais".
 * Add a language by adding a dictionary with the same keys.
 */
export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

const en = {
  "nav.dashboard": "Dashboard",
  "nav.investigations": "Investigations",
  "nav.discover": "Discover",
  "nav.compare": "Compare",
  "nav.saved": "Saved",
  "nav.leaseReview": "Lease review",
  "nav.moveIn": "Move-in",
  "nav.maintenance": "Maintenance",
  "nav.deposit": "Deposit protection",
  "nav.disputes": "Disputes",
  "nav.documents": "Documents",
  "nav.reports": "Reports",
  "nav.notifications": "Notifications",
  "nav.organization": "Organization",
  "nav.admin": "Admin",
  "nav.settings": "Settings",
  "nav.profile": "Profile",
  "nav.group.investigate": "Investigate",
  "nav.group.find": "Find a home",
  "nav.group.tenancy": "Your tenancy",
  "nav.group.records": "Records",
  "nav.signOut": "Sign out",
  "common.newInvestigation": "New investigation",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.demoData": "Demo data",
  "common.language": "Language",
  "common.theme": "Theme",
  "marketing.cta.primary": "Investigate a rental",
  "marketing.cta.secondary": "Explore how it works",
  "marketing.tagline": "Investigate before you pay.",
  "marketing.signIn": "Sign in",
  "marketing.getStarted": "Get started",
  "legal.officialSourceNote": "",
};

const fr: typeof en = {
  "nav.dashboard": "Tableau de bord",
  "nav.investigations": "Enquêtes",
  "nav.discover": "Découvrir",
  "nav.compare": "Comparer",
  "nav.saved": "Enregistrés",
  "nav.leaseReview": "Analyse du bail",
  "nav.moveIn": "Emménagement",
  "nav.maintenance": "Entretien",
  "nav.deposit": "Protection du dépôt",
  "nav.disputes": "Différends",
  "nav.documents": "Documents",
  "nav.reports": "Rapports",
  "nav.notifications": "Notifications",
  "nav.organization": "Organisation",
  "nav.admin": "Administration",
  "nav.settings": "Paramètres",
  "nav.profile": "Profil",
  "nav.group.investigate": "Enquêter",
  "nav.group.find": "Trouver un logement",
  "nav.group.tenancy": "Votre location",
  "nav.group.records": "Dossiers",
  "nav.signOut": "Se déconnecter",
  "common.newInvestigation": "Nouvelle enquête",
  "common.save": "Enregistrer",
  "common.cancel": "Annuler",
  "common.demoData": "Données de démonstration",
  "common.language": "Langue",
  "common.theme": "Thème",
  "marketing.cta.primary": "Enquêter sur une location",
  "marketing.cta.secondary": "Voir le fonctionnement",
  "marketing.tagline": "Vérifiez avant de payer.",
  "marketing.signIn": "Se connecter",
  "marketing.getStarted": "Commencer",
  "legal.officialSourceNote": "Les règles juridiques sont présentées dans leur langue source officielle (anglais). Toute traduction serait indiquée comme telle.",
};

export const DICTIONARIES: Record<Locale, typeof en> = { en, fr };
export type MessageKey = keyof typeof en;

export function translator(locale: Locale) {
  const dict = DICTIONARIES[locale] ?? en;
  return (key: MessageKey) => dict[key] ?? en[key] ?? key;
}
