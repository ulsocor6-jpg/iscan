import fs from 'fs';

function patchFile(path, replacements) {
  const original = fs.readFileSync(path, 'utf8');
  fs.writeFileSync(path + '.bak', original);

  let content = original;
  let allFound = true;

  for (const { oldStr, newStr, label } of replacements) {
    if (!content.includes(oldStr)) {
      console.error(`❌ ${path}: could not find "${label}" — skipping this file untouched.`);
      allFound = false;
      break;
    }
    content = content.replace(oldStr, newStr);
  }

  if (allFound) {
    fs.writeFileSync(path, content);
    console.log(`✅ ${path} updated (backup saved as ${path}.bak)`);
  }
}

patchFile('./src/routes/directDepositRoutes.js', [{
  label: 'admin/confirm handler',
  oldStr: `router.post('/admin/confirm', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { referenceId, senderName, adminNote } = req.body;
    const deposit = await DirectDeposit.findOne({ referenceId });
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
    if (deposit.status === 'CREDITED') return res.status(400).json({ error: 'Already credited' });

    await walletService.credit(deposit.userId.toString(), 'PHP', deposit.amount);

    await Ledger.create({
      referenceId, userId: deposit.userId,
      transactionType: 'cashin', debit: 0, credit: deposit.amount, currency: 'PHP',
      description: \`Direct deposit via \${deposit.channel} from \${senderName || 'unknown'}\`,
      status: 'completed'
    });

    deposit.status = 'CREDITED';
    deposit.creditedAt = new Date();
    deposit.senderName = senderName;
    deposit.adminNote = adminNote;
    await deposit.save();

    console.log(\`[DEPOSIT] P\${deposit.amount} credited to \${deposit.userId} ref:\${referenceId}\`);
    res.json({ success: true, credited: deposit.amount, referenceId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});`,
  newStr: `router.post('/admin/confirm', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { referenceId, senderName, adminNote } = req.body;

    const deposit = await DirectDeposit.findOneAndUpdate(
      { referenceId, status: 'PENDING' },
      { status: 'CREDITED', creditedAt: new Date(), senderName, adminNote },
      { new: false }
    );

    if (!deposit) {
      const existing = await DirectDeposit.findOne({ referenceId });
      if (!existing) return res.status(404).json({ error: 'Deposit not found' });
      return res.status(400).json({ error: \`Deposit already \${existing.status.toLowerCase()}\` });
    }

    try {
      await walletService.credit(deposit.userId.toString(), 'PHP', deposit.amount, {
        referenceId,
        description: \`Direct deposit via \${deposit.channel} from \${senderName || 'unknown'}\`,
        transactionType: 'cashin'
      });
    } catch (ledgerErr) {
      await DirectDeposit.findOneAndUpdate({ referenceId }, { status: 'PENDING' });
      throw ledgerErr;
    }

    console.log(\`[DEPOSIT] P\${deposit.amount} credited to \${deposit.userId} ref:\${referenceId}\`);
    res.json({ success: true, credited: deposit.amount, referenceId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});`
}]);

patchFile('./src/services/walletService.js', [{
  label: 'credit() method',
  oldStr: `  async credit(userId, asset, amount, { referenceId, description } = {}) {
    const wallet = await this.getOrCreateWallet(userId);
    await Ledger.create({
      referenceId: referenceId || ('CREDIT-' + crypto.randomBytes(8).toString('hex')),
      userId,
      transactionType: 'credit',
      debit: 0,
      credit: Number(amount),
      currency: asset,
      description: description || \`\${asset} credit via walletService\`,
      status: 'completed',
    });

    return wallet;
  }`,
  newStr: `  async credit(userId, asset, amount, { referenceId, description, transactionType = 'credit' } = {}) {
    const wallet = await this.getOrCreateWallet(userId);
    await Ledger.create({
      referenceId: referenceId || ('CREDIT-' + crypto.randomBytes(8).toString('hex')),
      userId,
      transactionType,
      debit: 0,
      credit: Number(amount),
      currency: asset,
      description: description || \`\${asset} credit via walletService\`,
      status: 'completed',
    });

    return wallet;
  }`
}]);
