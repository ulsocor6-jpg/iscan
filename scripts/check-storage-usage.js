// scripts/check-storage-usage.js
// Read-only — lists every collection sorted by storage size, so you can
// see exactly what's eating the 512MB quota before deleting anything.
//
// Usage: node scripts/check-storage-usage.js

import 'dotenv/config';
import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const collections = await db.listCollections().toArray();
  const stats = [];

  for (const c of collections) {
    try {
      const s = await db.command({ collStats: c.name });
      stats.push({
        name: c.name,
        count: s.count,
        storageMB: (s.storageSize / 1024 / 1024).toFixed(2),
        dataMB: (s.size / 1024 / 1024).toFixed(2),
        indexMB: (s.totalIndexSize / 1024 / 1024).toFixed(2),
      });
    } catch (e) {
      stats.push({ name: c.name, error: e.message });
    }
  }

  stats.sort((a, b) => parseFloat(b.storageMB || 0) - parseFloat(a.storageMB || 0));

  console.log('\nCollection storage usage (largest first):\n');
  console.log(
    'Collection'.padEnd(35),
    'Docs'.padStart(10),
    'Storage MB'.padStart(12),
    'Data MB'.padStart(10),
    'Index MB'.padStart(10)
  );
  console.log('-'.repeat(80));
  for (const s of stats) {
    if (s.error) {
      console.log(s.name.padEnd(35), 'ERROR:', s.error);
      continue;
    }
    console.log(
      s.name.padEnd(35),
      String(s.count).padStart(10),
      s.storageMB.padStart(12),
      s.dataMB.padStart(10),
      s.indexMB.padStart(10)
    );
  }

  const totalStorage = stats.reduce((sum, s) => sum + parseFloat(s.storageMB || 0), 0);
  console.log('-'.repeat(80));
  console.log(`Total storage across all collections: ${totalStorage.toFixed(2)} MB\n`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
