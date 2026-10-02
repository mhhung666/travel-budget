/**
 * 飯店「品牌 / 集團」精選目錄（ROADMAP #19 旅行成就）。
 *
 * 單一飯店是開放集合（百萬級、無乾淨開放資料）——不做目錄，StayRecord 以自由文字存飯店名；
 * 「品牌」才是有限集合，人工精選維護於此（成就頁品牌牆的收集單位）。
 * 品牌缺漏不擋輸入（StayRecord.brand 可為 null＝獨立旅宿/未知品牌），發現缺漏直接在此補。
 *
 * `id` 為穩定識別碼（存進 StayRecord.brand，勿改既有值——改了等於資料遷移）。
 * `nameZh` 為繁中常用名（zh / zh-CN 介面顯示用；未提供則顯示英文名）。
 */

export type HotelTier = 'luxury' | 'upscale' | 'midscale' | 'budget' | 'hostel';

export const HOTEL_TIERS: HotelTier[] = ['luxury', 'upscale', 'midscale', 'budget', 'hostel'];

export interface HotelGroup {
  id: string;
  name: string;
  nameZh?: string;
}

export interface HotelBrand {
  id: string;
  name: string;
  nameZh?: string;
  /** 所屬集團（HOTEL_GROUPS.id）。 */
  group: string;
  tier: HotelTier;
  /**
   * 帶入啟發式（matchHotelBrand）額外比對的別名——用於「集團旗艦」品牌的裸集團關鍵字：
   * 物業常寫「城市 + Marriott + 物業名」（如 "Bangkok Marriott Marquis"），全名 "Marriott Hotels"
   * 卻對不上。只放旗艦品牌、只放裸關鍵字；更具體的子品牌（JW Marriott…）靠最長命中勝出，不受影響。
   */
  aliases?: string[];
}

