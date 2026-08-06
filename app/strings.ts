import type { LocaleId } from "./localeScript";

// Every string the app says, in every language it says it in.
//
// One flat table rather than a file per language, because the thing you almost
// always want to see is *one string across all seven*, and that is a diff you
// can read here and cannot read across seven files. It gets split when it
// stops fitting on a screen, not before.
//
// English is the source and the fallback. A language missing a key gets the
// English word in the right place rather than a blank or a key name, which is
// what makes this shippable one screen at a time: the untranslated half of the
// app is in English, not broken.
//
// ——— A warning that belongs at the top ———
//
// These translations have not been reviewed by a native speaker. They are
// good enough for chrome, buttons and labels, where a slightly stiff phrase
// costs nothing. They are NOT good enough for anything a person could be hurt
// by getting wrong, which in a food shop means allergens, and allergen text is
// deliberately absent from this table for that reason. It stays in English
// until somebody who speaks the language has read it. See app/shop/products.ts.

export const KEYS = [
  // The finder: the front door of an order.
  "finder.pickup",
  "finder.delivery",
  "finder.catering",
  "finder.searchPlaceholder",
  "finder.addressPlaceholder",
  "finder.clear",
  "finder.searchArea",
  "finder.startAddress",
  "finder.startSearch",
  "finder.useMyLocation",
  "finder.zoomIn",
  "finder.zoomOut",
  "finder.order",
  "finder.orderNow",
  "finder.directions",
  "finder.call",
  "finder.copyAddress",
  "finder.copied",

  // The tab bar.
  "nav.home",
  "nav.menu",
  "nav.reorder",
  "nav.gift",
  "nav.about",

  // Settings, on the front door and in the account.
  "settings.appearance",
  "settings.darkMode",
  "settings.language",

  "common.close",
] as const;

export type StringKey = (typeof KEYS)[number];

type Table = Partial<Record<StringKey, string>>;

const en: Record<StringKey, string> = {
  "finder.pickup": "Pickup",
  "finder.delivery": "Delivery",
  "finder.catering": "Catering",
  "finder.searchPlaceholder": "Search store, city, state, or zip",
  "finder.addressPlaceholder": "Enter delivery address",
  "finder.clear": "Clear",
  "finder.searchArea": "Search area",
  "finder.startAddress": "Enter an address above to get started.",
  "finder.startSearch": "Search a store, city, state or zip to get started.",
  "finder.useMyLocation": "Use my location",
  "finder.zoomIn": "Zoom in",
  "finder.zoomOut": "Zoom out",
  "finder.order": "Order",
  "finder.orderNow": "Order now",
  "finder.directions": "Directions",
  "finder.call": "Call",
  "finder.copyAddress": "Copy address",
  "finder.copied": "Copied",

  "nav.home": "Home",
  "nav.menu": "Menu",
  "nav.reorder": "Reorder",
  "nav.gift": "Gift",
  "nav.about": "About",

  "settings.appearance": "Appearance",
  "settings.darkMode": "Dark mode",
  "settings.language": "Language",

  "common.close": "Close",
};

const es: Table = {
  "finder.pickup": "Recoger",
  "finder.delivery": "Entrega",
  "finder.catering": "Catering",
  "finder.searchPlaceholder": "Busca tienda, ciudad, estado o código postal",
  "finder.addressPlaceholder": "Introduce la dirección de entrega",
  "finder.clear": "Borrar",
  "finder.searchArea": "Buscar en esta zona",
  "finder.startAddress": "Introduce una dirección arriba para empezar.",
  "finder.startSearch": "Busca una tienda, ciudad, estado o código postal para empezar.",
  "finder.useMyLocation": "Usar mi ubicación",
  "finder.zoomIn": "Acercar",
  "finder.zoomOut": "Alejar",
  "finder.order": "Pedir",
  "finder.orderNow": "Pedir ahora",
  "finder.directions": "Cómo llegar",
  "finder.call": "Llamar",
  "finder.copyAddress": "Copiar dirección",
  "finder.copied": "Copiado",

  "nav.home": "Inicio",
  "nav.menu": "Menú",
  "nav.reorder": "Repetir",
  "nav.gift": "Regalo",
  "nav.about": "Nosotros",

  "settings.appearance": "Apariencia",
  "settings.darkMode": "Modo oscuro",
  "settings.language": "Idioma",

  "common.close": "Cerrar",
};

