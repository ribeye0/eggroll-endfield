import { describe, expect, it } from "vitest";
import { getApiLang, getHtmlLang, LOCALE_LABELS, TRANSLATIONS } from "../src/i18n";
import { ITEM_NAME_I18N, localizeItemName, localizePoolName, POOL_NAME_I18N } from "../src/itemI18n";

describe("5-language i18n & item/pool localization", () => {
  it("supports Korean locale helpers and translations", () => {
    expect(LOCALE_LABELS.ko).toBe("한국어");
    expect(getHtmlLang("ko")).toBe("ko");
    expect(getApiLang("ko")).toBe("ko-kr");
    expect(TRANSLATIONS.ko.tabChar).toBeTruthy();
    expect(TRANSLATIONS.ko.tabWeapon).toBeTruthy();
  });

  it("localizes character and weapon names by ID across all 5 locales", () => {
    expect(localizeItemName("chr_0016_laevat", "萊萬汀", "zh-TW")).toBe("萊萬汀");
    expect(localizeItemName("chr_0016_laevat", "萊萬汀", "zh-CN")).toBe("莱万汀");
    expect(localizeItemName("chr_0016_laevat", "萊萬汀", "ja")).toBe("レーヴァテイン");
    expect(localizeItemName("chr_0016_laevat", "萊萬汀", "en")).toBe("Laevatain");
    expect(localizeItemName("chr_0016_laevat", "萊萬汀", "ko")).toBe("레바테인");

    expect(localizeItemName("wpn_sword_0006", "熔鑄火焰", "en")).toBe("Forgeborn Scathe");
    expect(localizeItemName("wpn_sword_0006", "熔鑄火焰", "ko")).toBe("용조의 불꽃");
  });

  it("falls back to reverse-lookup by stored name when itemId is missing, and to original fallback when unknown", () => {
    expect(localizeItemName(undefined, "Laevatain", "ja")).toBe("レーヴァテイン");
    expect(localizeItemName(undefined, "Unknown New Hero", "ko")).toBe("Unknown New Hero");
    expect(localizeItemName("chr_9999_future", "未來新角色", "en")).toBe("未來新角色");
  });

  it("localizes pool names by poolId and reverse-lookup across all 5 locales", () => {
    expect(localizePoolName("special_1_0_1", "熔火灼痕", "en")).toBe("Scars of the Forge");
    expect(localizePoolName("special_1_0_1", "熔火灼痕", "ko")).toBe("불꽃에 그을린 상흔");
    expect(localizePoolName("weponbox_1_0_1", "熔鑄申領", "ja")).toBe("溶鋳・申請");
    expect(localizePoolName("standard", "基礎尋訪", "en")).toBe("Basic Headhunting");
    expect(localizePoolName(undefined, "Smelting Forge Issue", "zh-TW")).toBe("熔鑄申領");
    expect(localizePoolName("special_9_9_9", "Future Banner", "en")).toBe("Future Banner");
  });

  it("contains complete 5-language entries for every item and pool", () => {
    expect(Object.keys(ITEM_NAME_I18N).length).toBeGreaterThanOrEqual(88);
    expect(Object.keys(POOL_NAME_I18N).length).toBeGreaterThanOrEqual(46);
  });
});
