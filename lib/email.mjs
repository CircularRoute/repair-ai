// Brevo transactional email, STRICTLY limited to sign-in codes and links
// (founder ruling 13, the only approved external send besides push). Needs
// BREVO_API_KEY and a Brevo-verified sender in BREVO_SENDER_EMAIL.

const TEMPLATES = {
  en: (code, url) => ({
    subject: `${code} is your Repair AI sign-in code`,
    text:
      `Your Repair AI sign-in code: ${code}\n\n` +
      `Type it in the app. It expires in 15 minutes.\n\n` +
      `On a computer you can also open this link:\n${url}\n\n` +
      `If you did not request this, ignore this email.`,
  }),
  ru: (code, url) => ({
    subject: `${code} - vash kod vkhoda v Repair AI`,
    text:
      `Vash kod dlya vkhoda v Repair AI: ${code}\n\n` +
      `Vvedite ego v prilozhenii. Kod deystvuet 15 minut.\n\n` +
      `Na kompyutere mozhno otkryt ssylku:\n${url}\n\n` +
      `Esli vy ne zaprashivali kod, prosto proignoriruyte eto pismo.`,
  }),
  az: (code, url) => ({
    subject: `${code} - Repair AI giris kodunuz`,
    text:
      `Repair AI giris kodunuz: ${code}\n\n` +
      `Onu tetbiqde daxil edin. Kod 15 deqiqe kechearlidir.\n\n` +
      `Komputerde bu linki de acha bilersiniz:\n${url}\n\n` +
      `Bu kodu siz istemesinizse, mektubu nezere almayin.`,
  }),
};

// One-time invitation email when the admin adds a member (ruling 13).
const WELCOME_TEMPLATES = {
  en: (name, url) => ({
    subject: 'Rashad added you to Repair AI',
    text:
      `Hi ${name},\n\n` +
      `Rashad added you to Repair AI, a private group chat for repair business owners.\n\n` +
      `To join, open this address on your phone:\n${url}\n\n` +
      `Enter this email address there and type the 6-digit code you receive. ` +
      `After signing in, the app will help you add Repair AI to your home screen so you get message notifications.`,
  }),
  ru: (name, url) => ({
    subject: 'Rashad dobavil vas v Repair AI',
    text:
      `Zdravstvuyte, ${name}!\n\n` +
      `Rashad dobavil vas v Repair AI, zakrytyy gruppovoy chat dlya vladeltsev remontnogo biznesa.\n\n` +
      `Chtoby voyti, otkroyte etot adres na telefone:\n${url}\n\n` +
      `Vvedite tam etot email i 6-znachnyy kod iz pisma. Posle vkhoda prilozhenie podskazhet, ` +
      `kak dobavit Repair AI na glavnyy ekran, chtoby poluchat uvedomleniya.`,
  }),
  az: (name, url) => ({
    subject: 'Rashad sizi Repair AI qrupuna elave etdi',
    text:
      `Salam, ${name}!\n\n` +
      `Rashad sizi Repair AI qrupuna elave etdi. Bu, temir biznesi sahibleri uchun qapali qrup sohbetidir.\n\n` +
      `Daxil olmaq uchun telefonunuzda bu unvani achin:\n${url}\n\n` +
      `Orada bu email unvanini yazin ve gelen 6 reqemli kodu daxil edin. Girishden sonra tetbiq ` +
      `Repair AI-ni esas ekrana elave etmeyi gosterecek ki, bildirishler gelsin.`,
  }),
};

export async function sendWelcome({ to, name, language, url }, sender = brevoSend) {
  const template = (WELCOME_TEMPLATES[language] || WELCOME_TEMPLATES.en)(name, url);
  return sender({ to, toName: name, subject: template.subject, text: template.text });
}

export function emailConfigured() {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
}

// sender injectable for offline tests.
export async function sendLoginCode({ to, name, language, code, url }, sender = brevoSend) {
  const template = (TEMPLATES[language] || TEMPLATES.en)(code, url);
  return sender({
    to,
    toName: name,
    subject: template.subject,
    text: template.text,
  });
}

async function brevoSend({ to, toName, subject, text }) {
  if (!emailConfigured()) {
    throw new Error('email not configured: BREVO_API_KEY / BREVO_SENDER_EMAIL missing');
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: process.env.BREVO_SENDER_EMAIL, name: 'Repair AI' },
      to: [{ email: to, name: toName || to }],
      subject,
      textContent: text,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`brevo send failed: ${res.status} ${detail.slice(0, 200)}`);
  }
  return true;
}
