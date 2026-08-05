// Otto, Phase 1 scope: onboarding ONLY (greeting + consent + one warm question,
// spec Section 13 Phase 1). The templates are deterministic, per-language, and
// testable offline; the consent line is delivered to every member on join, no
// exceptions (hard rule 7). Responsive behaviour, caps, and voice arrive Phase 3.
// Internal agent id: otto-r (the Circular Route Otto is a different product).

export const OTTO_ID = 'otto-r';
export const OTTO_NAME = 'Otto';

const TEMPLATES = {
  en: (name) =>
    `Hi ${name}! I am Otto, the assistant in this group, and I work for Rashad.\n\n` +
    `The purpose here is simple: everything you share in this group shapes two products for repair businesses, ` +
    `a growth engine (marketing, sales, customers) and an operations autopilot (the whole back office).\n\n` +
    `One thing said plainly, once: everything in this group, including voice notes, is recorded, transcribed, ` +
    `and analyzed to design these products.\n\n` +
    `From time to time I may ask a short clarifying question. I will never pitch, never advise, and never chat at length.\n\n` +
    `So, ${name}: what part of running the business eats the most of your week?`,
  ru: (name) =>
    `Привет, ${name}! Я Отто, ассистент этой группы, и я работаю на Рашада.\n\n` +
    `Цель простая: всё, чем вы делитесь в этой группе, помогает создать два продукта для ремонтного бизнеса: ` +
    `движок роста (маркетинг, продажи, клиенты) и автопилот операций (весь бэк-офис).\n\n` +
    `Одна вещь, сказанная прямо и один раз: всё в этой группе, включая голосовые сообщения, записывается, ` +
    `расшифровывается и анализируется, чтобы спроектировать эти продукты.\n\n` +
    `Иногда я задам короткий уточняющий вопрос. Я никогда не буду ничего предлагать, советовать или вести долгие разговоры.\n\n` +
    `Итак, ${name}: какая часть работы в вашем бизнесе съедает больше всего времени за неделю?`,
  az: (name) =>
    `Salam, ${name}! Mən Otto, bu qrupun köməkçisiyəm və Rəşad üçün işləyirəm.\n\n` +
    `Məqsəd sadədir: bu qrupda bölüşdüyünüz hər şey təmir biznesi üçün iki məhsulun yaradılmasına kömək edir: ` +
    `böyümə mühərriki (marketinq, satış, müştərilər) və əməliyyat avtopilotu (bütün arxa ofis).\n\n` +
    `Bir şeyi açıq və bir dəfə deyirəm: bu qrupdakı hər şey, səsli mesajlar da daxil olmaqla, bu məhsulları ` +
    `dizayn etmək üçün qeydə alınır, mətnə çevrilir və təhlil edilir.\n\n` +
    `Hərdən qısa dəqiqləşdirici sual verə bilərəm. Heç vaxt heç nə təklif etməyəcəyəm, məsləhət verməyəcəyəm ` +
    `və uzun söhbətlər etməyəcəyəm.\n\n` +
    `Beləliklə, ${name}: biznesi idarə etməkdə həftənizin ən çox vaxtını hansı iş yeyir?`,
};

export function onboardingMessage(name, language) {
  const template = TEMPLATES[language] || TEMPLATES.en;
  return template(name);
}
