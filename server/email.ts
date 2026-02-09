import nodemailer from "nodemailer";
import type { Project } from "@shared/schema";

// SMTP configuration from environment variables
// Works with any provider: Gmail, Outlook, Brevo, Mailgun, custom SMTP, etc.
//
// Required env vars:
//   SMTP_HOST     — e.g. smtp.gmail.com, smtp-relay.brevo.com
//   SMTP_PORT     — e.g. 587 (TLS) or 465 (SSL)
//   SMTP_USER     — login username
//   SMTP_PASS     — login password or app-specific password
//   SMTP_FROM     — sender address, e.g. "Vibe Index <digest@vibeindex.com>"
//
// Optional:
//   APP_URL       — base URL for links in emails, defaults to http://localhost:5000

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

export function isEmailConfigured(): boolean {
  return !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
}

function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.REPLIT_DOMAINS) return `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`;
  return "http://localhost:5000";
}

// Render a digest email as HTML
export function renderDigestEmail(opts: {
  username: string;
  frequency: string;
  projects: Project[];
  unsubscribeToken: string;
}): string {
  const { username, frequency, projects: projectList, unsubscribeToken } = opts;
  const appUrl = getAppUrl();
  const unsubUrl = `${appUrl}/api/unsubscribe/${unsubscribeToken}`;

  const projectRows = projectList.map((p) => {
    const tags = p.tags ? p.tags.split(",").slice(0, 3).map(t => t.trim()).join(" · ") : "";
    const pricing = p.pricingModel === "free" ? "Free" : p.pricingModel || "";
    return `
      <tr>
        <td style="padding: 16px 0; border-bottom: 1px solid #eee;">
          <a href="${appUrl}/project/${p.id}" style="color: #111; text-decoration: none; font-size: 16px; font-weight: 600;">${escapeHtml(p.name || "Untitled")}</a>
          ${pricing ? `<span style="display: inline-block; margin-left: 8px; padding: 2px 6px; font-size: 11px; background: #f0f0f0; border-radius: 4px;">${pricing}</span>` : ""}
          <div style="color: #555; font-size: 13px; margin-top: 4px; line-height: 1.5;">${escapeHtml(p.shortDescription || "")}</div>
          ${tags ? `<div style="color: #999; font-size: 11px; margin-top: 4px;">${escapeHtml(tags)}</div>` : ""}
        </td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #f7f7f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f7f7f7;">
    <tr><td align="center" style="padding: 24px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background: #fff; border-radius: 8px; overflow: hidden;">
        <!-- Header -->
        <tr><td style="padding: 32px 24px 16px; text-align: center;">
          <div style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">Vibe Index</div>
          <div style="color: #888; font-size: 12px; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px;">Your ${frequency} digest</div>
        </td></tr>
        <!-- Greeting -->
        <tr><td style="padding: 0 24px 16px;">
          <div style="font-size: 14px; color: #333;">Hey ${escapeHtml(username)}, here are ${projectList.length} new project${projectList.length !== 1 ? "s" : ""} matching your interests:</div>
        </td></tr>
        <!-- Projects -->
        <tr><td style="padding: 0 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${projectRows}
          </table>
        </td></tr>
        <!-- CTA -->
        <tr><td style="padding: 24px; text-align: center;">
          <a href="${appUrl}" style="display: inline-block; padding: 10px 24px; background: #111; color: #fff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 600;">Discover More Projects</a>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding: 16px 24px 24px; border-top: 1px solid #eee; text-align: center;">
          <div style="font-size: 11px; color: #999; line-height: 1.6;">
            You're receiving this because you subscribed to ${frequency} digests on Vibe Index.<br>
            <a href="${appUrl}/subscribe" style="color: #666;">Change preferences</a> · <a href="${unsubUrl}" style="color: #666;">Unsubscribe</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Send an email using the configured SMTP transport
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; error?: string }> {
  const t = getTransporter();
  if (!t) {
    return { success: false, error: "SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS." };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@vibeindex.com";

  try {
    await t.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown SMTP error";
    console.error("[email] Send failed:", message);
    return { success: false, error: message };
  }
}
