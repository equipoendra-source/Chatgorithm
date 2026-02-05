import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to use favicon.ico directly or create from it
const ANDROID_RES = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');

// Android icon sizes for each density
const ICON_SIZES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192
};

// Foreground icons are larger (for adaptive icons)
const FOREGROUND_SIZES = {
    'mipmap-mdpi': 108,
    'mipmap-hdpi': 162,
    'mipmap-xhdpi': 216,
    'mipmap-xxhdpi': 324,
    'mipmap-xxxhdpi': 432
};

async function generateIcons() {
    // Read the PNG file
    const pngPath = path.join(__dirname, 'resources', 'icon.png');
    const sourceBuffer = fs.readFileSync(pngPath);

    console.log('🎨 Generating Android icons from:', pngPath);

    for (const [folder, size] of Object.entries(ICON_SIZES)) {
        const folderPath = path.join(ANDROID_RES, folder);

        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        await sharp(sourceBuffer)
            .resize(size, size)
            .png()
            .toFile(path.join(folderPath, 'ic_launcher.png'));
        console.log(`✅ ${folder}/ic_launcher.png (${size}x${size})`);

        await sharp(sourceBuffer)
            .resize(size, size)
            .png()
            .toFile(path.join(folderPath, 'ic_launcher_round.png'));
        console.log(`✅ ${folder}/ic_launcher_round.png (${size}x${size})`);
    }

    for (const [folder, size] of Object.entries(FOREGROUND_SIZES)) {
        const folderPath = path.join(ANDROID_RES, folder);

        const innerSize = Math.floor(size * 0.6);
        const padding = Math.floor(size * 0.2);

        await sharp(sourceBuffer)
            .resize(innerSize, innerSize)
            .extend({
                top: padding,
                bottom: padding,
                left: padding,
                right: padding,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .resize(size, size)
            .png()
            .toFile(path.join(folderPath, 'ic_launcher_foreground.png'));
        console.log(`✅ ${folder}/ic_launcher_foreground.png (${size}x${size})`);

        await sharp({
            create: {
                width: size,
                height: size,
                channels: 4,
                background: { r: 11, g: 11, b: 15, alpha: 255 } // Negro igual que el fondo del logo
            }
        })
            .png()
            .toFile(path.join(folderPath, 'ic_launcher_background.png'));
        console.log(`✅ ${folder}/ic_launcher_background.png (${size}x${size})`);
    }

    // Notification icons (transparent + white)
    const NOTIF_SIZES = {
        'mipmap-mdpi': 24,
        'mipmap-hdpi': 36,
        'mipmap-xhdpi': 48,
        'mipmap-xxhdpi': 72,
        'mipmap-xxxhdpi': 96
    };

    for (const [folder, size] of Object.entries(NOTIF_SIZES)) {
        const folderPath = path.join(ANDROID_RES, folder);

        // Use a clean SVG chat bubble for notifications (guaranteed to look good)
        // Android notification icons MUST be white on transparent.
        const svgBuffer = Buffer.from(`
        <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20ZM17 11H13V7H11V11H7V13H11V17H13V13H17V11Z" fill="white"/>
        </svg>
        `);
        // Using a plus or simple shape inside circle for clarity, or just a bubble?
        // Let's use a simple Message Bubble shape standard
        const svgBubble = Buffer.from(`
        <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
        </svg>
        `);

        await sharp(svgBubble)
            .resize(size, size) // Ensure exact size
            .png()
            .toFile(path.join(folderPath, 'ic_stat_notification.png'));

        console.log(`✅ ${folder}/ic_stat_notification.png (${size}x${size}) [SVG Generated]`);
    }

    console.log('\n🎉 All icons generated successfully!');
}

generateIcons().catch(console.error);
