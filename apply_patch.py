import re

path = "src/core/processTransaction.js"
with open(path, "r") as f:
    content = f.read()

old = '''  if (source === "MARI_BANK") {
    if (!recipientLastFour) {
      await inspectorService.failStage(flowId, InspectorStage.USER_LOOKUP, "No recipientLastFour", {
        decision: { reason: "UNIDENTIFIABLE_RECIPIENT" },
      });
      await flagForReview(raw, "UNIDENTIFIABLE_RECIPIENT");
      return null;
    }
    const query = { accountNumber: { $regex: new RegExp(escapeRegex(recipientLastFour) + "$") }, status: "active" };
    const bankAccount = await BankAccount.findOne(query).lean();
    if (bankAccount) user = await User.findById(bankAccount.userId).lean();
    await inspectorService.finishStage(flowId, InspectorStage.USER_LOOKUP, {
      query,
      result: bankAccount ? { accountId: bankAccount._id, userId: bankAccount.userId } : null,
      decision: { matched: !!user, reason: user ? "MATCHED_BY_RECIPIENT_LAST_FOUR" : "NO_MATCHING_USER" },
    });

  } else if (source === "MAYA") {
    let matchMethod = null;
    if (senderPhone) {
      const query = { provider: "maya", accountNumber: senderPhone, status: "active" };
      const mayaAccount = await BankAccount.findOne(query).lean();
      if (mayaAccount) { user = await User.findById(mayaAccount.userId).lean(); matchMethod = "SENDER_PHONE"; }
    }
    if (!user && senderName && senderLastFour) {
      const query = {
        accountName: { $regex: new RegExp(escapeRegex(senderName), "i") },
        accountNumber: { $regex: new RegExp(escapeRegex(senderLastFour) + "$") },
        status: "active",
      };
      const bankAccount = await BankAccount.findOne(query).lean();
      if (bankAccount) { user = await User.findById(bankAccount.userId).lean(); matchMethod = "SENDER_NAME_LAST_FOUR"; }
    }
    await inspectorService.finishStage(flowId, InspectorStage.USER_LOOKUP, {
      result: user ? { userId: user._id, email: user.email } : null,
      decision: { matched: !!user, method: matchMethod, reason: user ? "MATCHED" : "NO_MATCHING_USER" },
    });
  } else {
    await inspectorService.failStage(flowId, InspectorStage.USER_LOOKUP, `Unknown source: ${source}`);
    await flagForReview(raw, "UNKNOWN_SOURCE");
    return null;
  }

  if (!user) {
    await flagForReview(raw, "NO_MATCHING_USER");
    return null;
  }'''

new = '''  if (source === "MARI_BANK") {
    if (!recipientLastFour) {
      await inspectorService.failStage(flowId, InspectorStage.USER_LOOKUP, "No recipientLastFour", {
        decision: { reason: "UNIDENTIFIABLE_RECIPIENT" },
      });
      await flagForReview(raw, "UNIDENTIFIABLE_RECIPIENT");
      return null;
    }
    const query = { accountNumber: { $regex: new RegExp(escapeRegex(recipientLastFour) + "$") }, status: "active" };
    const bankAccount = await BankAccount.findOne(query).lean();
    if (bankAccount) user = await User.findById(bankAccount.userId).lean();

    if (user) {
      await inspectorService.finishStage(flowId, InspectorStage.USER_LOOKUP, {
        query,
        result: { accountId: bankAccount._id, userId: bankAccount.userId },
        decision: { matched: true, reason: "MATCHED_BY_RECIPIENT_LAST_FOUR" },
      });
    } else {
      await inspectorService.failStage(flowId, InspectorStage.USER_LOOKUP, "No BankAccount matches this recipient", {
        query,
        decision: { matched: false, reason: "NO_MATCHING_USER" },
      });
    }

  } else if (source === "MAYA") {
    let matchMethod = null;
    if (senderPhone) {
      const query = { provider: "maya", accountNumber: senderPhone, status: "active" };
      const mayaAccount = await BankAccount.findOne(query).lean();
      if (mayaAccount) { user = await User.findById(mayaAccount.userId).lean(); matchMethod = "SENDER_PHONE"; }
    }
    if (!user && senderName && senderLastFour) {
      const query = {
        accountName: { $regex: new RegExp(escapeRegex(senderName), "i") },
        accountNumber: { $regex: new RegExp(escapeRegex(senderLastFour) + "$") },
        status: "active",
      };
      const bankAccount = await BankAccount.findOne(query).lean();
      if (bankAccount) { user = await User.findById(bankAccount.userId).lean(); matchMethod = "SENDER_NAME_LAST_FOUR"; }
    }

    let ambiguousAnonymous = false;
    if (!user && !senderPhone && !senderName) {
      // Anonymous Maya deposit — fall back to amount matching against
      // currently open MAYA deposit requests. Only ambiguous when two
      // different users have an open request for the identical amount
      // within the same ~3-minute window (requests are capped at one
      // PENDING per user per channel by POST /deposit/request).
      const candidates = await DirectDeposit.find({
        status: "PENDING", channel: "MAYA", amount, expiresAt: { $gt: new Date() },
      }).lean();

      if (candidates.length === 1) {
        user = await User.findById(candidates[0].userId).lean();
        matchMethod = "ANONYMOUS_AMOUNT_MATCH";
      } else if (candidates.length > 1) {
        ambiguousAnonymous = true;
        matchMethod = "AMBIGUOUS_ANONYMOUS_MATCH";
      }
    }

    if (user) {
      await inspectorService.finishStage(flowId, InspectorStage.USER_LOOKUP, {
        result: { userId: user._id, email: user.email },
        decision: { matched: true, method: matchMethod, reason: "MATCHED" },
      });
    } else if (ambiguousAnonymous) {
      await inspectorService.failStage(flowId, InspectorStage.USER_LOOKUP,
        "Multiple open MAYA deposits match this amount — cannot safely auto-credit an anonymous transfer", {
          decision: { matched: false, method: matchMethod, reason: "AMBIGUOUS_ANONYMOUS_MATCH" },
      });
      await flagForReview(raw, "AMBIGUOUS_ANONYMOUS_MATCH");
      return null;
    } else {
      await inspectorService.failStage(flowId, InspectorStage.USER_LOOKUP, "No BankAccount or open deposit matches this sender", {
        decision: { matched: false, method: matchMethod, reason: "NO_MATCHING_USER" },
      });
    }

  } else {
    await inspectorService.failStage(flowId, InspectorStage.USER_LOOKUP, `Unknown source: ${source}`);
    await flagForReview(raw, "UNKNOWN_SOURCE");
    return null;
  }

  if (!user) {
    await flagForReview(raw, "NO_MATCHING_USER");
    return null;
  }'''

count = content.count(old)
if count != 1:
    print(f"❌ Expected exactly 1 match, found {count}. File may have changed — aborting, nothing written.")
    raise SystemExit(1)

content = content.replace(old, new)
with open(path, "w") as f:
    f.write(content)

print("✅ Patch applied to", path)
