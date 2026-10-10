import type { UserInput, UserUpdateInput } from "./user.js";

interface UnknownUserInput {
  name?: unknown;
  email?: unknown;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  return value.trim();
}

function asObject(value: unknown): UnknownUserInput | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as UnknownUserInput;
}

export function parseUserInput(value: unknown): UserInput | undefined {
  const input = asObject(value);
  if (!input) {
    return undefined;
  }

  const name = asNonEmptyString(input.name);
  const email = asNonEmptyString(input.email);
  if (!name || !email) {
    return undefined;
  }

  return { name, email: email.toLowerCase() };
}

export function parseUserUpdateInput(
  value: unknown,
): UserUpdateInput | undefined {
  const input = asObject(value);
  if (!input) {
    return undefined;
  }

  const hasName = "name" in input;
  const hasEmail = "email" in input;
  if (!hasName && !hasEmail) {
    return undefined;
  }

  const name = hasName ? asNonEmptyString(input.name) : undefined;
  const email = hasEmail ? asNonEmptyString(input.email) : undefined;
  if ((hasName && !name) || (hasEmail && !email)) {
    return undefined;
  }

  return { name, email: email?.toLowerCase() };
}
