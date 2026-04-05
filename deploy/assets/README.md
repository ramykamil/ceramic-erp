# Ceramic ERP - Assets Folder

This folder should contain:

## icon.ico
Windows application icon (256x256 recommended)

You can create one using:
- https://icoconvert.com/
- https://convertio.co/png-ico/

Or use a PNG with the following PowerShell to convert:
```powershell
# Install ImageMagick first, then:
magick convert logo.png -resize 256x256 icon.ico
```

## recommended-icon-specs.txt
- Size: 256x256, 128x128, 64x64, 48x48, 32x32, 16x16 (multi-resolution ICO)
- Format: ICO (Windows icon format)
- Background: Transparent or solid color matching your brand
