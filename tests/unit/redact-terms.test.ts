import { describe, expect, it } from "vitest";
import { termMasker } from "@/server/security/redact";

describe("termMasker (redacted organization views)", () => {
  const mask = termMasker([
    { value: "Daniel Moreau", label: "[name]", splitWords: true },
    { value: "Sarah Whitfield", label: "[name]", splitWords: true },
    { value: "Priya Demo (student)", label: "[renter]", splitWords: true },
    { value: "Message from Daniel", label: "[evidence]" },
  ]);

  it("masks full names, name parts and evidence titles", () => {
    const out = mask("Payment is directed to “Sarah Whitfield”, while the rental contact is Daniel Moreau (landlord message “Message from Daniel”, line 3). Sarah said Priya should pay.");
    expect(out).not.toMatch(/Daniel|Moreau|Sarah|Whitfield|Priya/);
    expect(out).toContain("[evidence]");
    expect(out).toContain("[name]");
    expect(out).toContain("[renter]");
  });

  it("does not mask common words or substrings of other words", () => {
    expect(mask("Visually similar to DEMO listing; the student danielle")).toBe("Visually similar to DEMO listing; the student danielle");
  });

  it("is a no-op with no terms", () => {
    expect(termMasker([])("Daniel Moreau")).toBe("Daniel Moreau");
  });
});
