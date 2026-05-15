import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertSyncStatusSafely, upsertRawEventsSafely } from '@/utils/supabase/upsert';
import { getValidDiscordToken } from '@/services/auth/oauth';
import { scoreDiscordEvent } from '@/utils/risk/scorer';

type DiscordChannelCursor = {
  before_id: string;
  oldest_ts: string;
};

type DiscordChannelCursorState = Record<string, string | DiscordChannelCursor>;

type DiscordUser = {
  id: string;
  username: string;
  discriminator?: string;
  email?: string;
};

type DiscordGuild = {
  id: string;
  name: string;
  owner?: boolean;
  permissions?: string;
};

type DiscordGuildChannel = {
  id: string;
  guild_id?: string;
  name?: string;
  type?: number;
};

type DiscordDMChannel = {
  id: string;
  name?: string;
  recipients?: Array<{ username?: string }>;
};

type DiscordMessage = {
  id: string;
  content?: string;
  timestamp: string;
  author?: {
    bot?: boolean;
    username?: string;
  };
};

const DISCORD_GUILD_TEXT_CHANNEL_TYPES = new Set([0, 5, 10, 11, 12]);

function readCursorEntry(value: string | DiscordChannelCursor | undefined): DiscordChannelCursor | null {
  if (!value) return null;
  if (typeof value === 'string') {
    return {
      before_id: value,
      oldest_ts: '',
    };
  }
  if (!value.before_id) return null;
  return value;
}

