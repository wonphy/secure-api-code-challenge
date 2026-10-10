export interface User {
  id: string;
  name: string;
  email: string;
}

export interface UserInput {
  name: string;
  email: string;
}

export interface UserUpdateInput {
  name?: string;
  email?: string;
}
