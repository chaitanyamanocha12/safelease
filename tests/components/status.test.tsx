// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EvidenceStatusBadge, ProviderBadge, ToolStatusBadge, DemoBadge } from "@/components/status/status-badge";
import { BarList } from "@/components/charts/bar-list";

vi.mock("@/app/(app)/investigations/actions", () => ({ reviewFindingAction: vi.fn(async () => ({ ok: true, data: null })), correctClaimAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

describe("status communication is never color-only", () => {
  it("renders text labels for every evidence status", () => {
    for (const [s, label] of [["supported", "Supported"], ["contradicted", "Contradicted"], ["warning", "Warning sign"], ["unverified", "Unverified"], ["not_checked", "Not checked"], ["provider_unavailable", "Provider unavailable"], ["needs_review", "Needs review"]] as const) {
      const { unmount } = render(<EvidenceStatusBadge status={s} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });
  it("labels provider and tool statuses", () => {
    render(<><ProviderBadge status="NOT_CONFIGURED" /><ProviderBadge status="DEMO" /><ToolStatusBadge status="provider_unavailable" /><DemoBadge /></>);
    expect(screen.getByText("NOT CONFIGURED")).toBeInTheDocument();
    expect(screen.getAllByText("DEMO").length).toBe(2);
    expect(screen.getByText("Provider unavailable")).toBeInTheDocument();
  });
});

describe("FindingCard", () => {
  it("expands to show source evidence and official citation", async () => {
    const { FindingCard } = await import("@/components/investigation/finding-card");
    render(
      <FindingCard
        investigationId="inv"
        claimsById={new Map([["c1", { value: "$1,200", excerpt: "need the deposit of $1,200 today", locator: "line 3", evidenceTitle: "Message" }]])}
        f={{ id: "f", findingKey: "legal:NS-DEPOSIT-MAX", category: "legal", label: "warning", severity: "caution", lifecycle: "active", title: "Deposit above limit", explanation: "Explained.", recommendation: "Ask.", citationLabel: "RTA s. 12(2)", citationUrl: "https://nslegislature.ca/x.pdf", ruleKey: "NS-DEPOSIT-MAX", ruleVersion: 1, requiresHumanReview: false, humanReview: "not_required", humanReviewNote: null, resolutionNote: null, firstDetectedAt: new Date(), claimIds: ["c1"] }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Deposit above limit/ }));
    expect(screen.getByText(/need the deposit of \$1,200 today/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /RTA s\. 12\(2\)/ })).toHaveAttribute("href", "https://nslegislature.ca/x.pdf");
  });
});

describe("BarList", () => {
  it("provides an accessible table and never shows suppressed numbers", () => {
    render(<BarList title="Themes" data={[{ label: "Deposit", value: "<5" }, { label: "Fees", value: 7 }]} />);
    expect(screen.getByRole("table", { name: "Themes" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Deposit" }).nextSibling?.textContent).toBe("<5");
  });
});
