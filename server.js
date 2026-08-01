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

let browser = null;

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
        console.log('✅ Navegador listo');
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

async function extractVideo(pageUrl) {
    if (!browser) throw new Error('Navegador no listo');

    const page = await browser.newPage();
    
    try {
        console.log('🌐 Cargando:', pageUrl);
        
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        // Ir a la página
        await page.goto(pageUrl, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        // ESPERAR MÁS TIEMPO (10 segundos)
        console.log('⏳ Esperando carga del player...');
        await page.waitForTimeout(10000);
        
        // Intentar hacer click en el play para activar el video
        try {
            const playButton = await page.$('video, .play-button, [class*="play"], button');
            if (playButton) {
                await playButton.click();
                await page.waitForTimeout(3000);
            }
        } catch (e) {
            // Ignorar error de click
        }
        
        // Buscar URL del video con múltiples métodos
        const videoData = await page.evaluate(() => {
            let url = null;
            let type = 'mp4';
            
            // Método 1: Video src directo
            const video = document.querySelector('video');
            if (video) {
                url = video.currentSrc || video.src;
                if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    type = 'hls';
                }
            }
            
            // Método 2: Source tag
            if (!url) {
                const source = document.querySelector('video source');
                if (source) url = source.src;
            }
            
            // Método 3: Buscar en network (fetch/xhr responses guardados en window)
            if (window._videoUrl) url = window._videoUrl;
            
            // Método 4: Buscar en scripts de la página
            if (!url) {
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    const text = script.textContent || '';
                    
                    // Patrones específicos de Streamwish
                    const patterns = [
                        /file["']?\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/,
                        /file["']?\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/,
                        /sources["']?\s*:\s*\[\s*\{\s*file["']?\s*:\s*["']([^"']+)["']/,
                        /sources["']?\s*:\s*\[\s*["']([^"']+)["']/,
                        /url["']?\s*:\s*["'](https?:\/\/[^"']+\.(mp4|m3u8))["']/,
                        /videoUrl["']?\s*[=:]\s*["']([^"']+)["']/,
                        /["'](https?:\/\/[^"']*cdn[^"']*\.(mp4|m3u8))["']/,
                        /["'](https?:\/\/[^"']*video[^"']*\.(mp4|m3u8))["']/,
                    ];
                    
                    for (const pattern of patterns) {
                        const match = text.match(pattern);
                        if (match && match[1]) {
                            url = match[1];
                            if (url.includes('.m3u8')) type = 'hls';
                            break;
                        }
                    }
                    if (url) break;
                }
            }
            
            // Método 5: Buscar en atributos data-*
            if (!url) {
                const allElements = document.querySelectorAll('*');
                for (const el of allElements) {
                    const dataUrl = el.getAttribute('data-url') || 
                                   el.getAttribute('data-src') || 
                                   el.getAttribute('data-video');
                    if (dataUrl && (dataUrl.includes('.mp4') || dataUrl.includes('.m3u8'))) {
                        url = dataUrl;
                        if (url.includes('.m3u8')) type = 'hls';
                        break;
                    }
                }
            }
            
            return { url, type };
        });
        
        if (!videoData.url) {
            // Último intento: buscar en el HTML completo
            const html = await page.content();
            const matches = html.match(/(https?:\/\/[^"'\s<>]+\.(mp4|m3u8)[^"'\s<>]*)/gi);
            if (matches && matches.length > 0) {
                videoData.url = matches[0];
                videoData.type = videoData.url.includes('.m3u8') ? 'hls' : 'mp4';
            }
        }
        
        if (!videoData.url) {
            throw new Error('No se encontró URL de video válida');
        }
        
        // Limpiar URL
        let cleanUrl = videoData.url.trim();
        
        // Si es URL relativa
        if (cleanUrl.startsWith('//')) {
            cleanUrl = 'https:' + cleanUrl;
        } else if (cleanUrl.startsWith('/')) {
            const urlObj = new URL(pageUrl);
            cleanUrl = urlObj.origin + cleanUrl;
        }
        
        // Verificar que sea URL válida
        new URL(cleanUrl);
        
        console.log('✅ Video encontrado:', cleanUrl.substring(0, 60) + '...');
        console.log('📹 Tipo:', videoData.type);
        
        // Obtener título
        const title = await page.evaluate(() => {
            const t = document.title;
            return t.replace(/ - (Streamwish|Embedwish|VidHide|Filemoon|Hanerix).*/i, '').trim() || 'Video';
        });
        
        return {
            url: cleanUrl,
            type: videoData.type,
            title: title
        };
        
    } catch (error) {
        console.error('❌ Error:', error);
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
            return res.status(400).json({ success: false, error: 'Dominio no soportado' });
        }

        // Extraer (tarda ~15 segundos ahora)
        const videoData = await extractVideo(url);
        
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const embedUrl = `${protocol}://${host}/embed?url=${encodeURIComponent(videoData.url)}&type=${videoData.type}&title=${encodeURIComponent(videoData.title)}`;
        
        res.json({
            success: true,
            data: videoData,
            embedUrl: embedUrl
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/embed', (req, res) => {
    try {
        const { url, type, title = 'Video' } = req.query;
        if (!url) return res.status(400).send('URL requerida');

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
        .error { color: white; text-align: center; padding: 20px; }
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
        <div class="error">No se puede reproducir el video</div>
    </video>`;
        }
        
        html += `</body></html>`;
        res.send(html);
        
    } catch (error) {
        res.status(500).send('Error');
    }
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', browser: browser ? 'ready' : 'not ready' });
});

initBrowser().then(() => {
    app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
});
