import { lazy } from "react";
import type { RouteObject } from "react-router-dom";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { AppLayout } from "@/layout/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { AboutPage } from "@/pages/AboutPage";
import { RouteErrorPage } from "@/pages/RouteErrorPage";

/** Pages are lazy chunks under AppLayout's Suspense so the nav stays up; the auth screens stay unsplit. */
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

/** The route table, apart from the router, so tests can build a memory router without the browser one. */
export const routes: RouteObject[] = [
  {
    // A pathless root that owns the one errorElement, so errors don't fall to React Router's own screen.
    errorElement: <RouteErrorPage />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
      { path: "/reset-password", element: <ResetPasswordPage /> },
      // Public, beside /login: the 404 below is inside ProtectedRoute, so a missing public route would hit /login.
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
          // Inside the protected children so an unmatched address keeps the nav; static paths outrank a splat.
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
