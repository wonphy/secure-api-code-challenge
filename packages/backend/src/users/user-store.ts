import { randomUUID } from "node:crypto";
import type { User, UserInput, UserUpdateInput } from "./user.js";

export class EmailAlreadyExistsError extends Error {
  constructor() {
    super("email_already_exists");
    this.name = "EmailAlreadyExistsError";
  }
}

/** In-memory user storage for the proof of concept. */
export class UserStore {
  private readonly users = new Map<string, User>();
  // Avoid a full scan when enforcing the normalized email uniqueness rule.
  private readonly userIdsByEmail = new Map<string, string>();

  list(): User[] {
    return [...this.users.values()];
  }

  get(id: string): User | undefined {
    return this.users.get(id);
  }

  create(input: UserInput): User {
    if (this.userIdsByEmail.has(input.email)) {
      throw new EmailAlreadyExistsError();
    }

    // Retain a hard in-memory primary-key guarantee if UUID generation collides.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const id = randomUUID();
      if (!this.users.has(id)) {
        const user = { id, ...input };
        this.users.set(id, user);
        this.userIdsByEmail.set(user.email, user.id);
        return user;
      }
    }

    throw new Error("unable_to_allocate_user_id");
  }

  update(id: string, input: UserUpdateInput): User | undefined {
    const existingUser = this.users.get(id);
    if (!existingUser) {
      return undefined;
    }

    const email = input.email ?? existingUser.email;
    const existingEmailOwner = this.userIdsByEmail.get(email);
    if (existingEmailOwner && existingEmailOwner !== id) {
      throw new EmailAlreadyExistsError();
    }

    const user: User = {
      id,
      name: input.name ?? existingUser.name,
      email,
    };
    this.users.set(id, user);
    if (existingUser.email !== user.email) {
      this.userIdsByEmail.delete(existingUser.email);
      this.userIdsByEmail.set(user.email, id);
    }
    return user;
  }

  delete(id: string): boolean {
    const user = this.users.get(id);
    if (!user) {
      return false;
    }

    this.users.delete(id);
    this.userIdsByEmail.delete(user.email);
    return true;
  }
}
