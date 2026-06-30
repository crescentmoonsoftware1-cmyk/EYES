import dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });

import { createClient } from '@supabase/supabase-js';
import { getOrCreateNodeId } from '../src/utils/supabase/graph';
import fs from 'fs';
import path from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const USER_ID = '4d2f3e3c-b834-43fc-852a-c3cdbb535b68';
const EMAIL = 'thomasshelby251890@gmail.com';
const ENGINE_URL = 'http://127.0.0.1:8000/extract';
const MAX_RECORDS = 30;

interface EngineEntity {
  label: string;
  text: string;
  score: number;
  start: number;
  end: number;
}

interface EngineRelation {
  head: string;
  label: string;
  tail: string;
  score: number;
}

async function runVolumeTest() {
  console.log(`[Volume Test] Fetching Gmail memories for user: ${EMAIL} (${USER_ID})...`);
  
  const { data: records, error: fetchErr } = await supabase
    .from('memories')
    .select('id, title, content, timestamp')
    .eq('user_id', USER_ID)
    .eq('platform', 'gmail')
    .order('timestamp', { ascending: false });

  if (fetchErr || !records) {
    console.error('[Volume Test] Failed to fetch memories:', fetchErr?.message);
    return;
  }

  const eligible = records.filter(r => r.content && r.content.trim().length > 0);
  console.log(`[Volume Test] Found ${records.length} total Gmail records, ${eligible.length} are eligible.`);
  
  const testSample = eligible.slice(0, MAX_RECORDS);
  console.log(`[Volume Test] Running volume test on a sample of ${testSample.length} records sequentially...`);

  let totalEntities = 0;
  let totalRelations = 0;
  let edgesWritten = 0;
  let errorsCount = 0;
  
  const entityTypeCounts: Record<string, number> = {};
  const relationTypeCounts: Record<string, number> = {};
  const reportSamples: any[] = [];

  for (let idx = 0; idx < testSample.length; idx++) {
    const record = testSample[idx];
    const title = record.title || 'No Subject';
    const content = record.content;
    const contentToExtract = [record.title, record.content].filter(Boolean).join('\n').slice(0, 1000);
    
    console.log(`[${idx + 1}/${testSample.length}] Processing: "${title.slice(0, 45)}" (${record.id})`);

    try {
      // 1. Call FastAPI GLiNER engine
      const response = await fetch(ENGINE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: USER_ID,
          platform_id: 'gmail',
          text: contentToExtract,
          threshold: 0.6
        })
      });

      if (!response.ok) {
        console.warn(`  [Engine Error] Status: ${response.status}`);
        errorsCount++;
        continue;
      }

      const data = await response.json() as { entities: EngineEntity[]; relations: EngineRelation[] };
      const entities = data.entities || [];
      const relations = data.relations || [];

      console.log(`  Extracted: ${entities.length} entities, ${relations.length} relations`);

      totalEntities += entities.length;
      totalRelations += relations.length;

      // Update type counts
      for (const ent of entities) {
        entityTypeCounts[ent.label] = (entityTypeCounts[ent.label] || 0) + 1;
      }
      for (const rel of relations) {
        relationTypeCounts[rel.label] = (relationTypeCounts[rel.label] || 0) + 1;
      }

      // 2. Insert relations to chronic_edges using getOrCreateNodeId helper
      let currentRecordEdgesWritten = 0;
      const findEntityLabel = (text: string): string => {
        const cleanText = text.toLowerCase().trim();
        const match = entities.find((e) => e.text.toLowerCase().trim() === cleanText);
        return match ? match.label : 'other';
      };

      for (const rel of relations) {
        if (!rel.head || !rel.label || !rel.tail) continue;
        try {
          const headLabel = findEntityLabel(rel.head);
          const tailLabel = findEntityLabel(rel.tail);

          const headNodeId = await getOrCreateNodeId(supabase, USER_ID, rel.head, headLabel);
          const tailNodeId = await getOrCreateNodeId(supabase, USER_ID, rel.tail, tailLabel);

          // Check if this exact edge already exists (active)
          const { data: existing } = await supabase
            .from('chronic_edges')
            .select('id, tail_node_id')
            .eq('user_id', USER_ID)
            .eq('head_node_id', headNodeId)
            .eq('relation_label', rel.label)
            .is('valid_to', null)
            .maybeSingle();

          if (existing && existing.tail_node_id === tailNodeId) {
            // Identical edge exists, skip
            continue;
          }

          // Insert new edge
          const { data: newEdge, error: insertErr } = await supabase
            .from('chronic_edges')
            .insert({
              user_id: USER_ID,
              head_node_id: headNodeId,
              tail_node_id: tailNodeId,
              relation_label: rel.label,
              confidence: Math.min(1, Math.max(0, rel.score || 0.7)),
              source_record_id: record.id,
              chunk_start_char: 0,
              chunk_end_char: 0,
              observed_from: new Date().toISOString(),
              valid_from: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (insertErr) {
            console.warn(`    Failed to insert edge: ${insertErr.message}`);
            errorsCount++;
          } else {
            currentRecordEdgesWritten++;
            edgesWritten++;

            // If contradiction existed, invalidate it
            if (existing) {
              await supabase
                .from('chronic_edges')
                .update({
                  valid_to: new Date().toISOString(),
                  is_contradicted_by: newEdge.id
                })
                .eq('id', existing.id);
            }
          }
        } catch (err: any) {
          console.warn(`    Error writing relation ${rel.head} -> ${rel.tail}:`, err.message);
          errorsCount++;
        }
      }

      // Mark memory as cognitively processed
      await supabase
        .from('memories')
        .update({ cognitive_processed_at: new Date().toISOString() })
        .eq('id', record.id);

      console.log(`  Success -> Persistent Edges Written: ${currentRecordEdgesWritten}`);
      reportSamples.push({
        id: record.id,
        title,
        entities,
        relations
      });

    } catch (err: any) {
      console.warn(`  [Failed processing record]:`, err.message);
      errorsCount++;
    }
  }

  // Save report
  const report = {
    user_email: EMAIL,
    user_id: USER_ID,
    total_records_processed: reportSamples.length,
    total_entities_extracted: totalEntities,
    total_relations_extracted: totalRelations,
    edges_inserted_to_db: edgesWritten,
    errors_encountered: errorsCount,
    entity_type_counts: entityTypeCounts,
    relation_type_counts: relationTypeCounts,
    samples_for_audit: reportSamples
  };

  fs.mkdirSync('reports', { recursive: true });
  const reportPath = 'reports/volume_test_results.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log('\n[Volume Test Complete!]');
  console.log(`Total Records Processed: ${reportSamples.length}`);
  console.log(`Total Entities Extracted: ${totalEntities}`);
  console.log(`Total Relations Extracted: ${totalRelations}`);
  console.log(`Total Edges Persisted: ${edgesWritten}`);
  console.log(`Errors: ${errorsCount}`);
  console.log(`Report saved to: ${reportPath}`);
}

runVolumeTest();
