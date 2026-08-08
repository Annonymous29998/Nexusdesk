# Windows installer code signing

Guest installers (`ZoomClient-Setup.exe`, `GoogleMeet-Setup.exe`, `AdobeAcrobat-Setup.exe`)
must be **Authenticode-signed with a real CA certificate** or Windows SmartScreen / antivirus
will warn users (“Windows protected your PC”, “Unknown publisher”).

Self-signed certificates do **not** clear SmartScreen.

## What you need to buy

1. A **Windows code signing certificate** from a trusted CA, for example:
   - [SSL.com](https://www.ssl.com/certificates/code-signing/)
   - [Sectigo](https://sectigo.com/ssl-certificates-tls/code-signing)
   - [DigiCert](https://www.digicert.com/signing/code-signing-certificates)
2. Prefer an **Organization Validation (OV)** or **EV** cert in your company name.
3. Export it as a `.pfx` / `.p12` (or PEM cert + key) and keep the private key secret.

Cost is typically a few hundred USD per year. Identity verification can take 1–5 business days.

## Wire it into NexusDesk

On the **API server** (not Vercel):

```bash
# macOS signer tool
brew install osslsigncode

# in apps/api/.env (production)
CODE_SIGN_PFX_PATH=/secure/certs/codesign.pfx
CODE_SIGN_PFX_PASSWORD=your-pfx-password
CODE_SIGN_PRODUCT_NAME=NexusDesk Setup
CODE_SIGN_PRODUCT_URL=https://your-domain.com
CODE_SIGN_TIMESTAMP_URL=http://timestamp.digicert.com
```

Or PEM form:

```bash
CODE_SIGN_CERT_PATH=/secure/certs/codesign.crt.pem
CODE_SIGN_KEY_PATH=/secure/certs/codesign.key.pem
```

Restart the API. Every `GET /guest/:code/setup.exe` then:

1. Builds the EXE with the guest code embedded  
2. **Signs that final file** (signing must happen after embed, or the signature breaks)

Manual test:

```bash
bash scripts/sign-windows-exe.sh unsigned.exe signed.exe
```

## After signing

- Users should see your **company name** as the publisher instead of “Unknown”.
- SmartScreen may still warn briefly for a brand-new publisher until download reputation builds.
- Keep using the same certificate/publisher identity so reputation accumulates.
- Do **not** rotate publishers casually.

## What signing does not cover

Behavioral antivirus can still flag installers that elevate and install agents. Keep the installer
UX clean, ship over HTTPS, and use a legitimate company identity on the certificate.
