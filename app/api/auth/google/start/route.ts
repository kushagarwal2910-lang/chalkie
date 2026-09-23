import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { driveConfigured } from "@/lib/drive-session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!driveConfigured()) return NextResponse.redirect(new URL("/?drive=unavailable", request.url));
  const state = crypto.randomBytes(24).toString("base64url");
  const redirectUri = `${request.nextUrl.origin}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  const cookieStore = await cookies();
  cookieStore.set("chalkie_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
