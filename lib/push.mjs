// Web push (VAPID). The only external sends this system ever makes are messages
// inside our own chat and push notifications (hard rule 3). Keys live in the env
// file / Render Environment tab as VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.

import webpush from 'web-push';
import { logEvent } from './db.mjs';

let configured = false;
export function configurePush() {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails('mailto:rashad@shopwithme.me', pub, priv);
  configured = true;
  return true;
}

export function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export function saveSubscription(db, memberId, subscription) {
  db.prepare(
    `INSERT INTO push_subscriptions (endpoint, memberId, subscription, createdAt)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       memberId = excluded.memberId, subscription = excluded.subscription, status = 'active'`
  ).run(subscription.endpoint, memberId, JSON.stringify(subscription), new Date().toISOString());
}

async function sendTo(db, row, payload) {
  try {
    await webpush.sendNotification(JSON.parse(row.subscription), JSON.stringify(payload));
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      // Retire, never delete.
      db.prepare("UPDATE push_subscriptions SET status = 'expired' WHERE endpoint = ?").run(row.endpoint);
    } else {
      logEvent(db, 'push.error', { endpoint: row.endpoint.slice(0, 40), error: err.message });
    }
  }
}

// Notify every active subscription except the sender's own devices.
export async function notifyMembers(db, { excludeMemberId = null, title, body, url = '/chat' }) {
  if (!configurePush()) return;
  const rows = db
    .prepare("SELECT * FROM push_subscriptions WHERE status = 'active'")
    .all()
    .filter((r) => r.memberId !== excludeMemberId);
  await Promise.all(rows.map((r) => sendTo(db, r, { title, body, url })));
}

export async function notifyAdmin(db, { title, body, url = '/admin' }) {
  if (!configurePush()) return;
  const rows = db
    .prepare(
      `SELECT ps.* FROM push_subscriptions ps
       JOIN members m ON m.id = ps.memberId
       WHERE ps.status = 'active' AND m.role = 'admin'`
    )
    .all();
  await Promise.all(rows.map((r) => sendTo(db, r, { title, body, url })));
}
