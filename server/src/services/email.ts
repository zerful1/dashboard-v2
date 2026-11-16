import { Resend } from "resend";
import { config } from "../config";
import { RESET_TTL_MINUTES } from "@dashboard/shared";

const client = config.RESEND_API_KEY ? new Resend(config.RESEND_API_KEY) : null;

/** Sends a password-reset link, or logs it when no API key is set (the endpoint returns 204 regardless). */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  if (!client) {
    // In production the link is a live credential, so it is not logged.
    if (config.isProduction) {
      console.error("[email] RESEND_API_KEY is not set; a password reset was not sent");
      return;
    }
    console.log(`[email] password reset for ${to}: ${resetUrl}`);
    return;
  }

  try {
    await client.emails.send({
      from: config.RESEND_FROM,
      to,
      subject: "Reset your password",
      text:
        `Reset your password using this link (valid for ${RESET_TTL_MINUTES} minutes):\n\n${resetUrl}\n\n` +
        `If you did not request this, you can ignore this email.`,
    });
  } catch (err) {
    // A delivery failure must not change the response, or the endpoint becomes an enumeration oracle.
    console.error("Password reset email failed to send:", err);
  }
}
