declare global {
  namespace Express {
    interface Locals {
      verifiedUser?: string;
    }
  }
}

export {};
