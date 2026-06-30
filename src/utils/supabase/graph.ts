import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolves a text entity name and type (label) to a UUID from the chronic_nodes table.
 * If the node does not exist, it inserts it.
 */
export async function getOrCreateNodeId(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  label: string
): Promise<string> {
  const cleanName = name.trim();
  const cleanLabel = label.trim().toLowerCase();

  // 1. Try selecting the node first
  const { data } = await supabase
    .from('chronic_nodes')
    .select('id')
    .eq('user_id', userId)
    .eq('label', cleanLabel)
    .eq('name', cleanName)
    .maybeSingle();

  if (data?.id) {
    return data.id;
  }

  // 2. If not found, upsert it (safe against concurrent inserts)
  const { data: upserted, error: upsertErr } = await supabase
    .from('chronic_nodes')
    .upsert(
      {
        user_id: userId,
        name: cleanName,
        label: cleanLabel,
        attributes: {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,label,name' }
    )
    .select('id')
    .single();

  if (upsertErr) {
    // If upsert fails (e.g. concurrent insert race condition), try select once more
    const { data: retryData } = await supabase
      .from('chronic_nodes')
      .select('id')
      .eq('user_id', userId)
      .eq('label', cleanLabel)
      .eq('name', cleanName)
      .maybeSingle();

    if (retryData?.id) {
      return retryData.id;
    }
    throw new Error(`Failed to resolve/upsert node "${cleanName}" (${cleanLabel}): ${upsertErr.message}`);
  }

  return upserted.id;
}
