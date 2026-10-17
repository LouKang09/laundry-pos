# Automatic receipt printing on the POS computer

The POS can print both receipt copies without opening the browser print preview when it runs in Chromium silent-printing mode. This is a local-computer setting; the hosted Railway website cannot directly control a USB/Bluetooth printer by itself.

## Windows setup

1. Install the printer driver and connect/power on the receipt printer.
2. Open **Settings → Bluetooth & devices → Printers & scanners** and set the real receipt printer as the Windows default. Do not leave **Microsoft Print to PDF** as the default if you want paper receipts.
3. Copy or open `scripts/launch-pos-kiosk-print.bat` on the POS computer and run it.
4. The launcher opens Laundry POS in a dedicated Edge/Chrome profile with `--kiosk-printing`. Sign in to the staff account in that window once; the profile keeps that login for later sessions unless you sign out or clear its data.
5. Create a small test order. The browser should send both receipt pages to the default printer without showing the usual print preview. Confirm both copies came out.

## Important limitations

- This launcher is for Windows PCs with Microsoft Edge or Google Chrome. It does not configure printers on phones or tablets.
- Silent printing sends the job to the operating system default printer. If the printer is offline, out of paper, or not configured, the browser does not expose a dependable hardware-status API to the website. The receipt screen therefore still asks staff to confirm the two copies printed and provides **Try again** if they did not.
- If the print preview still appears, fully close other Edge/Chrome windows launched with that kiosk profile, then start the launcher again. Check that the intended printer is the Windows default.
- The launcher uses a separate browser profile at `%LOCALAPPDATA%\LaundryPOS-KioskProfile`; log in there once. It does not share the normal browser profile cookies.
