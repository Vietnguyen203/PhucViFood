import { createBrowserRouter, Navigate } from "react-router";
import CTVPage from "./pages/CTVPage";
import HomePage from "./pages/HomePage";

const router = createBrowserRouter([
  {
    path: "/",
    Component: HomePage,
  },
  {
    path: "/ctv",
    Component: CTVPage,
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);

export default router;
