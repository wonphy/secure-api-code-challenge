import { Router } from "express";
import { requirePermission } from "../trust/permission-middleware.js";
import type { AuthorizationMode } from "../config/environment.js";
import { EmailAlreadyExistsError, UserStore } from "./user-store.js";
import { parseUserInput, parseUserUpdateInput } from "./user-validation.js";

function userIdFromRouteParameter(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function createUsersRouter(
  authorizationMode: AuthorizationMode,
  store = new UserStore(),
): Router {
  const router = Router();

  router.get(
    "/",
    requirePermission(authorizationMode, "read:users"),
    (_request, response) => {
      response.status(200).json({ users: store.list() });
    },
  );

  router.get(
    "/:id",
    requirePermission(authorizationMode, "read:user"),
    (request, response) => {
      const id = userIdFromRouteParameter(request.params.id);
      const user = id ? store.get(id) : undefined;
      if (!user) {
        response.status(404).json({ error: "user_not_found" });
        return;
      }

      response.status(200).json({ user });
    },
  );

  router.post(
    "/",
    requirePermission(authorizationMode, "create:user"),
    (request, response) => {
      const input = parseUserInput(request.body);
      if (!input) {
        response.status(400).json({ error: "name_and_email_are_required" });
        return;
      }

      try {
        response.status(201).json({ user: store.create(input) });
      } catch (error: unknown) {
        if (error instanceof EmailAlreadyExistsError) {
          response.status(409).json({ error: "email_already_exists" });
          return;
        }

        throw error;
      }
    },
  );

  router.put(
    "/:id",
    requirePermission(authorizationMode, "update:user"),
    (request, response) => {
      const input = parseUserUpdateInput(request.body);
      if (!input) {
        response.status(400).json({ error: "name_or_email_is_required" });
        return;
      }

      const id = userIdFromRouteParameter(request.params.id);
      if (!id) {
        response.status(404).json({ error: "user_not_found" });
        return;
      }

      let user;
      try {
        user = store.update(id, input);
      } catch (error: unknown) {
        if (error instanceof EmailAlreadyExistsError) {
          response.status(409).json({ error: "email_already_exists" });
          return;
        }

        throw error;
      }
      if (!user) {
        response.status(404).json({ error: "user_not_found" });
        return;
      }

      response.status(200).json({ user });
    },
  );

  router.delete(
    "/:id",
    requirePermission(authorizationMode, "delete:user"),
    (request, response) => {
      const id = userIdFromRouteParameter(request.params.id);
      if (!id || !store.delete(id)) {
        response.status(404).json({ error: "user_not_found" });
        return;
      }

      response.status(204).end();
    },
  );

  return router;
}
