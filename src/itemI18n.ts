import type { Locale } from "./i18n";

export type LocalizedNames = Record<Locale, string>;

/**
 * 5-language name lookup table for characters (chr_*) and 6-star weapons (wpn_*).
 * Source: https://www.akedata.wiki/
 */
export const ITEM_NAME_I18N: Record<string, LocalizedNames> = {
  // Characters (38)
  chr_0002_endminm: { "zh-TW": "管理員", "zh-CN": "管理员", ja: "管理人", en: "Endministrator", ko: "관리자" },
  chr_0003_endminf: { "zh-TW": "管理員", "zh-CN": "管理员", ja: "管理人", en: "Endministrator", ko: "관리자" },
  chr_0004_pelica: { "zh-TW": "佩麗卡", "zh-CN": "佩丽卡", ja: "ペリカ", en: "Perlica", ko: "펠리카" },
  chr_0005_chen: { "zh-TW": "陳千語", "zh-CN": "陈千语", ja: "チェン・センユー", en: "Chen Qianyu", ko: "진천우" },
  chr_0006_wolfgd: { "zh-TW": "狼衛", "zh-CN": "狼卫", ja: "ウルフガード", en: "Wulfgard", ko: "울프가드" },
  chr_0007_ikut: { "zh-TW": "弧光", "zh-CN": "弧光", ja: "アークライト", en: "Arclight", ko: "아크라이트" },
  chr_0009_azrila: { "zh-TW": "餘燼", "zh-CN": "余烬", ja: "エンバー", en: "Ember", ko: "엠버" },
  chr_0011_seraph: { "zh-TW": "賽希", "zh-CN": "赛希", ja: "ザイヒ", en: "Xaihi", ko: "자이히" },
  chr_0012_avywen: { "zh-TW": "艾維文娜", "zh-CN": "艾维文娜", ja: "アイビーエナ", en: "Avywenna", ko: "아비웨나" },
  chr_0013_aglina: { "zh-TW": "潔爾佩塔", "zh-CN": "洁尔佩塔", ja: "ギルベルタ", en: "Gilberta", ko: "질베르타" },
  chr_0014_aurora: { "zh-TW": "晝雪", "zh-CN": "昼雪", ja: "スノーシャイン", en: "Snowshine", ko: "스노우샤인" },
  chr_0015_lifeng: { "zh-TW": "黎風", "zh-CN": "黎风", ja: "リーフォン", en: "Lifeng", ko: "여풍" },
  chr_0016_laevat: { "zh-TW": "萊萬汀", "zh-CN": "莱万汀", ja: "レーヴァテイン", en: "Laevatain", ko: "레바테인" },
  chr_0017_yvonne: { "zh-TW": "伊馮", "zh-CN": "伊冯", ja: "イヴォンヌ", en: "Yvonne", ko: "이본" },
  chr_0018_dapan: { "zh-TW": "大潘", "zh-CN": "大潘", ja: "ダパン", en: "Da Pan", ko: "판" },
  chr_0019_karin: { "zh-TW": "秋栗", "zh-CN": "秋栗", ja: "アケクリ", en: "Akekuri", ko: "아케쿠리" },
  chr_0020_meurs: { "zh-TW": "卡契爾", "zh-CN": "卡契尔", ja: "キャッチャー", en: "Catcher", ko: "카치르" },
  chr_0021_whiten: { "zh-TW": "埃特拉", "zh-CN": "埃特拉", ja: "エステーラ", en: "Estella", ko: "에스텔라" },
  chr_0022_bounda: { "zh-TW": "螢石", "zh-CN": "萤石", ja: "フローライト", en: "Fluorite", ko: "플루라이트" },
  chr_0023_antal: { "zh-TW": "安塔爾", "zh-CN": "安塔尔", ja: "アンタル", en: "Antal", ko: "안탈" },
  chr_0024_deepfin: { "zh-TW": "阿列什", "zh-CN": "阿列什", ja: "アレッシュ", en: "Alesh", ko: "알레쉬" },
  chr_0025_ardelia: { "zh-TW": "艾爾黛拉", "zh-CN": "艾尔黛拉", ja: "アルデリア", en: "Ardelia", ko: "아델리아" },
  chr_0026_lastrite: { "zh-TW": "別禮", "zh-CN": "别礼", ja: "ラストライト", en: "Last Rite", ko: "라스트 라이트" },
  chr_0027_tangtang: { "zh-TW": "湯湯", "zh-CN": "汤汤", ja: "タンタン", en: "Tangtang", ko: "탕탕" },
  chr_0028_wulfa: { "zh-TW": "洛西", "zh-CN": "洛茜", ja: "ロッシ", en: "Rossi", ko: "로시" },
  chr_0029_pograni: { "zh-TW": "駿衛", "zh-CN": "骏卫", ja: "ポグラニチニク", en: "Pogranichnik", ko: "포그라니치니크" },
  chr_0030_zhuangfy: { "zh-TW": "莊方宜", "zh-CN": "庄方宜", ja: "ゾアン・ファンイ", en: "Zhuang Fangyi", ko: "장방이" },
  chr_0031_mifu: { "zh-TW": "弭弗", "zh-CN": "弭弗", ja: "ミ・フ", en: "Mi Fu", ko: "미브" },
  chr_0032_lizhiyan: { "zh-TW": "訣", "zh-CN": "诀", ja: "オクギ", en: "Arcane", ko: "결" },
  chr_0033_camille: { "zh-TW": "卡繆", "zh-CN": "卡缪", ja: "カミーユ", en: "Camille", ko: "카뮤" },
  chr_0034_typhoea: { "zh-TW": "提弗洛斯", "zh-CN": "提弗洛斯", ja: "ティフォロス", en: "Typhoeus", ko: "티프로스" },
  chr_0035_liino: { "zh-TW": "梨諾", "zh-CN": "梨诺", ja: "リーノ", en: "Liino", ko: "리노" },
  chr_0036_jsspsi: { "zh-TW": "祀", "zh-CN": "祀", ja: "スー", en: "Si", ko: "사" },
  chr_0037_minghe: { "zh-TW": "明河", "zh-CN": "明河", ja: "ミンホ", en: "Argent Flow", ko: "명하" },
  chr_0038_purrche: { "zh-TW": "噗切娜", "zh-CN": "噗切娜", ja: "プチエナ", en: "Purrchena", ko: "푸치나" },
  chr_0039_mimino: { "zh-TW": "米米諾", "zh-CN": "米米诺", ja: "ミミノ", en: "Mimino", ko: "미미노" },
  chr_0040_sweetpie: { "zh-TW": "小刻", "zh-CN": "小刻", ja: "ケーちゃん", en: "Kay", ko: "케르" },
  chr_9000_endmin: { "zh-TW": "管理員", "zh-CN": "管理员", ja: "管理人", en: "Endministrator", ko: "관리자" },

  // 6-Star Weapons (50)
  wpn_claym_0004: { "zh-TW": "典範", "zh-CN": "典范", ja: "鑑", en: "Exemplar", ko: "모범" },
  wpn_claym_0006: { "zh-TW": "昔日精品", "zh-CN": "昔日精品", ja: "昔日の逸品", en: "Former Finery", ko: "과거의 일품" },
  wpn_claym_0007: { "zh-TW": "大雷斑", "zh-CN": "大雷斑", ja: "大雷斑", en: "Thunderberge", ko: "천둥의 흔적" },
  wpn_claym_0008: { "zh-TW": "破碎君王", "zh-CN": "破碎君王", ja: "破砕君主", en: "Sundered Prince", ko: "분쇄의 군주" },
  wpn_claym_0013: { "zh-TW": "赫拉芬格", "zh-CN": "赫拉芬格", ja: "クラヴェンガー", en: "Khravengger", ko: "헤라펜거" },
  wpn_claym_0016: { "zh-TW": "幻想苦痛", "zh-CN": "幻想苦痛", ja: "ファントムペイン", en: "Phantom Pain", ko: "환상통" },
  wpn_claym_0017: { "zh-TW": "赤纓", "zh-CN": "赤缨", ja: "赤纓", en: "Amaranthine Tassel", ko: "적영" },
  wpn_claym_0018: { "zh-TW": "玉中身", "zh-CN": "玉中身", ja: "玉中身", en: "Jade Vessel", ko: "옥에 깃든 형체" },
  wpn_claym_0019: { "zh-TW": "悠久傳承", "zh-CN": "悠久传承", ja: "悠久の継承", en: "Long Heritage", ko: "유구한 전승" },
  wpn_funnel_0006: { "zh-TW": "作品：蝕跡", "zh-CN": "作品：蚀迹", ja: "作品：蝕跡", en: "Opus: Etch Figure", ko: "작품: 침식 흔적" },
  wpn_funnel_0008: { "zh-TW": "爆破單元", "zh-CN": "爆破单元", ja: "破壊ユニット", en: "Detonation Unit", ko: "폭발 유닛" },
  wpn_funnel_0009: { "zh-TW": "遺忘", "zh-CN": "遗忘", ja: "遺忘", en: "Oblivion", ko: "망각" },
  wpn_funnel_0010: { "zh-TW": "騎士精神", "zh-CN": "骑士精神", ja: "騎士精神", en: "Chivalric Virtues", ko: "기사도 정신" },
  wpn_funnel_0011: { "zh-TW": "使命必達", "zh-CN": "使命必达", ja: "使命必達", en: "Delivery Guaranteed", ko: "사명의 길" },
  wpn_funnel_0013: { "zh-TW": "滄溟星夢", "zh-CN": "沧溟星梦", ja: "蒼星の囁き", en: "Dreams of the Starry Beach", ko: "바다와 별의 꿈" },
  wpn_funnel_0015: { "zh-TW": "孤舟", "zh-CN": "孤舟", ja: "孤舟", en: "Lone Barge", ko: "고독한 나룻배" },
  wpn_funnel_0016: { "zh-TW": "四二式·肅陣", "zh-CN": "四二式·肃阵", ja: "四二式・粛陣", en: "Type 42: Solemn Phalanx", ko: "42식 · 척결" },
  wpn_funnel_0017: { "zh-TW": "霧中微光", "zh-CN": "雾中微光", ja: "朧光", en: "Flickers in the Mist", ko: "안개 속 불빛" },
  wpn_funnel_0018: { "zh-TW": "聯結點", "zh-CN": "联结点", ja: "連結点", en: "Junction Point", ko: "공명점" },
  wpn_funnel_0019: { "zh-TW": "寒夜幽影", "zh-CN": "寒夜幽影", ja: "寒夜の影", en: "Umbra of Frigid Eventide", ko: "추운 밤의 그림자" },
  wpn_funnel_0020: { "zh-TW": "苦難的盡頭", "zh-CN": "苦难的尽头", ja: "苦難の果", en: "Suffering's End", ko: "고난의 끝" },
  wpn_lance_0007: { "zh-TW": "燈火使命", "zh-CN": "灯火使命", ja: "灯火の使命", en: "Beacon of Duty", ko: "등불의 사명" },
  wpn_lance_0010: { "zh-TW": "驍勇", "zh-CN": "骁勇", ja: "勇猛", en: "Valiant", ko: "용사" },
  wpn_lance_0011: { "zh-TW": "J.E.T.", "zh-CN": "J.E.T.", ja: "J.E.T.", en: "JET", ko: "J.E.T." },
  wpn_lance_0012: { "zh-TW": "負山", "zh-CN": "负山", ja: "負山", en: "Mountain Bearer", ko: "산의 지배자" },
  wpn_lance_0014: { "zh-TW": "曜夜的首演", "zh-CN": "曜夜的首演", ja: "プリズムナイトデビュー", en: "Bedazzling Night Debut", ko: "찬란한 밤의 데뷔" },
  wpn_lance_0015: { "zh-TW": "鍍紅祝福", "zh-CN": "镀红祝福", ja: "カーマインヴェール", en: "Blessing of Lustrous Carmine", ko: "붉게 물든 가호" },
  wpn_lance_0016: { "zh-TW": "黃金時代", "zh-CN": "黄金时代", ja: "黄金時代", en: "Golden Age", ko: "전성기" },
  wpn_lance_0017: { "zh-TW": "甜美交易", "zh-CN": "甜美交易", ja: "スウィートディール", en: "Sweet Deal", ko: "달콤한 거래" },
  wpn_lance_0018: { "zh-TW": "突擊流星", "zh-CN": "突击流星", ja: "アサルトメテオ", en: "Raid Comet", ko: "유성 돌격" },
  wpn_pistol_0005: { "zh-TW": "領航者", "zh-CN": "领航者", ja: "ナビゲーター", en: "Navigator", ko: "항로의 개척자" },
  wpn_pistol_0007: { "zh-TW": "望鄉", "zh-CN": "望乡", ja: "望郷", en: "Home Longing", ko: "향수" },
  wpn_pistol_0008: { "zh-TW": "楔子", "zh-CN": "楔子", ja: "楔", en: "Wedge", ko: "쐐기" },
  wpn_pistol_0009: { "zh-TW": "同類相食", "zh-CN": "同类相食", ja: "同類共食", en: "Clannibal", ko: "클래니벌" },
  wpn_pistol_0010: { "zh-TW": "藝術暴君", "zh-CN": "艺术暴君", ja: "芸術の独裁者", en: "Artzy Tyrannical", ko: "예술의 폭군" },
  wpn_pistol_0011: { "zh-TW": "落草", "zh-CN": "落草", ja: "落草", en: "Brigand's Calling", ko: "반항" },
  wpn_sword_0006: { "zh-TW": "熔鑄火焰", "zh-CN": "熔铸火焰", ja: "フレイムフォージ", en: "Forgeborn Scathe", ko: "용조의 불꽃" },
  wpn_sword_0010: { "zh-TW": "黯色火炬", "zh-CN": "黯色火炬", ja: "ダークトーチ", en: "Umbral Torch", ko: "암흑의 횃불" },
  wpn_sword_0011: { "zh-TW": "扶搖", "zh-CN": "扶摇", ja: "フーヤオ", en: "Rapid Ascent", ko: "부요" },
  wpn_sword_0012: { "zh-TW": "熱熔切割器", "zh-CN": "热熔切割器", ja: "テルミット・カッター", en: "Thermite Cutter", ko: "테르밋 커터" },
  wpn_sword_0013: { "zh-TW": "顯赫聲名", "zh-CN": "显赫声名", ja: "輝かしき名声", en: "Eminent Repute", ko: "위대한 이름" },
  wpn_sword_0014: { "zh-TW": "白夜新星", "zh-CN": "白夜新星", ja: "白夜新星", en: "White Night Nova", ko: "백야의 별" },
  wpn_sword_0016: { "zh-TW": "不知歸", "zh-CN": "不知归", ja: "不知帰", en: "Never Rest", ko: "끝없는 방랑" },
  wpn_sword_0017: { "zh-TW": "光榮記憶", "zh-CN": "光荣记忆", ja: "栄光の記憶", en: "Glorious Memory", ko: "찬란했던 기억" },
  wpn_sword_0021: { "zh-TW": "宏願", "zh-CN": "宏愿", ja: "大願", en: "Grand Vision", ko: "장대한 염원" },
  wpn_sword_0021_ink: { "zh-TW": "宏願", "zh-CN": "宏愿", ja: "大願", en: "Grand Vision", ko: "장대한 염원" },
  wpn_sword_0022: { "zh-TW": "狼之緋", "zh-CN": "狼之绯", ja: "狼緋", en: "Lupine Scarlet", ko: "늑대의 혈흔" },
  wpn_sword_0024: { "zh-TW": "聚合工業", "zh-CN": "聚合工业", ja: "複合工業", en: "Complexed Industry", ko: "응집 공업" },
  wpn_sword_0025: { "zh-TW": "喚月", "zh-CN": "唤月", ja: "問月", en: "Lunar Calling", ko: "환월" },
  wpn_sword_0026: { "zh-TW": "遙望", "zh-CN": "遥望", ja: "ファーサイト", en: "Farsight", ko: "조망" },
};