export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const { supabase, userId } = actor;

  try {
    // 1. Get existing sync status to retrieve channel cursors from metadata
    const { data: currentStatus } = await supabase
      .from('sync_status')
      .select('metadata, total_items')
      .eq('user_id', userId)
      .eq('platform', 'discord')
      .maybeSingle();

    const channelCursors = (currentStatus?.metadata?.channel_cursors || {}) as DiscordChannelCursorState;

    // 2. Get Valid Token
    const accessToken = await getValidDiscordToken(supabase, userId);
    if (!accessToken) return NextResponse.json({ error: 'No Discord token found or refresh failed' }, { status: 404 });

    // Mark as 'syncing'
    await upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'discord',
      status: 'syncing',
      last_sync_at: new Date().toISOString(),
    });

    // 3. Fetch User Profile & Guilds
    const [userResponse, guildsResponse] = await Promise.all([
      fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      }),
      fetch('https://discord.com/api/v10/users/@me/guilds', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })
    ]);

    if (!userResponse.ok) throw new Error(`Discord User API failed: ${userResponse.status}`);

    const discordUser = (await userResponse.json()) as DiscordUser;
    const discordGuilds = (guildsResponse.ok ? await guildsResponse.json() : []) as DiscordGuild[];

    // 4. Fetch Private Channels (DMs) & History using cursors
    const dmResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    
    const dmChannels = (dmResponse.ok ? await dmResponse.json() : []) as DiscordDMChannel[];
    const url = new URL(request.url);
    const depth = url.searchParams.get('depth') || 'shallow';
    const dmLimit = depth === 'deep' ? 20 : 5;
    const messageLimit = depth === 'deep' ? 100 : 20;

    const activeDMs = dmChannels.slice(0, dmLimit);

    const messagePromises = activeDMs.map(async (channel) => {
      // Use the stored message ID as 'before' to pull OLDER messages
      const beforeId = readCursorEntry(channelCursors[channel.id])?.before_id || null;
      const fetchUrl = new URL(`https://discord.com/api/v10/channels/${channel.id}/messages`);
      fetchUrl.searchParams.set('limit', messageLimit.toString());
      if (beforeId) fetchUrl.searchParams.set('before', beforeId);

      const resp = await fetch(fetchUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const data = (await resp.json()) as unknown;
      return { channel, messages: Array.isArray(data) ? (data as DiscordMessage[]) : [] };
    });

    const dmHistories = await Promise.all(messagePromises);

    // 4b. Best-effort guild channel history (requires permissions/scope that may not be present for all users)
    const guildLimit = depth === 'deep' ? 8 : 3;
    const guildMessageLimit = depth === 'deep' ? 60 : 20;
    const guildHistories: Array<{ guild: DiscordGuild; channel: DiscordGuildChannel; messages: DiscordMessage[] }> = [];

    for (const guild of discordGuilds.slice(0, guildLimit)) {
      const channelsResponse = await fetch(`https://discord.com/api/v10/guilds/${guild.id}/channels`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });

      if (!channelsResponse.ok) {
        continue;
      }

      const guildChannels = (await channelsResponse.json()) as DiscordGuildChannel[];
      const textChannels = guildChannels
        .filter((channel) => DISCORD_GUILD_TEXT_CHANNEL_TYPES.has(channel.type || -1))
        .slice(0, depth === 'deep' ? 8 : 3);

      for (const channel of textChannels) {
        const guildCursorKey = `guild:${guild.id}:channel:${channel.id}`;
        const beforeId = readCursorEntry(channelCursors[guildCursorKey])?.before_id || null;

        const messagesUrl = new URL(`https://discord.com/api/v10/channels/${channel.id}/messages`);
        messagesUrl.searchParams.set('limit', String(guildMessageLimit));
        if (beforeId) {
          messagesUrl.searchParams.set('before', beforeId);
        }

        const messagesResponse = await fetch(messagesUrl.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });

        if (!messagesResponse.ok) {
          continue;
        }

        const messageData = (await messagesResponse.json()) as unknown;
        guildHistories.push({
          guild,
          channel,
          messages: Array.isArray(messageData) ? (messageData as DiscordMessage[]) : [],
        });
      }
    }

    // 5. Transform to Events
    const events: Record<string, unknown>[] = [
      {
        user_id: userId,
        platform: 'discord',
        platform_id: `user_${discordUser.id}`,
        event_type: 'profile',
        title: `Discord Profile: ${discordUser.username}`,
        content: `Discord user ${discordUser.username}#${discordUser.discriminator} (${discordUser.id}). Email: ${discordUser.email || 'unset'}.`,
        author: discordUser.username,
        timestamp: new Date().toISOString(),
        metadata: { ...discordUser }
      }
    ];

    for (const guild of discordGuilds) {
      events.push({
        user_id: userId,
        platform: 'discord',
        platform_id: `guild_${guild.id}`,
        event_type: 'guild_membership',
        title: `Discord Server: ${guild.name}`,
        content: `Member of Discord server ${guild.name}.`,
        author: discordUser.username,
        timestamp: new Date().toISOString(),
        metadata: {
          guild_id: guild.id,
          guild_name: guild.name,
          owner: Boolean(guild.owner),
          permissions: guild.permissions || null,
        },
        is_flagged: false,
        flag_severity: 'LOW',
        flag_reason: null,
      });
    }

    const updatedCursors = { ...channelCursors };
    let hasMoreOverall = false;

    for (const { channel, messages } of dmHistories) {
      if (messages.length >= messageLimit) hasMoreOverall = true;

      for (const msg of messages) {
        if (!msg.content || msg.author?.bot) continue;

        const risk = await scoreDiscordEvent({
          text: msg.content,
          channelName: channel.name || 'Personal DM',
          user: discordUser.username
        });

        events.push({
          user_id: userId,
          platform: 'discord',
          platform_id: `msg_${msg.id}`,
          event_type: 'message',
          title: `DM with ${channel.recipients?.map((recipient) => recipient.username || 'Unknown').join(', ') || 'Community'}`,
          content: msg.content,
          author: msg.author?.username || 'Unknown',
          timestamp: new Date(msg.timestamp).toISOString(),
          is_flagged: risk.flagged,
          flag_severity: risk.severity,
          flag_reason: risk.reasons.join(', '),
          metadata: { ...msg, channel_id: channel.id }
        });

        // Update cursor using oldest timestamp observed, with corresponding before_id.
        const existing = readCursorEntry(updatedCursors[channel.id]);
        if (!existing || !existing.oldest_ts || new Date(msg.timestamp).getTime() < new Date(existing.oldest_ts).getTime()) {
          updatedCursors[channel.id] = {
            before_id: msg.id,
            oldest_ts: msg.timestamp,
          };
        }
      }
    }

    for (const { guild, channel, messages } of guildHistories) {
      if (messages.length >= guildMessageLimit) hasMoreOverall = true;

      for (const msg of messages) {
        if (!msg.content || msg.author?.bot) continue;

        const risk = await scoreDiscordEvent({
          text: msg.content,
          channelName: `${guild.name}/${channel.name || 'unknown-channel'}`,
          user: discordUser.username,
        });

        events.push({
          user_id: userId,
          platform: 'discord',
          platform_id: `guild_msg_${msg.id}`,
          event_type: 'guild_message',
          title: `#${channel.name || 'unknown'} in ${guild.name}`,
          content: msg.content,
          author: msg.author?.username || 'Unknown',
          timestamp: new Date(msg.timestamp).toISOString(),
          is_flagged: risk.flagged,
          flag_severity: risk.severity,
          flag_reason: risk.reasons.join(', '),
          metadata: {
            ...msg,
            guild_id: guild.id,
            guild_name: guild.name,
            channel_id: channel.id,
            channel_name: channel.name || null,
          },
        });

        const cursorKey = `guild:${guild.id}:channel:${channel.id}`;
        const existing = readCursorEntry(updatedCursors[cursorKey]);
        if (!existing || !existing.oldest_ts || new Date(msg.timestamp).getTime() < new Date(existing.oldest_ts).getTime()) {
          updatedCursors[cursorKey] = {
            before_id: msg.id,
            oldest_ts: msg.timestamp,
          };
        }
      }
    }

    // 6. Save Events
    if (events.length > 0) {
      await upsertRawEventsSafely(supabase, events);
    }

    // 7. Update Sync Status & Profile
    const { count: totalMemories } = await supabase
      .from('memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const now = new Date().toISOString();
    await Promise.all([
      upsertSyncStatusSafely(supabase, {
        user_id: userId,
        platform: 'discord',
        status: hasMoreOverall ? 'syncing' : 'connected',
        sync_progress: hasMoreOverall ? 50 : 100,
        total_items: (currentStatus?.total_items || 0) + events.length,
        last_sync_at: now,
        next_sync_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
        metadata: { channel_cursors: updatedCursors },
        error_message: null,
      }),
      supabase.from('user_profiles').update({
        memories_indexed: totalMemories ?? events.length,
        updated_at: now,
      }).eq('user_id', userId),
    ]);

    return NextResponse.json({ 
      success: true, 
      count: events.length,
      hasMore: hasMoreOverall,
      totalMemories
    });
  } catch (err) {
    console.error('Discord Sync Error:', err);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
