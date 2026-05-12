import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

import JSZip from 'jszip';

import { createClient } from '@/utils/supabase/server';

type ExportRowEvent = {
  id: string;
  platform: string;
  source_id: string;
  event_type: string | null;
  title: string | null;
  content: string | null;
  author: string | null;
  timestamp: string | null;
  metadata: unknown;
  is_flagged: boolean | null;
  flag_severity: string | null;
};

function exportFileName() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `the-eyes-export-${yyyy}-${mm}-${dd}.json`;
}

function exportZipFileName() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `the-eyes-export-bundle-${yyyy}-${mm}-${dd}.zip`;
}

function exportCsvFileName(dataset: string) {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `the-eyes-export-${dataset}-${yyyy}-${mm}-${dd}.csv`;
}

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) return '';
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : JSON.stringify(value);

  if (/[,"\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function toCsv(columns: string[], rows: Array<Record<string, unknown>>) {
  const header = columns.join(',');
  const body = rows
    .map((row) => columns.map((column) => escapeCsvValue(row[column])).join(','))
    .join('\n');

  return `${header}\n${body}`;
}

type CsvDataset = 'raw_events' | 'topics' | 'sync_status' | 'connections';

type ExportFormat = 'json' | 'csv' | 'zip';

type SignedExportPayload = {
  userId: string;
  format: ExportFormat;
  dataset: CsvDataset;
  exp: number;
};

const SIGNED_EXPORT_TTL_SECONDS = Math.max(120, Math.floor(Number(process.env.EXPORT_SIGNED_URL_TTL_SECONDS || 900)));

function readExportFormat(value: string | null): ExportFormat {
  const normalized = (value || '').toLowerCase();
  if (normalized === 'csv') return 'csv';
  if (normalized === 'zip') return 'zip';
  return 'json';
}

function getExportSigningKey() {
  const key = process.env.EXPORT_SIGNING_KEY || process.env.TOKEN_ENCRYPTION_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) return null;
  return key;
}