/**
 * 5-language name lookup table for gacha pools (GachaCharPoolTable & GachaWeaponPoolTable).
 * Source: https://www.akedata.wiki/
 */
export const POOL_NAME_I18N: Record<string, LocalizedNames> = {
  // Character Recruitment
  beginner: { "zh-TW": "啟程尋訪", "zh-CN": "启程寻访", ja: "旅立ちスカウト", en: "New Horizons", ko: "여정의 시작 헤드헌팅" },
  standard: { "zh-TW": "基礎尋訪", "zh-CN": "基础寻访", ja: "通常スカウト", en: "Basic Headhunting", ko: "기초 헤드헌팅" },
  special_1_0_1: { "zh-TW": "熔火灼痕", "zh-CN": "熔火灼痕", ja: "灼熱焔痕", en: "Scars of the Forge", ko: "불꽃에 그을린 상흔" },
  special_1_0_2: { "zh-TW": "熱烈色彩", "zh-CN": "热烈色彩", ja: "超イケイケカラフル", en: "Hues of Passion", ko: "격정의 색채" },
  special_1_0_3: { "zh-TW": "輕飄飄的信使", "zh-CN": "轻飘飘的信使", ja: "ふわふわトランスポーター", en: "The Floaty Messenger", ko: "전달자의 바람" },
  special_1_1_1: { "zh-TW": "河流的女兒", "zh-CN": "河流的女儿", ja: "水の申し子", en: "River's Daughter", ko: "강에서 태어난 소녀" },
  special_1_1_2: { "zh-TW": "狼珀", "zh-CN": "狼珀", ja: "ウルフパール", en: "Wolf Pearl", ko: "울프펄" },
  special_1_2_1: { "zh-TW": "春雷動，萬物生", "zh-CN": "春雷动，万物生", ja: "春雷響き、万物芽吹く", en: "Thunder of Renewal", ko: "봄의 천둥, 만물의 소생" },
  joint_1_2_2: { "zh-TW": "輝光慶典", "zh-CN": "辉光庆典", ja: "輝きの祝典", en: "Fest of Brilliance", ko: "찬란한 빛의 축제" },
  special_1_3_1: { "zh-TW": "拳出無悔", "zh-CN": "拳出无悔", ja: "拳に悔い無し", en: "Fists of No Regrets", ko: "후회 없는 주먹" },
  special_1_3_2: { "zh-TW": "逐罪者", "zh-CN": "逐罪者", ja: "咎の番人", en: "Expunger of Sin", ko: "죄를 쫓는 자" },
  special_1_4_1: { "zh-TW": "臨淵望北", "zh-CN": "临渊望北", ja: "臨淵望北", en: "North Yearns the Rift Vigile", ko: "벼랑 끝, 북쪽을 향한 시선" },
  special_1_4_2: { "zh-TW": "晨星於此閃耀", "zh-CN": "晨星于此闪耀", ja: "キラキラ綺羅星", en: "Good Morning from Your Dawnstar", ko: "빛나는 새벽의 별" },
  special_1_5_1: { "zh-TW": "冬獵", "zh-CN": "冬猎", ja: "冬狩", en: "Winter Hunt", ko: "겨울 사냥" },
  special_1_6_1: { "zh-TW": "萬物更新", "zh-CN": "万物更新", ja: "万象一新", en: "Rejuvenation", ko: "만물의 재구성" },
  special_1_6_2: { "zh-TW": "煙火邀星河", "zh-CN": "烟火邀星河", ja: "人煙の牽く天河", en: "The Hearth Fire Beckons the Starry Flow", ko: "은하수를 부르는 불꽃" },
  special_1_7_1: { "zh-TW": "鍛砧、行囊與蜜糖", "zh-CN": "锻砧、行囊与蜜糖", ja: "「かじ」とバッグとハチミツ！", en: "Anvil, Backpack, Plus A Pot o'Honey", ko: "모루, 배낭, 그리고 벌꿀" },
  rerun_chr_aglina: { "zh-TW": "致每一個飄遊之願", "zh-CN": "致每一个飘游之愿", ja: "ひらり漂うすべての願いへ", en: "To Every Wish Adrift", ko: "떠도는 모든 소망에게" },
  rerun_chr_tangtang: { "zh-TW": "祖泉的新流", "zh-CN": "祖泉的新流", ja: "祖泉の新流", en: "Ancestral Spring Flows Anew", ko: "선조의 샘의 새로운 물결" },
  rerun_chr_wulfa: { "zh-TW": "緋紅瑰寶", "zh-CN": "绯红瑰宝", ja: "スカーレットパール", en: "Precious Scarlet", ko: "붉은색의 진주" },
  rerun_chr_yvonne: { "zh-TW": "絢麗異彩", "zh-CN": "绚丽异彩", ja: "超爆盛れカラフル", en: "Resplendent Spectrum", ko: "찬란한 색채" },

  // Arsenal Issue
  weaponbox_constant_1: { "zh-TW": "堅冰申領", "zh-CN": "坚冰申领", ja: "堅氷・申請", en: "Solid Ice Issue", ko: "결빙 신청" },
  weaponbox_constant_2: { "zh-TW": "星聲申領", "zh-CN": "星声申领", ja: "星声・申請", en: "Cosmic Voice Issue", ko: "성음 신청" },
  weaponbox_constant_3: { "zh-TW": "遠途申領", "zh-CN": "远途申领", ja: "遠路・申請", en: "Far Expedition Issue", ko: "원정 신청" },
  weaponbox_constant_4: { "zh-TW": "崇山申領", "zh-CN": "崇山申领", ja: "山岳・申請", en: "Rising Mount Issue", ko: "숭산 신청" },
  weaponbox_constant_5: { "zh-TW": "雷鳴申領", "zh-CN": "雷鸣申领", ja: "雷光・申請", en: "Thunderous Peal Issue", ko: "뇌명 신청" },
  weponbox_1_0_1: { "zh-TW": "熔鑄申領", "zh-CN": "熔铸申领", ja: "溶鋳・申請", en: "Smelting Forge Issue", ko: "용조 신청" },
  weponbox_1_0_2: { "zh-TW": "繪塗申領", "zh-CN": "绘涂申领", ja: "彩色・申請", en: "Graffiti Issue", ko: "화도 신청" },
  weponbox_1_0_3: { "zh-TW": "迅行申領", "zh-CN": "迅行申领", ja: "疾駆・申請", en: "Express Delivery Issue", ko: "순행 신청" },
  weponbox_1_1_1: { "zh-TW": "新芽申領", "zh-CN": "新芽申领", ja: "新芽・申請", en: "Budding Anew Issue", ko: "신아 신청" },
  weponbox_1_1_2: { "zh-TW": "緋珀申領", "zh-CN": "绯珀申领", ja: "緋珀・申請", en: "Scarlet Pearl Issue", ko: "적옥 신청" },
  weponbox_1_2_1: { "zh-TW": "行舟申領", "zh-CN": "行舟申领", ja: "行舟・申請", en: "Drifting Raft Issue", ko: "항해 신청" },
  weponbox_1_2_2: { "zh-TW": "熔灼申領", "zh-CN": "熔灼申领", ja: "溶融・申請", en: "Smelting Fire Issue", ko: "용작 신청" },
  weponbox_1_2_3: { "zh-TW": "疾行申領", "zh-CN": "疾行申领", ja: "早駆・申請", en: "Swift Walker Issue", ko: "질풍 신청" },
  weponbox_1_3_1: { "zh-TW": "絳結申領", "zh-CN": "绛结申领", ja: "赫結・申請", en: "Scarlet Knot Issue", ko: "붉은 결속 신청" },
  weponbox_1_3_2: { "zh-TW": "染赤申領", "zh-CN": "染赤申领", ja: "染紅・申請", en: "Crimson Hued Issue", ko: "적색화 신청" },
  weponbox_1_4_1: { "zh-TW": "軍列申領", "zh-CN": "军列申领", ja: "戦列・申請", en: "Military Grade Issue", ko: "제대 신청" },
  weponbox_1_4_2: { "zh-TW": "明曜申領", "zh-CN": "明曜申领", ja: "明星・申請", en: "Bedazzled Issue", ko: "찬란 신청" },
  weponbox_1_5_1: { "zh-TW": "幽寒申領", "zh-CN": "幽寒申领", ja: "極寒・申請", en: "Deep Cold Issue", ko: "한기 신청" },
  weaponbox_1_6_1: { "zh-TW": "篆玉申領", "zh-CN": "篆玉申领", ja: "玉書・申請", en: "Seal of Jade Issue", ko: "전옥 신청" },
  weaponbox_1_6_2: { "zh-TW": "月映申領", "zh-CN": "月映申领", ja: "月映・申請", en: "Moongleam Issue", ko: "월영 신청" },
  weaponbox_1_7_1: { "zh-TW": "恣遊申領", "zh-CN": "恣游申领", ja: "巡旅・申請", en: "Casual Roamer Issue", ko: "유영 신청" },
  rerun_wpn_aglina: { "zh-TW": "飄行申領", "zh-CN": "飘行申领", ja: "漂遊・申請", en: "Floaty Traveler Issue", ko: "표류 신청" },
  rerun_wpn_tangtang: { "zh-TW": "細枝申領", "zh-CN": "细枝申领", ja: "小枝・申請", en: "Tender Sprig Issue", ko: "가지 신청" },
  rerun_wpn_wulfa: { "zh-TW": "赤獠申領", "zh-CN": "赤獠申领", ja: "赤牙・申請", en: "Scarlet Claws Issue", ko: "적아 신청" },
  rerun_wpn_yvonne: { "zh-TW": "點繪申領", "zh-CN": "点绘申领", ja: "点描・申請", en: "Tag Artist Issue", ko: "점묘 신청" },
};

