import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "./lib/auth-middleware";
import { authRoutes } from "./routes/auth";
import { usersRoutes } from "./routes/users";
import { storesRoutes } from "./routes/stores";
import { proposalsRoutes, proposalsPublicRoutes } from "./routes/proposals";
import { dashboardRoutes } from "./routes/dashboard";
import { reportsRoutes } from "./routes/reports";

const app = new Hono()
  .use("*", cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"] }))
  // Public proposals routes (no auth) — must be before authMiddleware
  .route("/api/proposals", proposalsPublicRoutes)
  .use("*", authMiddleware)
  .basePath("api")
  .get("/health", (c) => c.json({ status: "ok", app: "Axis Capital" }, 200))
  .route("/auth", authRoutes)
  .route("/users", usersRoutes)
  .route("/stores", storesRoutes)
  .route("/proposals", proposalsRoutes)
  .route("/dashboard", dashboardRoutes)
  .route("/reports", reportsRoutes);

export type AppType = typeof app;
export default app;
