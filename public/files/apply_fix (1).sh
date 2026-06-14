#!/bin/bash
TARGET="$HOME/Desktop/iscansystem/public/files/dashboard_v3.html"

echo "📦 Backing up original..."
cp "$TARGET" "${TARGET%.html}_pre_patch.html"

python3 << 'PYEOF'
import re

TARGET = __import__('os').path.expanduser(
    "~/Desktop/iscansystem/public/files/dashboard_v3.html"
)

with open(TARGET, 'r') as f:
    c = f.read()

# ── FIX 1: Add Base to CHAIN_MAP ─────────────────────────────
c = c.replace(
    "  '0xa':    { name:'Optimism',       token:'ETH',   color:'#ff0420' },\n};",
    "  '0xa':    { name:'Optimism',       token:'ETH',   color:'#ff0420' },\n  '0x2105': { name:'Base',           token:'ETH',   color:'#0052ff' },\n};"
)

# ── FIX 2: Replace USDC_CONTRACTS with full TOKEN_CONTRACTS ──
old_contracts = """var USDC_CONTRACTS = {
  '0x1':  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  '0x89': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
};"""

new_contracts = """var TOKEN_CONTRACTS = {
  '0x1':    { USDC:'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', USDT:'0xdAC17F958D2ee523a2206206994597C13D831ec7', WETH:'0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
  '0x89':   { USDC:'0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', USDT:'0xc2132D05D31c914a87C6611C10748AEb04B58e8F', WETH:'0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619' },
  '0x38':   { USDC:'0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', USDT:'0x55d398326f99059fF775485246999027B3197955', WETH:'0x2170Ed0880ac9A755fd29B2688956BD959F933F8' },
  '0x7e4':  { AXS:'0x97a9107C1793BC407d6F527b77e7fff4D812bece', SLP:'0xa8754b9Fa15fc18BB59458815510E40a12cD2014', USDC:'0x0B7007c13325C48911F73A2daD5FA5dCBf808aDc', WETH:'0xc99a6A985eD2Cac1ef41640596C5A5f9F4E19Ef' },
  '0xa4b1': { USDC:'0xaf88d065e77c8cC2239327C5EDb3A432268e5831', USDT:'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', WETH:'0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', ARB:'0x912CE59144191C1204E64559FE8253a0e49E6548' },
  '0xa':    { USDC:'0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', USDT:'0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', WETH:'0x4200000000000000000000000000000000000006' },
  '0x2105': { USDC:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', WETH:'0x4200000000000000000000000000000000000006' },
};
var CHAIN_TOKENS = {
  '0x1':    ['native','USDC','USDT','WETH'],
  '0x89':   ['native','USDC','USDT','WETH'],
  '0x38':   ['native','USDC','USDT','WETH'],
  '0x7e4':  ['native','AXS','SLP','USDC','WETH'],
  '0xa4b1': ['native','USDC','USDT','WETH','ARB'],
  '0xa':    ['native','USDC','USDT','WETH'],
  '0x2105': ['native','USDC','WETH'],
};
var USDC_CONTRACTS = Object.fromEntries(Object.entries(TOKEN_CONTRACTS).map(([c,t])=>[c,t.USDC||null]).filter(([,v])=>v));"""

c = c.replace(old_contracts, new_contracts)

# ── FIX 3: Replace getUSDCBalance with full token balance fn ─
old_usdc_fn = """// ── USDC BALANCE ────────────────────────────────────────────
async function getUSDCBalance(provider,address,chainId){
  var contract=USDC_CONTRACTS[chainId];
  if(!contract)return 0;
  try{
    var data='0x70a08231000000000000000000000000'+address.slice(2).padStart(64,'0');
    var result=await provider.request({method:'eth_call',params:[{to:contract,data},'latest']});
    return parseInt(result,16)/1e6;
  }catch(e){return 0;}
}"""