export const HOTEL_GROUPS: HotelGroup[] = [
  { id: 'marriott', name: 'Marriott International', nameZh: '萬豪國際' },
  { id: 'hilton', name: 'Hilton', nameZh: '希爾頓' },
  { id: 'ihg', name: 'IHG Hotels & Resorts', nameZh: '洲際酒店集團' },
  { id: 'hyatt', name: 'Hyatt', nameZh: '凱悅' },
  { id: 'accor', name: 'Accor', nameZh: '雅高' },
  { id: 'wyndham', name: 'Wyndham', nameZh: '溫德姆' },
  { id: 'choice', name: 'Choice Hotels', nameZh: '精選國際' },
  { id: 'best-western', name: 'Best Western', nameZh: '最佳西方' },
  { id: 'radisson', name: 'Radisson Hotel Group', nameZh: '麗笙酒店集團' },
  { id: 'shangri-la', name: 'Shangri-La Group', nameZh: '香格里拉集團' },
  { id: 'mandarin-oriental', name: 'Mandarin Oriental', nameZh: '文華東方' },
  { id: 'peninsula', name: 'The Peninsula Hotels', nameZh: '半島酒店' },
  { id: 'four-seasons', name: 'Four Seasons', nameZh: '四季酒店' },
  { id: 'aman', name: 'Aman', nameZh: '安縵' },
  { id: 'rosewood', name: 'Rosewood Hotel Group', nameZh: '瑰麗酒店集團' },
  { id: 'kempinski', name: 'Kempinski', nameZh: '凱賓斯基' },
  { id: 'langham', name: 'Langham Hospitality', nameZh: '朗廷酒店集團' },
  { id: 'dorchester', name: 'Dorchester Collection', nameZh: '多徹斯特精選' },
  { id: 'belmond', name: 'Belmond', nameZh: '貝爾蒙德' },
  { id: 'como', name: 'COMO Hotels' },
  { id: 'capella', name: 'Capella Hotel Group', nameZh: '嘉佩樂' },
  { id: 'kerzner', name: 'Kerzner International' },
  { id: 'jumeirah', name: 'Jumeirah', nameZh: '卓美亞' },
  { id: 'oberoi', name: 'The Oberoi Group', nameZh: '歐貝羅伊' },
  { id: 'ihcl', name: 'IHCL (Taj)', nameZh: '泰姬酒店集團' },
  { id: 'dusit', name: 'Dusit International', nameZh: '都喜國際' },
  { id: 'minor', name: 'Minor Hotels', nameZh: '美諾酒店集團' },
  { id: 'banyan', name: 'Banyan Group', nameZh: '悅榕集團' },
  { id: 'melia', name: 'Meliá Hotels', nameZh: '美利亞' },
  { id: 'citizenm', name: 'citizenM' },
  { id: 'yotel', name: 'YOTEL' },
  { id: 'okura-nikko', name: 'Okura Nikko Hotels', nameZh: '大倉日航酒店集團' },
  { id: 'imperial', name: 'Imperial Hotel', nameZh: '帝國飯店' },
  { id: 'new-otani', name: 'New Otani', nameZh: '新大谷' },
  { id: 'prince', name: 'Seibu Prince Hotels', nameZh: '西武王子大飯店' },
  { id: 'hoshino', name: 'Hoshino Resorts', nameZh: '星野集團' },
  { id: 'tokyu', name: 'Tokyu Hotels', nameZh: '東急飯店' },
  { id: 'jr-west', name: 'JR-West Hotels', nameZh: 'JR西日本飯店' },
  { id: 'mystays', name: 'Hotel MYSTAYS' },
  { id: 'toyoko-inn', name: 'Toyoko Inn', nameZh: '東橫INN' },
  { id: 'apa', name: 'APA Hotels', nameZh: 'APA飯店' },
  { id: 'route-inn', name: 'Route Inn Group', nameZh: '露櫻集團' },
  { id: 'kyoritsu', name: 'Kyoritsu Maintenance', nameZh: '共立' },
  { id: 'super-hotel', name: 'Super Hotel' },
  { id: 'sotetsu', name: 'Sotetsu Hotels', nameZh: '相鐵飯店' },
  { id: 'daiwa', name: 'Daiwa House Hospitality', nameZh: '大和' },
  { id: 'richmond', name: 'Richmond Hotels' },
  { id: 'lotte', name: 'Lotte Hotels', nameZh: '樂天酒店' },
  { id: 'shilla', name: 'The Shilla', nameZh: '新羅酒店' },
  { id: 'huazhu', name: 'H World (Huazhu)', nameZh: '華住集團' },
  { id: 'atour', name: 'Atour', nameZh: '亞朵' },
  { id: 'jinjiang', name: 'Jin Jiang', nameZh: '錦江' },
  { id: 'silks', name: 'Silks Hotel Group', nameZh: '晶華國際酒店集團' },
  { id: 'ldc', name: 'LDC Hotels', nameZh: '雲朗觀光' },
  { id: 'hotel-royal', name: 'Hotel Royal Group', nameZh: '老爺酒店集團' },
  { id: 'landis', name: 'Landis Hospitality', nameZh: '麗緻餐旅集團' },
  { id: 'evergreen', name: 'Evergreen Hotels', nameZh: '長榮酒店' },
  { id: 'caesar', name: 'Caesar Hotels', nameZh: '凱撒飯店連鎖' },
  { id: 'fullon', name: 'Fullon Hotels', nameZh: '福容大飯店' },
  { id: 'ambassador', name: 'Ambassador Hotels', nameZh: '國賓大飯店' },
  { id: 'hostels', name: 'Hostel Chains', nameZh: '連鎖青年旅舍' },
];

