import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: 'chalkie-v3-ordered-byok',
    commit: process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || null,
    deployed: true,
    timestamp: new Date().toISOString()
  });
}
