import { describe, expect, it } from "vitest";
import {
  analyzeSpecialPoolData,
  analyzeWeaponPoolData,
  compareSeqId,
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
});
