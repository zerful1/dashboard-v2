import { Resend } from "resend";
import { config } from "../config";
import { RESET_TTL_MINUTES } from "@dashboard/shared";

const client = config.RESEND_API_KEY ? new Resend(config.RESEND_API_KEY) : null;

/**
 * Send a password-reset link.
 *
 * With no API key configured (tests, local development) the link is logged instead
 * of sent. Failing the request would make the whole flow untestable without a
 * third-party account, and the endpoint deliberately returns 204 regardless.
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  if (!client) {
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
    // A delivery failure must not change the HTTP response — that would turn the
    // endpoint back into an enumeration oracle, since unknown addresses never
    // attempt a send at all.
    console.error("Password reset email failed to send:", err);
  }
}
