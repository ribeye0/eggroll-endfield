import { describe, expect, it } from "vitest";
import {
  analyzeSpecialPoolData,
  analyzeWeaponPoolData,
  compareSeqId,
  computeWeaponGiftMilestone,
  renderAsciiBar,
  SPECIAL_POOL_KEY,
} from "../src/gachaCalc";
import { DEMO_POOL_INFO, DEMO_RECORDS } from "../src/demoData";

describe("gachaCalc", () => {
  it("compares numeric seqIds accurately without float precision loss", () => {
    expect(compareSeqId("1000000000000000002", "1000000000000000001")).toBe(1);
    expect(compareSeqId("999", "1000")).toBe(-1);
    expect(compareSeqId("42", "42")).toBe(0);
  });

  it("analyzes special character pools with shared small pity and per-pool big pity", () => {
    const raw = DEMO_RECORDS.char[SPECIAL_POOL_KEY]!;
    const stats = analyzeSpecialPoolData(raw, DEMO_POOL_INFO);
    expect(stats.length).toBe(3);

    const latest = stats[0]!;
    expect(latest.poolName).toBe("萬物更新");
    expect(latest.gotUp6).toBe(true);
    expect(latest.upWinRate).not.toBeNull();

    expect(stats[1]!.poolName).toBe("冬獵");
    expect(stats[2]!.poolName).toBe("晨星於此閃耀");
  });

  it("analyzes weapon pool pity and UP status", () => {
    const raw = DEMO_RECORDS.weapon["weaponbox_1_6_1"]!;
    const stat = analyzeWeaponPoolData("weaponbox_1_6_1", raw, "wpn_claym_0018");
    expect(stat.count6).toBeGreaterThan(0);
    expect(stat.smallPityMax).toBe(40);
    expect(stat.bigPityMax).toBe(80);
  });

  it("renders ASCII progress bar cleanly", () => {
    expect(renderAsciiBar(0, 80, 10)).toBe("[░░░░░░░░░░]");
    expect(renderAsciiBar(40, 80, 10)).toBe("[█████░░░░░]");
    expect(renderAsciiBar(80, 80, 10)).toBe("[██████████]");
  });

  it("computes weapon arsenal gift milestones (100 box, 180 UP, 260 box, 340 UP)", () => {
    const m0 = computeWeaponGiftMilestone(60);
    expect(m0.nextTarget).toBe(100);
    expect(m0.nextLabel).toBe("補充武庫箱");
    expect(m0.boxesEarned).toBe(0);
    expect(m0.weaponsEarned).toBe(0);

    const m1 = computeWeaponGiftMilestone(120);
    expect(m1.nextTarget).toBe(180);
    expect(m1.nextLabel).toBe("UP 武器");
    expect(m1.boxesEarned).toBe(1);
    expect(m1.weaponsEarned).toBe(0);

    const m2 = computeWeaponGiftMilestone(240);
    expect(m2.nextTarget).toBe(260);
    expect(m2.nextLabel).toBe("補充武庫箱");
    expect(m2.boxesEarned).toBe(1);
    expect(m2.weaponsEarned).toBe(1);

    const m3 = computeWeaponGiftMilestone(340);
    expect(m3.nextTarget).toBe(420);
    expect(m3.boxesEarned).toBe(2);
    expect(m3.weaponsEarned).toBe(2);
  });
});
