// Shared JWT verification using Supabase's new asymmetric keys (JWKS)
// This replaces the deprecated verify_jwt infrastructure flag

import * as jose from "jsr:@panva/jose@6";

const SUPABASE_JWT_ISSUER =
  Deno.env.get("SB_JWT_ISSUER") ??
  Deno.env.get("SUPABASE_URL") + "/auth/v1";

const SUPABASE_JWT_KEYS = jose.createRemoteJWKSet(
  new URL(Deno.env.get("SUPABASE_URL")! + "/auth/v1/.well-known/jwks.json")
);

export function getAuthToken(req: Request): string {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    throw new Error("Missing authorization header");
  }
  const [bearer, token] = authHeader.split(" ");
  if (bearer !== "Bearer") {
    throw new Error("Auth header is not 'Bearer {token}'");
  }
  return token;
}

export async function verifySupabaseJWT(jwt: string) {
  return jose.jwtVerify(jwt, SUPABASE_JWT_KEYS, {
    issuer: SUPABASE_JWT_ISSUER,
  });
}

// Middleware that validates authorization header
export async function withAuth<T>(
  req: Request,
  handler: (req: Request, userId: string) => Promise<T>
): Promise<Response | T> {
  // Skip auth for OPTIONS (CORS preflight)
  if (req.method === "OPTIONS") {
    return handler(req, "");
  }

  try {
    const token = getAuthToken(req);
    const { payload } = await verifySupabaseJWT(token);

    if (!payload.sub) {
      return new Response(JSON.stringify({ error: "Invalid JWT: no subject" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    return handler(req, payload.sub);
  } catch (e) {
    console.error("JWT verification failed:", e);
    return new Response(
      JSON.stringify({
        error: "Invalid JWT",
        details: e instanceof Error ? e.message : "Unknown error"
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
