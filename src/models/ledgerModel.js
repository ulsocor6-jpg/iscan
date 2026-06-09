import mongoose from 'mongoose';

const ledgerSchema = new mongoose.Schema({

referenceId: {
type: String,
required: true,
index: true
},

userId: {
type: mongoose.Schema.Types.ObjectId,
ref: 'User',
required: true,
index: true
},

transactionType: {
type: String,
enum: [
'deposit',
'withdrawal',
'transfer',
'cash_in',
'cash_out',
'swap',
'remittance',
'fee',
'adjustment'
],
required: true
},

debit: {
type: Number,
default: 0
},

credit: {
type: Number,
default: 0
},

balanceAfter: {
type: Number,
default: 0
},

currency: {
type: String,
default: 'PHP'
},

source: {
type: String,
default: null
},

destination: {
type: String,
default: null
},

description: {
type: String,
default: ''
},

status: {
type: String,
enum: [
'pending',
'completed',
'failed',
'reversed'
],
default: 'completed'
}

}, {
timestamps: true
});

ledgerSchema.index({
userId: 1,
createdAt: -1
});

export default mongoose.model(
'Ledger',
ledgerSchema
);

