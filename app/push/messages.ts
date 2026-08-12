import type { CourierStage, FoodStage } from "../orderStages";

// What a notification says, in the language the customer reads the app in.
//
// ——— Why these live here and not in app/i18n ———
//
// Every other string in this app is looked up through useT(), in a component,
// in the browser. These are composed on a server, inside a webhook, from a
// status change — there is no component and no hook, and the device is asleep.
//
// The first cut read `en[...]` from the i18n table and shipped English to
// everybody, which was a real cost: somebody reading the shop in Korean got a
// Korean app and an English notification, at the one moment they are away from
// the screen and cannot work out what it means.
//
// Reaching for the ten locale tables instead would pull roughly six hundred
// strings per language into the webhook path to use five of them. This is the
// five, in the ten languages, next to the code that sends them.
//
// The locale comes off the subscription row, recorded when the device turned
// notifications on, so it is the language they were reading at the time.

type Message = { title: string; body: string };

const NOTIFIABLE = ["ready", "voided", "collected", "delivered", "canceled"] as const;

/** The stages worth waking a phone for. See app/push/announce.ts for the ones
 *  deliberately left out and why. */
export type NotifiableStage = (typeof NOTIFIABLE)[number];

export function notifiable(stage: FoodStage | CourierStage): stage is NotifiableStage {
  return (NOTIFIABLE as readonly string[]).includes(stage);
}