const ko: Table = {
  "finder.pickup": "픽업",
  "finder.delivery": "배달",
  "finder.catering": "케이터링",
  "finder.searchPlaceholder": "매장, 도시, 주 또는 우편번호 검색",
  "finder.addressPlaceholder": "배달 주소를 입력하세요",
  "finder.clear": "지우기",
  "finder.searchArea": "이 지역 검색",
  "finder.startAddress": "시작하려면 위에 주소를 입력하세요.",
  "finder.startSearch": "시작하려면 매장, 도시, 주 또는 우편번호를 검색하세요.",
  "finder.useMyLocation": "내 위치 사용",
  "finder.zoomIn": "확대",
  "finder.zoomOut": "축소",
  "finder.order": "주문",
  "finder.orderNow": "지금 주문",
  "finder.directions": "길찾기",
  "finder.call": "전화",
  "finder.copyAddress": "주소 복사",
  "finder.copied": "복사됨",

  "nav.home": "홈",
  "nav.menu": "메뉴",
  "nav.reorder": "재주문",
  "nav.gift": "선물",
  "nav.about": "소개",

  "settings.appearance": "화면 모드",
  "settings.darkMode": "다크 모드",
  "settings.language": "언어",

  "common.close": "닫기",
};

// The right-to-left one. Nothing about the strings is special; the layout is,
// and that is handled by dir="rtl" on the document plus logical properties in
// the components. See globals.css.
const ur: Table = {
  "finder.pickup": "پک اپ",
  "finder.delivery": "ڈیلیوری",
  "finder.catering": "کیٹرنگ",
  "finder.searchPlaceholder": "اسٹور، شہر، ریاست یا زپ کوڈ تلاش کریں",
  "finder.addressPlaceholder": "ڈیلیوری کا پتہ درج کریں",
  "finder.clear": "صاف کریں",
  "finder.searchArea": "اس علاقے میں تلاش کریں",
  "finder.startAddress": "شروع کرنے کے لیے اوپر پتہ درج کریں۔",
  "finder.startSearch": "شروع کرنے کے لیے اسٹور، شہر، ریاست یا زپ تلاش کریں۔",
  "finder.useMyLocation": "میری لوکیشن استعمال کریں",
  "finder.zoomIn": "زوم اِن",
  "finder.zoomOut": "زوم آؤٹ",
  "finder.order": "آرڈر",
  "finder.orderNow": "ابھی آرڈر کریں",
  "finder.directions": "راستہ",
  "finder.call": "کال کریں",
  "finder.copyAddress": "پتہ کاپی کریں",
  "finder.copied": "کاپی ہو گیا",

  "nav.home": "ہوم",
  "nav.menu": "مینو",
  "nav.reorder": "دوبارہ آرڈر",
  "nav.gift": "تحفہ",
  "nav.about": "تعارف",

  "settings.appearance": "ظاہری شکل",
  "settings.darkMode": "ڈارک موڈ",
  "settings.language": "زبان",

  "common.close": "بند کریں",
};

