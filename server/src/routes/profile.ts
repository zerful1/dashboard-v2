import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { getProfile, updateProfile, deleteAccount } from "../repositories/profiles";
import { findUserByIdWithPassword } from "../repositories/users";
import { verifyPassword } from "../services/password";
import { NotFound, Unauthorized } from "../errors";
import { isTimeZone } from "../validation";
import { PASSWORD_MAX_LENGTH } from "@dashboard/shared";

export const profileRouter = Router();

// Guards the whole router, so a later route is protected by default.
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
    // A zone both sides know: copyDay hands it to Postgres (AT TIME ZONE), where an unknown name was a 500.
    timezone: z.string().min(1).max(60).refine(isTimeZone, "Unknown time zone").optional(),
    // Optional TDEE details: the DB CHECKs repeat these bounds, and null clears a detail.
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

// Not `passwordField`: this checks a password, so the length policy must not apply to a legacy short one.
const deleteBody = z.object({ password: z.string().min(1).max(PASSWORD_MAX_LENGTH) });

// Deleting cascades through every owned table, so the password proves the account holder is asking.
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
