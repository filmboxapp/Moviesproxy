const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const ALLOWED_DOMAINS = [
    'streamwish.com', 'streamwish.to', 'hanerix.com',
    'awish.pro', 'embedwish.com', 'wishfast.com',
    'vidhide.com', 'filemoon.sx', 'streamtape.com',
    'voe.sx', 'doodstream.com', 'mixdrop.co'
];

let browser = null;

async function initBrowser() {
    browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('✅ Listo');
}

async function extractVideo(pageUrl) {
    const page = await browser.newPage();
    
    try {
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
        
        await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(8000);
        
        // Intentar click en play
        try {
            await page.click('video, .play-button, button');
            await page.waitForTimeout(2000);
        } catch(e) {}
        
        // Extraer datos
        const result = await page.evaluate(() => {
            let url = null;
            
            // Buscar video
            const video = document.querySelector('video');
            if (video) {
                url = video.currentSrc || video.src;
            }
            if (!url) {
                const source = document.querySelector('video source');
                if (source) url = source.src;
            }
            
            // Buscar en scripts
            if (!url) {
                const scripts = document.querySelectorAll('script');
                for (const s of scripts) {
                    const text = s.textContent || '';
                    const m = text.match(/file["']?\s*:\s*["']([^"']+\.(mp4|m3u8))["']/) ||
                             text.match(/sources["']?\s*:\s*\[\s*["']([^"']+)["']/) ||
                             text.match(/["'](https?:\/\/[^"']+\.(mp4|m3u8))["']/);
                    if (m) url = m[1];
                }
            }
            
            // Buscar en data attributes
            if (!url) {
                const els = document.querySelectorAll('[data-src], [data-url], [data-video]');
                for (const el of els) {
                    const u = el.getAttribute('data-src') || el.getAttribute('data-url');
                    if (u && (u.includes('.mp4') || u.includes('.m3u8'))) url = u;
                }
            }
            
            return { url };
        });
        
        if (!result.url) {
            // Buscar en HTML completo
            const html = await page.content();
            const m = html.match(/(https?:\/\/[^"'\s<>]+\.(mp4|m3u8)[^"'\s<>]*)/);
            if (m) result.url = m[1];
        }
        
        if (!result.url) throw new Error('No se encontró el video');
        
        // Limpiar URL
        let url = result.url.trim();
        if (url.startsWith('//')) url = 'https:' + url;
        if (url.startsWith('/')) {
            const base = new URL(pageUrl);
            url = base.origin + url;
        }
        
        // DETECTAR TIPO CORRECTAMENTE
        const type = url.includes('.m3u8') || url.includes('m3u8') ? 'hls' : 'mp4';
        
        console.log('✅ Video:', url.substring(0, 50), 'Tipo:', type);
        
        const title = await page.evaluate(() => {
            return document.title.replace(/ -.*/, '').trim() || 'Video';
        });
        
        return { url, type, title };
        
    } finally {
        await page.close();
    }
}

app.post('/api/extract', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL requerida' });
        
        const urlObj = new URL(url);
        const valid = ALLOWED_DOMAINS.some(d => urlObj.hostname.includes(d));
        if (!valid) return res.status(400).json({ error: 'Dominio no soportado' });
        
        const video = await extractVideo(url);
        
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const embedUrl = `${protocol}://${host}/embed?url=${encodeURIComponent(video.url)}&type=${video.type}&title=${encodeURIComponent(video.title)}`;
        
        res.json({ success: true, data: video, embedUrl });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/embed', (req, res) => {
    const { url, type, title } = req.query;
    if (!url) return res.status(400).send('URL requerida');
    
    const decoded = decodeURIComponent(url);
    const safeUrl = decoded.replace(/'/g, "\\'");
    const safeTitle = (title || 'Video').replace(/</g, '&lt;');
    
    // FORZAR detección de HLS si la URL lo indica
    const isHLS = decoded.includes('.m3u8') || type === 'hls';
    
    let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${safeTitle}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { background: #000; width: 100%; height: 100%; overflow: hidden; }
        body { display: flex; justify-content: center; align-items: center; }
        video { width: 100%; height: 100%; }
    </style>
</head>
<body>`;

    if (isHLS) {
        html += `
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <video id="player" controls autoplay playsinline></video>
    <script>
        var video = document.getElementById('player');
        var src = '${safeUrl}';
        console.log('Cargando HLS:', src);
        if (Hls.isSupported()) {
            var hls = new Hls();
            hls.loadSource(src);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function() { video.play(); });
            hls.on(Hls.Events.ERROR, function(e,d) { console.error('HLS error:', d); });
        } else {
            video.src = src;
        }
    </script>`;
    } else {
        html += `
    <video controls autoplay playsinline>
        <source src="${safeUrl}" type="video/mp4">
    </video>`;
    }
    
    html += `</body></html>`;
    res.send(html);
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', browser: !!browser });
});

initBrowser().then(() => {
    app.listen(PORT, () => console.log(`🚀 Puerto ${PORT}`));
});
