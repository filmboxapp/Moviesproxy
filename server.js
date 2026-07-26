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

async function extractStreamwishVideo(pageUrl) {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': 'https://streamwish.com/'
        };

        const response = await axios.get(pageUrl, { headers, timeout: 15000 });
        const $ = cheerio.load(response.data);
        
        let videoUrl = $('video source').attr('src');
        
        if (!videoUrl) {
            videoUrl = $('video').attr('data-src');
        }
        
        if (!videoUrl) {
            const scripts = $('script').map((i, el) => $(el).html()).get();
            for (const script of scripts) {
                if (!script) continue;
                const match = script.match(/sources:\s*\[\s*["']([^"']+)["']/i) ||
                              script.match(/file:\s*["']([^"']+)["']/i) ||
                              script.match(/src:\s*["']([^"']+\.(mp4|m3u8))["']/i);
                if (match && match[1]) {
                    videoUrl = match[1];
                    break;
                }
            }
        }
        
        if (!videoUrl) {
            const m3u8Match = response.data.match(/(https?:\/\/[^"'\s>]+\.m3u8[^"'\s<>]*)/i);
            if (m3u8Match) videoUrl = m3u8Match[1];
        }

        if (!videoUrl) {
            throw new Error('No se pudo extraer el video.');
        }

        const isHLS = videoUrl.includes('.m3u8');
        
        return {
            url: videoUrl,
            type: isHLS ? 'hls' : 'mp4',
            title: $('title').text().replace(/ - (Streamwish|Embedwish).*/i, '').trim() || 'Video'
        };
        
    } catch (error) {
        if (error.response) {
            throw new Error(`Error ${error.response.status}: No se pudo acceder al video`);
        }
        throw new Error(error.message || 'Error desconocido');
    }
}

app.post('/api/extract', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ success: false, error: 'URL requerida' });
        }

        try {
            new URL(url);
        } catch {
            return res.status(400).json({ success: false, error: 'URL invalida' });
        }

        const allowedDomains = [
            'streamwish.com', 'streamwish.to', 'awish.pro', 
            'embedwish.com', 'voe.sx', 'streamtape.com',
            'streamtape.to', 'vadbam.net', 'vadbam.com'
        ];
        
        const urlObj = new URL(url);
        const isValid = allowedDomains.some(domain => urlObj.hostname.includes(domain));
        
        if (!isValid) {
            return res.status(400).json({ 
                success: false,
                error: 'Dominio no soportado.' 
            });
        }

        const videoData = await extractStreamwishVideo(url);
        
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
        res.status(500).json({ success: false, error: error.message });
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
        Tu navegador no soporta la reproduccion de video.
    </video>`;
        }
        
        html += `</body></html>`;
        
        res.send(html);
        
    } catch (error) {
        res.status(500).send('Error al generar el reproductor');
    }
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
