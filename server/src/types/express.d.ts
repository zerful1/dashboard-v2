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
      /** Set by requireAuth only; typed required, so undefined at runtime on unguarded routes. */
      userId: string;
    }
  }
}

export {};
