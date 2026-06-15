import mongoose from 'mongoose';

const chainAddressSchema = new mongoose.Schema({
  chain:       { type:String },
  address:     { type:String },
  chainId:     { type:String },
  usdtBalance: { type:Number, default:0 },
  usdcBalance: { type:Number, default:0 },
}, { _id:false });

const linkedWalletSchema = new mongoose.Schema({
  address:       { type:String, required:true },
  provider:      { type:String, enum:['metamask','ronin','coinbase','trustwallet','other'], default:'metamask' },
  chainId:       { type:String, default:'0x1' },
  network:       { type:String, default:'Ethereum' },
  nativeToken:   { type:String, default:'ETH' },
  nativeBalance: { type:Number, default:0 },
  usdcBalance:   { type:Number, default:0 },
  addedAt:       { type:Date, default:Date.now },
}, { _id:false });

const walletSchema = new mongoose.Schema({
  userId:         { type:mongoose.Schema.Types.ObjectId, ref:'User', required:true, unique:true },
  iscanAddress:   { type:String, required:true, unique:true },
  balances:       { type:Map, of:Number, default:{} },
  chainAddresses: { type:[chainAddressSchema], default:[] },
  activeChain:    { type:String, default:'ETHEREUM' },
  linkedWallets:  { type:[linkedWalletSchema], default:[] },
  status:         { type:String, enum:['active','suspended'], default:'active' },
}, { timestamps:true });

export default mongoose.model('Wallet', walletSchema);
