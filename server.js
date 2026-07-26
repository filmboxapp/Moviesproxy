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
    'streamwish.com', 'streamwish.to', 'streamwish.xyz',
    'awish.pro', 'embedwish.com', 'hanerix.com',
    'wishfast.com', 'wishcdn.com',
    'vidhide.com', 'vidhidepro.com',
    'filemoon.sx', 'filemoon.to',
    'streamtape.com', 'streamtape.to',
    'voe.sx', 'voe-unblock.com',
    'hexload.com', 'userload.com',
    'doodstream.com', 'dood.to',
    'streamhub.to', 'streamvid.net',
    'vadbam.net', 'vadbam.com',
    'mixdrop.co', 'mixdrop.to',
];

// Variable global para el navegador
let browser = null;

// Iniciar navegador al arrancar
async function initBrowser() {
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080'
            ]
        });
        console.log('✅ Navegador iniciado');
    } catch (error) {
        console.error('❌ Error iniciando navegador:', error);
    }
}

async function extractVideoWithPuppeteer(pageUrl) {
    if (!browser) {
        throw new Error('Navegador no disponible');
    }

    const page = await browser.newPage();
    
    try {
        console.log('Navegando a:', pageUrl);
        
        // Configurar viewport y user agent
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        // Ir a la página y esperar que cargue
        await page.goto(pageUrl, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        console.log('Página cargada, buscando video...');
        
        // Esperar un poco para que cargue el player
        await page.waitForTimeout(3000);
        
        // Buscar URL del video en la página
        const videoData = await page.evaluate(() => {
            // Buscar en video tags
            const video = document.querySelector('video');
            if (video) {
                const src = video.currentSrc || video.src || video.querySelector('source')?.src;
                if (src) return { url: src, type: src.includes('.m3u8') ? 'hls' : 'mp4' };
            }
            
            // Buscar en sources de video
            const source = document.querySelector('video source');
            if (source && source.src) {
                return { url: source.src, type: source.src.includes('.m3u8') ? 'hls' : 'mp4' };
            }
            
            // Buscar en iframes
            const iframe = document.querySelector('iframe');
            if (iframe && iframe.src && (iframe.src.includes('mp4') || iframe.src.includes('m3u8'))) {
                return { url: iframe.src, type: 'mp4' };
            }
            
            // Buscar en scripts
            const scripts = Array.from(document.querySelectorAll('script'));
            for (const script of scripts) {
                const text = script.textContent || '';
                const patterns = [
                    /sources:\s*\[\s*["']([^"']+)["']/,
                    /file:\s*["']([^"']+\.(mp4|m3u8))["']/,
                    /src:\s*["']([^"']+\.(mp4|m3u8))["']/,
                    /["'](https?:\/\/[^"']+\.(mp4|m3u8))["']/
                ];
                
                for (const pattern of patterns) {
                    const match = text.match(pattern);
                    if (match && match[1]) {
                        return { 
                            url: match[1], 
                            type: match[1].includes('.m3u8') ? 'hls' : 'mp4' 
                        };
                    }
                }
            }
            
            return null;
        });
        
        if (!videoData || !videoData.url) {
            throw new Error('No se encontró el video en la página');
        }
        
        // Obtener título
        const title = await page.evaluate(() => {
            return document.title.replace(/ - (Streamwish|Embedwish|VidHide|Filemoon).*/i, '').trim() || 'Video';
        });
        
        console.log('✅ Video encontrado:', videoData.url.substring(0, 50) + '...');
        
        return {
            url: videoData.url,
            type: videoData.type,
            title: title
        };
        
    } catch (error) {
        console.error('Error en Puppeteer:', error);
        throw error;
    } finally {
        await page.close();
    }
}

app.post('/api/extract', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ success: false, error: 'URL requerida' });
        }

        let urlObj;
        try {
            urlObj = new URL(url);
        } catch {
            return res.status(400).json({ success: false, error: 'URL invalida' });
        }

        const hostname = urlObj.hostname.toLowerCase();
        const isValid = ALLOWED_DOMAINS.some(domain => hostname.includes(domain));
        
        if (!isValid) {
            return res.status(400).json({ 
                success: false,
                error: `Dominio "${hostname}" no soportado`
            });
        }

        // Extraer con Puppeteer (tarda 5-10 segundos)
        const videoData = await extractVideoWithPuppeteer(url);
        
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const embedUrl = `${protocol}://${host}/embed?url=${encodeURIComponent(videoData.url)}&type=${videoData.type}&title=${encodeURIComponent(videoData.title)}`;
        
        res.json({
            success: true,
            data: videoData,
            embedUrl: embedUrl
        });
        
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.get('/embed', (req, res) => {
    try {
        const { url, type, title = 'Video' } = req.query;
        
        if (!url) {
            return res.status(400).send('URL requerida');
        }

        const decodedUrl = decodeURIComponent(url);
        const safeUrl = decodedUrl.replace(/'/g, "\\'");
        const safeTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        const isHLS = type === 'hls';
        
        let html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitle}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { background: #000; width: 100%; height: 100%; overflow: hidden; }
        body { display: flex; justify-content: center; align-items: center; }
        video { width: 100%; height: 100%; max-height: 100vh; }
    </style>
</head>
<body>`;

        if (isHLS) {
            html += `
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <video id="player" controls autoplay playsinline></video>
    <script>
        (function() {
            var video = document.getElementById('player');
            var videoSrc = '${safeUrl}';
            if (Hls.isSupported()) {
                var hls = new Hls();
                hls.loadSource(videoSrc);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, function() { video.play(); });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = videoSrc;
                video.addEventListener('loadedmetadata', function() { video.play(); });
            }
        })();
    </script>`;
        } else {
            html += `
    <video controls autoplay playsinline>
        <source src="${safeUrl}" type="video/mp4">
    </video>`;
        }
        
        html += `</body></html>`;
        
        res.send(html);
        
    } catch (error) {
        res.status(500).send('Error');
    }
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        browser: browser ? 'ready' : 'not ready'
    });
});

// Iniciar navegador y servidor
initBrowser().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Servidor en puerto ${PORT}`);
    });
});