const MESSAGES: Record<NotifiableStage, Record<string, Message>> = {
  ready: {
    en: { title: "Your order is ready", body: "It's on the counter at Corner Bagel." },
    es: { title: "Tu pedido está listo", body: "Te espera en el mostrador de Corner Bagel." },
    fa: { title: "سفارش شما آماده است", body: "روی پیشخوان Corner Bagel منتظر شماست." },
    fr: { title: "Votre commande est prête", body: "Elle vous attend au comptoir de Corner Bagel." },
    it: { title: "Il tuo ordine è pronto", body: "Ti aspetta al banco di Corner Bagel." },
    ja: { title: "ご注文の用意ができました", body: "Corner Bagel のカウンターでお待ちしています。" },
    ko: { title: "주문하신 음식이 준비됐어요", body: "Corner Bagel 카운터에서 기다리고 있습니다." },
    my: { title: "သင့်အော်ဒါ အဆင်သင့်ဖြစ်ပါပြီ", body: "Corner Bagel ကောင်တာမှာ စောင့်နေပါတယ်။" },
    ur: { title: "آپ کا آرڈر تیار ہے", body: "Corner Bagel کے کاؤنٹر پر آپ کا منتظر ہے۔" },
    zh: { title: "你的订单做好了", body: "就在 Corner Bagel 的柜台等你。" },
  },
  collected: {
    en: { title: "On the way", body: "Your courier has your order and is heading to you." },
    es: { title: "En camino", body: "El repartidor ya lleva tu pedido." },
    fa: { title: "در راه است", body: "پیک سفارش شما را برداشته و در راه است." },
    fr: { title: "En route", body: "Le coursier a votre commande et arrive." },
    it: { title: "In arrivo", body: "Il corriere ha il tuo ordine e sta arrivando." },
    ja: { title: "配達中です", body: "配達員がご注文を受け取り、向かっています。" },
    ko: { title: "배달 중입니다", body: "배달 기사가 주문을 받아 가고 있어요." },
    my: { title: "လမ်းမှာရှိပါပြီ", body: "ပို့ဆောင်သူက အော်ဒါကိုယူပြီး လာနေပါပြီ။" },
    ur: { title: "راستے میں ہے", body: "قاصد آپ کا آرڈر لے کر آ رہا ہے۔" },
    zh: { title: "正在配送", body: "骑手已取到你的订单，正在赶来。" },
  },
  delivered: {
    en: { title: "Delivered", body: "Your order is at your door. Enjoy." },
    es: { title: "Entregado", body: "Tu pedido está en tu puerta. Que aproveche." },
    fa: { title: "تحویل شد", body: "سفارش شما دم در است. نوش جان." },
    fr: { title: "Livré", body: "Votre commande est à votre porte. Bon appétit." },
    it: { title: "Consegnato", body: "Il tuo ordine è alla porta. Buon appetito." },
    ja: { title: "お届けしました", body: "ご注文は玄関先にあります。どうぞ召し上がれ。" },
    ko: { title: "배달 완료", body: "문 앞에 두었습니다. 맛있게 드세요." },
    my: { title: "ပို့ဆောင်ပြီးပါပြီ", body: "အော်ဒါက တံခါးဝမှာ ရောက်နေပါပြီ။" },
    ur: { title: "پہنچا دیا گیا", body: "آپ کا آرڈر دروازے پر ہے۔ مزے سے کھائیں۔" },
    zh: { title: "已送达", body: "订单已放在你门口，请慢用。" },
  },
  canceled: {
    en: { title: "Delivery cancelled", body: "The courier isn't coming. Call the shop and we'll sort it out." },
    es: { title: "Entrega cancelada", body: "El repartidor no vendrá. Llámanos y lo resolvemos." },
    fa: { title: "ارسال لغو شد", body: "پیک نمی‌آید. با فروشگاه تماس بگیرید تا حلش کنیم." },
    fr: { title: "Livraison annulée", body: "Le coursier ne viendra pas. Appelez-nous, on s'en occupe." },
    it: { title: "Consegna annullata", body: "Il corriere non arriverà. Chiamaci e sistemiamo tutto." },
    ja: { title: "配達がキャンセルされました", body: "配達員は向かいません。店にお電話ください。" },
    ko: { title: "배달이 취소됐습니다", body: "기사가 오지 않습니다. 가게로 전화 주시면 처리해 드릴게요." },
    my: { title: "ပို့ဆောင်မှု ပယ်ဖျက်လိုက်ပါပြီ", body: "ပို့ဆောင်သူ မလာတော့ပါ။ ဆိုင်ကို ဖုန်းဆက်ပေးပါ။" },
    ur: { title: "ڈیلیوری منسوخ", body: "قاصد نہیں آ رہا۔ دکان پر کال کریں، ہم حل کر دیں گے۔" },
    zh: { title: "配送已取消", body: "骑手不会前来。请致电门店，我们来处理。" },
  },
  voided: {
    en: { title: "Your order was cancelled", body: "Call the shop and we'll sort it out." },
    es: { title: "Tu pedido fue cancelado", body: "Llámanos y lo resolvemos." },
    fa: { title: "سفارش شما لغو شد", body: "با فروشگاه تماس بگیرید تا حلش کنیم." },
    fr: { title: "Votre commande a été annulée", body: "Appelez-nous, on s'en occupe." },
    it: { title: "Il tuo ordine è stato annullato", body: "Chiamaci e sistemiamo tutto." },
    ja: { title: "ご注文がキャンセルされました", body: "店にお電話ください。" },
    ko: { title: "주문이 취소됐습니다", body: "가게로 전화 주시면 처리해 드릴게요." },
    my: { title: "သင့်အော်ဒါ ပယ်ဖျက်ခံရပါပြီ", body: "ဆိုင်ကို ဖုန်းဆက်ပေးပါ။" },
    ur: { title: "آپ کا آرڈر منسوخ ہو گیا", body: "دکان پر کال کریں، ہم حل کر دیں گے۔" },
    zh: { title: "你的订单已取消", body: "请致电门店，我们来处理。" },
  },
};

/** These two end the order, so the subscription is swept after they go out. */
export function isFinal(stage: NotifiableStage): boolean {
  return stage === "delivered" || stage === "canceled" || stage === "voided";
}

/** The notification for a stage, in a locale. Falls back to English for a
 *  locale we have no copy for rather than sending nothing — a notification in
 *  the wrong language still tells somebody their food is ready. */
export function messageFor(stage: NotifiableStage, locale: string): Message {
  const table = MESSAGES[stage];
  return table[locale] ?? table.en;
}