function buildReverseMap(table: Record<string, LocalizedNames>): Map<string, LocalizedNames> {
  const map = new Map<string, LocalizedNames>();
  for (const names of Object.values(table)) {
    for (const val of Object.values(names)) {
      if (val && !map.has(val)) {
        map.set(val, names);
      }
    }
  }
  return map;
}

const ITEM_REVERSE_MAP = buildReverseMap(ITEM_NAME_I18N);
const POOL_REVERSE_MAP = buildReverseMap(POOL_NAME_I18N);

/**
 * Merge remotely fetched or cached 5-language name mappings into runtime lookup tables.
 */
export function mergeDynamicI18nCatalog(
  items?: Record<string, LocalizedNames>,
  pools?: Record<string, LocalizedNames>,
): void {
  if (items) {
    for (const [id, names] of Object.entries(items)) {
      ITEM_NAME_I18N[id] = { ...(ITEM_NAME_I18N[id] || {}), ...names };
      for (const val of Object.values(ITEM_NAME_I18N[id]!)) {
        if (val) ITEM_REVERSE_MAP.set(val, ITEM_NAME_I18N[id]!);
      }
    }
  }
  if (pools) {
    for (const [id, names] of Object.entries(pools)) {
      POOL_NAME_I18N[id] = { ...(POOL_NAME_I18N[id] || {}), ...names };
      for (const val of Object.values(POOL_NAME_I18N[id]!)) {
        if (val) POOL_REVERSE_MAP.set(val, POOL_NAME_I18N[id]!);
      }
    }
  }
}

/**
 * Resolve a character or weapon display name in the target locale.
 * Priority: exact ID lookup -> reverse lookup by stored name -> original fallback.
 */
export function localizeItemName(
  itemId: string | undefined,
  fallback: string,
  locale: Locale,
): string {
  if (itemId && ITEM_NAME_I18N[itemId]) {
    return ITEM_NAME_I18N[itemId][locale] || fallback;
  }
  const byName = fallback ? ITEM_REVERSE_MAP.get(fallback) : undefined;
  if (byName) {
    return byName[locale] || fallback;
  }
  return fallback;
}

/**
 * Resolve a gacha pool display name in the target locale.
 * Priority: exact poolId lookup -> reverse lookup by stored poolName -> original fallback.
 */
export function localizePoolName(
  poolId: string | undefined,
  fallback: string | undefined,
  locale: Locale,
): string {
  if (poolId && POOL_NAME_I18N[poolId]) {
    return POOL_NAME_I18N[poolId][locale] || fallback || poolId;
  }
  const byName = fallback ? POOL_REVERSE_MAP.get(fallback) : undefined;
  if (byName) {
    return byName[locale] || fallback || poolId || "";
  }
  return fallback || poolId || "";
}