new_usdc_fn = """// ── TOKEN BALANCES ───────────────────────────────────────────
var TOKEN_DECIMALS={USDC:6,USDT:6,WETH:18,AXS:18,SLP:18,ARB:18};
async function getTokenBalance(provider,address,chainId,symbol){
  var contract=(TOKEN_CONTRACTS[chainId]||{})[symbol];
  if(!contract)return 0;
  try{
    var data='0x70a08231'+'000000000000000000000000'+address.slice(2).padStart(40,'0');
    var result=await provider.request({method:'eth_call',params:[{to:contract,data},'latest']});
    var dec=TOKEN_DECIMALS[symbol]!==undefined?TOKEN_DECIMALS[symbol]:18;
    return parseInt(result,16)/Math.pow(10,dec);
  }catch(e){return 0;}
}
async function getUSDCBalance(provider,address,chainId){return getTokenBalance(provider,address,chainId,'USDC');}
async function getAllTokenBalances(provider,address,chainId){
  var native=0;
  try{var bw=await provider.request({method:'eth_getBalance',params:[address,'latest']});native=parseFloat((parseInt(bw,16)/1e18).toFixed(6));}catch(e){}
  var nativeSym=(CHAIN_MAP[chainId]||{token:'ETH'}).token;
  var balances={native:native,[nativeSym]:native};
  var tokens=(CHAIN_TOKENS[chainId]||[]).filter(t=>t!=='native');
  await Promise.all(tokens.map(async function(sym){
    balances[sym]=parseFloat((await getTokenBalance(provider,address,chainId,sym)).toFixed(6));
  }));
  return balances;
}"""

c = c.replace(old_usdc_fn, new_usdc_fn)

# ── FIX 4: MetaMask — exclude Trust/Coinbase ─────────────────
old_mm_detect = "  if(window.ethereum.providers){provider=window.ethereum.providers.find(p=>p.isMetaMask&&!p.isRonin)||null;}\n  if(!provider&&window.ethereum.isMetaMask&&!window.ethereum.isRonin)provider=window.ethereum;\n  if(!provider){showMsg('walletMsg','error','MetaMask not found. Make sure it is installed and enabled.');return;}"

new_mm_detect = "  if(window.ethereum.providers&&Array.isArray(window.ethereum.providers)){provider=window.ethereum.providers.find(p=>p.isMetaMask&&!p.isRonin&&!p.isTrust&&!p.isTrustWallet&&!p.isCoinbaseWallet)||null;}\n  if(!provider&&window.ethereum.isMetaMask&&!window.ethereum.isRonin&&!window.ethereum.isTrust&&!window.ethereum.isTrustWallet&&!window.ethereum.isCoinbaseWallet)provider=window.ethereum;\n  if(!provider){showMsg('walletMsg','error','MetaMask not found. If Trust Wallet or Coinbase Wallet is active, disable them or use a separate browser profile.');return;}"

c = c.replace(old_mm_detect, new_mm_detect)

# ── FIX 5: Ronin — remove wallet_requestPermissions ──────────
old_ronin = "      await roninProvider.request({method:'wallet_requestPermissions',params:[{eth_accounts:{}}]});\n      var accounts=await roninProvider.request({method:'eth_requestAccounts'});"
new_ronin = "      var accounts=await roninProvider.request({method:'eth_requestAccounts'});"
c = c.replace(old_ronin, new_ronin)

# ── FIX 6: Ronin — fetch all token balances ───────────────────
old_ronin_bal = "      var nativeBal=0;\n      try{var bw=await roninProvider.request({method:'eth_getBalance',params:[address,'latest']});nativeBal=(parseInt(bw,16)/1e18).toFixed(4);}catch(e){}\n      var r=await api('/api/v1/wallet/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address,provider:'ronin',chainId,nativeBalance:parseFloat(nativeBal),nativeToken:'RON',usdcBalance:0})});\n      if(r.ok||r.data.success){\n        showMsg('walletMsg','success','✅ Ronin connected: '+address.substring(0,6)+'...'+address.substring(address.length-4)+' | '+nativeBal+' RON');\n        _syncIscanAddress(r.data);myAddress=address;loadWallets();loadWalletsForOverview();updateReceiveQR();\n      }else showMsg('walletMsg','error',r.data.error||'Failed to link Ronin wallet.');"

