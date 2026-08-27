// Rotas da integração Google Meet (D5). ISOLADAS sob /integrations/google-meet/*.
// - Admin: start (gera URL do popup OAuth), status, disconnect, poll-now.
// - Público: callback (Google redireciona o navegador; devolve HTML que fecha o popup).
import { Controller, Get, Post, Query, Req, Res, Header, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { AdminGuard } from '../common/admin.guard';
import { GoogleMeetService } from './google-meet.service';

@Controller('integrations/google-meet')
@UseGuards(JwtOrgGuard, AdminGuard)
export class IntegrationsGoogleController {
  constructor(private readonly gmeet: GoogleMeetService) {}
  private uid(req: any): string { return req.user.id; }

  @Get('oauth/start') start(@Req() req: any) { return this.gmeet.startUrl(this.uid(req)); }
  @Get('status') status() { return this.gmeet.status(); }
  @Post('disconnect') disconnect() { return this.gmeet.disconnect(); }
  @Post('poll-now') pollNow() { return this.gmeet.poll(); }
}

// Callback público (sem JWT — quem chama é o navegador via redirect do Google). Segurança pelo `state`.
@Controller('integrations/google-meet/oauth')
export class IntegrationsGooglePublicController {
  constructor(private readonly gmeet: GoogleMeetService) {}

  @Get('callback')
  @Header('content-type', 'text/html; charset=utf-8')
  async callback(@Query('code') code: string, @Query('state') state: string, @Query('error') error: string, @Res({ passthrough: true }) _res: Response): Promise<string> {
    const page = (title: string, msg: string, ok: boolean, email = '') => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui;background:#0a1633;color:#fff;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><div style="font-size:40px">${ok ? '✅' : '⚠️'}</div><h2>${title}</h2><p style="opacity:.8">${msg}</p></div>
<script>try{window.opener&&window.opener.postMessage({type:'google-meet-connected',ok:${ok},email:${JSON.stringify(email)}},'*')}catch(e){} setTimeout(function(){window.close()}, 1200);</script>
</body></html>`;
    if (error) return page('Conexão cancelada', String(error), false);
    if (!code || !state) return page('Faltam parâmetros', 'code/state ausentes.', false);
    try {
      const r = await this.gmeet.handleCallback(code, state);
      return page('Google conectado', `Conta ${r.email || ''} conectada. Pode fechar esta janela.`, true, r.email || '');
    } catch (e: any) {
      return page('Erro ao conectar', String(e?.message || e).slice(0, 200), false);
    }
  }
}
