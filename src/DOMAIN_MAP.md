# ISCAN Domain Ownership Map

## Wallet Domain
Owner: walletService.js
Rules:
- read-only balance derived from ledger
- no direct mutation

## Ledger Domain
Owner: ledgerEngine.js
Rules:
- single source of truth for all financial state
- immutable entries

## Transaction Domain
Owner: transactionService.js + orchestration layer
Rules:
- handles intent, not final money state

## Identity Domain
Owner: IdentityService.js
Rules:
- identity only, no financial authority

## KYC Domain
Owner: kycService.js
Rules:
- gating system only, no financial writes

## Payment Providers
Owner: coinsphProvider.js, mayaProvider.js
Rules:
- external settlement only
- never modify internal ledger directly
