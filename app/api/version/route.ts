import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: 'chalkie-v2-progressive-release',
    deployed: true,
    timestamp: new Date().toISOString()
  });
}
