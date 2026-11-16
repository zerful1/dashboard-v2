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
import { Unauthorized, BadRequest, Conflict, Forbidden } from "../errors";
import { config } from "../config";
import { signupAllowed, type SignupPolicy } from "../signups";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, todayISO } from "@dashboard/shared";
import { DEMO_SESSION_MS, findOrCreateDemoUser, isDemoEmail } from "../demo/account";
import { refreshDemoIfStale, DEMO_TIMEZONE } from "../demo/refresh";

export const authRouter = Router();

/** Messages are spelled out, not zod's defaults; the KEYS are the contract (`details` keys by path). */
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

    // Before hashing and the database; a plain 403 shows allowlist membership, fine: only a demo address.
    if (!signupAllowed(req.app.locals.signupPolicy as SignupPolicy, email)) {
      next(new Forbidden("Sign-ups are closed"));
      return;
    }
    if (isDemoEmail(email)) {
      next(new Conflict("An account with that email already exists"));
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await createUserWithProfile(email, passwordHash);

    // Same fixation defence as login: a planted session id must not survive the account's creation.
    await regenerate(req);
    req.session.userId = user.id;

    res.status(201).json({ id: user.id, email: user.email });
  } catch (err) {
    if (err instanceof Conflict) {
      // Deliberately vague: confirming the email is taken would make signup an account-enumeration oracle.
      next(new BadRequest("Could not create that account"));
      return;
    }
    next(err);
  }
});

authRouter.post("/login", validate({ body: credentials }), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof credentials>;
    // The demo is reachable only through /demo, so here it is an unknown address, dummy hash and all.
    const user = isDemoEmail(email) ? null : await findUserByEmail(email);

    // Always hash, even for an unknown email, or response time reveals whether the account exists.
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

// The read-only demo needs no password; server time in the demo's own timezone decides staleness.
authRouter.post("/demo", async (req, res, next) => {
  try {
    const user = await findOrCreateDemoUser();
    await refreshDemoIfStale(user.id, todayISO(DEMO_TIMEZONE));
    await regenerate(req);
    req.session.userId = user.id;
    req.session.demo = true;
    req.session.cookie.maxAge = DEMO_SESSION_MS;
    res.json({ id: user.id, email: user.email, demo: true });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await findUserById(req.userId);
    if (!user) {
      // The session outlived its user row: clear it rather than 500 on every later request.
      req.session.destroy(() => {});
      next(new Unauthorized());
      return;
    }
    res.json({ id: user.id, email: user.email, demo: req.session.demo === true });
  } catch (err) {
    next(err);
  }
});

// Password change and reset

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

      // updatePasswordHash deletes every session including this one, so regenerate afterwards, not before.
      await updatePasswordHash(user.id, await hashPassword(newPassword));
      await regenerate(req);
      req.session.userId = user.id;

      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

/** Every answer waits this long, so sending an email can't time-reveal that an account exists. */
export const FORGOT_FLOOR_MS = 1000;

authRouter.post(
  "/forgot-password",
  validate({ body: z.object({ email: emailField }) }),
  async (req, res, next) => {
    try {
      const { email } = req.body as { email: string };
      const floor = new Promise((resolve) => setTimeout(resolve, FORGOT_FLOOR_MS));
      // No reset for the demo: it would hand it a usable password.
      const user = isDemoEmail(email) ? null : await findUserByEmail(email);

      if (user) {
        const raw = await createResetToken(user.id);
        await sendPasswordResetEmail(
          user.email,
          `${config.APP_ORIGIN}/reset-password?token=${raw}`,
        );
      }
      await floor;

      // Always 204, whether or not the account exists, or this is an account-enumeration oracle.
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

const resetBody = z.object({
  // Comes from the emailed link, so a length failure means a mangled URL, not something the user can edit.
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

    // Signs out every device: a reset is usually a response to compromise.
    await updatePasswordHash(userId, await hashPassword(newPassword));
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});
