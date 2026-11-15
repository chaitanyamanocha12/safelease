/**
 * Canonical Nova Scotia legal sources and rule definitions (version 1).
 *
 * Every excerpt below was checked against the official document at the URL
 * on SOURCE_VERIFIED_ON. The seed loads these into the versioned rule
 * database; later edits go through admin review (pending_review → verified).
 *
 * This is legal INFORMATION, not legal advice.
 */
export const SOURCE_VERIFIED_ON = "2026-11-15";

export interface LegalSourceDef {
  sourceKey: string;
  title: string;
  publisher: string;
  url: string;
  sourceType: "statute" | "regulation" | "government_guide" | "government_form" | "government_page";
  verificationNote: string;
}

export const LEGAL_SOURCES: LegalSourceDef[] = [
  {
    sourceKey: "NS-RTA",
    title: "Residential Tenancies Act, R.S.N.S. 1989, c. 401 (consolidated to October 3, 2025)",
    publisher: "Nova Scotia House of Assembly",
    url: "https://nslegislature.ca/sites/default/files/legc/statutes/residential%20tenancies.pdf",
    sourceType: "statute",
    verificationNote: "Sections 6, 7, 11, 12 and 12A text reviewed in the consolidated PDF.",
  },
  {
    sourceKey: "NS-IRRICA",
    title: "Interim Residential Rental Increase Cap Act, S.N.S. 2021, c. 22 (consolidated to April 30, 2025)",
    publisher: "Nova Scotia House of Assembly",
    url: "https://nslegislature.ca/sites/default/files/legc/statutes/interim%20residential%20rental%20increase%20cap.pdf",
    sourceType: "statute",
    verificationNote: "Sections 3, 4 and 7 reviewed: 5% for 2026 and 2027; Act expires after Dec 31, 2027.",
  },
  {
    sourceKey: "NS-RENT-CAP-2026",
    title: "Temporary Rent Cap and Rent Increases (2026)",
    publisher: "Nova Scotia Residential Tenancies Program",
    url: "https://www.novascotia.ca/sites/default/files/documents/1-4301/residential-tenancies-program-temporary-rent-cap-and-rent-increases-en.pdf",
    sourceType: "government_guide",
    verificationNote: "States the cap does not apply to new tenants signing a new lease, and no increase in the first 12 months.",
  },
  {
    sourceKey: "NS-RENTING-GUIDE",
    title: "Residential Tenancies Guides — Renting Guide (April 2025)",
    publisher: "Nova Scotia Residential Tenancies Program",
    url: "https://www.novascotia.ca/sites/default/files/documents/1-1764/residential-tenancies-guides-renting-en.pdf",
    sourceType: "government_guide",
    verificationNote: "Application fees, deposits, pets, SIN, lease types, late rent, landlord entry and inspection guidance reviewed.",
  },
  {
    sourceKey: "NS-DEPOSIT-CLAIMS-2026",
    title: "Security Deposit Claims (2026)",
    publisher: "Nova Scotia Residential Tenancies Program",
    url: "https://www.novascotia.ca/sites/default/files/documents/1-4300/residential-tenancies-program-security-deposit-claims-en.pdf",
    sourceType: "government_guide",
    verificationNote: "Tenant may file after waiting at least 10 days after tenancy ends; landlord claim within 10 days.",
  },
  {
    sourceKey: "NS-FORM-P",
    title: "Standard Form of Lease (Form P)",
    publisher: "Government of Nova Scotia",
    url: "https://www.novascotia.ca/standard-form-lease-form-p",
    sourceType: "government_form",
    verificationNote: "Conditions in Form P apply even when another lease or a verbal agreement is used; signed copy within 10 days.",
  },
  {
    sourceKey: "NS-CONDITION-REPORT",
    title: "Rental Unit Condition Report Form",
    publisher: "Government of Nova Scotia",
    url: "https://www.novascotia.ca/rental-unit-condition-report-form",
    sourceType: "government_form",
    verificationNote: "Both parties should inspect and sign; if the landlord won't, tenant completes it with a witness.",
  },
  {
    sourceKey: "NS-RTA-HOME",
    title: "Residential tenancies: tenants and landlords",
    publisher: "Government of Nova Scotia",
    url: "https://novascotia.ca/residential-tenancies-tenants-and-landlords/",
    sourceType: "government_page",
    verificationNote: "Index of official forms, guides and the security-deposit interest calculator.",
  },
  {
    sourceKey: "NS-FORMS",
    title: "Residential tenancy forms",
    publisher: "Government of Nova Scotia",
    url: "https://www.novascotia.ca/residential-tenancy-forms",
    sourceType: "government_page",
    verificationNote: "Official forms including Form J (Application to Director) and Form S (return of security deposit).",
  },
];

