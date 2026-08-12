import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtOrgGuard } from '../common/jwt-org.guard';
import { AdminGuard } from '../common/admin.guard';
import { ProofsService } from './proofs.service';

// Comprovantes (Fatia 1) — 🔒 ADMIN-ONLY. Só LEITURA por IA; a baixa da parcela é
// feita pelo caminho já existente (fin_account_upsert) após o operador CONFIRMAR.
@Controller('finance/proofs')
@UseGuards(JwtOrgGuard, AdminGuard)
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
}
