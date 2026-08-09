import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/requireAuth";
import { hashPassword, verifyPassword, DUMMY_HASH } from "../services/password";
import {
  createUserWithProfile,
  findUserByEmail,
  findUserById,
} from "../repositories/users";
import { Unauthorized, BadRequest, Conflict } from "../errors";

export const authRouter = Router();

const credentials = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
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