const ja: Table = {
  "finder.pickup": "受け取り",
  "finder.delivery": "配達",
  "finder.catering": "ケータリング",
  "finder.searchPlaceholder": "店舗、市、州、郵便番号で検索",
  "finder.addressPlaceholder": "配達先の住所を入力",
  "finder.clear": "クリア",
  "finder.searchArea": "このエリアを検索",
  "finder.startAddress": "上に住所を入力してください。",
  "finder.startSearch": "店舗、市、州、郵便番号を検索してください。",
  "finder.useMyLocation": "現在地を使う",
  "finder.zoomIn": "拡大",
  "finder.zoomOut": "縮小",
  "finder.order": "注文",
  "finder.orderNow": "今すぐ注文",
  "finder.directions": "経路",
  "finder.call": "電話",
  "finder.copyAddress": "住所をコピー",
  "finder.copied": "コピーしました",

  "nav.home": "ホーム",
  "nav.menu": "メニュー",
  "nav.reorder": "再注文",
  "nav.gift": "ギフト",
  "nav.about": "情報",

  "settings.appearance": "外観",
  "settings.darkMode": "ダークモード",
  "settings.language": "言語",

  "common.close": "閉じる",
};

const zh: Table = {
  "finder.pickup": "自取",
  "finder.delivery": "配送",
  "finder.catering": "餐饮服务",
  "finder.searchPlaceholder": "搜索门店、城市、州或邮编",
  "finder.addressPlaceholder": "输入配送地址",
  "finder.clear": "清除",
  "finder.searchArea": "搜索该区域",
  "finder.startAddress": "请在上方输入地址以开始。",
  "finder.startSearch": "搜索门店、城市、州或邮编以开始。",
  "finder.useMyLocation": "使用我的位置",
  "finder.zoomIn": "放大",
  "finder.zoomOut": "缩小",
  "finder.order": "下单",
  "finder.orderNow": "立即下单",
  "finder.directions": "路线",
  "finder.call": "致电",
  "finder.copyAddress": "复制地址",
  "finder.copied": "已复制",

  "nav.home": "首页",
  "nav.menu": "菜单",
  "nav.reorder": "再来一单",
  "nav.gift": "礼品",
  "nav.about": "关于",

  "settings.appearance": "外观",
  "settings.darkMode": "深色模式",
  "settings.language": "语言",

  "common.close": "关闭",
};

const my: Table = {
  "finder.pickup": "လာယူရန်",
  "finder.delivery": "ပို့ဆောင်ရန်",
  "finder.catering": "ကေတာရင်",
  "finder.searchPlaceholder": "ဆိုင်၊ မြို့၊ ပြည်နယ် သို့မဟုတ် ဇစ်ကုဒ် ရှာပါ",
  "finder.addressPlaceholder": "ပို့ဆောင်ရန် လိပ်စာ ထည့်ပါ",
  "finder.clear": "ရှင်းလင်းရန်",
  "finder.searchArea": "ဤဧရိယာကို ရှာပါ",
  "finder.startAddress": "စတင်ရန် အပေါ်တွင် လိပ်စာ ထည့်ပါ။",
  "finder.startSearch": "စတင်ရန် ဆိုင်၊ မြို့၊ ပြည်နယ် သို့မဟုတ် ဇစ်ကုဒ် ရှာပါ။",
  "finder.useMyLocation": "ကျွန်ုပ်၏ တည်နေရာကို သုံးရန်",
  "finder.zoomIn": "ချဲ့ရန်",
  "finder.zoomOut": "ချုံ့ရန်",
  "finder.order": "မှာယူရန်",
  "finder.orderNow": "ယခု မှာယူပါ",
  "finder.directions": "လမ်းညွှန်",
  "finder.call": "ဖုန်းခေါ်ရန်",
  "finder.copyAddress": "လိပ်စာ ကူးယူပါ",
  "finder.copied": "ကူးယူပြီး",

  "nav.home": "ပင်မ",
  "nav.menu": "မီနူး",
  "nav.reorder": "ပြန်မှာရန်",
  "nav.gift": "လက်ဆောင်",
  "nav.about": "အကြောင်း",

  "settings.appearance": "အသွင်အပြင်",
  "settings.darkMode": "အမှောင် မုဒ်",
  "settings.language": "ဘာသာစကား",

  "common.close": "ပိတ်ရန်",
};

export const STRINGS: Record<LocaleId, Table> & { en: Record<StringKey, string> } = {
  en,
  es,
  ko,
  ur,
  ja,
  zh,
  my,
};
