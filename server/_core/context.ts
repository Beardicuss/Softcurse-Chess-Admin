import { ENV } from "./env";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user: User | null;
};

export async function createContext(
  opts: FetchCreateContextFnOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // If not authenticated, grant mock admin in dev mode so you can test features
    if (!ENV.isProduction) {
      user = {
        id: 1,
        openId: "dev_bypass",
        name: "Dev Admin",
        email: "dev@localhost",
        loginMethod: "local",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date()
      };
    } else {
      user = null;
    }
  }

  return {
    req: opts.req,
    resHeaders: opts.resHeaders,
    user,
  };
}
