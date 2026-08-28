import type { D1Database } from '@cloudflare/workers-types';
import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { sharedStateSchema } from '../../../db/schema';
import { createInitialState, getSharedState, type SharedDemoState } from '../../reppy-data';

export const dynamic = 'force-dynamic';

function database() {
  return (env as unknown as { DB: D1Database }).DB;
}

async function ensureSchema(db: D1Database) {
  await db.prepare(sharedStateSchema).run();
}

function isSharedState(value: unknown): value is SharedDemoState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<SharedDemoState>;
  return [state.students, state.workouts, state.assignments, state.sessions].every(Array.isArray);
}

export async function GET() {
  const db = database();
  await ensureSchema(db);
  const row = await db.prepare('SELECT payload FROM shared_state WHERE id = ?').bind('reppy').first<{ payload: string }>();

  if (row?.payload) {
    try {
      return NextResponse.json(JSON.parse(row.payload));
    } catch {
      // Replace an unreadable prototype record with a clean shared state below.
    }
  }

  const initial = getSharedState(createInitialState());
  await db.prepare('INSERT OR REPLACE INTO shared_state (id, payload, updated_at) VALUES (?, ?, ?)')
    .bind('reppy', JSON.stringify(initial), new Date().toISOString())
    .run();
  return NextResponse.json(initial);
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isSharedState(body)) {
    return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 });
  }

  const db = database();
  await ensureSchema(db);
  await db.prepare(`
    INSERT INTO shared_state (id, payload, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
  `).bind('reppy', JSON.stringify(body), new Date().toISOString()).run();
  return NextResponse.json({ ok: true });
}
