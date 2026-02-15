import { NextResponse } from 'next/server';

export async function GET() {
  const logLevel = process.env.LOG_LEVEL?.toLowerCase() || 'silent';
  return NextResponse.json({ logLevel });
}
