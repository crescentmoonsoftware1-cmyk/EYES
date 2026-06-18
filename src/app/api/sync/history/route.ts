import { NextResponse } from 'next/server';

import { createClient } from '@/utils/supabase/server';

type SyncRunLogRow = {
  run_id: string;
  platform: string;
  trigger: 'cron' | 'manual' | 'recovery';
  status: 'success' | 'error' | 'skipped';
  duration_ms: number;
  error_message: string | null;
  created_at: string;
};

type SyncHistoryRun = {
  runId: string;
  createdAt: string;
  trigger: 'cron' | 'manual' | 'recovery';
  status: 'success' | 'error' | 'skipped';
  platformCount: number;
  failedPlatforms: string[];
  durationMs: number;
  errorCount: number;
};

function isMissingTable(errorCode?: string) {
  return errorCode === '42P01';
}

function toRunStatus(rows: SyncRunLogRow[]): 'success' | 'error' | 'skipped' {
  if (rows.some((row) => row.status === 'error')) {
    return 'error';
  }

  if (rows.some((row) => row.status === 'success')) {
    return 'success';
  }

  return 'skipped';
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ runs: [] }, { status: 200 });
    }

    const { data, error } = await supabase
      .from('sync_run_logs')
      .select('run_id,platform,trigger,status,duration_ms,error_message,created_at')
      .eq('user_id', authData.user.id)
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) {
      if (isMissingTable(error.code)) {
        return NextResponse.json(
          {
            runs: [],
            warning: 'sync_run_logs table is not available. Apply migration 005_sync_run_logs.sql.',
          },
          { status: 200 }
        );
      }

      throw error;
    }

    const rows = (data ?? []) as SyncRunLogRow[];

    const grouped = new Map<string, SyncRunLogRow[]>();
    rows.forEach((row) => {
      if (!grouped.has(row.run_id)) {
        grouped.set(row.run_id, []);
      }
      grouped.get(row.run_id)?.push(row);
    });

    const runs: SyncHistoryRun[] = Array.from(grouped.entries())
      .map(([runId, runRows]) => {
        const createdAt = runRows
          .map((row) => row.created_at)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

        const failedPlatforms = runRows
          .filter((row) => row.status === 'error')
          .map((row) => row.platform);

        const durationMs = runRows.reduce((total, row) => total + Math.max(0, row.duration_ms || 0), 0);
        const trigger = runRows[0]?.trigger ?? 'cron';

        const platforms = runRows.map((row) => ({
          name: row.platform,
          status: row.status,
          durationMs: row.duration_ms,
          errorMessage: row.error_message,
        }));

        return {
          runId,
          createdAt,
          trigger,
          status: toRunStatus(runRows),
          platformCount: runRows.length,
          failedPlatforms,
          durationMs,
          errorCount: runRows.filter((row) => !!row.error_message).length,
          platforms,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 30);

    return NextResponse.json({
      runs,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('sync history error:', error);
    return NextResponse.json({ runs: [] }, { status: 200 });
  }
}
