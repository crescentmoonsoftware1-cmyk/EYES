import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Integration Guide — EYES',
  description: 'How to connect your accounts and import your data into EYES.',
};

const connectors = [
  { name: 'Gmail',            liveApi: 'Yes',    import: '-',       notes: 'OAuth — full inbox & sent mail indexed.' },
  { name: 'Google Calendar',  liveApi: 'Yes',    import: '-',       notes: 'OAuth — events, invites, and cancellations indexed.' },
  { name: 'GitHub',           liveApi: 'Yes',    import: '-',       notes: 'OAuth — commits, PRs, and issues indexed.' },
  { name: 'Slack',            liveApi: 'Yes',    import: '-',       notes: 'OAuth — channel history indexed per workspace.' },
  { name: 'Notion',           liveApi: 'Yes',    import: '-',       notes: 'OAuth — pages, databases, and tasks indexed.' },
  { name: 'Discord',          liveApi: 'Yes',    import: '-',       notes: 'OAuth — server messages indexed.' },
  { name: 'Linear',           liveApi: 'Yes',    import: '-',       notes: 'OAuth — issues and project activity indexed.' },
  { name: 'ChatGPT',          liveApi: 'No',     import: 'Import',  notes: 'No live API available from OpenAI. Export your conversations from ChatGPT settings (ZIP), then import here — your full conversation history is added to your vault.' },
  { name: 'Claude',           liveApi: 'No',     import: 'Import',  notes: 'No live API available from Anthropic. Export your conversations from claude.ai, then import the JSON file here — your full conversation history is added to your vault.' },
  { name: 'Reddit',           liveApi: 'Soon',   import: '-',       notes: 'Under review — will appear here when approved.' },
  { name: 'X / Twitter',      liveApi: 'Yes',    import: '-',       notes: 'OAuth — posts and DMs indexed.' },
];

function Badge({ value }: { value: string }) {
  const colors: Record<string, string> = {
    Yes:    '#1F4D3F',
    No:     '#555',
    Import: '#4A3F6B',
    Soon:   '#7A5C1E',
    '-':    'transparent',
  };
  if (value === '-') return <span style={{ color: '#999' }}>—</span>;
  return (
    <span style={{
      display: 'inline-block',
      background: colors[value] ?? '#333',
      color: '#fff',
      borderRadius: '4px',
      padding: '2px 10px',
      fontSize: '0.75rem',
      fontWeight: 700,
      letterSpacing: '0.04em',
    }}>
      {value}
    </span>
  );
}

export default function IntegrationGuidePage() {
  return (
    <main style={{
      maxWidth: '820px',
      margin: '0 auto',
      padding: '60px 24px',
      fontFamily: "'Inter', sans-serif",
      color: '#1A1A1A',
      lineHeight: 1.7,
    }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '8px' }}>Integration Guide</h1>
      <p style={{ color: '#555', marginBottom: '40px', fontSize: '1rem' }}>
        How to connect your accounts and import your data into EYES.
      </p>

      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>Connector Status</h2>
      <p style={{ color: '#555', marginBottom: '24px', fontSize: '0.9rem' }}>
        <strong>Live API</strong> means EYES connects directly via OAuth and keeps your data up to date automatically.{' '}
        <strong>Import</strong> means no live API connection is available from that provider; instead, you export your data manually
        and EYES adds it to your vault for full search and analysis.
      </p>

      <div style={{ overflowX: 'auto', marginBottom: '48px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#F4F4EE', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', fontWeight: 700, borderBottom: '2px solid #E5E5DF' }}>Connector</th>
              <th style={{ padding: '12px 16px', fontWeight: 700, borderBottom: '2px solid #E5E5DF' }}>Live API</th>
              <th style={{ padding: '12px 16px', fontWeight: 700, borderBottom: '2px solid #E5E5DF' }}>Import</th>
              <th style={{ padding: '12px 16px', fontWeight: 700, borderBottom: '2px solid #E5E5DF' }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {connectors.map((c, i) => (
              <tr key={c.name} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAF7', borderBottom: '1px solid #E5E5DF' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{c.name}</td>
                <td style={{ padding: '12px 16px' }}><Badge value={c.liveApi} /></td>
                <td style={{ padding: '12px 16px' }}><Badge value={c.import} /></td>
                <td style={{ padding: '12px 16px', color: '#444' }}>{c.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>How to import ChatGPT conversations</h2>
      <ol style={{ paddingLeft: '20px', color: '#444', marginBottom: '40px' }}>
        <li style={{ marginBottom: '8px' }}>Open <a href="https://chat.openai.com" target="_blank" rel="noopener noreferrer" style={{ color: '#1F4D3F' }}>chat.openai.com</a> → Settings → Data Controls → Export Data.</li>
        <li style={{ marginBottom: '8px' }}>OpenAI emails you a ZIP file — download it.</li>
        <li style={{ marginBottom: '8px' }}>In EYES, go to <strong>Vault → Import → ChatGPT ZIP</strong> and upload the file.</li>
        <li>EYES extracts all conversations, embeds them, and adds them to your vault. They are citable from the next turn onward.</li>
      </ol>

      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>How to import Claude conversations</h2>
      <ol style={{ paddingLeft: '20px', color: '#444', marginBottom: '40px' }}>
        <li style={{ marginBottom: '8px' }}>Open <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" style={{ color: '#1F4D3F' }}>claude.ai</a> → Settings → Export Data.</li>
        <li style={{ marginBottom: '8px' }}>Download the exported JSON file.</li>
        <li style={{ marginBottom: '8px' }}>In EYES, go to <strong>Vault → Import → Claude JSON</strong> and upload the file.</li>
        <li>Your full Claude conversation history is added to your vault and citable from the next turn onward.</li>
      </ol>

      <p style={{ color: '#888', fontSize: '0.8rem', borderTop: '1px solid #E5E5DF', paddingTop: '24px' }}>
        Questions? Contact <a href="mailto:support@eyes.app" style={{ color: '#1F4D3F' }}>support@eyes.app</a>.
      </p>
    </main>
  );
}
