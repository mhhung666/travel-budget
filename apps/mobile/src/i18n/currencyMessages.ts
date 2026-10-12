import type { AppLocale } from './messages';

// Common labels align with the shared creation design; Intl supplies other currencies.
export const currencyMessages: Record<
  AppLocale,
  {
    title: string;
    search: string;
    common: string;
    other: string;
    noMatch: string;
    clear: string;
    hint: string;
    names: Readonly<Record<string, string>>;
  }
> = {
  zh: {
    title: '選擇帳本基準幣別',
    search: '搜尋代碼或名稱',
    common: '常用幣別',
    other: '其他幣別',
    noMatch: '找不到符合的幣別',
    clear: '清除搜尋',
    hint: '試試代碼或名稱，例如 USD、美元',
    names: {
      TWD: '新臺幣',
      JPY: '日圓',
      USD: '美元',
      EUR: '歐元',
      HKD: '港元',
      THB: '泰銖',
      KRW: '韓元',
      CNY: '人民幣',
      GBP: '英鎊',
      SGD: '新加坡元',
      AUD: '澳元',
      MYR: '馬來西亞令吉',
      VND: '越南盾',
      PHP: '菲律賓披索',
      IDR: '印尼盾',
    },
  },
  'zh-CN': {
    title: '选择账本基准币别',
    search: '搜索代码或名称',
    common: '常用币别',
    other: '其他币别',
    noMatch: '找不到符合的币别',
    clear: '清除搜索',
    hint: '试试代码或名称，例如 USD、美元',
    names: {
      TWD: '新台币',
      JPY: '日元',
      USD: '美元',
      EUR: '欧元',
      HKD: '港元',
      THB: '泰铢',
      KRW: '韩元',
      CNY: '人民币',
      GBP: '英镑',
      SGD: '新加坡元',
      AUD: '澳元',
      MYR: '马来西亚林吉特',
      VND: '越南盾',
      PHP: '菲律宾比索',
      IDR: '印度尼西亚盾',
    },
  },
  en: {
    title: 'Choose ledger base currency',
    search: 'Search code or name',
    common: 'Common currencies',
    other: 'Other currencies',
    noMatch: 'No matching currency',
    clear: 'Clear search',
    hint: 'Try a code or name, such as USD or US Dollar',
    names: {
      TWD: 'New Taiwan Dollar',
      JPY: 'Japanese Yen',
      USD: 'US Dollar',
      EUR: 'Euro',
      HKD: 'Hong Kong Dollar',
      THB: 'Thai Baht',
      KRW: 'South Korean Won',
      CNY: 'Chinese Yuan',
      GBP: 'British Pound',
      SGD: 'Singapore Dollar',
      AUD: 'Australian Dollar',
      MYR: 'Malaysian Ringgit',
      VND: 'Vietnamese Dong',
      PHP: 'Philippine Peso',
      IDR: 'Indonesian Rupiah',
    },
  },
  jp: {
    title: '帳簿の基準通貨を選択',
    search: 'コードまたは名称を検索',
    common: 'よく使う通貨',
    other: 'その他の通貨',
    noMatch: '一致する通貨がありません',
    clear: '検索をクリア',
    hint: 'USD、米ドルなどのコードや名称をお試しください',
    names: {
      TWD: 'ニュー台湾ドル',
      JPY: '日本円',
      USD: '米ドル',
      EUR: 'ユーロ',
      HKD: '香港ドル',
      THB: 'タイバーツ',
      KRW: '韓国ウォン',
      CNY: '中国人民元',
      GBP: '英ポンド',
      SGD: 'シンガポールドル',
      AUD: '豪ドル',
      MYR: 'マレーシアリンギット',
      VND: 'ベトナムドン',
      PHP: 'フィリピンペソ',
      IDR: 'インドネシアルピア',
    },
  },
};
