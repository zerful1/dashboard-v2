import { lazy } from "react";
import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { AppLayout } from "@/layout/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { AboutPage } from "@/pages/AboutPage";
import { RouteErrorPage } from "@/pages/RouteErrorPage";

/**
 * Every page inside the app shell is a separate chunk.
 *
 * The Suspense boundary lives in AppLayout, around its Outlet, so the nav and
 * sign-out stay on screen while a chunk loads — navigation never blanks. Doing
 * this per-route instead would put a boundary above the layout and take the
 * whole shell down for every transition.
 *
 * `.then` unwrapping is needed because these are named exports and React.lazy
 * expects a module whose `default` is the component.
 *
 * The five unauthenticated screens above are deliberately NOT split. They are
 * small pages with no heavy dependencies, and they sit on the cold-start
 * critical path: splitting them would add a load-the-entry-then-discover-the-
 * chunk round trip to the one route every signed-out visitor hits first.
 */
const HomePage = lazy(() =>
  import("@/pages/HomePage").then((m) => ({ default: m.HomePage })),
);
const WeightPage = lazy(() =>
  import("@/features/weight/WeightPage").then((m) => ({ default: m.WeightPage })),
);
const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const GymPage = lazy(() =>
  import("@/features/gym/GymPage").then((m) => ({ default: m.GymPage })),
);
const NutritionPage = lazy(() =>
  import("@/features/nutrition/NutritionPage").then((m) => ({ default: m.NutritionPage })),
);
const InsightsPage = lazy(() =>
  import("@/features/insights/InsightsPage").then((m) => ({ default: m.InsightsPage })),
);
const HabitsPage = lazy(() =>
  import("@/features/habits/HabitsPage").then((m) => ({ default: m.HabitsPage })),
);
const NotFoundPage = lazy(() =>
  import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);

/** Exported for tests, which build a memory router from the same table. */
export const routes: RouteObject[] = [
  {
    // A pathless root whose only job is to own one errorElement for the whole
    // tree — errors bubble to the nearest ancestor that has one, and without
    // this that ancestor is React Router's own fallback screen. A route with
    // children and no element renders an <Outlet/>, so it costs nothing else.
    errorElement: <RouteErrorPage />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
      { path: "/reset-password", element: <ResetPasswordPage /> },
      // Public, beside /login: the 404 below sits inside ProtectedRoute, so a
      // missing public route sends a signed-out visitor to /login instead.
      { path: "/about", element: <AboutPage /> },
      {
        element: (
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        ),
        children: [
          { path: "/", element: <HomePage /> },
          { path: "/weight", element: <WeightPage /> },
          { path: "/gym", element: <GymPage /> },
          { path: "/nutrition", element: <NutritionPage /> },
          { path: "/insights", element: <InsightsPage /> },
          { path: "/habits", element: <HabitsPage /> },
          { path: "/settings", element: <SettingsPage /> },
          // Inside the protected children, not beside them, so an address that
          // matches nothing still renders with the nav and sign-out around it:
          // a 404 that strands the user is a different thing from one that doesn't.
          // Static paths outrank a splat in React Router's ranking, so the
          // routes above are unaffected by their order relative to this one.
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
