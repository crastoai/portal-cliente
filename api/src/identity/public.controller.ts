import { Body, Controller, Post, Req } from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * Rotas PÚBLICAS de identidade (sem JWT — quem esqueceu a senha não tem sessão).
 * Controller separado de propósito: o IdentityController inteiro é guardado por
 * JwtOrgGuard, e furar um guard de classe por rota é fácil de errar sem perceber.
 */
@Controller('identity')
export class IdentityPublicController {
  constructor(private readonly users: UsersService) {}

  /**
   * "Esqueci minha senha" — Portal e WhatsApp CRM (mesma conta).
   * SEMPRE responde ok, exista ou não o e-mail: dizer "este e-mail não existe" entrega
   * de graça quem é cliente da Crasto.AI (enumeração de usuários). Só sai e-mail se a
   * pessoa realmente tiver conta.
   */
  @Post('forgot')
  forgot(@Req() req: any, @Body() b: any) { return this.users.forgot(req, b?.email, b?.target); }
}