new_ronin_bal = """      var allBals=await getAllTokenBalances(roninProvider,address,chainId);
      var nativeBal=allBals['RON']||0;
      var r=await api('/api/v1/wallet/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address,provider:'ronin',chainId,nativeBalance:nativeBal,nativeToken:'RON',usdcBalance:allBals['USDC']||0,tokenBalances:allBals})});
      if(r.ok||r.data.success){
        var summary=Object.entries(allBals).filter(([k,v])=>k!=='native'&&v>0).map(([k,v])=>v.toFixed(4)+' '+k).join(' | ')||nativeBal+' RON';
        showMsg('walletMsg','success','✅ Ronin: '+address.substring(0,6)+'...'+address.substring(address.length-4)+' | '+summary);
        _syncIscanAddress(r.data);myAddress=address;loadWallets();loadWalletsForOverview();updateReceiveQR();
      }else showMsg('walletMsg','error',r.data.error||'Failed to link Ronin wallet.');"""

c = c.replace(old_ronin_bal, new_ronin_bal)

# ── FIX 7: MetaMask — fetch all token balances ───────────────
old_mm_bal = "    var chainId=await provider.request({method:'eth_chainId'});\n    var chainInfo=CHAIN_MAP[chainId]||{name:'Unknown',token:'ETH',color:'#94a3b8'};\n    var nativeBal=0;\n    try{var bw=await provider.request({method:'eth_getBalance',params:[address,'latest']});nativeBal=(parseInt(bw,16)/1e18).toFixed(4);}catch(e){}\n    var usdcBal=await getUSDCBalance(provider,address,chainId);\n    var r=await api('/api/v1/wallet/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address,provider:'metamask',chainId,nativeBalance:parseFloat(nativeBal),nativeToken:chainInfo.token,usdcBalance:usdcBal})});\n    if(r.ok||r.data.success){\n      showMsg('walletMsg','success','✅ '+chainInfo.name+' connected: '+address.substring(0,6)+'...'+address.substring(address.length-4)+' | '+nativeBal+' '+chainInfo.token+(usdcBal>0?' | '+usdcBal.toFixed(2)+' USDC':''));\n      _syncIscanAddress(r.data);myAddress=address;loadWallets();loadWalletsForOverview();updateReceiveQR();\n    }else showMsg('walletMsg','error',r.data.error||'Failed to link wallet.');"

new_mm_bal = """    var chainId=await provider.request({method:'eth_chainId'});
    var chainInfo=CHAIN_MAP[chainId]||{name:'Unknown',token:'ETH',color:'#94a3b8'};
    showMsg('walletMsg','info','Detected '+chainInfo.name+' — reading balances...');
    var allBals=await getAllTokenBalances(provider,address,chainId);
    var nativeBal=allBals[chainInfo.token]||0;
    var r=await api('/api/v1/wallet/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address,provider:'metamask',chainId,nativeBalance:nativeBal,nativeToken:chainInfo.token,usdcBalance:allBals['USDC']||0,tokenBalances:allBals})});
    if(r.ok||r.data.success){
      var summary=Object.entries(allBals).filter(([k,v])=>k!=='native'&&v>0).map(([k,v])=>v.toFixed(4)+' '+k).join(' | ')||nativeBal+' '+chainInfo.token;
      showMsg('walletMsg','success','✅ '+chainInfo.name+': '+address.substring(0,6)+'...'+address.substring(address.length-4)+' | '+summary);
      _syncIscanAddress(r.data);myAddress=address;loadWallets();loadWalletsForOverview();updateReceiveQR();
    }else showMsg('walletMsg','error',r.data.error||'Failed to link wallet.');"""

c = c.replace(old_mm_bal, new_mm_bal)

# ── FIX 8: Wallet list — show all token chips ────────────────
old_chips = "        '<span class=\"token-chip\" style=\"color:'+chainInfo.color+'\">'+(w.nativeBalance||0)+' '+chainInfo.token+'</span>'+\n        (w.usdcBalance>0?'<span class=\"token-chip\" style=\"color:#2775ca\">'+(parseFloat(w.usdcBalance)||0).toFixed(2)+' USDC</span>':'')+\n      '</div>'+"

new_chips = "        renderTokenChips(w,chainInfo)+\n      '</div>'+"

c = c.replace(old_chips, new_chips)