function buildSignedExportToken(payload: SignedExportPayload, signingKey: string) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', signingKey).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifySignedExportToken(token: string, signingKey: string): SignedExportPayload | null {
  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = crypto.createHmac('sha256', signingKey).update(encodedPayload).digest('base64url');

  const expectedBuffer = Buffer.from(expectedSignature);
  const providedBuffer = Buffer.from(providedSignature);
  if (expectedBuffer.length !== providedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SignedExportPayload;
    if (!payload.userId || !payload.exp || !payload.format || !payload.dataset) {
      return null;
    }

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function readCsvDataset(value: string | null): CsvDataset {
  if (value === 'topics') return 'topics';
  if (value === 'sync_status') return 'sync_status';
  if (value === 'connections') return 'connections';
  return 'raw_events';
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestFormat = readExportFormat(url.searchParams.get('format'));
    const requestDataset = readCsvDataset(url.searchParams.get('dataset'));
    const signedToken = url.searchParams.get('signed');
    const signedUrlRequested = url.searchParams.get('delivery') === 'signed-url';

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let format: ExportFormat = requestFormat;
    let csvDataset: CsvDataset = requestDataset;

    if (signedToken) {
      const signingKey = getExportSigningKey();
      if (!signingKey) {
        return NextResponse.json(
          { error: 'Signed export verification is unavailable. Set EXPORT_SIGNING_KEY and retry.' },
          { status: 500 }
        );
      }

      const signedPayload = verifySignedExportToken(signedToken, signingKey);
      if (!signedPayload) {
        return NextResponse.json({ error: 'Invalid or expired signed export token.' }, { status: 401 });
      }

      if (signedPayload.userId !== user.id) {
        return NextResponse.json({ error: 'Signed export token does not match authenticated user.' }, { status: 403 });
      }

      format = signedPayload.format;
      csvDataset = signedPayload.dataset;
    }

    if (!signedToken && signedUrlRequested) {
      const signingKey = getExportSigningKey();
      if (!signingKey) {
        return NextResponse.json(
          { error: 'Signed export delivery is unavailable. Set EXPORT_SIGNING_KEY and retry.' },
          { status: 500 }
        );
      }

      const expiresAtEpoch = Math.floor(Date.now() / 1000) + SIGNED_EXPORT_TTL_SECONDS;
      const token = buildSignedExportToken(
        {
          userId: user.id,
          format,
          dataset: csvDataset,
          exp: expiresAtEpoch,
        },
        signingKey
      );

      const downloadUrl = new URL('/api/data/export', url);
      downloadUrl.searchParams.set('signed', token);

      return NextResponse.json({
        signed: true,
        format,
        dataset: csvDataset,
        expiresAt: new Date(expiresAtEpoch * 1000).toISOString(),
        downloadUrl: downloadUrl.toString(),
      });
    }

    const [
      { data: profile },
      { data: rawEvents },
      { data: topics },
      { data: syncStatus },
      { data: tokenPlatforms },
      { count: embeddingCount },
    ] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('name,avatar,plan,joined_date,memories_indexed,created_at,updated_at')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('memories')
        .select('id,platform,source_id,event_type,title,content,author,timestamp,metadata,is_flagged,flag_severity')
        .eq('user_id', user.id)
        .not('content', 'is', null)
        .order('timestamp', { ascending: false }),
      supabase
        .from('topics')
        .select('id,title,description,event_ids,sentiment,connection_count,created_at,updated_at')
        .eq('user_id', user.id),
      supabase
        .from('sync_status')
        .select('platform,last_sync_at,next_sync_at,sync_progress,total_items,status,error_message,created_at,updated_at')
        .eq('user_id', user.id),
      supabase
        .from('oauth_tokens')
        .select('platform,scope,created_at,updated_at,expires_at')
        .eq('user_id', user.id),
      supabase
        .from('memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
    ]);

    const events = (rawEvents ?? []) as ExportRowEvent[];

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email ?? null,
      },
      profile: profile ?? null,
      summary: {
        rawEventCount: events.length,
        embeddingCount: embeddingCount ?? 0,
        topicCount: topics?.length ?? 0,
        connectedPlatformCount: tokenPlatforms?.length ?? 0,
      },
      connectedPlatforms: tokenPlatforms ?? [],
      syncStatus: syncStatus ?? [],
      topics: topics ?? [],
      rawEvents: events,
    };

    if (format === 'csv') {
      if (csvDataset === 'raw_events') {
        const columns = [
          'id',
          'platform',
          'source_id',
          'event_type',
          'title',
          'content',
          'author',
          'timestamp',
          'is_flagged',
          'flag_severity',
          'metadata',
        ];

        const csvRows = events.map((event) => ({
          ...event,
          metadata: event.metadata ?? {},
        }));

        const csv = toCsv(columns, csvRows);
        return new NextResponse(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${exportCsvFileName(csvDataset)}"`,
            'Cache-Control': 'no-store',
          },
        });
      }

      if (csvDataset === 'topics') {
        const topicRows = (topics ?? []).map((topic) => ({
          id: (topic as { id?: string }).id ?? '',
          title: (topic as { title?: string }).title ?? '',
          description: (topic as { description?: string | null }).description ?? '',
          sentiment: (topic as { sentiment?: string | null }).sentiment ?? '',
          connection_count: (topic as { connection_count?: number | null }).connection_count ?? 0,
          event_ids: (topic as { event_ids?: unknown }).event_ids ?? [],
          created_at: (topic as { created_at?: string | null }).created_at ?? '',
          updated_at: (topic as { updated_at?: string | null }).updated_at ?? '',
        }));

        const csv = toCsv(
          ['id', 'title', 'description', 'sentiment', 'connection_count', 'event_ids', 'created_at', 'updated_at'],
          topicRows
        );

        return new NextResponse(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${exportCsvFileName(csvDataset)}"`,
            'Cache-Control': 'no-store',
          },
        });
      }

      if (csvDataset === 'sync_status') {
        const syncRows = (syncStatus ?? []).map((status) => ({
          platform: (status as { platform?: string }).platform ?? '',
          status: (status as { status?: string | null }).status ?? '',
          sync_progress: (status as { sync_progress?: number | null }).sync_progress ?? 0,
          total_items: (status as { total_items?: number | null }).total_items ?? 0,
          last_sync_at: (status as { last_sync_at?: string | null }).last_sync_at ?? '',
          next_sync_at: (status as { next_sync_at?: string | null }).next_sync_at ?? '',
          error_message: (status as { error_message?: string | null }).error_message ?? '',
          created_at: (status as { created_at?: string | null }).created_at ?? '',
          updated_at: (status as { updated_at?: string | null }).updated_at ?? '',
        }));

        const csv = toCsv(
          [
            'platform',
            'status',
            'sync_progress',
            'total_items',
            'last_sync_at',
            'next_sync_at',
            'error_message',
            'created_at',
            'updated_at',
          ],
          syncRows
        );

        return new NextResponse(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${exportCsvFileName(csvDataset)}"`,
            'Cache-Control': 'no-store',
          },
        });
      }

      const connectionRows = (tokenPlatforms ?? []).map((platform) => ({
        platform: (platform as { platform?: string }).platform ?? '',
        scope: (platform as { scope?: string | null }).scope ?? '',
        expires_at: (platform as { expires_at?: string | null }).expires_at ?? '',
        created_at: (platform as { created_at?: string | null }).created_at ?? '',
        updated_at: (platform as { updated_at?: string | null }).updated_at ?? '',
      }));

      const csv = toCsv(['platform', 'scope', 'expires_at', 'created_at', 'updated_at'], connectionRows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${exportCsvFileName(csvDataset)}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (format === 'zip') {
      const zip = new JSZip();
      zip.file(
        'manifest.json',
        JSON.stringify(
          {
            version: 1,
            exportedAt: new Date().toISOString(),
            user: {
              id: user.id,
              email: user.email ?? null,
            },
            summary: payload.summary,
            notes: [
              'This ZIP bundle contains JSON snapshots of your export payload.',
              'Use /api/data/export?format=csv&dataset=raw_events for spreadsheet-friendly row export.',
            ],
          },
          null,
          2
        )
      );
      zip.file('profile.json', JSON.stringify(payload.profile, null, 2));
      zip.file('connected-platforms.json', JSON.stringify(payload.connectedPlatforms, null, 2));
      zip.file('sync-status.json', JSON.stringify(payload.syncStatus, null, 2));
      zip.file('topics.json', JSON.stringify(payload.topics, null, 2));
      zip.file('raw-events.json', JSON.stringify(payload.rawEvents, null, 2));

      const rawEventColumns = [
        'id',
        'platform',
        'source_id',
        'event_type',
        'title',
        'content',
        'author',
        'timestamp',
        'is_flagged',
        'flag_severity',
        'metadata',
      ];
      zip.file(
        'raw-events.csv',
        toCsv(
          rawEventColumns,
          events.map((event) => ({
            ...event,
            metadata: event.metadata ?? {},
          }))
        )
      );

      const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      const zipArrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      ) as ArrayBuffer;

      return new NextResponse(zipArrayBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${exportZipFileName()}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFileName()}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('export data error:', error);
    return NextResponse.json({ error: 'Failed to export data.' }, { status: 500 });
  }
}
