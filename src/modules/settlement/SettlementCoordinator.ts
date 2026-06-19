import { randomUUID } from "crypto";

type SettlementType = "DEPOSIT" | "WITHDRAWAL" | "CONVERSION";
type Asset = "PHP" | "USDT" | "USDC" | "FLOWER";

type SettlementStatus =
  | "CREATED"
  | "MATCHED"
  | "SETTLED"
  | "FAILED";

interface Settlement {
  id: string;
  user_id: string;
  type: SettlementType;
  asset: Asset;
  expected_amount: number;

  inbound_tx_id?: string;
  outbound_tx_id?: string;

  status: SettlementStatus;

  created_at: Date;
  updated_at: Date;
}
