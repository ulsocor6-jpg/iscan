import fs from "fs";
const path = "src/pages/Swaps.tsx";
let content = fs.readFileSync(path, "utf8");

const oldFn = `  async function connectWallet(id: string) {
    try {
      let address = "";
      if (id === "metamask") {
        if (!(window as any).ethereum) { alert("MetaMask not installed"); return; }
        const accounts = await (window as any).ethereum.request({ method:"eth_requestAccounts" });
        address = accounts[0];
      } else if (id === "ronin") {
        if (!(window as any).ronin) { alert("Ronin wallet not installed"); return; }
        const accounts = await (window as any).ronin.provider.request({ method:"eth_requestAccounts" });
        address = accounts[0];
      }
      setConnectedWallet(id);
      setWalletAddress(address);
    } catch(err:any) { setError(err.message); }
  }`;

const newFn = `  function getMetaMaskProvider(): any {
    const eth = (window as any).ethereum;
    if (!eth) return null;
    if (eth.providers?.length) {
      return eth.providers.find((p: any) => p.isMetaMask) || null;
    }
    return eth.isMetaMask ? eth : null;
  }

  async function connectWallet(id: string) {
    try {
      let address = "";
      if (id === "metamask") {
        const provider = getMetaMaskProvider();
        if (!provider) { alert("MetaMask not installed (or blocked by another wallet extension)"); return; }
        const accounts = await provider.request({ method:"eth_requestAccounts" });
        address = accounts[0];
      } else if (id === "ronin") {
        if (!(window as any).ronin) { alert("Ronin wallet not installed"); return; }
        const accounts = await (window as any).ronin.provider.request({ method:"eth_requestAccounts" });
        address = accounts[0];
      }
      setConnectedWallet(id);
      setWalletAddress(address);
    } catch(err:any) { setError(err.message); }
  }`;

if (!content.includes(oldFn)) {
  console.error("Exact match not found — no changes made.");
  process.exit(1);
}
content = content.replace(oldFn, newFn);
fs.writeFileSync(path, content);
console.log("Patched connectWallet in Swaps.tsx");
