# ISCAN Architecture Rules (Single Source of Truth Governance)

## 🧠 Core Principle
ISCAN is a **ledger-first financial system**.

The Ledger Engine is the ONLY source of truth for money.

Everything else (Wallet, Transactions, UI) is derived from it.

---

# 1. LEDGER (SYSTEM OF RECORD)

## Rules
- Ledger is immutable (no overwrites, only new entries)
- All financial state MUST be recorded here first
- Ledger defines:
  - balance changes
  - deposits
  - withdrawals
  - transfers
  - settlements

## Forbidden
- No service may directly "set balance"
- No wallet or transaction model can override ledger state

---

# 2. WALLET SYSTEM

WalletService and WalletModel are ALLOWED to exist.

## Allowed behavior:
- Fetch wallet data
- Cache computed balance from ledger
- Display balance to user
- Trigger transaction requests via orchestration layer

## Forbidden behavior:
- Directly modifying balance as final truth
- Acting as money storage system
- Overwriting ledger-calculated values

## Rule:
Wallet = VIEW + CACHE of Ledger

---

# 3. TRANSACTION SYSTEM

## Transaction = INTENT ONLY

Transactions represent requests such as:
- transfer request
- payment request
- withdrawal request

## Transaction is NOT final money state

Final state is determined ONLY after:
- Ledger commit
- Settlement (if external provider involved)

---

# 4. ORCHESTRATION LAYER (CRITICAL)

All financial actions MUST pass through orchestration.

## Responsibilities:
- Validate request (auth + KYC)
- Prevent double spending
- Create transaction intent
- Trigger ledger write
- Coordinate payment providers
- Handle success/failure flows

---

# 5. IDENTITY & KYC SYSTEM

## IdentityService:
- stores user identity only
- no financial authority

## KYCService:
- acts as access gate
- does NOT move money

---

# 6. PAYMENT PROVIDERS (Coins.ph / Maya / GCash)

## Rules:
- External systems are ONLY settlement tools
- They confirm external transfer success/failure
- They NEVER define internal balance

## Flow:
Ledger → Orchestration → Provider → Callback → Ledger update

---

# 7. DATA CONSISTENCY RULES

## Mandatory:
- Ledger must always reflect final truth
- Wallet must sync from ledger
- Transactions must reconcile with ledger entries

## Forbidden:
- Multiple sources updating same financial state
- Parallel balance mutations outside ledger

---

# 8. DUPLICATE SYSTEM RULE

There must only be ONE active implementation for:

- Wallet Model
- Ledger Model
- Transaction Model
- Identity Model

All duplicates must be:
- merged
- deprecated
- or removed

---

# 9. EVENT-DRIVEN DESIGN (RECOMMENDED)

All financial actions should be treated as events:

Examples:
- USER_TRANSFER_INITIATED
- LEDGER_ENTRY_CREATED
- PAYMENT_SETTLED
- KYC_VERIFIED

Ledger consumes events and produces truth.

---

# 10. AI / AGENT RULES (IMPORTANT)

Any AI agent operating in this system must:

- scan full codebase before changes
- never create duplicate models
- never bypass ledger
- always validate financial consistency
- prefer modification over creation
- preserve transaction integrity

If unsure → STOP and request clarification

---

# 11. SYSTEM SAFETY GUARANTEE

If a conflict exists between services:

👉 Ledger Engine ALWAYS wins
