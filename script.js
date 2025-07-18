// Wait for DOM
window.addEventListener('DOMContentLoaded', function () {
  // Entropy collection variables
  const entropyOverlay = document.getElementById('entropyOverlay');
  const entropyProgress = document.getElementById('entropyProgress');
  const entropyPercent = document.getElementById('entropyPercent');
  const entropyStatus = document.getElementById('entropyStatus');
  const ENTROPY_TARGET = 2560; // bits of entropy to collect (10x more)
  let entropyPool = [];
  let entropyBits = 0;
  let entropyReady = false;

  function updateEntropyProgress() {
    const percent = Math.min(100, Math.floor((entropyBits / ENTROPY_TARGET) * 100));
    entropyProgress.style.width = percent + '%';
    entropyPercent.textContent = percent + '%';
    if (percent >= 100) {
      entropyStatus.textContent = 'Enough entropy collected! Generating wallet...';
    } else {
      entropyStatus.textContent = 'Entropy collected: ' + entropyBits + ' / ' + ENTROPY_TARGET + ' bits';
    }
  }

  function addEntropy(val, bits = 2) {
    if (entropyBits >= ENTROPY_TARGET) return;
    entropyPool.push(val ^ Date.now());
    entropyBits += bits;
    updateEntropyProgress();
    if (entropyBits >= ENTROPY_TARGET && !entropyReady) {
      entropyReady = true;
      setTimeout(finishEntropy, 400);
    }
  }

  function finishEntropy() {
    entropyOverlay.style.display = 'none';
    // Now ready to generate wallets using entropy
    entropyReady = true;
    // Optionally, trigger wallet generation if desired
  }

  // Mouse movement
  window.addEventListener('mousemove', function(e) {
    addEntropy(e.clientX ^ e.clientY);
  });
  // Touch movement
  window.addEventListener('touchmove', function(e) {
    if (e.touches && e.touches.length > 0) {
      addEntropy(e.touches[0].clientX ^ e.touches[0].clientY);
    }
  });
  // Keyboard
  window.addEventListener('keydown', function(e) {
    addEntropy(e.keyCode);
  });

  updateEntropyProgress();

  // Global variables for import functionality
  let lastImportType = null;
  let lastImportData = null;

  // Always attach print event if button exists
  const printWalletBtn = document.getElementById('printWallet');
  let isWalletPrinting = false;
  if (printWalletBtn) {
    printWalletBtn.onclick = null;
    printWalletBtn.addEventListener('click', function(e) {
      if (isWalletPrinting) return;
      isWalletPrinting = true;
      printWalletBtn.disabled = true;
      document.body.classList.add('print-wallets');
      setTimeout(() => window.print(), 0);
    });
    window.addEventListener('afterprint', function() {
      document.body.classList.remove('print-wallets');
      isWalletPrinting = false;
      printWalletBtn.disabled = false;
    });
  }

  // Generate tab elements
  const generateBtn = document.getElementById('generateWallet');
  const walletCountInput = document.getElementById('walletCount');
  const walletsPrintDiv = document.getElementById('walletsPrint');
  // Remove any duplicate declaration of printWalletBtn. Only declare it once at the top with the other generate tab elements.

  function createWalletElement(address, wif, idx) {
    // Create wallet DOM structure for printing
    const walletDiv = document.createElement('div');
    walletDiv.className = 'wallet-row';
    walletDiv.style.marginBottom = '2.2rem';
    walletDiv.innerHTML = `
      <div class="wallet-col share">
        <div class="label">SHARE</div>
        <div class="qr-container" id="printAddressQR${idx}"></div>
        <div class="key-text">${address}</div>
      </div>
      <div class="wallet-col secret">
        <div class="label">SECRET</div>
        <div class="qr-container" id="printPrivateKeyQR${idx}"></div>
        <div class="key-text">${wif}</div>
      </div>
    `;
    // Info below both columns
    const infoDiv = document.createElement('div');
    infoDiv.className = 'wallet-info';
    infoDiv.innerHTML = '<b>To safeguard this wallet:</b> Print and store in a safe place. Never share your private key. Anyone with access to the private key can spend your BSV.';
    walletDiv.appendChild(infoDiv);
    return walletDiv;
  }

  function bigIntTo32ByteBuffer(num) {
    let hex = num.toString(16);
    while (hex.length < 64) hex = '0' + hex; // pad to 32 bytes
    const bytes = [];
    for (let i = 0; i < 64; i += 2) {
      bytes.push(parseInt(hex.slice(i, i + 2), 16));
    }
    return new Uint8Array(bytes);
  }

  async function getValidEntropyBuffer() {
    const N_HEX = "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141";
    const N = BigInt("0x" + N_HEX);
    let poolStr = entropyPool.join(',');
    let enc = new TextEncoder();
    let hashBuffer = await window.crypto.subtle.digest('SHA-256', enc.encode(poolStr));
    let hashBytes = new Uint8Array(hashBuffer);

    // Get 32 random bytes from CSPRNG
    let randBytes = new Uint8Array(32);
    window.crypto.getRandomValues(randBytes);

    // Mix in user entropy by XORing with hashBytes
    let mixed = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      mixed[i] = randBytes[i] ^ hashBytes[i % hashBytes.length];
    }

    // Convert to BigInt
    let hex = Array.from(mixed).map(b => b.toString(16).padStart(2, '0')).join('');
    let num = BigInt('0x' + hex);

    // Force into valid range: [1, N-1]
    num = (num % (N - 1n)) + 1n;

    // Convert back to 32-byte buffer
    let numHex = num.toString(16);
    while (numHex.length < 64) numHex = '0' + numHex;
    const bytes = [];
    for (let i = 0; i < 64; i += 2) {
      bytes.push(parseInt(numHex.slice(i, i + 2), 16));
    }
    return new Uint8Array(bytes);
  }

  // Patch generateWallets to use entropy for the first wallet
  async function generateWallets() {
    const count = Math.max(1, Math.min(20, parseInt(walletCountInput.value, 10) || 1));
    walletsPrintDiv.innerHTML = '';
    walletsPrintDiv.style.display = '';
    // Force reflow
    void walletsPrintDiv.offsetHeight;
    // Use entropy for the first wallet if available
    let entropyUsed = false;
    let entropyBytes = null;
    if (entropyReady && entropyPool.length > 0) {
      entropyBytes = await getValidEntropyBuffer();
    }
    for (let i = 0; i < count; i++) {
      let privKey;
      if (!entropyUsed && entropyBytes) {
        const buffer = bsv.deps.Buffer.from(entropyBytes);
        privKey = bsv.PrivateKey.fromBuffer(buffer, 'mainnet');
        entropyUsed = true;
      } else {
        privKey = bsv.PrivateKey.fromRandom('mainnet');
      }
      const wif = privKey.toWIF();
      const address = privKey.toAddress('mainnet').toString();
      const walletElem = createWalletElement(address, wif, i);
      // Wrap in .wallet-print
      const walletPrintDiv = document.createElement('div');
      walletPrintDiv.className = 'wallet-print';
      walletPrintDiv.appendChild(walletElem);
      walletsPrintDiv.appendChild(walletPrintDiv);
      // Add cut line after each wallet except the last
      if (i < count - 1) {
        const cutLine = document.createElement('div');
        cutLine.className = 'cut-line';
        walletsPrintDiv.appendChild(cutLine);
      }
      // Generate QR codes for this wallet
      const addressQR = walletElem.querySelector(`#printAddressQR${i}`);
      const privQR = walletElem.querySelector(`#printPrivateKeyQR${i}`);
      if (typeof QRCode !== 'undefined') {
        new QRCode(addressQR, {
          text: address,
          width: 120,
          height: 120
        });
        new QRCode(privQR, {
          text: wif,
          width: 120,
          height: 120
        });
      }
    }
  }

  if (generateBtn && walletCountInput && walletsPrintDiv) {
    generateBtn.addEventListener('click', async function() {
      // Only show entropy overlay if not ready
      if (!entropyReady) {
        entropyOverlay.style.display = 'flex';
        // Wait for entropy to be collected before generating wallets
        finishEntropy = async function() {
          entropyOverlay.style.display = 'none';
          entropyReady = true;
          await generateWallets();
        };
        return;
      }
      await generateWallets();
    });
    // Do NOT generate wallets on page load
    // generateWallets();
  }

  // Hide walletsPrintDiv and disable print button on load
  walletsPrintDiv.style.display = 'none';
  if (printWalletBtn) printWalletBtn.disabled = true;

  async function generateWallets() {
    const count = Math.max(1, Math.min(20, parseInt(walletCountInput.value, 10) || 1));
    walletsPrintDiv.innerHTML = '';
    walletsPrintDiv.style.display = '';
    // Force reflow
    void walletsPrintDiv.offsetHeight;
    // Use entropy for the first wallet if available
    let entropyUsed = false;
    let entropyBytes = null;
    if (entropyReady && entropyPool.length > 0) {
      entropyBytes = await getValidEntropyBuffer();
    }
    for (let i = 0; i < count; i++) {
      let privKey;
      if (!entropyUsed && entropyBytes) {
        const buffer = bsv.deps.Buffer.from(entropyBytes);
        privKey = bsv.PrivateKey.fromBuffer(buffer, 'mainnet');
        entropyUsed = true;
      } else {
        privKey = bsv.PrivateKey.fromRandom('mainnet');
      }
      const wif = privKey.toWIF();
      const address = privKey.toAddress('mainnet').toString();
      const walletElem = createWalletElement(address, wif, i);
      // Wrap in .wallet-print
      const walletPrintDiv = document.createElement('div');
      walletPrintDiv.className = 'wallet-print';
      walletPrintDiv.appendChild(walletElem);
      walletsPrintDiv.appendChild(walletPrintDiv);
      // Add cut line after each wallet except the last
      if (i < count - 1) {
        const cutLine = document.createElement('div');
        cutLine.className = 'cut-line';
        walletsPrintDiv.appendChild(cutLine);
      }
      // Generate QR codes for this wallet
      const addressQR = walletElem.querySelector(`#printAddressQR${i}`);
      const privQR = walletElem.querySelector(`#printPrivateKeyQR${i}`);
      if (typeof QRCode !== 'undefined') {
        new QRCode(addressQR, {
          text: address,
          width: 120,
          height: 120
        });
        new QRCode(privQR, {
          text: wif,
          width: 120,
          height: 120
        });
      }
    }
    if (printWalletBtn) printWalletBtn.disabled = false;
  }

  if (printWalletBtn && walletsPrintDiv) {
    printWalletBtn.disabled = !walletsPrintDiv.querySelector('.wallet-print');
    printWalletBtn.addEventListener('click', function() {
      // Only allow printing if there are wallet-print elements
      if (!walletsPrintDiv.querySelector('.wallet-print')) return;
      walletsPrintDiv.style.display = '';
      window.print();
    });
  }

  // Print wallet side-by-side layout for print
  function showPrintWallet() {
    walletsPrintDiv.style.display = '';
  }
  function hidePrintWallet() {
    walletsPrintDiv.style.display = '';
  }
  // Commenting out global print event listeners for debugging
  // window.addEventListener('beforeprint', showPrintWallet);
  // window.addEventListener('afterprint', function() {
  //   hidePrintWallet();
  //   isPrinting = false;
  // });

  // Import tab logic (add null checks for all event listeners)
  const importBtn = document.getElementById('importBtn');
  const importInput = document.getElementById('importInput');
  const importError = document.getElementById('importError');
  const importResult = document.getElementById('importResult');
  const importAddressDiv = document.getElementById('importAddressDiv');
  const importAddressQR = document.getElementById('importAddressQR');
  const utxoTableBody = document.getElementById('utxoTableBody');
  const printImportBtn = document.getElementById('printImportBtn');
  if (printImportBtn) printImportBtn.style.display = 'none';
  const showBeefBtn = document.getElementById('showBeefBtn');
  if (showBeefBtn) showBeefBtn.style.display = 'none';
  const copyBeefBtn = document.getElementById('copyBeefBtn');
  const downloadBeefBtn = document.getElementById('downloadBeefBtn');
  const copiedMsg = document.getElementById('copiedMsg');
  const beefJsonDisplay = document.getElementById('beefJsonDisplay');

  if (importBtn && importInput && importError && importResult && importAddressDiv && importAddressQR && utxoTableBody && printImportBtn && showBeefBtn && copyBeefBtn && downloadBeefBtn && copiedMsg && beefJsonDisplay) {
    const importAddressSection = document.getElementById('importAddressSection');
    const importUtxoSection = document.getElementById('importUtxoSection');
    const importTxSection = document.getElementById('importTxSection');
    const txSummary = document.getElementById('txSummary');
    const txInputs = document.getElementById('txInputs');
    const txOutputs = document.getElementById('txOutputs');
    const txSpv = document.getElementById('txSpv');

    function getBeefJson() {
      let beef = {};
      if (lastImportType === 'address') {
        beef = {
          format: 'BEEF',
          version: 1,
          address: lastImportData.address,
          wif: lastImportData.wif || undefined,
          utxos: lastImportData.utxos
        };
      } else if (lastImportType === 'txid') {
        beef = {
          format: 'BEEF',
          version: 1,
          txid: lastImportData.txid,
          merkleProof: lastImportData.merkleProof,
          blockHeader: lastImportData.blockHeader,
          inputs: lastImportData.tx.vin,
          outputs: lastImportData.tx.vout,
          spv: lastImportData.blockInfo || undefined
        };
      }
      return JSON.stringify(beef, null, 2);
    }

    function showBeefJson(toggle=true) {
      if (!lastImportType) return;
      if (toggle) {
        if (beefJsonDisplay.style.display === 'none') {
          beefJsonDisplay.textContent = getBeefJson();
          beefJsonDisplay.style.display = '';
          showBeefBtn.textContent = 'Hide BEEF JSON';
          copyBeefBtn.style.display = '';
          downloadBeefBtn.style.display = '';
        } else {
          beefJsonDisplay.style.display = 'none';
          showBeefBtn.textContent = 'Show BEEF JSON';
          copyBeefBtn.style.display = 'none';
          downloadBeefBtn.style.display = 'none';
        }
      } else {
        beefJsonDisplay.textContent = getBeefJson();
        beefJsonDisplay.style.display = '';
        showBeefBtn.textContent = 'Hide BEEF JSON';
        copyBeefBtn.style.display = '';
        downloadBeefBtn.style.display = '';
      }
    }

    showBeefBtn.addEventListener('click', function() { showBeefJson(true); });

    copyBeefBtn.addEventListener('click', function() {
      if (!lastImportType) return;
      const beefJson = getBeefJson();
      navigator.clipboard.writeText(beefJson).then(() => {
        copiedMsg.style.display = '';
        setTimeout(() => { copiedMsg.style.display = 'none'; }, 1500);
      });
    });

    function clearImportDisplay() {
      importError.textContent = '';
      importResult.style.display = 'none';
      importAddressDiv.textContent = '';
      importAddressQR.innerHTML = '';
      utxoTableBody.innerHTML = '';
      importAddressSection.style.display = '';
      importUtxoSection.style.display = '';
      importTxSection.style.display = 'none';
      txSummary.innerHTML = '';
      txInputs.innerHTML = '';
      txOutputs.innerHTML = '';
      txSpv.innerHTML = '';
    }

    async function importWallet() {
      clearImportDisplay();
      beefJsonDisplay.style.display = 'none';
      showBeefBtn.textContent = 'Show BEEF JSON';
      copyBeefBtn.style.display = 'none';
      downloadBeefBtn.style.display = 'none';
      copiedMsg.style.display = 'none';
      if (printImportBtn) printImportBtn.style.display = 'none';
      if (showBeefBtn) showBeefBtn.style.display = 'none';
      let input = importInput.value.trim();
      if (!input) {
        importError.textContent = 'Please enter a WIF private key, BSV address, or TXID.';
        return;
      }
      // Detect TXID (64 hex chars)
      if (/^[0-9a-fA-F]{64}$/.test(input)) {
        // TXID import
        importAddressSection.style.display = 'none';
        importUtxoSection.style.display = 'none';
        importTxSection.style.display = '';
        importResult.style.display = 'block';
        txSummary.innerHTML = 'Loading transaction details...';
        try {
          // Bitails: fetch transaction details
          const txRes = await fetch(`https://api.bitails.io/tx/${input}`);
          if (!txRes.ok) throw new Error('Not found');
          const tx = await txRes.json();
          // Bitails: fetch Merkle proof
          let merkleProof = [];
          try {
            const proofRes = await fetch(`https://api.bitails.io/tx/${input}/proof`);
            if (proofRes.ok) {
              const proofData = await proofRes.json();
              if (proofData && proofData.branches && Array.isArray(proofData.branches)) {
                merkleProof = proofData.branches.map(step => ({ hash: step.hash, position: step.pos === 'L' ? 'left' : 'right' }));
              }
            }
          } catch (e) { /* ignore proof errors */ }
          if (!merkleProof || !Array.isArray(merkleProof)) merkleProof = [];
          if (merkleProof.length === 0) {
            importError.textContent = 'No Merkle proof available for this transaction from Bitails.';
          }
          // Bitails: fetch block header
          let blockHeader = null;
          if (tx.blockhash) {
            try {
              const blockRes = await fetch(`https://api.bitails.io/block/${tx.blockhash}`);
              if (blockRes.ok) {
                const blockInfo = await blockRes.json();
                blockHeader = { merkleRoot: blockInfo.merkleRoot || blockInfo.merkleroot, ...blockInfo };
              }
            } catch (e) { /* ignore block header errors */ }
          }
          // Summary
          txSummary.innerHTML = `<b>TXID:</b> ${input}<br><b>Block Hash:</b> ${tx.blockhash || 'Unconfirmed'}<br><b>Confirmations:</b> ${tx.confirmations || 0}`;
          txInputs.innerHTML = '<b>Inputs:</b><br>' + (tx.vin && tx.vin.length ? '<ul>' + tx.vin.map(vin => `<li>${vin.addr || ''} (${vin.value || 0} sats)</li>`).join('') + '</ul>' : 'None');
          txOutputs.innerHTML = '<b>Outputs:</b><br>' + (tx.vout && tx.vout.length ? '<ul>' + tx.vout.map(vout => `<li>${vout.scriptPubKey && vout.scriptPubKey.addresses ? vout.scriptPubKey.addresses.join(', ') : ''} (${vout.valueSat || 0} sats)</li>`).join('') + '</ul>' : 'None');
          // SPV info
          let blockInfo = null;
          if (tx.blockhash) {
            txSpv.innerHTML = 'Loading block info...';
            try {
              const blockRes = await fetch(`https://api.bitails.io/block/${tx.blockhash}`);
              if (blockRes.ok) {
                blockInfo = await blockRes.json();
                txSpv.innerHTML = `<b>Block Height:</b> ${blockInfo.height}<br><b>Block Hash:</b> ${blockInfo.hash}`;
              } else {
                txSpv.innerHTML = '<b>Block info:</b> N/A';
              }
            } catch (e) {
              txSpv.innerHTML = '<b>Block info:</b> N/A';
            }
          } else {
            txSpv.innerHTML = '<b>Block info:</b> Unconfirmed';
          }
          // Save for BEEF
          lastImportType = 'txid';
          lastImportData = { tx, blockInfo, txid: input, merkleProof, blockHeader };
          if (printImportBtn) printImportBtn.style.display = '';
          if (showBeefBtn) showBeefBtn.style.display = '';
        } catch (e) {
          txSummary.innerHTML = 'Error fetching transaction details.';
          txInputs.innerHTML = '';
          txOutputs.innerHTML = '';
          txSpv.innerHTML = '';
        }
        return;
      }
      // Otherwise, WIF or address (existing logic)
      let address = '';
      let wif = '';
      try {
        if (/^[KL5][1-9A-HJ-NP-Za-km-z]{51,52}$/.test(input)) {
          // Looks like WIF
          const privKey = bsv.PrivateKey.fromWIF(input);
          address = privKey.toAddress('mainnet').toString();
          wif = input;
        } else if (/^1[0-9A-HJ-NP-Za-km-z]{25,34}$/.test(input)) {
          // Looks like legacy address
          address = input;
        } else {
          importError.textContent = 'Invalid WIF, BSV address, or TXID.';
          return;
        }
      } catch (e) {
        importError.textContent = 'Invalid WIF, BSV address, or TXID.';
        return;
      }
      // Show address and QR
      importAddressSection.style.display = '';
      importUtxoSection.style.display = '';
      importTxSection.style.display = 'none';
      importAddressDiv.textContent = address;
      new QRCode(importAddressQR, {
        text: address,
        width: 160,
        height: 160
      });
      importResult.style.display = 'block';
      // Fetch UTXOs (Bitails)
      utxoTableBody.innerHTML = '<tr><td colspan="5">Loading UTXOs...</td></tr>';
      try {
        const utxoRes = await fetch(`https://api.bitails.io/address/${address}/unspent`);
        if (!utxoRes.ok) throw new Error('Not found');
        const utxoData = await utxoRes.json();
        const utxos = utxoData.unspent || [];
        if (!Array.isArray(utxos) || utxos.length === 0) {
          utxoTableBody.innerHTML = '<tr><td colspan="5">No UTXOs found for this address.</td></tr>';
        } else {
          utxoTableBody.innerHTML = utxos.map(utxo =>
            `<tr><td>${utxo.txid}</td><td>${utxo.vout}</td><td>${utxo.satoshis}</td><td>${utxo.blockheight}</td><td>${utxo.confirmations}</td></tr>`
          ).join('');
        }
        // Save for BEEF
        lastImportType = 'address';
        lastImportData = { address, wif, utxos };
        if (printImportBtn) printImportBtn.style.display = '';
        if (showBeefBtn) showBeefBtn.style.display = '';
      } catch (e) {
        utxoTableBody.innerHTML = '<tr><td colspan="5">Error fetching UTXOs.</td></tr>';
      }
    }

    importBtn.addEventListener('click', importWallet);
    importInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') importWallet();
    });
    if (printImportBtn) {
      printImportBtn.addEventListener('click', function() {
        document.body.classList.add('print-import');
        window.print();
      });
      window.addEventListener('afterprint', function() {
        document.body.classList.remove('print-import');
      });
    }
    downloadBeefBtn.addEventListener('click', function() {
      if (!lastImportType) return;
      const beefJson = getBeefJson();
      let filename = 'beef.json';
      if (lastImportType === 'address' && lastImportData && lastImportData.address) {
        filename = 'beef-' + lastImportData.address + '.json';
      } else if (lastImportType === 'txid' && lastImportData && lastImportData.tx && lastImportData.tx.txid) {
        filename = 'beef-' + lastImportData.tx.txid + '.json';
      }
      const blob = new Blob([beefJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Tab switching logic
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      // Remove active from all tab buttons
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      // Add active to clicked button
      btn.classList.add('active');
      // Hide all tab contents
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      // Show the selected tab
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });

  // SPV UTXO Validator logic
  const beefFileInput = document.getElementById('beefFileInput');
  const validateBeefBtn = document.getElementById('validateBeefBtn');
  const beefJsonPaste = document.getElementById('beefJsonPaste');
  const validateBeefPasteBtn = document.getElementById('validateBeefPasteBtn');
  const beefValidationError = document.getElementById('beefValidationError');
  const beefValidationResult = document.getElementById('beefValidationResult');

  function reverseHex(hex) {
    return hex.match(/../g).reverse().join('');
  }

  // Enhanced verifyMerkleProof: returns {isValid, steps, computedRoot}
  async function verifyMerkleProof(txid, merkleProof, merkleRoot) {
    if (!txid || typeof txid !== 'string') throw new Error('BEEF JSON missing or invalid txid');
    let steps = [];
    let hash = reverseHex(txid.toLowerCase());
    let stepNum = 0;
    for (const step of merkleProof) {
      if (!step.hash || typeof step.hash !== 'string') throw new Error('BEEF JSON merkleProof step missing hash');
      let sibling = reverseHex(step.hash.toLowerCase());
      let concat, concatDesc;
      if (step.position === 'left') {
        concat = sibling + hash;
        concatDesc = `left (sibling) + right (current)`;
      } else {
        concat = hash + sibling;
        concatDesc = `left (current) + right (sibling)`;
      }
      const result = await sha256d(concat);
      steps.push({
        step: stepNum,
        inputHash: hash,
        sibling,
        position: step.position,
        concat,
        concatDesc,
        result
      });
      hash = result;
      stepNum++;
    }
    if (!merkleRoot || typeof merkleRoot !== 'string') throw new Error('BEEF JSON missing or invalid merkleRoot');
    const computedRoot = reverseHex(hash);
    const isValid = computedRoot === merkleRoot.toLowerCase();
    return { isValid, steps, computedRoot, expectedRoot: merkleRoot.toLowerCase() };
  }
  // Double SHA256 helper (async)
  async function sha256d(hex) {
    const bytes = hexToBytes(hex);
    const hash1 = await sha256(bytes);
    const hash2 = await sha256(hash1);
    return bytesToHex(hash2);
  }
  // Hex to bytes
  function hexToBytes(hex) {
    if (hex.startsWith('0x')) hex = hex.slice(2);
    const bytes = [];
    for (let c = 0; c < hex.length; c += 2) bytes.push(parseInt(hex.substr(c, 2), 16));
    return new Uint8Array(bytes);
  }
  // Bytes to hex
  function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // SHA256 (browser crypto, async)
  async function sha256(bytes) {
    if (window.crypto && window.crypto.subtle) {
      const buffer = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
      return new Uint8Array(hashBuffer);
    } else {
      throw new Error('SHA256 not supported');
    }
  }
  // Beef validation logic update (returns breakdown)
  async function validateBeefJson(beef) {
    if (!beef || beef.format !== 'BEEF' || beef.version !== 1) {
      throw new Error('Invalid BEEF JSON format or version.');
    }
    if (!beef.txid || !beef.merkleProof || !beef.blockHeader) {
      throw new Error('BEEF JSON must contain txid, merkleProof, and blockHeader for Merkle proof validation.');
    }
    const merkleRoot = beef.blockHeader.merkleRoot || beef.blockHeader.merkleroot;
    if (!merkleRoot) throw new Error('BEEF JSON missing or invalid merkleRoot');
    // Validate Merkle proof
    const result = await verifyMerkleProof(beef.txid, beef.merkleProof, merkleRoot);
    return result;
  }

  function renderBeefDetails(beef) {
    let html = '<div style="margin-top:1em;">';
    if (beef.address) html += `<div><b>Address:</b> ${beef.address}</div>`;
    if (beef.wif) html += `<div><b>WIF:</b> ${beef.wif}</div>`;
    if (beef.txid) html += `<div><b>TXID:</b> ${beef.txid}</div>`;
    if (beef.blockHash) html += `<div><b>Block Hash:</b> ${beef.blockHash}</div>`;
    if (beef.blockHeight) html += `<div><b>Block Height:</b> ${beef.blockHeight}</div>`;
    if (beef.utxos && Array.isArray(beef.utxos)) {
      html += '<div style="margin-top:0.7em;"><b>UTXOs:</b></div>';
      html += '<table style="width:100%;border-collapse:collapse;margin-top:0.3em;font-size:1em;">';
      html += '<thead><tr><th>TXID</th><th>Vout</th><th>Value (sats)</th><th>Block Height</th></tr></thead><tbody>';
      for (const utxo of beef.utxos) {
        html += `<tr><td>${utxo.tx_hash || utxo.txid || ''}</td><td>${utxo.tx_pos ?? utxo.vout ?? ''}</td><td>${utxo.value ?? ''}</td><td>${utxo.height ?? ''}</td></tr>`;
      }
      html += '</tbody></table>';
    }
    if (beef.inputs && Array.isArray(beef.inputs)) {
      html += '<div style="margin-top:0.7em;"><b>Inputs:</b><ul>';
      for (const input of beef.inputs) {
        html += `<li>${input.addr || ''} (${input.value || 0} sats)</li>`;
      }
      html += '</ul></div>';
    }
    if (beef.outputs && Array.isArray(beef.outputs)) {
      html += '<div style="margin-top:0.7em;"><b>Outputs:</b><ul>';
      for (const output of beef.outputs) {
        html += `<li>${output.scriptPubKey && output.scriptPubKey.addresses ? output.scriptPubKey.addresses.join(', ') : ''} (${output.valueSat || output.value || 0} sats)</li>`;
      }
      html += '</ul></div>';
    }
    if (beef.spv) {
      html += '<div style="margin-top:0.7em;"><b>SPV Info:</b><pre style="background:#f7f7f7;border:1px solid #ddd;padding:0.7em;overflow:auto;">' + JSON.stringify(beef.spv, null, 2) + '</pre></div>';
    }
    html += '</div>';
    return html;
  }

  // Render Merkle proof breakdown table
  function renderMerkleBreakdown(steps, computedRoot, expectedRoot, isValid) {
    let html = '<div style="margin-top:1.2em;">';
    html += `<b>Computed Merkle Root:</b> <span style="color:${isValid ? '#22b573' : '#e53e3e'}">${computedRoot}</span><br/>`;
    html += `<b>Expected Merkle Root:</b> <span style="color:${isValid ? '#22b573' : '#e53e3e'}">${expectedRoot}</span><br/>`;
    html += '<div style="overflow-x:auto;"><table class="beef-table" style="margin-top:0.7em;">';
    html += '<thead><tr><th>Step</th><th>Input Hash</th><th>Sibling</th><th>Position</th><th>Concat Order</th><th>Concat (hex)</th><th>Result (SHA256d)</th></tr></thead><tbody>';
    for (const s of steps) {
      html += `<tr><td>${s.step}</td><td>${s.inputHash}</td><td>${s.sibling}</td><td>${s.position}</td><td>${s.concatDesc}</td><td style="font-size:0.92em;">${s.concat}</td><td style="font-weight:bold;">${s.result}</td></tr>`;
    }
    html += '</tbody></table></div></div>';
    return html;
  }

  if (validateBeefBtn && beefFileInput && beefValidationError && beefValidationResult) {
    validateBeefBtn.addEventListener('click', async function() {
      beefValidationError.textContent = '';
      beefValidationResult.textContent = '';
      const file = beefFileInput.files[0];
      if (!file) {
        beefValidationError.textContent = 'Please select a BEEF JSON file.';
        return;
      }
      const reader = new FileReader();
      reader.onload = async function(e) {
        try {
          const beef = JSON.parse(e.target.result);
          const { isValid, steps, computedRoot, expectedRoot } = await validateBeefJson(beef);
          let resultHtml = '';
          if (isValid) {
            resultHtml += '<div style="color:#22b573;font-weight:bold;font-size:1.2em;margin-bottom:0.7em;">✔ Merkle proof is valid.</div>';
          } else {
            resultHtml += '<div style="color:#e53e3e;font-weight:bold;font-size:1.2em;margin-bottom:0.7em;">✖ Merkle proof is INVALID.</div>';
          }
          resultHtml += renderMerkleBreakdown(steps, computedRoot, expectedRoot, isValid);
          resultHtml += renderBeefDetails(beef);
          beefValidationResult.innerHTML = resultHtml;
        } catch (err) {
          beefValidationError.textContent = 'Invalid BEEF JSON: ' + err.message;
        }
      };
      reader.readAsText(file);
    });
  }

  if (validateBeefPasteBtn && beefJsonPaste && beefValidationError && beefValidationResult) {
    validateBeefPasteBtn.addEventListener('click', async function() {
      beefValidationError.textContent = '';
      beefValidationResult.textContent = '';
      const text = beefJsonPaste.value.trim();
      if (!text) {
        beefValidationError.textContent = 'Please paste BEEF JSON.';
        return;
      }
      try {
        const beef = JSON.parse(text);
        const { isValid, steps, computedRoot, expectedRoot } = await validateBeefJson(beef);
        let resultHtml = '';
        if (isValid) {
          resultHtml += '<div style="color:#22b573;font-weight:bold;font-size:1.2em;margin-bottom:0.7em;">✔ Merkle proof is valid.</div>';
        } else {
          resultHtml += '<div style="color:#e53e3e;font-weight:bold;font-size:1.2em;margin-bottom:0.7em;">✖ Merkle proof is INVALID.</div>';
        }
        resultHtml += renderMerkleBreakdown(steps, computedRoot, expectedRoot, isValid);
        resultHtml += renderBeefDetails(beef);
        beefValidationResult.innerHTML = resultHtml;
      } catch (err) {
        beefValidationError.textContent = 'Invalid BEEF JSON: ' + err.message;
      }
    });
  }
});
