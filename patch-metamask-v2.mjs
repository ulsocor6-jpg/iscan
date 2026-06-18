import fs from "fs";
const path = "src/pages/Swaps.tsx";
let content = fs.readFileSync(path, "utf8");

const endMarker = "\n\n  const tabStyle";
const endIdx = content.indexOf(endMarker);
if (endIdx === -1) { console.error("End marker not found — aborting."); process.exit(1); }

let startIdx = content.indexOf("  function getMetaMaskProvider");
if (startIdx === -1) startIdx = content.indexOf("  async function connectWallet(id: string) {");
if (startIdx === -1) { console.error("connectWallet not found — aborting."); process.exit(1); }

const newBlock = `  function detectInjectedProviders(): Promise<any[]> {
    return new Promise((resolve) => {
      const found: any[] = [];
      const handler = (event: any) => { found.push(event.detail); };
      window.addEventListener("eip6963:announceProvider", handler as any);
      window.dispatchEvent(new Event("eip6963:requestProvider"));
      setTimeout(() => {
        window.removeEventListener("eip6963:announceProvider", handler as any);
        resolve(found);
      }, 250);
    });
  }

  async function getMetaMaskProvider(): Promise<any> {
    const announced = await detectInjectedProviders();
    const mm = announced.find((p: any) => p.info?.rdns === "io.metamask");
    if (mm) return mm.provider;
    const eth = (window as any).ethereum;
    if (eth?.providers?.length) {
      return eth.providers.find((p: any) => p.isMetaMask) || null;
    }
    return eth?.isMetaMask ? eth : null;
  }

  async function connectWallet(id: string) {
    try {
      let address = "";
      if (id === "metamask") {
        const provider = await getMetaMaskProvider();
        if (!provider) { alert("MetaMask not found. If you have multiple wallet extensions, make sure MetaMask is enabled."); return; }
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

content = content.slice(0, startIdx) + newBlock + content.slice(endIdx);
fs.writeFileSync(path, content);
console.log("Patched Swaps.tsx with EIP-6963 detection.");
