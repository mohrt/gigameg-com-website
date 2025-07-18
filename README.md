# BSV SPV Paper Wallet Generator

A self-contained, client-side web app for generating Bitcoin SV (BSV) paper wallets, inspired by bitaddress.org. All cryptography and wallet generation is performed in your browser. No data is sent to any server.

## Features
- Generate BSV private/public key pairs (WIF, address)
- Display QR codes for address and private key
- Printable paper wallet design
- Optionally check balance and fetch block header info (SPV-related)
- 100% offline-capable (download and run locally)

## Usage
1. **Download the entire folder** (or the .zip release) to your computer.
2. Open `index.html` in your web browser (preferably offline for maximum security).
3. Click **"Generate New Wallet"** to create a new BSV address and private key.
4. Print your paper wallet using the **"Print Paper Wallet"** button.
5. (Optional) Click **"Check Balance (SPV)"** to fetch the balance and block header info for your address (requires internet connection).

## Security Notes
- For best security, run this app **offline** (disconnect from the internet) before generating wallets.
- Never share your private key with anyone. Anyone with access to the private key can spend your BSV.
- Store your paper wallet in a safe place, protected from fire, water, and theft.
- Always verify the integrity of the files before use (see below).

## Packaging & Integrity
To create a .zip archive and generate an MD5 checksum:

```
zip -r bsv-paperwallet.zip index.html style.css script.js libs/
md5 bsv-paperwallet.zip
```

The output will look like:

```
MD5 (bsv-paperwallet.zip) = abcdef1234567890abcdef1234567890
```

Share the .zip and the MD5 hash so others can verify the download.

## Dependencies
- [bsv.js](https://github.com/moneybutton/bsv) (MIT License)
- [qrcode.js](https://github.com/davidshimjs/qrcodejs) (MIT License)

All dependencies are included in the `libs/` folder for offline use.

## License
MIT 