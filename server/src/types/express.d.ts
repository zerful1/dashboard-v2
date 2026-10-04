import "express-session";

declare module "express-session" {
  interface SessionData {
    /** The only place a user identity is ever stored. Set on register and login. */
    userId?: string;
    /** Set only by POST /api/auth/demo: this session may read but never write. */
    demo?: boolean;
  }
}

declare global {
  namespace Express {
    interface Request {
      /**
       * Set by requireAuth, and nowhere else. Typed as required rather than
       * optional so guarded handlers do not need a non-null assertion on every
       * use — the trade-off being that reading it on an unguarded route yields
       * undefined at runtime despite the type. Mount requireAuth at the router
       * level to make that impossible.
       */
      userId: string;
    }
  }
}

export {};
