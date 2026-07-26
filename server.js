const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const ALLOWED_DOMAINS = [
    'streamwish.com', 'streamwish.to', 'streamwish.xyz',
    'awish.pro', 'embedwish.com', 'hanerix.com',
    'wishfast.com', 'wishcdn.com', 'wishfast.top',
    'vidhide.com', 'vidhidepro.com', 'vidhideplus.com',
    'filemoon.sx', 'filemoon.to', 'filemoon.in',
    'streamtape.com', 'streamtape.to', 'streamtape.net',
    'voe.sx', 'voe-unblock.com', 'voe-unblock.net',
    'hexload.com', 'userload.com',
    'doodstream.com', 'dood.to', 'dood.ws',
    'streamhub.to', 'streamvid.net',
    'vadbam.net', 'vadbam.com', 'vadbam.to',
    'mixdrop.co', 'mixdrop.to', 'mixdrop.ch',
    'upstream.to', 'uptostream.com',
    'vidoza.net', 'vidoza.com',
];

async function extractVideo(pageUrl) {
    try {
        // Headers más completos para simular navegador real
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://streamwish.com/',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0'
        };

        console.log('Extrayendo:', pageUrl);
        
        const response = await axios.get(pageUrl, { 
            headers, 
            timeout: 20000,
            maxRedirects: 5,
            validateStatus: (status) => status < 400
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        console.log('HTML recibido, buscando video...');
        
        let videoUrl = null;
        let method = '';

        // MÉTODO 1: Video tags estándar
        videoUrl = $('video source').attr('src');
        if (videoUrl) method = 'video source';

        // MÉTODO 2: Atributos data-src
        if (!videoUrl) {
            videoUrl = $('video').attr('data-src');
            if (videoUrl) method = 'video data-src';
        }

        // MÉTODO 3: Cualquier atributo src en video
        if (!videoUrl) {
            videoUrl = $('video').attr('src');
            if (videoUrl) method = 'video src';
        }

        // MÉTODO 4: Buscar en iframes (a veces el video está en un iframe)
        if (!videoUrl) {
            const iframeSrc = $('iframe').attr('src');
            if (iframeSrc && (iframeSrc.includes('.mp4') || iframeSrc.includes('.m3u8') || iframeSrc.includes('player'))) {
                videoUrl = iframeSrc;
                method = 'iframe';
            }
        }

        // MÉTODO 5: Buscar en scripts - múltiples patrones
        if (!videoUrl) {
            const scripts = $('script').map((i, el) => $(el).html()).get().filter(s => s);
            
            const patterns = [
                // Streamwish patterns
                /sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+)["']/i,
                /sources\s*:\s*\[\s*["']([^"']+)["']/i,
                /file\s*:\s*["']([^"']+\.(mp4|m3u8))["']/i,
                /src\s*:\s*["']([^"']+\.(mp4|m3u8))["']/i,
                /videoUrl\s*=\s*["']([^"']+)["']/i,
                /video_url\s*=\s*["']([^"']+)["']/i,
                /url\s*:\s*["']([^"']+\.(mp4|m3u8))["']/i,
                /["'](https?:\/\/[^"']+\.(mp4|m3u8|mkv|avi))["']/i,
                /file["']?\s*:\s*["']([^"']+)["']/i,
                /source["']?\s*:\s*["']([^"']+)["']/i,
                /video["']?\s*:\s*["']([^"']+)["']/i,
                // Base64 encoded URLs (común en algunos players)
                /atob\(["']([A-Za-z0-9+/=]+)["']\)/i,
            ];
            
            for (const script of scripts) {
                for (const pattern of patterns) {
                    const match = script.match(pattern);
                    if (match && match[1]) {
                        let found = match[1];
                        
                        // Si es base64, decodificar
                        if (pattern.toString().includes('atob')) {
                            try {
                                found = Buffer.from(found, 'base64').toString('utf-8');
                            } catch (e) {
                                continue;
                            }
                        }
                        
                        // Verificar que sea URL válida de video
                        if (found.includes('.mp4') || found.includes('.m3u8') || found.includes('http')) {
                            videoUrl = found;
                            method = 'script pattern';
                            break;
                        }
                    }
                }
                if (videoUrl) break;
            }
        }

        // MÉTODO 6: Buscar en el HTML crudo con regex
        if (!videoUrl) {
            const htmlPatterns = [
                /(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i,
                /(https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*)/i,
                /["']([^"']*cdn[^"']*\.(mp4|m3u8))["']/i,
                /["']([^"']*video[^"']*\.(mp4|m3u8))["']/i,
            ];
            
            for (const pattern of htmlPatterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    videoUrl = match[1];
                    method = 'html regex';
                    break;
                }
            }
        }

        // MÉTODO 7: Buscar en meta tags o links
        if (!videoUrl) {
            const ogVideo = $('meta[property="og:video"]').attr('content');
            if (ogVideo) {
                videoUrl = ogVideo;
                method = 'og:video meta';
            }
        }

        if (!videoUrl) {
            console.log('No se encontró video en la página');
            throw new Error('No se pudo encontrar el video. El sitio puede usar protección anti-scraping o el video requiere interacción del usuario.');
        }

        console.log('Video encontrado por método:', method);
        console.log('URL del video:', videoUrl.substring(0, 100) + '...');

        // Limpiar y procesar URL
        videoUrl = videoUrl.trim().replace(/\\"/g, '').replace(/\\'/g, '');
        
        // Si es URL relativa, convertir a absoluta
        if (videoUrl.startsWith('//')) {
            videoUrl = 'https:' + videoUrl;
        } else if (videoUrl.startsWith('/')) {
            const urlObj = new URL(pageUrl);
            videoUrl = urlObj.origin + videoUrl;
        }

        // Verificar que sea URL válida
        try {
            new URL(videoUrl);
        } catch (e) {
            throw new Error('URL de video inválida encontrada en la página');
        }

        const isHLS = videoUrl.includes('.m3u8');
        
        // Extraer título
        let title = $('title').text().trim();
        title = title.replace(/ - (Streamwish|Embedwish|VidHide|Filemoon|Hanerix|Wishfast).*/i, '');
        title = title.replace(/Watch\s*/i, '');
        title = title || 'Video';

        return {
            url: videoUrl,
            type: isHLS ? 'hls' : 'mp4',
            title: title,
            method: method // Para debugging
        };
        
    } catch (error) {
        console.error('Error extrayendo:', error.message);
        if (error.response) {
            throw new Error(`Error ${error.response.status}: El sitio no responde o bloquea el acceso`);
        }
        throw error;
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
            return res.status(400).json({ success: false, error: 'URL inválida' });
        }

        const hostname = urlObj.hostname.toLowerCase();
        const isValid = ALLOWED_DOMAINS.some(domain => hostname.includes(domain));
        
        if (!isValid) {
            return res.status(400).json({ 
                success: false,
                error: `Dominio "${hostname}" no soportado`,
                supported: ALLOWED_DOMAINS.slice(0, 8).join(', ') + '...'
            });
        }

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
        console.error('Error en API:', error.message);
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
        const safeUrl = decodedUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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
        .error { color: white; text-align: center; padding: 20px; font-family: sans-serif; }
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
            
            video.addEventListener('error', function(e) {
                console.error('Video error:', e);
            });
            
            if (Hls.isSupported()) {
                var hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: true
                });
                hls.loadSource(videoSrc);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, function() {
                    video.play().catch(function(e) {
                        console.log('Autoplay blocked:', e);
                    });
                });
                hls.on(Hls.Events.ERROR, function(event, data) {
                    console.error('HLS error:', data);
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = videoSrc;
                video.addEventListener('loadedmetadata', function() {
                    video.play().catch(function(e) {
                        console.log('Autoplay blocked:', e);
                    });
                });
            } else {
                document.body.innerHTML = '<div class="error">Tu navegador no soporta HLS</div>';
            }
        })();
    </script>`;
        } else {
            html += `
    <video controls autoplay playsinline>
        <source src="${safeUrl}" type="video/mp4">
        <div class="error">Tu navegador no soporta la reproducción de video</div>
    </video>`;
        }
        
        html += `</body></html>`;
        
        res.send(html);
        
    } catch (error) {
        res.status(500).send('Error al generar el reproductor');
    }
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
