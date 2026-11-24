export type Provider = "hypergryph" | "gryphline";

export interface AccountInfo {
  key: string;
  uid: string;
  roleId: string;
  nickName: string;
  serverId: string;
  serverName: string;
  provider: Provider;
  u8Token?: string;
}

export interface CharRecord {
  charId: string;
  charName: string;
  gachaTs: string;
  kind?: string;
  isFree: boolean;
  isNew: boolean;
  poolId: string;
  poolName: string;
  rarity: number;
  seqId: string;
  poolVersion?: number | null;
  poolType?: string;
}

export interface WeaponRecord {
  poolId: string;
  poolName: string;
  weaponId: string;
  weaponName: string;
  weaponType: string;
  rarity: number;
  isNew: boolean;
  gachaTs: string;
  seqId: string;
  kind?: string;
  poolVersion?: number | null;
  poolType?: string;
}

export interface PoolInfoEntry {
  pool_id: string;
  pool_gacha_type: string;
  pool_name: string;
  pool_type: string;
  up6_id: string;
  up6_ids?: string[];
  up6_name?: string;
  version_num?: string;
}

export type RerunCountMap = Record<string, number>;

export interface AccountRecords {
  char: Record<string, CharRecord[]>;
  weapon: Record<string, WeaponRecord[]>;
  charRerunCounts?: RerunCountMap;
  weaponRerunCounts?: RerunCountMap;
  lastSyncAt?: string;
}

export interface AppStore {
  accounts: AccountInfo[];
  activeAccountKey?: string;
  records: Record<string, AccountRecords>;
  poolInfo: Record<string, PoolInfoEntry>;
  theme: "dark" | "light";
  zoom?: number;
  historyLimit?: number | "all";
}

export interface HistoryRecord {
  name: string;
  itemId?: string;
  pity: number;
  isNew: boolean;
  isFree?: boolean;
  isUp?: boolean;
  hasUpInfo?: boolean;
  poolId?: string;
  poolName?: string;
  gachaTs?: string;
  seqId?: string;
}

export interface GachaStatistics {
  poolName: string;
  poolId?: string;
  poolType: string;
  isCurrentPool?: boolean;
  totalPulls: number;
  paidPulls: number;
  freePulls: number;
  pityCount: number;
  smallPityMax: number;
  bigPityMax?: number;
  bigPityCount?: number;
  bigPityRemaining?: number;
  officialTotalCount?: number;
  up6Ids?: string[];
  gotUp6?: boolean;
  count6: number;
  count5: number;
  count4: number;
  avgPity6: number | null;
  upWinRate: number | null;
  history6: HistoryRecord[];
}
