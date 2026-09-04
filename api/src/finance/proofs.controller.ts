import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { FinanceAccessGuard } from '../common/finance-access.guard';
import { ProofsService } from './proofs.service';

// Comprovantes/Conciliação — parte do MÓDULO Financeiro (vendável). Gate por
// FinanceAccessGuard (org tem o módulo + papel). Só LEITURA por IA; a baixa da parcela é
// feita pelo caminho já existente (fin_account_upsert) após o operador CONFIRMAR. O contexto
// da empresa (contexto()) já é escopado por RLS no usuário que pediu.
@Controller('finance/proofs')
@UseGuards(JwtOrgGuard, FinanceAccessGuard)
export class ProofsController {
  constructor(private readonly proofs: ProofsService) {}

  // Recebe a imagem (base64) e devolve os dados LIDOS do comprovante. Não grava nada.
  @Post('extract')
  async extract(@Body() b: any): Promise<{ ok: boolean; data?: any; error?: string }> {
    const img = String(b?.image_base64 || '');
    if (!img) return { ok: false, error: 'imagem vazia' };
    try {
      const data = await this.proofs.extract(img, String(b?.mime || 'image/jpeg'), b?.filename ? String(b.filename) : undefined);
      return { ok: true, data };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  // Fatia 2 — leitor UNIFICADO: comprovante OU extrato. Devolve SEMPRE uma lista de
  // lançamentos já classificados (receita de cliente / custo / interna / imposto / pessoal).
  // Continua sem gravar nada: a baixa é decisão humana na tela.
  @Post('read')
  async read(@Req() req: any, @Body() b: any): Promise<{ ok: boolean; data?: any; error?: string }> {
    const file = String(b?.file_base64 || b?.image_base64 || '');
    if (!file) return { ok: false, error: 'arquivo vazio' };
    const uid = String(req?.user?.id || '');
    try {
      const data = await this.proofs.readDoc(uid, file, String(b?.mime || 'image/jpeg'), b?.filename ? String(b.filename) : undefined);
      return { ok: true, data };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) };
    }
  }
}