# ── FIX 9: Add helpers + dynamic token selector before connectWallet ──
anchor = "// ── CONNECT WALLET ──────────────────────────────────────────"
helpers = """// ── TOKEN CHIP RENDERER ─────────────────────────────────────
var TOKEN_COLORS={ETH:'#627eea',MATIC:'#8247e5',BNB:'#f3ba2f',RON:'#1273ea',USDC:'#2775ca',USDT:'#26a17b',WETH:'#627eea',AXS:'#1273ea',SLP:'#00d4ff',ARB:'#28a0f0'};
function renderTokenChips(w,chainInfo){
  var chips=[];
  var nativeSym=chainInfo.token;
  chips.push('<span class="token-chip" style="color:'+(chainInfo.color||'#94a3b8')+'">'+(w.nativeBalance||0)+' '+nativeSym+'</span>');
  var tb=w.tokenBalances||{};
  (CHAIN_TOKENS[w.chainId]||[]).filter(function(t){return t!=='native'&&t!==nativeSym;}).forEach(function(sym){
    var val=tb[sym]!==undefined?tb[sym]:(sym==='USDC'?(w.usdcBalance||0):0);
    if(val>0)chips.push('<span class="token-chip" style="color:'+(TOKEN_COLORS[sym]||'#94a3b8')+'">'+parseFloat(val).toFixed(4)+' '+sym+'</span>');
  });
  return chips.join('');
}
function updateTokenSelectorForChain(chainId){
  var tokens=CHAIN_TOKENS[chainId]||['native','USDC','USDT'];
  var nativeSym=(CHAIN_MAP[chainId]||{token:'ETH'}).token;
  var sel=document.getElementById('tokenSelector');
  if(!sel)return;
  sel.innerHTML=tokens.map(function(t,i){
    var label=t==='native'?nativeSym:t;
    return '<button class="chain-btn'+(i===0?' active':'')+'" data-token="'+t+'" onclick="selectReceiveToken(this)">'+label+'</button>';
  }).join('');
  _receiveToken='native';
}
"""
if anchor in c and helpers not in c:
    c = c.replace(anchor, helpers + anchor)

# ── FIX 10: Wire selectReceiveChain to update token selector ─
c = c.replace(
    "  _receiveChain=btn.dataset.chain;\n  updateReceiveQR();",
    "  _receiveChain=btn.dataset.chain;\n  updateTokenSelectorForChain(_receiveChain);\n  updateReceiveQR();"
)

# ── FIX 11: Add Base chain button ────────────────────────────
c = c.replace(
    'onclick="selectReceiveChain(this)">🔴 Optimism</button>\n          </div>',
    'onclick="selectReceiveChain(this)">🔴 Optimism</button>\n            <button class="chain-btn" data-chain="0x2105" data-name="Base" onclick="selectReceiveChain(this)">🔷 Base</button>\n          </div>'
)

# ── FIX 12: Init token selector on load ──────────────────────
old_init = "loadIscanAddressAll();\n</script>"
new_init = "loadIscanAddressAll();\nupdateTokenSelectorForChain('0x1');\n</script>"
c = c.replace(old_init, new_init)

with open(TARGET, 'w') as f:
    f.write(c)

# Verify
checks = [
    ("TOKEN_CONTRACTS" in c, "TOKEN_CONTRACTS"),
    ("CHAIN_TOKENS" in c, "CHAIN_TOKENS"),
    ("getAllTokenBalances" in c, "getAllTokenBalances"),
    ("renderTokenChips" in c, "renderTokenChips"),
    ("updateTokenSelectorForChain" in c, "updateTokenSelectorForChain"),
    ("isTrustWallet" in c, "Trust Wallet exclusion"),
    ("0x2105" in c, "Base chain"),
    ("0x912CE591" in c, "ARB contract"),
    ("wallet_requestPermissions" not in c.split("eth_requestAccounts")[0].split("connectWallet('ronin')")[-1], "Ronin fix"),
]
all_ok = True
for ok, label in checks:
    print(("✅" if ok else "❌") + " " + label)
    if not ok: all_ok = False
print()
print("✅ All patches applied!" if all_ok else "❌ Some patches failed — check above")
PYEOF
