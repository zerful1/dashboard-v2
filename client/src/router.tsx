import { createBrowserRouter } from "react-router-dom";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { AppLayout } from "@/layout/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { HomePage } from "@/pages/HomePage";
import { SettingsPage } from "@/pages/SettingsPage";
import { WeightPage } from "@/features/weight/WeightPage";
import { ComingSoonPage } from "@/pages/ComingSoonPage";
import { RouteErrorPage } from "@/pages/RouteErrorPage";

export const router = createBrowserRouter([
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
      {
        element: (
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        ),
        children: [
          { path: "/", element: <HomePage /> },
          { path: "/weight", element: <WeightPage /> },
          { path: "/settings", element: <SettingsPage /> },
          // Inside the protected children, not beside them, so an address that
          // matches nothing still renders with the nav and sign-out around it.
          // Most of NAV_ITEMS points here for now: those sections 404 on
          // purpose — showing the shape of the app beats hiding it — but a 404
          // that strands the user is a different thing from one that doesn't.
          // Static paths outrank a splat in React Router's ranking, so the
          // routes above are unaffected by their order relative to this one.
          { path: "*", element: <ComingSoonPage /> },
        ],
      },
    ],
  },
]);
