import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { getProfile, updateProfile, deleteAccount } from "../repositories/profiles";
import { NotFound } from "../errors";

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

profileRouter.delete("/", async (req, res, next) => {
  try {
    await deleteAccount(req.userId);
    req.session.destroy(() => {
      res.clearCookie("dash.sid");
      res.sendStatus(204);
    });
  } catch (err) {
    next(err);
  }
});