export const HOTEL_BRANDS: HotelBrand[] = [
  // ── Marriott ──
  {
    id: 'ritz-carlton',
    name: 'The Ritz-Carlton',
    nameZh: '麗思卡爾頓',
    group: 'marriott',
    tier: 'luxury',
  },
  { id: 'st-regis', name: 'St. Regis', nameZh: '瑞吉', group: 'marriott', tier: 'luxury' },
  { id: 'jw-marriott', name: 'JW Marriott', nameZh: 'JW萬豪', group: 'marriott', tier: 'luxury' },
  { id: 'edition', name: 'EDITION', nameZh: '艾迪遜', group: 'marriott', tier: 'luxury' },
  { id: 'w-hotels', name: 'W Hotels', nameZh: 'W飯店', group: 'marriott', tier: 'luxury' },
  {
    id: 'luxury-collection',
    name: 'The Luxury Collection',
    nameZh: '豪華精選',
    group: 'marriott',
    tier: 'luxury',
  },
  { id: 'bulgari', name: 'Bulgari Hotels', nameZh: '寶格麗', group: 'marriott', tier: 'luxury' },
  {
    id: 'marriott-hotels',
    name: 'Marriott Hotels',
    nameZh: '萬豪',
    group: 'marriott',
    tier: 'upscale',
    aliases: ['Marriott'],
  },
  { id: 'sheraton', name: 'Sheraton', nameZh: '喜來登', group: 'marriott', tier: 'upscale' },
  { id: 'westin', name: 'Westin', nameZh: '威斯汀', group: 'marriott', tier: 'upscale' },
  { id: 'le-meridien', name: 'Le Méridien', nameZh: '艾美', group: 'marriott', tier: 'upscale' },
  { id: 'renaissance', name: 'Renaissance', nameZh: '萬麗', group: 'marriott', tier: 'upscale' },
  {
    id: 'autograph',
    name: 'Autograph Collection',
    nameZh: '傲途格精選',
    group: 'marriott',
    tier: 'upscale',
  },
  {
    id: 'marriott-executive',
    name: 'Marriott Executive Apartments',
    nameZh: '萬豪行政公寓',
    group: 'marriott',
    tier: 'upscale',
  },
  {
    id: 'courtyard',
    name: 'Courtyard by Marriott',
    nameZh: '萬怡',
    group: 'marriott',
    tier: 'midscale',
  },
  {
    id: 'four-points',
    name: 'Four Points by Sheraton',
    nameZh: '福朋喜來登',
    group: 'marriott',
    tier: 'midscale',
  },
  {
    id: 'fairfield',
    name: 'Fairfield by Marriott',
    nameZh: '萬楓',
    group: 'marriott',
    tier: 'midscale',
  },
  { id: 'ac-hotels', name: 'AC Hotels', nameZh: 'AC飯店', group: 'marriott', tier: 'midscale' },
  { id: 'aloft', name: 'Aloft', nameZh: '雅樂軒', group: 'marriott', tier: 'midscale' },
  { id: 'moxy', name: 'Moxy', group: 'marriott', tier: 'budget' },
  {
    id: 'city-express',
    name: 'City Express by Marriott',
    nameZh: 'City Express',
    group: 'marriott',
    tier: 'budget',
  },
  {
    id: 'protea',
    name: 'Protea Hotels',
    nameZh: 'Protea飯店',
    group: 'marriott',
    tier: 'midscale',
  },
  {
    id: 'four-points-flex',
    name: 'Four Points Flex by Sheraton',
    nameZh: 'Four Points Flex',
    group: 'marriott',
    tier: 'budget',
  },
  {
    id: 'series-by-marriott',
    name: 'Series by Marriott',
    nameZh: 'Series by Marriott',
    group: 'marriott',
    tier: 'midscale',
  },
  { id: 'studiores', name: 'StudioRes', group: 'marriott', tier: 'budget' },
  // ── Hilton ──
  {
    id: 'waldorf-astoria',
    name: 'Waldorf Astoria',
    nameZh: '華爾道夫',
    group: 'hilton',
    tier: 'luxury',
  },
  { id: 'conrad', name: 'Conrad', nameZh: '康萊德', group: 'hilton', tier: 'luxury' },
  { id: 'lxr', name: 'LXR Hotels & Resorts', group: 'hilton', tier: 'luxury' },
  {
    id: 'hilton-hotels',
    name: 'Hilton Hotels & Resorts',
    nameZh: '希爾頓',
    group: 'hilton',
    tier: 'upscale',
    aliases: ['Hilton'],
  },
  { id: 'curio', name: 'Curio Collection', nameZh: '格芮精選', group: 'hilton', tier: 'upscale' },
  { id: 'canopy', name: 'Canopy by Hilton', nameZh: '嘉悅里', group: 'hilton', tier: 'upscale' },
  {
    id: 'doubletree',
    name: 'DoubleTree by Hilton',
    nameZh: '逸林',
    group: 'hilton',
    tier: 'midscale',
  },
  {
    id: 'hilton-garden-inn',
    name: 'Hilton Garden Inn',
    nameZh: '希爾頓花園',
    group: 'hilton',
    tier: 'midscale',
  },
  { id: 'hampton', name: 'Hampton by Hilton', nameZh: '歡朋', group: 'hilton', tier: 'budget' },
  // ── IHG ──
  { id: 'six-senses', name: 'Six Senses', nameZh: '六善', group: 'ihg', tier: 'luxury' },
  { id: 'regent', name: 'Regent', nameZh: '麗晶', group: 'ihg', tier: 'luxury' },
  {
    id: 'intercontinental',
    name: 'InterContinental',
    nameZh: '洲際',
    group: 'ihg',
    tier: 'luxury',
  },
  { id: 'kimpton', name: 'Kimpton', nameZh: '金普頓', group: 'ihg', tier: 'upscale' },
  { id: 'hotel-indigo', name: 'Hotel Indigo', nameZh: '英迪格', group: 'ihg', tier: 'upscale' },
  { id: 'voco', name: 'voco', group: 'ihg', tier: 'upscale' },
  { id: 'crowne-plaza', name: 'Crowne Plaza', nameZh: '皇冠假日', group: 'ihg', tier: 'upscale' },
  { id: 'holiday-inn', name: 'Holiday Inn', nameZh: '假日飯店', group: 'ihg', tier: 'midscale' },
  {
    id: 'holiday-inn-express',
    name: 'Holiday Inn Express',
    nameZh: '智選假日',
    group: 'ihg',
    tier: 'budget',
  },
  // ── Hyatt ──
  { id: 'park-hyatt', name: 'Park Hyatt', nameZh: '柏悅', group: 'hyatt', tier: 'luxury' },
  { id: 'grand-hyatt', name: 'Grand Hyatt', nameZh: '君悅', group: 'hyatt', tier: 'luxury' },
  { id: 'alila', name: 'Alila', nameZh: '阿麗拉', group: 'hyatt', tier: 'luxury' },
  { id: 'andaz', name: 'Andaz', nameZh: '安達仕', group: 'hyatt', tier: 'luxury' },
  { id: 'thompson', name: 'Thompson Hotels', group: 'hyatt', tier: 'upscale' },
  {
    id: 'hyatt-regency',
    name: 'Hyatt Regency',
    nameZh: '凱悅',
    group: 'hyatt',
    tier: 'upscale',
    aliases: ['Hyatt'],
  },
  {
    id: 'hyatt-centric',
    name: 'Hyatt Centric',
    nameZh: '凱悅尚萃',
    group: 'hyatt',
    tier: 'upscale',
  },
  { id: 'hyatt-place', name: 'Hyatt Place', nameZh: '凱悅嘉軒', group: 'hyatt', tier: 'midscale' },
  // ── Accor ──
  { id: 'raffles', name: 'Raffles', nameZh: '萊佛士', group: 'accor', tier: 'luxury' },
  { id: 'fairmont', name: 'Fairmont', nameZh: '費爾蒙', group: 'accor', tier: 'luxury' },
  { id: 'sofitel', name: 'Sofitel', nameZh: '索菲特', group: 'accor', tier: 'luxury' },
  { id: 'mgallery', name: 'MGallery', nameZh: '美憬閣', group: 'accor', tier: 'upscale' },
  { id: 'pullman', name: 'Pullman', nameZh: '鉑爾曼', group: 'accor', tier: 'upscale' },
  { id: 'swissotel', name: 'Swissôtel', nameZh: '瑞士飯店', group: 'accor', tier: 'upscale' },
  { id: 'movenpick', name: 'Mövenpick', nameZh: '莫凡彼', group: 'accor', tier: 'upscale' },
  { id: 'novotel', name: 'Novotel', nameZh: '諾富特', group: 'accor', tier: 'midscale' },
  { id: 'mercure', name: 'Mercure', nameZh: '美居', group: 'accor', tier: 'midscale' },
  { id: 'ibis', name: 'ibis', nameZh: '宜必思', group: 'accor', tier: 'budget' },
  { id: 'ibis-styles', name: 'ibis Styles', nameZh: '宜必思尚品', group: 'accor', tier: 'budget' },
  { id: 'ibis-budget', name: 'ibis budget', nameZh: '宜必思快捷', group: 'accor', tier: 'budget' },
  // ── Wyndham / Choice / Best Western / Radisson ──
  { id: 'wyndham-hotels', name: 'Wyndham', nameZh: '溫德姆', group: 'wyndham', tier: 'upscale' },
  { id: 'ramada', name: 'Ramada', nameZh: '華美達', group: 'wyndham', tier: 'midscale' },
  { id: 'days-inn', name: 'Days Inn', nameZh: '戴斯', group: 'wyndham', tier: 'budget' },
  { id: 'super-8', name: 'Super 8', nameZh: '速8', group: 'wyndham', tier: 'budget' },
  { id: 'microtel', name: 'Microtel', group: 'wyndham', tier: 'budget' },
  { id: 'comfort-inn', name: 'Comfort Inn', group: 'choice', tier: 'midscale' },
  { id: 'quality-inn', name: 'Quality Inn', group: 'choice', tier: 'budget' },
  { id: 'econo-lodge', name: 'Econo Lodge', group: 'choice', tier: 'budget' },
  {
    id: 'best-western-hotels',
    name: 'Best Western',
    nameZh: '最佳西方',
    group: 'best-western',
    tier: 'midscale',
  },
  {
    id: 'best-western-premier',
    name: 'Best Western Premier',
    nameZh: '最佳西方精品',
    group: 'best-western',
    tier: 'upscale',
  },
  {
    id: 'radisson-blu',
    name: 'Radisson Blu',
    nameZh: '麗笙藍標',
    group: 'radisson',
    tier: 'upscale',
  },
  { id: 'radisson', name: 'Radisson', nameZh: '麗笙', group: 'radisson', tier: 'upscale' },
  { id: 'radisson-red', name: 'Radisson RED', group: 'radisson', tier: 'midscale' },
  {
    id: 'park-inn',
    name: 'Park Inn by Radisson',
    nameZh: '麗柏',
    group: 'radisson',
    tier: 'midscale',
  },
  // ── 亞洲豪華 / 獨立豪華 ──
  {
    id: 'shangri-la-hotels',
    name: 'Shangri-La',
    nameZh: '香格里拉',
    group: 'shangri-la',
    tier: 'luxury',
  },
  { id: 'kerry', name: 'Kerry Hotels', nameZh: '嘉里', group: 'shangri-la', tier: 'upscale' },
  { id: 'jen', name: 'JEN', nameZh: '今旅', group: 'shangri-la', tier: 'midscale' },
  { id: 'traders', name: 'Traders Hotels', nameZh: '盛貿', group: 'shangri-la', tier: 'midscale' },
  {
    id: 'mandarin-oriental-hotels',
    name: 'Mandarin Oriental',
    nameZh: '文華東方',
    group: 'mandarin-oriental',
    tier: 'luxury',
  },
  {
    id: 'peninsula-hotels',
    name: 'The Peninsula',
    nameZh: '半島酒店',
    group: 'peninsula',
    tier: 'luxury',
  },
  {
    id: 'four-seasons-hotels',
    name: 'Four Seasons',
    nameZh: '四季酒店',
    group: 'four-seasons',
    tier: 'luxury',
  },
  { id: 'aman-resorts', name: 'Aman', nameZh: '安縵', group: 'aman', tier: 'luxury' },
  { id: 'rosewood-hotels', name: 'Rosewood', nameZh: '瑰麗', group: 'rosewood', tier: 'luxury' },
  {
    id: 'new-world',
    name: 'New World Hotels',
    nameZh: '新世界',
    group: 'rosewood',
    tier: 'upscale',
  },
  {
    id: 'kempinski-hotels',
    name: 'Kempinski',
    nameZh: '凱賓斯基',
    group: 'kempinski',
    tier: 'luxury',
  },
  { id: 'langham-hotels', name: 'The Langham', nameZh: '朗廷', group: 'langham', tier: 'luxury' },
  { id: 'cordis', name: 'Cordis', nameZh: '康得思', group: 'langham', tier: 'upscale' },
  {
    id: 'dorchester-hotels',
    name: 'Dorchester Collection',
    nameZh: '多徹斯特精選',
    group: 'dorchester',
    tier: 'luxury',
  },
  { id: 'belmond-hotels', name: 'Belmond', nameZh: '貝爾蒙德', group: 'belmond', tier: 'luxury' },
  { id: 'como-hotels', name: 'COMO', group: 'como', tier: 'luxury' },
  { id: 'capella-hotels', name: 'Capella', nameZh: '嘉佩樂', group: 'capella', tier: 'luxury' },
  { id: 'one-and-only', name: 'One&Only', group: 'kerzner', tier: 'luxury' },
  { id: 'atlantis', name: 'Atlantis', nameZh: '亞特蘭提斯', group: 'kerzner', tier: 'luxury' },
  { id: 'jumeirah-hotels', name: 'Jumeirah', nameZh: '卓美亞', group: 'jumeirah', tier: 'luxury' },
  { id: 'oberoi-hotels', name: 'The Oberoi', nameZh: '歐貝羅伊', group: 'oberoi', tier: 'luxury' },
  { id: 'taj', name: 'Taj Hotels', nameZh: '泰姬', group: 'ihcl', tier: 'luxury' },
  { id: 'dusit-thani', name: 'Dusit Thani', nameZh: '都喜天麗', group: 'dusit', tier: 'upscale' },
  { id: 'anantara', name: 'Anantara', nameZh: '安納塔拉', group: 'minor', tier: 'luxury' },
  { id: 'avani', name: 'Avani', group: 'minor', tier: 'upscale' },
  { id: 'banyan-tree', name: 'Banyan Tree', nameZh: '悅榕庄', group: 'banyan', tier: 'luxury' },
  { id: 'angsana', name: 'Angsana', nameZh: '悅椿', group: 'banyan', tier: 'upscale' },
  { id: 'gran-melia', name: 'Gran Meliá', group: 'melia', tier: 'luxury' },
  { id: 'melia-hotels', name: 'Meliá', nameZh: '美利亞', group: 'melia', tier: 'upscale' },
  { id: 'citizenm-hotels', name: 'citizenM', group: 'citizenm', tier: 'midscale' },
  { id: 'yotel-hotels', name: 'YOTEL', group: 'yotel', tier: 'midscale' },
  // ── 日本 ──
  {
    id: 'hotel-okura',
    name: 'Hotel Okura',
    nameZh: '大倉飯店',
    group: 'okura-nikko',
    tier: 'luxury',
  },
  {
    id: 'hotel-nikko',
    name: 'Hotel Nikko',
    nameZh: '日航酒店',
    group: 'okura-nikko',
    tier: 'upscale',
  },
  {
    id: 'jal-city',
    name: 'Hotel JAL City',
    nameZh: 'JAL City',
    group: 'okura-nikko',
    tier: 'midscale',
  },
  {
    id: 'imperial-hotel',
    name: 'Imperial Hotel',
    nameZh: '帝國飯店',
    group: 'imperial',
    tier: 'luxury',
  },
  {
    id: 'new-otani-hotels',
    name: 'Hotel New Otani',
    nameZh: '新大谷飯店',
    group: 'new-otani',
    tier: 'luxury',
  },
  {
    id: 'prince-hotels',
    name: 'Prince Hotels',
    nameZh: '王子大飯店',
    group: 'prince',
    tier: 'upscale',
  },
  { id: 'hoshinoya', name: 'HOSHINOYA', nameZh: '虹夕諾雅', group: 'hoshino', tier: 'luxury' },
  { id: 'kai', name: 'KAI', nameZh: '界', group: 'hoshino', tier: 'luxury' },
  { id: 'risonare', name: 'RISONARE', nameZh: '里索納雷', group: 'hoshino', tier: 'upscale' },
  { id: 'omo', name: 'OMO by Hoshino Resorts', group: 'hoshino', tier: 'midscale' },
  { id: 'beb', name: 'BEB', group: 'hoshino', tier: 'budget' },
  { id: 'tokyu-hotels', name: 'Tokyu Hotels', nameZh: '東急飯店', group: 'tokyu', tier: 'upscale' },
  { id: 'tokyu-stay', name: 'Tokyu Stay', nameZh: '東急STAY', group: 'tokyu', tier: 'midscale' },
  {
    id: 'hotel-granvia',
    name: 'Hotel Granvia',
    nameZh: '格蘭比亞',
    group: 'jr-west',
    tier: 'upscale',
  },
  { id: 'via-inn', name: 'Via Inn', group: 'jr-west', tier: 'budget' },
  { id: 'mystays-hotels', name: 'Hotel MYSTAYS', group: 'mystays', tier: 'midscale' },
  {
    id: 'toyoko-inn-hotels',
    name: 'Toyoko Inn',
    nameZh: '東橫INN',
    group: 'toyoko-inn',
    tier: 'budget',
  },
  { id: 'apa-hotels', name: 'APA Hotel', nameZh: 'APA飯店', group: 'apa', tier: 'budget' },
  {
    id: 'route-inn-hotels',
    name: 'Hotel Route Inn',
    nameZh: '露櫻',
    group: 'route-inn',
    tier: 'budget',
  },
  { id: 'dormy-inn', name: 'Dormy Inn', nameZh: '多美迎', group: 'kyoritsu', tier: 'midscale' },
  { id: 'super-hotel-hotels', name: 'Super Hotel', group: 'super-hotel', tier: 'budget' },
  {
    id: 'sotetsu-fresa',
    name: 'Sotetsu Fresa Inn',
    nameZh: '相鐵FRESA INN',
    group: 'sotetsu',
    tier: 'budget',
  },
  {
    id: 'daiwa-roynet',
    name: 'Daiwa Roynet',
    nameZh: '大和ROYNET',
    group: 'daiwa',
    tier: 'midscale',
  },
  { id: 'richmond-hotels', name: 'Richmond Hotel', group: 'richmond', tier: 'midscale' },
  // ── 韓國 / 中國 ──
  { id: 'signiel', name: 'Signiel', group: 'lotte', tier: 'luxury' },
  { id: 'lotte-hotels', name: 'Lotte Hotels', nameZh: '樂天飯店', group: 'lotte', tier: 'upscale' },
  { id: 'l7', name: 'L7 by Lotte', group: 'lotte', tier: 'midscale' },
  { id: 'shilla-hotels', name: 'The Shilla', nameZh: '新羅飯店', group: 'shilla', tier: 'luxury' },
  { id: 'shilla-stay', name: 'Shilla Stay', nameZh: '新羅舒泰', group: 'shilla', tier: 'midscale' },
  { id: 'ji-hotel', name: 'Ji Hotel', nameZh: '全季', group: 'huazhu', tier: 'midscale' },
  { id: 'hanting', name: 'HanTing', nameZh: '漢庭', group: 'huazhu', tier: 'budget' },
  { id: 'atour-hotels', name: 'Atour Hotel', nameZh: '亞朵', group: 'atour', tier: 'midscale' },
  {
    id: 'jinjiang-inn',
    name: 'Jinjiang Inn',
    nameZh: '錦江之星',
    group: 'jinjiang',
    tier: 'budget',
  },
  // ── 台灣 ──
  { id: 'silks-place', name: 'Silks Place', nameZh: '晶英酒店', group: 'silks', tier: 'luxury' },
  {
    id: 'wellspring-silks',
    name: 'Wellspring by Silks',
    nameZh: '晶泉丰旅',
    group: 'silks',
    tier: 'upscale',
  },
  { id: 'just-sleep', name: 'Just Sleep', nameZh: '捷絲旅', group: 'silks', tier: 'midscale' },
  {
    id: 'palais-de-chine',
    name: 'Palais de Chine',
    nameZh: '君品酒店',
    group: 'ldc',
    tier: 'luxury',
  },
  {
    id: 'chateau-de-chine',
    name: 'Chateau de Chine',
    nameZh: '翰品酒店',
    group: 'ldc',
    tier: 'upscale',
  },
  {
    id: 'maison-de-chine',
    name: 'Maison de Chine',
    nameZh: '兆品酒店',
    group: 'ldc',
    tier: 'midscale',
  },
  {
    id: 'hotel-royal-hotels',
    name: 'Hotel Royal',
    nameZh: '老爺酒店',
    group: 'hotel-royal',
    tier: 'upscale',
  },
  {
    id: 'royal-inn',
    name: 'Royal Inn',
    nameZh: '老爺會館',
    group: 'hotel-royal',
    tier: 'midscale',
  },
  { id: 'landis-hotels', name: 'The Landis', nameZh: '亞都麗緻', group: 'landis', tier: 'luxury' },
  {
    id: 'evergreen-laurel',
    name: 'Evergreen Laurel',
    nameZh: '長榮桂冠酒店',
    group: 'evergreen',
    tier: 'upscale',
  },
  {
    id: 'evergreen-resort',
    name: 'Evergreen Resort',
    nameZh: '長榮鳳凰酒店',
    group: 'evergreen',
    tier: 'upscale',
  },
  {
    id: 'caesar-park',
    name: 'Caesar Park',
    nameZh: '凱撒大飯店',
    group: 'caesar',
    tier: 'upscale',
  },
  {
    id: 'caesar-metro',
    name: 'Caesar Metro',
    nameZh: '凱達大飯店',
    group: 'caesar',
    tier: 'midscale',
  },
  {
    id: 'fullon-hotels',
    name: 'Fullon Hotel',
    nameZh: '福容大飯店',
    group: 'fullon',
    tier: 'upscale',
  },
  {
    id: 'ambassador-hotels',
    name: 'Ambassador Hotel',
    nameZh: '國賓大飯店',
    group: 'ambassador',
    tier: 'upscale',
  },
  { id: 'amba', name: 'amba', nameZh: '意舍酒店', group: 'ambassador', tier: 'midscale' },
  // ── 青年旅舍 ──
  {
    id: 'hostelling-international',
    name: 'Hostelling International',
    nameZh: '國際青年旅舍',
    group: 'hostels',
    tier: 'hostel',
  },
  { id: 'generator', name: 'Generator', group: 'hostels', tier: 'hostel' },
];

const brandById = new Map(HOTEL_BRANDS.map((b) => [b.id, b]));
const groupById = new Map(HOTEL_GROUPS.map((g) => [g.id, g]));

export function getHotelBrand(id: string | null | undefined): HotelBrand | undefined {
  return id ? brandById.get(id) : undefined;
}

export function getHotelGroup(id: string | null | undefined): HotelGroup | undefined {
  return id ? groupById.get(id) : undefined;
}

/** 依語系取品牌顯示名：中文介面優先繁中常用名，否則英文名。 */
export function getHotelBrandName(brand: HotelBrand, locale: string): string {
  return locale.startsWith('zh') && brand.nameZh ? brand.nameZh : brand.name;
}

export function getHotelGroupName(group: HotelGroup, locale: string): string {
  return locale.startsWith('zh') && group.nameZh ? group.nameZh : group.name;
}

/** 合法品牌 id 集合（Zod 驗證用）。 */
export const HOTEL_BRAND_IDS = new Set(HOTEL_BRANDS.map((b) => b.id));
