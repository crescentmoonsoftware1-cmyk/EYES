import { Resend } from 'resend';

// Using Resend shared domain until the-eyes.app is purchased.
// Switch to 'EYES <hello@the-eyes.app>' after buying the domain + adding DNS records.
const FROM = 'EYES <onboarding@resend.dev>';

// Lazy-init: new Resend() throws at module load if API key is missing,
// which crashes Next.js build during page-data collection.
function getResendClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set.');
  return new Resend(key);
}

// ── Email templates ────────────────────────────────────────────────────────────

function welcomeHtml(name: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, sans-serif; background: #0a0a0a; color: #e5e7eb; margin: 0; padding: 0; }
  .container { max-width: 560px; margin: 40px auto; padding: 40px; background: #111; border: 1px solid #1f2937; border-radius: 12px; }
  h1 { font-size: 24px; font-weight: 700; color: #fff; margin: 0 0 8px; }
  p { color: #9ca3af; line-height: 1.6; margin: 12px 0; }
  .cta { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #6366f1; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; }
  .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #1f2937; font-size: 12px; color: #4b5563; }
</style></head>
<body>
  <div class="container">
    <h1>EYES is now watching.</h1>
    <p>Hi ${name},</p>
    <p>Your account is active. EYES is indexing your connected platforms and will begin detecting patterns in your behavior over the next 21 days.</p>
    <p>For now — ask it anything about your history. It already knows more than you think.</p>
    <a href="${process.env.NEXT_PUBLIC_SITE_URL}/chat" class="cta">Open EYES →</a>
    <div class="footer">
      EYES Neural Memory OS · <a href="${process.env.NEXT_PUBLIC_SITE_URL}" style="color:#4b5563">the-eyes.app</a>
    </div>
  </div>
</body>
</html>`;
}

function clusterReadyHtml(name: string, clusterCount: number) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, sans-serif; background: #0a0a0a; color: #e5e7eb; margin: 0; padding: 0; }
  .container { max-width: 560px; margin: 40px auto; padding: 40px; background: #111; border: 1px solid #1f2937; border-radius: 12px; }
  h1 { font-size: 24px; font-weight: 700; color: #fff; margin: 0 0 8px; }
  .badge { display: inline-block; padding: 4px 12px; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); color: #818cf8; border-radius: 20px; font-size: 13px; margin-bottom: 20px; }
  p { color: #9ca3af; line-height: 1.6; margin: 12px 0; }
  .cta { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #6366f1; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; }
  .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #1f2937; font-size: 12px; color: #4b5563; }
</style></head>
<body>
  <div class="container">
    <div class="badge">🧠 Behavioral patterns detected</div>
    <h1>EYES found ${clusterCount} recurring states in your data.</h1>
    <p>Hi ${name},</p>
    <p>After analyzing your last 21+ days of activity, EYES has detected ${clusterCount} distinct behavioral modes you cycle through. These are not guesses — they are patterns computed from your actual data.</p>
    <p>Open EYES to review and name each pattern. Once confirmed, every chat answer will reference which mode you're currently in.</p>
    <a href="${process.env.NEXT_PUBLIC_SITE_URL}/chat" class="cta">Review your patterns →</a>
    <div class="footer">
      EYES Neural Memory OS · <a href="${process.env.NEXT_PUBLIC_SITE_URL}" style="color:#4b5563">the-eyes.app</a>
    </div>
  </div>
</body>
</html>`;
}

function connectorErrorHtml(name: string, platform: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, sans-serif; background: #0a0a0a; color: #e5e7eb; margin: 0; padding: 0; }
  .container { max-width: 560px; margin: 40px auto; padding: 40px; background: #111; border: 1px solid #1f2937; border-radius: 12px; }
  h1 { font-size: 24px; font-weight: 700; color: #fff; margin: 0 0 8px; }
  .warn { display: inline-block; padding: 4px 12px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: #f87171; border-radius: 20px; font-size: 13px; margin-bottom: 20px; }
  p { color: #9ca3af; line-height: 1.6; margin: 12px 0; }
  .cta { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #6366f1; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; }
  .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #1f2937; font-size: 12px; color: #4b5563; }
</style></head>
<body>
  <div class="container">
    <div class="warn">⚠ Connection expired</div>
    <h1>Your ${platform} connection needs to be refreshed.</h1>
    <p>Hi ${name},</p>
    <p>EYES lost access to your ${platform} account. This usually happens when OAuth tokens expire. EYES cannot index new ${platform} data until you reconnect.</p>
    <p>This takes 30 seconds to fix.</p>
    <a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard" class="cta">Reconnect ${platform} →</a>
    <div class="footer">
      EYES Neural Memory OS · <a href="${process.env.NEXT_PUBLIC_SITE_URL}" style="color:#4b5563">the-eyes.app</a>
    </div>
  </div>
</body>
</html>`;
}



// ── Public send functions ──────────────────────────────────────────────────────

export async function sendWelcomeEmail(to: string, name: string) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    await getResendClient().emails.send({
      from: FROM,
      to,
      subject: 'EYES is now watching.',
      html: welcomeHtml(name),
    });
    console.log(`[Email] Welcome sent → ${to}`);
  } catch (err) {
    console.error('[Email] Welcome failed:', err);
  }
}

export async function sendClusterReadyEmail(to: string, name: string, clusterCount: number) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    await getResendClient().emails.send({
      from: FROM,
      to,
      subject: `EYES detected ${clusterCount} behavioral patterns in your data`,
      html: clusterReadyHtml(name, clusterCount),
    });
    console.log(`[Email] Cluster ready sent → ${to}`);
  } catch (err) {
    console.error('[Email] Cluster ready failed:', err)
  }
}

export async function sendConnectorErrorEmail(to: string, name: string, platform: string) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    await getResendClient().emails.send({
      from: FROM,
      to,
      subject: `Action needed: Your ${platform} connection expired`,
      html: connectorErrorHtml(name, platform),
    });
    console.log(`[Email] Connector error sent → ${to} for ${platform}`);
  } catch (err) {
    console.error('[Email] Connector error failed:', err);
  }
}

function draftApprovalHtml(name: string, sender: string, summary: string, draftReply: string, citations: string, actionId: string) {
  const approvalUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/?view=action-queue&id=${actionId}`;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, sans-serif; background: #0a0a0a; color: #e5e7eb; margin: 0; padding: 0; }
  .container { max-width: 560px; margin: 40px auto; padding: 40px; background: #111; border: 1px solid #1f2937; border-radius: 12px; }
  h1 { font-size: 24px; font-weight: 700; color: #fff; margin: 0 0 8px; }
  .badge { display: inline-block; padding: 4px 12px; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); color: #818cf8; border-radius: 20px; font-size: 13px; margin-bottom: 20px; }
  p { color: #9ca3af; line-height: 1.6; margin: 12px 0; }
  .quote-box { background: rgba(255,255,255,0.03); border-left: 3px solid #6366f1; padding: 16px; margin: 16px 0; border-radius: 4px; color: #e5e7eb; font-style: italic; white-space: pre-wrap; }
  .citation-box { background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); padding: 12px; margin: 16px 0; border-radius: 4px; color: #9ca3af; font-size: 13px; }
  .cta { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #6366f1; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; }
  .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #1f2937; font-size: 12px; color: #4b5563; }
</style></head>
<body>
  <div class="container">
    <div class="badge">✉ Action Draft Ready</div>
    <h1>Draft Reply for: "${summary}"</h1>
    <p>Hi ${name},</p>
    <p>EYES has prepared a draft response to an email from <strong>${sender}</strong>. Review the draft below:</p>
    
    <div class="quote-box">${draftReply}</div>
    
    <h3>Why EYES wrote this:</h3>
    <div class="citation-box">${citations}</div>
    
    <p>Please note: this reply will NOT be sent until you approve it.</p>
    
    <a href="${approvalUrl}" class="cta">Approve & Send Draft →</a>
    <div class="footer">
      EYES Neural Memory OS · <a href="${process.env.NEXT_PUBLIC_SITE_URL}" style="color:#4b5563">the-eyes.app</a>
    </div>
  </div>
</body>
</html>`;
}

export async function sendDraftApprovalEmail(params: {
  to: string;
  name: string;
  sender: string;
  summary: string;
  draftReply: string;
  citations: string;
  actionId: string;
}) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    await getResendClient().emails.send({
      from: FROM,
      to: params.to,
      subject: `[EYES Draft Approval] Reply to "${params.summary}"`,
      html: draftApprovalHtml(
        params.name,
        params.sender,
        params.summary,
        params.draftReply,
        params.citations,
        params.actionId
      ),
    });
    console.log(`[Email] Draft approval email sent → ${params.to}`);
  } catch (err) {
    console.error('[Email] Draft approval failed:', err);
  }
}


