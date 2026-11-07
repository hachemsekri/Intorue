/** Builds the quote-request email (table layout + inline styles, works in Gmail, Outlook, Apple Mail). */
export interface QuoteMail {
  name: string;
  phone: string;
  clientType: 'individual' | 'company';
  company: string;
  city: string;
  car: number;
  moto: number;
  trot: number;
  total: number;
  saved: number;
  locale: string;
  receivedAt: Date;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const NAVY = '#0E2A47';
const TURQ = '#14B8A6';
const TURQ_D = '#0E7C7B';
const MUTED = '#5B6B7F';
const LINE = '#DDE3EA';
const BG = '#F3F6F9';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const LANG: Record<string, string> = { fr: 'Français', ar: 'Arabe', en: 'English' };

export function quoteEmail(q: QuoteMail): { subject: string; html: string; text: string } {
  const vehicles = q.car + q.moto + q.trot;
  const when = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Tunis', dateStyle: 'full', timeStyle: 'short' }).format(q.receivedAt);
  const local = q.phone.startsWith('+216') ? q.phone.slice(4).replace(/(\d{2})(\d{3})(\d{3})/, '$1 $2 $3') : q.phone;
  const wa = q.phone.replace(/\D/g, '');
  const who = q.clientType === 'company' ? `Entreprise · ${q.company}` : 'Particulier';
  const subject = `Nouveau devis : ${q.name} · ${vehicles} véhicule${vehicles > 1 ? 's' : ''} · ${q.total} DT`;

  const chip = (n: number, label: string) =>
    n > 0
      ? `<td style="padding:0 8px 8px 0"><span style="display:inline-block;background:#E6F7F5;color:${TURQ_D};font:700 14px ${FONT};padding:8px 14px;border-radius:999px">${n} ${label}</span></td>`
      : '';
  const row = (k: string, v: string) =>
    `<tr><td style="padding:12px 0;border-top:1px solid ${LINE};font:400 14px ${FONT};color:${MUTED};width:42%">${esc(k)}</td><td style="padding:12px 0;border-top:1px solid ${LINE};font:600 15px ${FONT};color:${NAVY}">${v}</td></tr>`;

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${BG}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(q.name)} · ${esc(local)} · ${vehicles} véhicule${vehicles > 1 ? 's' : ''} · ${q.total} DT</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="background:${NAVY};border-radius:18px 18px 0 0;padding:22px 28px">
  <table role="presentation" width="100%"><tr>
    <td style="font:800 22px ${FONT};letter-spacing:-0.02em;color:#FFFFFF">Into<span style="color:${TURQ}">rue</span></td>
    <td align="right" style="font:600 12px ${FONT};color:#9FB3C8">Demande de devis</td>
  </tr></table>
</td></tr>
<tr><td style="background:#FFFFFF;padding:30px 28px 8px">
  <p style="margin:0 0 6px;font:600 13px ${FONT};color:${TURQ_D}">Nouveau client à rappeler</p>
  <h1 style="margin:0;font:800 28px/1.15 ${FONT};letter-spacing:-0.02em;color:${NAVY}">${esc(q.name)}</h1>
  <p style="margin:6px 0 0;font:400 15px ${FONT};color:${MUTED}">${esc(who)}${q.city ? ` · ${esc(q.city)}` : ''}</p>
</td></tr>
<tr><td style="background:#FFFFFF;padding:18px 28px 6px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};border-radius:14px"><tr><td style="padding:18px 20px">
    <p style="margin:0;font:600 12px ${FONT};color:${MUTED}">Téléphone</p>
    <p style="margin:4px 0 14px;font:800 26px ${FONT};letter-spacing:0.01em;color:${NAVY}">${esc(local)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:8px"><a href="tel:${esc(q.phone)}" style="display:inline-block;background:${TURQ};color:#06302D;font:800 15px ${FONT};text-decoration:none;padding:12px 22px;border-radius:999px">Appeler</a></td>
      <td><a href="https://wa.me/${wa}" style="display:inline-block;background:#FFFFFF;color:${NAVY};border:1px solid ${LINE};font:700 15px ${FONT};text-decoration:none;padding:11px 20px;border-radius:999px">WhatsApp</a></td>
    </tr></table>
  </td></tr></table>
</td></tr>
<tr><td style="background:#FFFFFF;padding:22px 28px 0">
  <p style="margin:0 0 10px;font:700 15px ${FONT};color:${NAVY}">Véhicules à équiper</p>
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>${chip(q.car, q.car > 1 ? 'voitures' : 'voiture')}${chip(q.moto, q.moto > 1 ? 'motos' : 'moto')}${chip(q.trot, q.trot > 1 ? 'trottinettes' : 'trottinette')}</tr></table>
</td></tr>
<tr><td style="background:#FFFFFF;padding:10px 28px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NAVY};border-radius:14px"><tr>
    <td style="padding:18px 20px;font:600 14px ${FONT};color:#9FB3C8">Total annoncé au client</td>
    <td align="right" style="padding:18px 20px;font:800 24px ${FONT};color:#FFFFFF">${q.total} DT${q.saved > 0 ? `<br><span style="font:600 13px ${FONT};color:${TURQ}">Économie ${q.saved} DT</span>` : ''}</td>
  </tr></table>
</td></tr>
<tr><td style="background:#FFFFFF;padding:18px 28px 26px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${row('Reçue le', esc(when))}
    ${row('Langue du site', esc(LANG[q.locale] ?? q.locale))}
    ${row('Numéro complet', esc(q.phone))}
  </table>
</td></tr>
<tr><td style="background:#FFFFFF;border-radius:0 0 18px 18px;border-top:1px solid ${LINE};padding:16px 28px;font:400 12px/1.5 ${FONT};color:${MUTED}">
  Envoyé automatiquement par le formulaire « Demander un devis » de muycab.host. Ces données sont personnelles : ne les transférez pas.
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `Nouvelle demande de devis : ${q.name}`,
    `${who}${q.city ? ` · ${q.city}` : ''}`,
    `Téléphone : ${q.phone}`,
    `Véhicules : ${q.car} voiture(s), ${q.moto} moto(s), ${q.trot} trottinette(s)`,
    `Total annoncé : ${q.total} DT${q.saved > 0 ? ` (économie ${q.saved} DT)` : ''}`,
    `Reçue le : ${when}`,
  ].join('\n');
  return { subject, html, text };
}