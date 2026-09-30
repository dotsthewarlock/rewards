# Barcode Scanner

Lightweight mobile-first barcode scanner web app.

## Features

- Rear-camera barcode scanning
- Auto accept with short confirmation delay
- Beep on successful scan
- Duplicate suppression
- Session-based temporary storage
- Copy scanned codes to clipboard
- Export scanned codes as CSV
- Clear list/cache controls
- Native `BarcodeDetector` with ZXing browser fallback

## Deploy with GitHub Pages

1. Create a new GitHub repository.
2. Upload `index.html` and `README.md` to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select your default branch (usually `main`) and `/ (root)`.
6. Save.

GitHub Pages will provide an HTTPS URL. HTTPS is required for browser camera access.

## Notes

The app is a single HTML file. The ZXing fallback is loaded from a pinned CDN version when native browser barcode detection is unavailable, so that fallback requires internet access.
