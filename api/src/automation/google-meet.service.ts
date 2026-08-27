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

  // Correlaciona a conferência do Meet com o evento do Calendar (mesmo código) p/ obter os
  // e-mails REAIS dos participantes. Externo = fora de @crasto.com/@crasto.ai. Reunião interna
  // (só crasto) → allInternal=true (o poller pula, não cria lead).
  private async correlate(access: string, rec: any, startMs: number): Promise<{ emails: string[]; names: string[]; allInternal: boolean }> {
    try {
      let code = '';
      if (rec.space) { const sp = await this.gget(`${MEET}/${rec.space}`, access); code = sp?.meetingCode || ''; }
      const tMin = new Date(startMs - 2 * 3600e3).toISOString();
      const tMax = new Date(startMs + 4 * 3600e3).toISOString();
      const evd = await this.gget(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=25&timeMin=${encodeURIComponent(tMin)}&timeMax=${encodeURIComponent(tMax)}`, access);
      const events: any[] = evd.items || [];
      const ev = events.find((e) => code && ((e.conferenceData?.conferenceId === code) || String(e.hangoutLink || '').includes(code)));
      const attendees: any[] = ev?.attendees || [];
      const ext = attendees.filter((a) => a.email && !a.self && !a.resource && !/@crasto\.(com|ai)$/i.test(a.email));
      const allInternal = attendees.length > 0 && ext.length === 0;
      return { emails: ext.map((a) => String(a.email).toLowerCase()), names: ext.map((a) => a.displayName || String(a.email).split('@')[0]), allInternal };
    } catch { return { emails: [], names: [], allInternal: false }; }
  }

  // Poller: novas conferenceRecords desde o watermark → transcript entries → ingest.
  async poll(): Promise<{ ok: boolean; ingested: number; scanned: number; connected: boolean; last_poll_at: string | null }> {
    const conns = await this.db.asService(async (c) => (await c.query(`select * from automation.google_connections where refresh_token is not null`)).rows);
    let ingested = 0, scanned = 0;
    for (const conn of conns) {
      try {
        const access = await this.ensureAccess(conn);
        const sinceMs = conn.watermark ? new Date(conn.watermark).getTime() : Date.now() - 7 * 864e5;
        const filter = `start_time>="${new Date(sinceMs).toISOString()}"`;
        const data = await this.gget(`${MEET}/conferenceRecords?pageSize=20&filter=${encodeURIComponent(filter)}`, access);
        const records: any[] = data.conferenceRecords || [];
        scanned += records.length;
        let maxStart = conn.watermark ? new Date(conn.watermark).getTime() : 0;
        for (const rec of records) {
          const startMs = new Date(rec.startTime).getTime();
          if (conn.watermark && startMs <= new Date(conn.watermark).getTime()) continue;
          // 1) transcrição primeiro — sem transcrição, adianta o watermark e pula (nada a registrar)
          const tr = await this.gget(`${MEET}/${rec.name}/transcripts`, access);
          const transcripts: any[] = tr.transcripts || [];
          if (!transcripts.length) { if (startMs > maxStart) maxStart = startMs; continue; }
          let text = '';
          for (const t of transcripts) {
            let pageToken = '';
            do {
              const ed = await this.gget(`${MEET}/${t.name}/entries?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`, access);
              (ed.transcriptEntries || []).forEach((e: any) => { text += `${e.text || ''}\n`; });
              pageToken = ed.nextPageToken || '';
            } while (pageToken);
          }
          if (!text.trim()) { if (startMs > maxStart) maxStart = startMs; continue; }
          // 2) correlaciona com o Calendar p/ os e-mails reais dos participantes
          const corr = await this.correlate(access, rec, startMs);
          if (corr.allInternal) { if (startMs > maxStart) maxStart = startMs; continue; }  // reunião interna → não cria lead
          let contactEmail: string | null = null, contactName: string | null = null, attendees = '', allowCreate = false;
          if (corr.emails.length) {
            contactEmail = corr.emails[0]; contactName = corr.names[0] || null; attendees = corr.names.join(', '); allowCreate = true;
          } else {
            // sem e-mail externo do Calendar → usa participantes do Meet só p/ CASAR (não criar lixo)
            const pr = await this.gget(`${MEET}/${rec.name}/participants?pageSize=50`, access);
            const names: string[] = (pr.participants || []).map((p: any) => p.signedinUser?.displayName || p.anonymousUser?.displayName || p.phoneUser?.displayName).filter(Boolean);
            contactName = names.find((n) => n && !/crasto|jhon|john/i.test(n)) || null;
            attendees = names.join(', '); allowCreate = false;
          }
          const r = await this.engine.ingestMeetTranscript({ title: `Reunião ${String(rec.startTime || '').slice(0, 10)}`.trim(), meeting_at: rec.startTime, attendees, transcript: text.trim(), contact_email: contactEmail, contact_name: contactName, allow_create: allowCreate });
          if (!(r as any)?.skipped) ingested++;
          if (startMs > maxStart) maxStart = startMs;
        }
        const newWatermark = maxStart ? new Date(maxStart).toISOString() : (conn.watermark || new Date(sinceMs).toISOString());
        await this.db.asService((c) => c.query(`update automation.google_connections set watermark=$2, last_poll_at=now(), last_error=null where id=$1`, [conn.id, newWatermark]));
      } catch (e: any) {
        await this.db.asService((c) => c.query(`update automation.google_connections set last_poll_at=now(), last_error=$2 where id=$1`, [conn.id, String(e?.message).slice(0, 300)]));
        this.log.warn(`poll ${conn.email}: ${e?.message}`);
      }
    }
    const last = await this.db.asService(async (c) => (await c.query(`select to_char(max(last_poll_at),'YYYY-MM-DD"T"HH24:MI:SSOF') as t from automation.google_connections`)).rows[0]?.t);
    return { ok: true, ingested, scanned, connected: conns.length > 0, last_poll_at: last ?? null };
  }
}
