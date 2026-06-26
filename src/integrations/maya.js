/**
 * maya.js — Maya Integration Entry Point
 *
 * This file is the integration index for the Maya payment channel.
 *
 * ── How Maya deposits work in ISCAN ──────────────────────────────────────
 *
 * 1. User links their Maya number in their ISCAN profile
 *    → stored in User.linkedWallets: { provider: "MAYA", accountNumber: "09XXXXXXXXX" }
 *
 * 2. User requests a deposit via POST /deposit/request (channel: "MAYA")
 *    → system generates referenceId (e.g. ISCAN-A3F9C2)
 *    → referenceId is shown to user and embedded in QR code (for audit only)
 *    → user is told to send exactly ₱X to the ISCAN Maya account
 *
 * 3. Sender pays via Maya app (Maya-to-Maya or InstaPay)
 *    → Maya push notification appears on the ISCAN Android device
 *    → MayaIngestor app (Android) captures the notification
 *    → forwards it via POST to /api/maya/notify (mayaNotifyRoute.js)
 *
 * 4. Backend processes the notification:
 *    → mayaNotificationParser.js extracts: amount + senderPhone OR senderName+lastFour
 *    → processTransaction.js matches sender → ISCAN user via linkedWallets
 *    → finds their PENDING DirectDeposit for that amount
 *    → atomically claims it and calls walletService.credit()
 *    → emits deposit.credited event for live dashboard update
 *
 * 5. Ambiguous or unmatched cases → flagged via deposit.flagged event
 *    → admin resolves manually via /deposit/admin/confirm
 *
 * ── What referenceId is for ───────────────────────────────────────────────
 * The referenceId (ISCAN-XXXXXX) is NOT used for matching.
 * Matching is done by linked account number — because Maya notifications
 * do not reliably include the sender's note/message field.
 * The referenceId exists purely as an audit trail and dispute reference.
 *
 * ── Maya cashout (outgoing) ───────────────────────────────────────────────
 * Cashouts use Maya's official Unified Transfer / disbursement API.
 * See: src/integrations/paymentProviders/mayaProvider.js
 */

export { default } from './paymentProviders/mayaProvider.js';
