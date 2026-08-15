import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/requireAuth";
import { hashPassword, verifyPassword, DUMMY_HASH } from "../services/password";
import {
  createUserWithProfile,
  findUserByEmail,
  findUserById,
  findUserByIdWithPassword,
  updatePasswordHash,
} from "../repositories/users";
import { createResetToken, consumeResetToken } from "../repositories/passwordResets";
import { sendPasswordResetEmail } from "../services/email";
import { Unauthorized, BadRequest, Conflict } from "../errors";
import { config } from "../config";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "@dashboard/shared";

export const authRouter = Router();

/**
 * Every message below is written out rather than left to zod's default.
 *
 * The defaults leak the validator's vocabulary into the interface — a user
 * shown "String must contain at least 8 character(s)" is reading about a zod
 * type, not about their password. Spelling the message out also removes the
 * "(s)": the minimum is a fixed number, so the plural is never in question.
 *
 * The object KEYS are the contract, not the messages. `details` is keyed by the
 * field path (see middleware/validate.ts) and the client maps `details.password`
 * onto the Password field, so renaming a key silently breaks that mapping while
 * rewording a message is free.
 */
const emailField = z
  .string()
  .email("Enter a valid email address")
  .max(254, "Email must be 254 characters or fewer");

const passwordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer`);

const credentials = z.object({
  email: emailField,
  password: passwordField,
});

/** Promise wrapper around session.regenerate, which is callback-only. */
function regenerate(req: import("express").Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

authRouter.post("/register", validate({ body: credentials }), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof credentials>;
    const passwordHash = await hashPassword(password);
    const user = await createUserWithProfile(email, passwordHash);

    // Same fixation defence as login: an attacker who planted a known session id
    // in the victim's browser must not still hold it once the account exists.
    await regenerate(req);
    req.session.userId = user.id;

    res.status(201).json({ id: user.id, email: user.email });
  } catch (err) {
    if (err instanceof Conflict) {
      // Deliberately vague at the HTTP boundary. The repository knows the email is
      // taken, but confirming that to an unauthenticated caller turns the signup
      // form into an account-enumeration oracle.
      next(new BadRequest("Could not create that account"));
      return;
    }
    next(err);
  }
});

authRouter.post("/login", validate({ body: credentials }), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof credentials>;
    const user = await findUserByEmail(email);

    // Always hash, even when the email is unknown — otherwise response time
    // reveals whether the account exists. DUMMY_HASH never matches, so the
    // outcome is unchanged; only the timing is.
    const ok = await verifyPassword(user?.password_hash ?? DUMMY_HASH, password);
    if (!user || !ok) {
      next(new Unauthorized("Invalid email or password"));
      return;
    }

    await regenerate(req);
    req.session.userId = user.id;

    res.json({ id: user.id, email: user.email });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      next(err);
      return;
    }
    res.clearCookie("dash.sid");
    res.sendStatus(204);
  });
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await findUserById(req.userId);
    if (!user) {
      // The session outlived its user row — deleted account, or a restored
      // database. Clear it rather than 500ing on every subsequent request.
      req.session.destroy(() => {});
      next(new Unauthorized());
      return;
    }
    res.json({ id: user.id, email: user.email });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Password change and reset
// ---------------------------------------------------------------------------

const changeBody = z.object({
  currentPassword: z
    .string()
    .min(1, "Enter your current password")
    .max(PASSWORD_MAX_LENGTH, `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer`),
  newPassword: passwordField,
});

authRouter.post(
  "/change-password",
  requireAuth,
  validate({ body: changeBody }),
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body as z.infer<typeof changeBody>;

      // The one caller that needs the hash; everything else uses findUserById.
      const user = await findUserByIdWithPassword(req.userId);
      if (!user || !(await verifyPassword(user.password_hash, currentPassword))) {
        next(new Unauthorized("Current password is incorrect"));
        return;
      }

      // updatePasswordHash deletes EVERY session for this user, including the one
      // making the request — so regenerate afterwards to keep the caller signed
      // in. The reverse order would delete the session it just created.
      await updatePasswordHash(user.id, await hashPassword(newPassword));
      await regenerate(req);
      req.session.userId = user.id;

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  "/forgot-password",
  validate({ body: z.object({ email: emailField }) }),
  async (req, res, next) => {
    try {
      const { email } = req.body as { email: string };
      const user = await findUserByEmail(email);

      if (user) {
        const raw = await createResetToken(user.id);
        await sendPasswordResetEmail(
          user.email,
          `${config.APP_ORIGIN}/reset-password?token=${raw}`,
        );
      }

      // Always 204, whether or not the account exists. Any other shape is an
      // account-enumeration oracle.
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

const resetBody = z.object({
  // Not user-typed — it comes from the emailed link — so a length failure means
  // a mangled URL, not something the user can correct by editing a field.
  token: z.string().length(64, "That reset link is not valid"),
  newPassword: passwordField,
});

authRouter.post("/reset-password", validate({ body: resetBody }), async (req, res, next) => {
  try {
    const { token, newPassword } = req.body as z.infer<typeof resetBody>;

    const userId = await consumeResetToken(token);
    if (!userId) {
      next(new BadRequest("That reset link is invalid or has expired"));
      return;
    }

    // Signs out every device. A reset is usually a response to compromise, so
    // leaving other sessions alive would defeat the point.
    await updatePasswordHash(userId, await hashPassword(newPassword));
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});
