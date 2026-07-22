import { NextResponse } from 'next/server';
import { getAllRadarrMovies } from '@/lib/radarr';

export async function GET() {
  try {
    const movies = await getAllRadarrMovies();
    return NextResponse.json({ movies });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
