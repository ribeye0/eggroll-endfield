import { describe, expect, it } from "vitest";
import { exportAccountToAkegf, importFromAkegf, isAkegfDocument } from "../src/akegf";
import { DEMO_ACCOUNT, DEMO_RECORDS } from "../src/demoData";

describe("AKEGF v0.4 format", () => {
  it("exports account records strictly matching AKEGF v0.4 rules", () => {
    const doc = exportAccountToAkegf(DEMO_ACCOUNT, DEMO_RECORDS);
    expect(doc.info.version).toBe("v0.4");
    expect(doc.info.export_timestamp).toBeGreaterThanOrEqual(1_000_000_000_000);
    expect(doc.endfield.length).toBe(1);

    const acc = doc.endfield[0]!;
    expect(acc.uid).toBe(DEMO_ACCOUNT.roleId);
    expect(acc.account_uid).toBeUndefined();

    for (const pull of acc.list) {
      if (pull.record_type === "weapon") {
        expect("is_free" in pull).toBe(false);
      }
      if (pull.record_type === "char") {
        expect("weapon_type" in pull).toBe(false);
      }
      if (pull.kind === "draw") {
        expect(pull.pool_id).toBeTruthy();
        expect(pull.item_name).toBeTruthy();
        expect(typeof pull.rarity).toBe("number");
        expect(typeof pull.gacha_ts).toBe("number");
      }
    }
  });

  it("imports official AKEGF v0.4 example preserving distinct char/weapon seq_id and gift_weapon", () => {
    const example = {
      info: {
        version: "v0.4" as const,
        export_app: "AKEGF Example",
        export_app_version: "0.4",
        export_timestamp: 1780000000123,
      },
      endfield: [
        {
          region: "cn" as const,
          server_id: "1",
          lang: "zh-cn",
          list: [
            {
              record_type: "char" as const,
              seq_id: "90071992547409931",
              pool_id: "beginner",
              item_id: "chr_0025_ardelia",
              gacha_ts: 1779999900123,
              rarity: 6,
              is_free: false,
              kind: "draw",
              item_name: "艾尔黛拉",
            },
            {
              record_type: "weapon" as const,
              seq_id: "90071992547409931",
              pool_id: "rerun_wpn_tangtang",
              item_id: "wpn_pistol_0011",
              gacha_ts: 1779999900123,
              rarity: 6,
              kind: "draw",
              item_name: "落草",
            },
            {
              kind: "gift_weapon",
              record_type: "weapon" as const,
              seq_id: "90071992547409932",
              pool_id: "weaponbox_1_6_1",
              name_text: "玉中身",
              gift_reward_label: "篆玉赠礼",
              item_name: "玉中身",
              gacha_ts: 1779999940123,
            },
          ],
          account_uid: "10000000000000001",
          uid: "20000000000000001",
        },
        {
          list: [
            {
              kind: "draw",
              item_name: "卡契尔",
              pool_id: "standard",
              rarity: 4,
              gacha_ts: 1779999900123,
            },
          ],
          region: "global" as const,
          server_id: "2",
          uid: "20000000000000002",
        },
      ],
    };

    expect(isAkegfDocument(example)).toBe(true);
    const bundles = importFromAkegf(example);
    expect(bundles.length).toBe(2);

    const cn = bundles[0]!;
    expect(cn.records.char["E_CharacterGachaPoolType_Beginner"]?.length).toBe(1);
    expect(cn.records.weapon["rerun_wpn_tangtang"]?.length).toBe(1);
    expect(cn.records.weapon["weaponbox_1_6_1"]?.length).toBe(1);
    expect(cn.records.char["E_CharacterGachaPoolType_Beginner"]?.[0]?.seqId).toBe(
      "90071992547409931",
    );

    const global = bundles[1]!;
    expect(global.account.provider).toBe("gryphline");
    expect(global.account.serverId).toBe("2");
    expect(global.records.char["E_CharacterGachaPoolType_Standard"]?.length).toBe(1);
  });

  it("routes non-special/non-rerun/non-standard character pools to special pool group (Joint)", () => {
    const doc = {
      info: {
        version: "v0.4" as const,
        export_app: "Test",
        export_app_version: "1.0",
        export_timestamp: 1780000000123,
      },
      endfield: [
        {
          region: "global" as const,
          server_id: "2",
          uid: "12345",
          lang: "zh-tw",
          list: [
            {
              record_type: "char" as const,
              seq_id: "1",
              pool_id: "collab_1_8_1",
              item_id: "chr_0016_laevat",
              gacha_ts: 1780000000000,
              rarity: 6,
              is_free: false,
              kind: "draw",
              item_name: "萊萬汀",
            },
          ],
        },
      ],
    };
    const [bundle] = importFromAkegf(doc);
    expect(bundle!.records.char["E_CharacterGachaPoolType_Joint"]?.length).toBe(1);
    expect(bundle!.records.char["E_CharacterGachaPoolType_Standard"]).toBeUndefined();
  });
});
