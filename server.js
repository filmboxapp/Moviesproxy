const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
// Sirve archivos estáticos desde la raíz
app.use(express.static('.'));

/**
 * Extrae URL directo de video de Streamwish
 */
async function extractStreamwishVideo(pageUrl) {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': 'https://streamwish.com/'
        };

        const response = await axios.get(pageUrl, { headers, timeout: 10000 });
        const $ = cheerio.load(response.data);
        
        let videoUrl = $('video source').attr('src');
        
        if (!videoUrl) {
            videoUrl = $('video').attr('data-src');
        }
        
        if (!videoUrl) {
            const scripts = $('script').map((i, el) => $(el).html()).get();
            for (const script of scripts) {
                const match = script.match(/sources:\s*\[\s*["']([^"']+)["']/i) ||
                              script.match(/file:\s*["']([^"']+)["']/i) ||
                              script.match(/src:\s*["']([^"']+\.(mp4|m3u8))["']/i);
                if (match) {
                    videoUrl = match[1];
                    break;
                }
            }
        }
        
        if (!videoUrl) {
            const m3u8Match = response.data.match(/(https?:\/\/[^"']+\.m3u8[^"'\s]*)/i);
            if (m3u8Match) videoUrl = m3u8Match[1];
        }

        if (!videoUrl) {
            throw new Error('No se pudo extraer el video de la página');
        }

        const isHLS = videoUrl.includes('.m3u8');
        
        return {
            url: videoUrl,
            type: isHLS ? 'hls' : 'mp4',
            title: $('title').text().replace(' - Streamwish', '').trim() || 'Video'
        };
        
    } catch (error) {
        throw new Error(`Error extrayendo video: ${error.message}`);
    }
}

app.post('/api/extract', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL requerida' });
    }

    const allowedDomains = ['streamwish.com', 'streamwish.to', 'awish.pro', 
                           'embedwish.com', 'voe.sx', 'streamtape.com'];
    const isValid = allowedDomains.some(domain => url.includes(domain));
    
    if (!isValid) {
        return res.status(400).json({ 
            error: 'Dominio no soportado. Usa Streamwish o similares.' 
        });
    }

    try {
        const videoData = await extractStreamwishVideo(url);
        res.json({
            success: true,
            data: videoData,
            embedUrl: `${req.protocol}://${req.get('host')}/embed?url=${encodeURIComponent(videoData.url)}&type=${videoData.type}`
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.get('/embed', (req, res) => {
    const { url, type, title = 'Video' } = req.query;
    
    if (!url) {
        return res.status(400).send('URL requerida');
    }

    const decodedUrl = decodeURIComponent(url);
    
    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            background: #000; 
            display: flex; 
            justify-content: center; 
            align-items: center;
            min-height: 100vh;
        }
        video {
            width: 100%;
            height: 100vh;
            max-height: 100vh;
        }
    </style>
</head>
<body>
    ${type === 'hls' ? `
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <video id="player" controls autoplay></video>
    <script>
        const video = document.getElementById('player');
        if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource('${decodedUrl}');
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = '${decodedUrl}';
            video.addEventListener('loadedmetadata', () => video.play());
        }
    </script>
    ` : `
    <video controls autoplay playsinline>
        <source src="${decodedUrl}" type="video/mp4">
        Tu navegador no soporta el video.
    </video>
    `}
</body>
</html>
    `);
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🚀 Proxy corriendo en http://localhost:${PORT}`);
});
