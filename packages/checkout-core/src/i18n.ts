import type { Locale } from './types.ts';

export interface Messages {
  readonly group: string;
  readonly eyebrow: string;
  readonly qrAlt: string;
  readonly dueIn: (mmss: string) => string;
  readonly paidAt: (time: string) => string;
  readonly statusCreating: string;
  readonly statusAwaiting: string;
  readonly statusDegraded: string;
  readonly statusExpired: string;
  readonly statusPaid: string;
  readonly statusFailed: string;
  readonly noteCreating: string;
  readonly noteAwaiting: string;
  readonly noteDegraded: string;
  readonly noteExpired: string;
  readonly notePaid: string;
  readonly noteFailed: string;
  readonly payloadLabel: string;
  readonly copy: string;
  readonly copied: string;
  readonly copyManual: string;
  readonly checking: string;
  readonly checkNow: string;
  readonly newCode: string;
  readonly tryAgain: string;
  readonly checkedLabel: string;
  readonly lastCheckedLabel: string;
  readonly ago: (minutes: number) => string;
  readonly codeStatusLabel: string;
  readonly expiredAtValue: (time: string) => string;
  readonly e2eLabel: string;
  readonly refusalLabel: string;
  readonly remainingAnnounce: (mmss: string) => string;
}

const ptBR: Messages = {
  group: 'Pagamento via Pix',
  eyebrow: 'Cobrança Pix',
  qrAlt: 'QR code do Pix',
  dueIn: (mmss) => `vence em ${mmss}`,
  paidAt: (time) => `pago às ${time}`,
  statusCreating: 'Gerando o código',
  statusAwaiting: 'Aguardando pagamento',
  statusDegraded: 'Sem confirmação do servidor',
  statusExpired: 'Expirada',
  statusPaid: 'Concluída',
  statusFailed: 'Não foi possível gerar',
  noteCreating: 'Isso costuma levar 1 a 2 segundos.',
  noteAwaiting: 'Abra o app do seu banco, escolha Pix › Pix Copia e Cola e cole o código.',
  noteDegraded: 'Se você já pagou, o pagamento não se perde — seguimos tentando.',
  noteExpired: 'Códigos Pix valem 15 minutos. Gere um novo para continuar — nada foi cobrado.',
  notePaid: 'Recebemos a confirmação do seu Pix. Nada mais é preciso fazer aqui.',
  noteFailed: 'O provedor recusou a cobrança. Tente de novo — nada foi cobrado.',
  payloadLabel: 'Pix Copia e Cola',
  copy: 'Copiar código',
  copied: 'Código copiado',
  copyManual: 'Selecione e copie o código',
  checking: 'Verificando…',
  checkNow: 'Verificar agora',
  newCode: 'Gerar novo código',
  tryAgain: 'Tentar de novo',
  checkedLabel: 'Verificado',
  lastCheckedLabel: 'Última confirmação',
  ago: (minutes) => `há ${minutes} min`,
  codeStatusLabel: 'Situação do código',
  expiredAtValue: (time) => `EXPIRADO ÀS ${time}`,
  e2eLabel: 'ID da transação',
  refusalLabel: 'Recusa do provedor',
  remainingAnnounce: (mmss) => `Faltam ${mmss} para o código expirar.`,
};

export { ptBR };

export const messagesFor = (_locale?: Locale, override?: Messages): Messages => override ?? ptBR;
