/**
 * Email delivery. "submitted" is only reported when the provider returns an
 * acceptance id. dev_log writes to the server console and is labeled DEMO —
 * it never counts as delivery.
 */
import { env } from "../env";
import { fetchWithPolicy, safeErrorMessage } from "./http";
import type { Provider, ProviderInfo } from "./types";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export type EmailSendResult =
  | { outcome: "submitted"; providerId: string; providerMessageId: string }
  | { outcome: "logged_not_delivered"; providerId: string }
  | { outcome: "failed"; providerId: string; error: string }
  | { outcome: "not_configured"; providerId: string };

export interface EmailProvider extends Provider {
  send(msg: EmailMessage): Promise<EmailSendResult>;
}

class ResendProvider implements EmailProvider {
  info(): ProviderInfo {
    const e = env();
    const configured = Boolean(e.RESEND_API_KEY && e.EMAIL_FROM);
    return {
      id: "resend",
      category: "email",
      name: "Resend",
      description: "Transactional email delivery (user-approved messages, password reset).",
      capabilities: ["send_email"],
      status: configured ? "LIVE" : "NOT_CONFIGURED",
      statusMessage: configured
        ? "Configured. Delivery is confirmed only by the provider's acceptance response."
        : "Set RESEND_API_KEY and EMAIL_FROM (a verified sender domain).",
      requiredEnv: ["RESEND_API_KEY", "EMAIL_FROM"],
      docsUrl: "https://resend.com/docs/api-reference/emails/send-email",
      timeoutMs: 10000,
      retries: 0,
    };
  }

  async send(msg: EmailMessage): Promise<EmailSendResult> {
    const e = env();
    if (!e.RESEND_API_KEY || !e.EMAIL_FROM) return { outcome: "not_configured", providerId: "resend" };
    try {
      // retries: 0 — sending is not idempotent; never risk a duplicate send.
      const res = await fetchWithPolicy("https://api.resend.com/emails", {
        method: "POST",
        timeoutMs: 10000,
        retries: 0,
        headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: e.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, reply_to: msg.replyTo }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (res.ok && body.id) return { outcome: "submitted", providerId: "resend", providerMessageId: body.id };
      return { outcome: "failed", providerId: "resend", error: `Provider rejected the message (${res.status}).` };
    } catch (err) {
      return { outcome: "failed", providerId: "resend", error: safeErrorMessage(err) };
    }
  }
}

class DevLogProvider implements EmailProvider {
  info(): ProviderInfo {
    return {
      id: "dev_log",
      category: "email",
      name: "Development console log",
      description: "Writes emails to the server console for local development. Nothing is delivered.",
      capabilities: ["log_email"],
      status: "DEMO",
      statusMessage: "DEMO: emails are printed to the server console and NOT delivered.",
      requiredEnv: ["EMAIL_PROVIDER=dev_log"],
    };
  }
  async send(msg: EmailMessage): Promise<EmailSendResult> {
    console.info(
      `\n[safelease dev email — NOT DELIVERED]\nTo: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}\n[end dev email]\n`,
    );
    return { outcome: "logged_not_delivered", providerId: "dev_log" };
  }
}

class NoEmailProvider implements EmailProvider {
  info(): ProviderInfo {
    return {
      id: "none",
      category: "email",
      name: "Email delivery",
      description: "No email provider configured. Drafts can still be copied and sent manually.",
      capabilities: [],
      status: "NOT_CONFIGURED",
      statusMessage: "Set EMAIL_PROVIDER=resend with RESEND_API_KEY and EMAIL_FROM to enable sending.",
      requiredEnv: ["EMAIL_PROVIDER", "RESEND_API_KEY", "EMAIL_FROM"],
    };
  }
  async send(): Promise<EmailSendResult> {
    return { outcome: "not_configured", providerId: "none" };
  }
}

export function getEmailProvider(): EmailProvider {
  switch (env().EMAIL_PROVIDER) {
    case "resend":
      return new ResendProvider();
    case "dev_log":
      return new DevLogProvider();
    default:
      return new NoEmailProvider();
  }
}

export function passwordResetAvailable(): boolean {
  const s = getEmailProvider().info().status;
  return s === "LIVE" || s === "DEMO";
}
