import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { getProfile, updateProfile, deleteAccount } from "../repositories/profiles";
import { findUserByIdWithPassword } from "../repositories/users";
import { verifyPassword } from "../services/password";
import { NotFound, Unauthorized } from "../errors";
import { PASSWORD_MAX_LENGTH } from "@dashboard/shared";

export const profileRouter = Router();

// Guards the whole router, so a route added later is protected by default rather
// than by remembering to add the middleware.
profileRouter.use(requireAuth);

profileRouter.get("/", async (req, res, next) => {
  try {
    const profile = await getProfile(req.userId);
    if (!profile) {
      next(new NotFound("Profile not found"));
      return;
    }
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

const patchBody = z
  .object({
    display_name: z.string().trim().max(60).optional(),
    units: z.enum(["kg", "lb"]).optional(),
    // A permissive check; the value is only ever passed to Intl, which throws on
    // a genuinely unknown zone at the point of use.
    timezone: z.string().min(1).max(60).optional(),
    // Optional body details for the nutrition TDEE hint. The DB CHECKs repeat
    // these bounds, so a request that slipped past here would still fail.
    // Nullable: null clears a detail (#17 review 11).
    height_cm: z.number().min(100).max(250).nullable().optional(),
    birth_year: z.number().int().min(1900).max(2100).nullable().optional(),
    sex: z.enum(["male", "female"]).nullable().optional(),
    activity_level: z.enum(["sedentary", "light", "moderate", "very", "extra"]).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

profileRouter.patch("/", validate({ body: patchBody }), async (req, res, next) => {
  try {
    const profile = await updateProfile(req.userId, req.body as z.infer<typeof patchBody>);
    if (!profile) {
      next(new NotFound("Profile not found"));
      return;
    }
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

// Not `passwordField`: this CHECKS a password, it does not set one, so the
// length policy must not apply - a legacy short password still has to work.
const deleteBody = z.object({ password: z.string().min(1).max(PASSWORD_MAX_LENGTH) });

// Deleting cascades through every table the account owns. A bare authenticated
// request let anyone at an unlocked device erase it with one click and a
// confirm; the password proves it is the account holder asking.
profileRouter.delete("/", validate({ body: deleteBody }), async (req, res, next) => {
  try {
    const { password } = req.body as z.infer<typeof deleteBody>;
    const user = await findUserByIdWithPassword(req.userId);
    if (!user || !(await verifyPassword(user.password_hash, password))) {
      next(new Unauthorized("Password is incorrect"));
      return;
    }
    await deleteAccount(req.userId);
    req.session.destroy(() => {
      res.clearCookie("dash.sid");
      res.sendStatus(204);
    });
  } catch (err) {
    next(err);
  }
});
