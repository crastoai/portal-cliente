// ============================================================================
// GoogleMeetService — integração Google Meet (D5), INTERNAL (só a Crasto).
// OAuth Authorization-Code (start/callback/refresh) + poller que lê conferenceRecords
// → transcripts → entries pela Meet REST API e alimenta ingestMeetTranscript (casa cliente
// existente / cria lead). ISOLADO: projeto GCP dedicado; segredo próprio (google_meet_*);
// escopos MÍNIMOS (meetings.space.readonly + calendar.events.readonly + email). Sem Drive.
// ============================================================================
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RlsDbService } from '../common/rls-db.service';
import { AutomationEngineService } from './automation.engine';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const MEET = 'https://meet.googleapis.com/v2';
const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/meetings.space.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
].join(' ');

function emailFromIdToken(idToken?: string): string | null {
  try { return JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64').toString('utf8')).email || null; } catch { return null; }
}

@Injectable()
export class GoogleMeetService {
  private readonly log = new Logger('GoogleMeet');
  constructor(private readonly db: RlsDbService, private readonly engine: AutomationEngineService) {}

  private cfg() {
    return this.db.asService(async (c) => {
      const rows = (await c.query(`select key, value from automation.app_settings where key in ('google_meet_client_id','google_meet_client_secret','google_meet_redirect_uri')`)).rows;
      const m: Record<string, string> = {}; rows.forEach((r: any) => (m[r.key] = r.value));
      return { clientId: m.google_meet_client_id, clientSecret: m.google_meet_client_secret, redirectUri: m.google_meet_redirect_uri };
    });
  }

  // ── OAuth ──
  async startUrl(uid: string) {
    const { clientId, redirectUri } = await this.cfg();
    if (!clientId) return { ok: false, error: 'OAuth do Google Meet ainda não configurado (falta o client no cofre).' };
    const state = randomUUID();
    await this.db.asService((c) => c.query(`insert into automation.oauth_states (state, created_by) values ($1,$2)`, [state, uid]));
    const qs = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
    return { ok: true, url: `${AUTH_URL}?${qs.toString()}` };
  }

  async handleCallback(code: string, state: string): Promise<{ email: string | null }> {
    const okState = await this.db.asService(async (c) => (await c.query(`delete from automation.oauth_states where state=$1 returning state`, [state])).rowCount ?? 0);
    if (!okState) throw new Error('state inválido');
    const { clientId, clientSecret, redirectUri } = await this.cfg();
    const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }).toString() });
    const tok: any = await r.json();
    if (!r.ok) throw new Error('troca de token falhou: ' + JSON.stringify(tok).slice(0, 200));
    const email = emailFromIdToken(tok.id_token);
    const expiry = new Date(Date.now() + (Number(tok.expires_in) || 3600) * 1000).toISOString();
    await this.db.asService((c) => c.query(
      `insert into automation.google_connections (email, refresh_token, access_token, access_expiry, scopes) values ($1,$2,$3,$4,$5)
       on conflict (email) do update set refresh_token=coalesce(excluded.refresh_token, automation.google_connections.refresh_token),
         access_token=excluded.access_token, access_expiry=excluded.access_expiry, scopes=excluded.scopes, last_error=null, updated_at=now()`,
      [email, tok.refresh_token || null, tok.access_token, expiry, SCOPES]));
    this.log.log(`conectado: ${email}`);
    return { email };
  }

  status() {
    return this.db.asService(async (c) => {
      const r = (await c.query(`select email, last_poll_at, last_error, scopes, (refresh_token is not null) as has_token from automation.google_connections order by updated_at desc limit 1`)).rows[0];
      return { connected: !!r?.has_token, email: r?.email ?? null, last_poll_at: r?.last_poll_at ?? null, last_error: r?.last_error ?? null };
    });
  }
  disconnect() { return this.db.asService(async (c) => { await c.query(`delete from automation.google_connections`); return { ok: true }; }); }

  private async ensureAccess(conn: any): Promise<string> {
    if (conn.access_token && conn.access_expiry && new Date(conn.access_expiry).getTime() > Date.now() + 60000) return conn.access_token;
    const { clientId, clientSecret } = await this.cfg();
    const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: conn.refresh_token, grant_type: 'refresh_token' }).toString() });
    const tok: any = await r.json();
    if (!r.ok) throw new Error('refresh falhou: ' + JSON.stringify(tok).slice(0, 150));
    const expiry = new Date(Date.now() + (Number(tok.expires_in) || 3600) * 1000).toISOString();
    await this.db.asService((c) => c.query(`update automation.google_connections set access_token=$2, access_expiry=$3, updated_at=now() where id=$1`, [conn.id, tok.access_token, expiry]));
    return tok.access_token;
  }

  private gget(url: string, access: string) { return fetch(url, { headers: { Authorization: `Bearer ${access}` } }).then((r) => r.json() as any); }

  // Poller: novas conferenceRecords desde o watermark → transcript entries → ingest.
  async poll(): Promise<{ ok: boolean; ingested: number }> {
    const conns = await this.db.asService(async (c) => (await c.query(`select * from automation.google_connections where refresh_token is not null`)).rows);
    let ingested = 0;
    for (const conn of conns) {
      try {
        const access = await this.ensureAccess(conn);
        const sinceMs = conn.watermark ? new Date(conn.watermark).getTime() : Date.now() - 7 * 864e5;
        const filter = `start_time>="${new Date(sinceMs).toISOString()}"`;
        const data = await this.gget(`${MEET}/conferenceRecords?pageSize=20&filter=${encodeURIComponent(filter)}`, access);
        const records: any[] = data.conferenceRecords || [];
        let maxStart = conn.watermark ? new Date(conn.watermark).getTime() : 0;
        for (const rec of records) {
          const startMs = new Date(rec.startTime).getTime();
          if (conn.watermark && startMs <= new Date(conn.watermark).getTime()) continue;
          // transcript entries (texto estruturado, sem Drive)
          const tr = await this.gget(`${MEET}/${rec.name}/transcripts`, access);
          let text = '';
          for (const t of (tr.transcripts || [])) {
            let pageToken = '';
            do {
              const ed = await this.gget(`${MEET}/${t.name}/entries?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`, access);
              (ed.transcriptEntries || []).forEach((e: any) => { text += `${e.text || ''}\n`; });
              pageToken = ed.nextPageToken || '';
            } while (pageToken);
          }
          // participantes → attendees + tentativa de nome do contato (não-Crasto)
          const pr = await this.gget(`${MEET}/${rec.name}/participants?pageSize=50`, access);
          const names: string[] = (pr.participants || []).map((p: any) => p.signedinUser?.displayName || p.anonymousUser?.displayName || p.phoneUser?.displayName).filter(Boolean);
          const attendees = names.join(', ');
          const contactName = names.find((n) => n && !n.toLowerCase().includes('crasto')) || null;
          if (text.trim()) {
            await this.engine.ingestMeetTranscript({ title: `Reunião ${String(rec.startTime || '').slice(0, 10)}`.trim(), meeting_at: rec.startTime, attendees, transcript: text.trim(), contact_name: contactName });
            ingested++;
          }
          if (startMs > maxStart) maxStart = startMs;
        }
        const newWatermark = maxStart ? new Date(maxStart).toISOString() : (conn.watermark || new Date(sinceMs).toISOString());
        await this.db.asService((c) => c.query(`update automation.google_connections set watermark=$2, last_poll_at=now(), last_error=null where id=$1`, [conn.id, newWatermark]));
      } catch (e: any) {
        await this.db.asService((c) => c.query(`update automation.google_connections set last_poll_at=now(), last_error=$2 where id=$1`, [conn.id, String(e?.message).slice(0, 300)]));
        this.log.warn(`poll ${conn.email}: ${e?.message}`);
      }
    }
    return { ok: true, ingested };
  }
}