export type RuleCategory =
  | "deposit"
  | "fees"
  | "rent_increase"
  | "lease"
  | "inspection"
  | "deposit_return"
  | "privacy"
  | "entry"
  | "payment";

export interface LegalRuleDef {
  ruleKey: string;
  category: RuleCategory;
  logicKey: string;
  title: string;
  summary: string;
  conditions: string;
  citation: string;
  sourceKey: string;
  sourceExcerpt: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  params?: Record<string, number | string | boolean>;
}

export const LEGAL_RULES: LegalRuleDef[] = [
  {
    ruleKey: "NS-DEPOSIT-MAX",
    category: "deposit",
    logicKey: "deposit_max",
    title: "Security deposit maximum: half of one month's rent",
    summary:
      "A landlord in Nova Scotia may not demand, accept or receive a security deposit greater than one half of the monthly rent.",
    conditions: "Applies to residential tenancies under the Residential Tenancies Act. Requires the monthly rent and the deposit amount.",
    citation: "Residential Tenancies Act, R.S.N.S. 1989, c. 401, s. 12(2)",
    sourceKey: "NS-RTA",
    sourceExcerpt:
      "No landlord shall demand, accept or receive from a tenant as a security deposit a sum of money or other value that is in excess of one half of the rent per month that is or would be required to be paid for the residential premises.",
    params: { maxFractionOfMonthlyRent: 0.5 },
  },
  {
    ruleKey: "NS-DEPOSIT-DEEMED",
    category: "deposit",
    logicKey: "upfront_deemed_deposit",
    title: "Extra money beyond rent is treated as a security deposit",
    summary:
      "Money a landlord obtains in addition to rent is deemed to be a security deposit. The Renting Guide adds that money taken before the lease is signed or before rent is due is considered a security deposit. Combined amounts count toward the half-month maximum.",
    conditions: "Applies to holding fees, key fees, pet deposits and similar upfront amounts requested in addition to rent.",
    citation: "Residential Tenancies Act, s. 12(1); Renting Guide (April 2025), Application process",
    sourceKey: "NS-RTA",
    sourceExcerpt:
      "Where a landlord obtains from a tenant any sum of money or other value that is in addition to the rent payable in respect of the residential premises the sum of money or value is deemed to be a security deposit.",
    params: { maxFractionOfMonthlyRent: 0.5 },
  },
  {
    ruleKey: "NS-APPLICATION-FEE",
    category: "fees",
    logicKey: "application_fee",
    title: "Application fees are prohibited",
    summary:
      "No person may demand, accept or receive money from someone who applies, or may apply, to become their tenant in respect of the application.",
    conditions: "Applies to any fee charged to apply for or be considered for a rental unit.",
    citation: "Residential Tenancies Act, s. 6(1); Renting Guide (April 2025)",
    sourceKey: "NS-RTA",
    sourceExcerpt:
      "No person shall demand, accept or receive, from an individual who may, or applies to, become a tenant of that person, a sum of money or other value in consideration of or respecting the application by the individual to become a tenant of that person.",
  },
  {
    ruleKey: "NS-PET-DEPOSIT",
    category: "deposit",
    logicKey: "pet_deposit",
    title: "No additional deposit for pets",
    summary: "The official Renting Guide states a landlord can't charge an additional deposit for pets.",
    conditions: "Applies when a separate pet deposit or pet fee is requested on top of the security deposit.",
    citation: "Renting Guide (April 2025), Landlord rules",
    sourceKey: "NS-RENTING-GUIDE",
    sourceExcerpt: "A landlord can't charge an additional deposit for pets.",
  },
  {
    ruleKey: "NS-RENT-CAP",
    category: "rent_increase",
    logicKey: "rent_cap",
    title: "Temporary 5% rent increase cap for existing tenants (through Dec 31, 2027)",
    summary:
      "A landlord may not increase rent for an existing tenant by more than 5% (2026 and 2027) above what the tenant was legally required to pay in the preceding 12 months, including when signing a new fixed-term lease with an existing tenant for the same unit. It does not apply to new tenants signing a new lease.",
    conditions:
      "Existing tenancy, same residential premises, increase effective Jan 1, 2026 – Dec 31, 2027. Excludes income-based public-housing increases and compliant land-lease community increases.",
    citation: "Interim Residential Rental Increase Cap Act, S.N.S. 2021, c. 22, ss. 3, 4(1)(d)–(e), 4(2), 7(1)",
    sourceKey: "NS-IRRICA",
    sourceExcerpt:
      "a landlord shall not increase the rent payable by an existing tenant by more than … from January 1, 2026, to December 31, 2026, inclusive, five per cent; from January 1, 2027, to December 31, 2027, inclusive, five per cent",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-12-31",
    params: { capPercent: 5 },
  },
  {
    ruleKey: "NS-RENT-INCREASE-NOTICE",
    category: "rent_increase",
    logicKey: "rent_increase_notice",
    title: "Rent increases: once per 12 months, with written notice",
    summary:
      "Rent can be increased only once in a 12-month period. Written notice is required: 4 months for year-to-year and month-to-month leases, 8 weeks for week-to-week. For fixed-term leases, the amounts and dates of increases must be stated in the lease. Rent cannot increase during the first 12 months of a tenancy.",
    conditions: "Applies to residential tenancies (separate rules for land-lease communities and public housing).",
    citation: "Residential Tenancies Act, s. 11; Temporary Rent Cap and Rent Increases (2026)",
    sourceKey: "NS-RTA",
    sourceExcerpt:
      "in no case shall a landlord increase the rent to the tenant more than once in a twelve-month period and without proper notice … In the case of a fixed-term lease, the lease shall indicate the amount and effective dates of any increases",
    params: { noticeMonthsPeriodic: 4, noticeWeeksWeekly: 8 },
  },
  {
    ruleKey: "NS-DEPOSIT-RETURN",
    category: "deposit_return",
    logicKey: "deposit_return",
    title: "Security deposit return within 10 days of the lease ending",
    summary:
      "The deposit plus interest must be returned within 10 days after the lease ends, unless the tenant agreed in writing or the landlord files a security deposit claim with the Director within 10 days. Claims cannot include ordinary wear and tear.",
    conditions: "Requires the tenancy end date. Interest is credited at the regulated rate (use the official calculator).",
    citation: "Residential Tenancies Act, s. 12A(1)–(3), (5); Security Deposit Claims (2026)",
    sourceKey: "NS-RTA",
    sourceExcerpt:
      "the security deposit, together with interest, must be returned to the tenant within ten days of the date of the termination of the lease … A claim for damages from a security deposit must not include any costs associated with ordinary wear and tear",
    params: { returnDays: 10 },
  },
  {
    ruleKey: "NS-LEASE-COPY",
    category: "lease",
    logicKey: "lease_copy",
    title: "Copy of the lease and the Act within 10 days",
    summary:
      "The landlord must provide a copy (paper, electronic or a web link) of the Residential Tenancies Act within 10 days, and the official Form P page states the tenant must receive a copy of the signed lease within 10 days of signing.",
    conditions: "Applies after a lease is signed or the tenant takes possession.",
    citation: "Residential Tenancies Act, s. 7(1), (1B); Standard Form of Lease (Form P) page",
    sourceKey: "NS-RTA",
    sourceExcerpt:
      "No landlord shall grant a lease or possession or occupancy of residential premises to a tenant unless the landlord has provided the tenant with a copy or reproduction of this Act without cost within ten days …",
  },
  {
    ruleKey: "NS-STANDARD-FORM",
    category: "lease",
    logicKey: "standard_form",
    title: "Standard Form of Lease conditions always apply",
    summary:
      "The conditions in Form P apply to any residential lease in Nova Scotia, even if a different written lease or a verbal agreement is used. Lease terms that try to remove those obligations should be reviewed.",
    conditions: "Applies to lease clauses that appear to conflict with statutory conditions.",
    citation: "Standard Form of Lease (Form P) page; Renting Guide (April 2025), Landlord rules",
    sourceKey: "NS-FORM-P",
    sourceExcerpt: "Landlords can choose to use Form P, another form of lease or a verbal agreement, but the conditions in Form P still apply.",
  },
  {
    ruleKey: "NS-LATE-FEE",
    category: "payment",
    logicKey: "late_fee",
    title: "Late rent charge guidance: 1% of monthly rent per month",
    summary:
      "The official Renting Guide states landlords can charge 1% of the monthly rent per month for late rent. A lease charging more should be reviewed; the governing regulation was not independently reviewed by SafeLease.",
    conditions: "Applies to late-payment fees stated in a lease.",
    citation: "Renting Guide (April 2025), Rent",
    sourceKey: "NS-RENTING-GUIDE",
    sourceExcerpt: "Landlords can charge 1% of the monthly rent per month for any late rent.",
    params: { maxPercentPerMonth: 1 },
  },
  {
    ruleKey: "NS-ENTRY-NOTICE",
    category: "entry",
    logicKey: "entry_notice",
    title: "Landlord entry: 24 hours' written notice, daylight hours",
    summary:
      "The Renting Guide states landlords can only enter in an emergency or after giving 24 hours' written notice, with entry during daylight hours.",
    conditions: "Applies to lease clauses about landlord access.",
    citation: "Renting Guide (April 2025), Locks and landlord access",
    sourceKey: "NS-RENTING-GUIDE",
    sourceExcerpt:
      "Landlords can only enter rental units if there's an emergency [or] they have given 24 hours' written notice that they'll be entering the unit and the entry is during daylight hours",
    params: { minNoticeHours: 24 },
  },
  {
    ruleKey: "NS-SIN",
    category: "privacy",
    logicKey: "sin_request",
    title: "Landlords cannot force you to provide your SIN",
    summary:
      "Landlords may ask for standard application information and run credit checks, but are not allowed to force tenants to provide their Social Insurance Number.",
    conditions: "Applies when a Social Insurance Number is requested as a condition of renting.",
    citation: "Renting Guide (April 2025), Application process",
    sourceKey: "NS-RENTING-GUIDE",
    sourceExcerpt: "Landlords can conduct credit and background checks on prospective tenants but are not allowed to force tenants to provide their Social Insurance Number.",
  },
  {
    ruleKey: "NS-CONDITION-REPORT",
    category: "inspection",
    logicKey: "condition_report",
    title: "Rental Unit Condition Report at move-in and move-out",
    summary:
      "Use the official Rental Unit Condition Report at the start and end of a tenancy. Both parties should inspect, sign and keep a copy. If the landlord won't complete one, complete it with a witness who signs. Inspection is recommended under section 19 of the lease; a completed report becomes part of the lease.",
    conditions: "Applies at move-in and move-out.",
    citation: "Rental Unit Condition Report Form page; Renting Guide (April 2025), Moving in",
    sourceKey: "NS-CONDITION-REPORT",
    sourceExcerpt:
      "If a landlord doesn't or won't complete a rental unit condition report, tenants should fill one out in the presence of a witness and have that witness sign the form.",
  },
  {
    ruleKey: "NS-LEASE-TYPES",
    category: "lease",
    logicKey: "lease_type",
    title: "Periodic vs fixed-term leases",
    summary:
      "Periodic leases (year-to-year, month-to-month, week-to-week) renew until proper notice is given. A fixed-term lease has specific start and end dates and does not renew; if the tenant keeps paying rent after the end date, a month-to-month lease begins. Without a written lease, the Standard Form of Lease applies as month-to-month.",
    conditions: "Classification guidance for lease review.",
    citation: "Renting Guide (April 2025), Signing a lease",
    sourceKey: "NS-RENTING-GUIDE",
    sourceExcerpt:
      "There are 2 kinds of leases: periodic and fixed-term … If a tenant continues to pay rent after the end date in the original fixed-term lease, a month-to-month lease begins",
  },
];

export const RULE_BY_KEY = new Map(LEGAL_RULES.map((r) => [r.ruleKey, r]));
export const SOURCE_BY_KEY = new Map(LEGAL_SOURCES.map((s) => [s.sourceKey, s]));

export const LEGAL_DISCLAIMER =
  "SafeLease provides legal information, not legal advice. Rules are summarized from official Nova Scotia sources with the verification date shown. Confirm important decisions with the Residential Tenancies Program (1-800-670-4357) or a legal clinic.";
