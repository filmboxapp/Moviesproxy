let currentVideo = null;

async function extractVideo() {
    const urlInput = document.getElementById('videoUrl');
    const url = urlInput.value.trim();
    
    if (!url) {
        showError('Por favor ingresa un URL valido');
        return;
    }
    
    try {
        new URL(url);
    } catch {
        showError('URL invalida. Debe empezar con http:// o https://');
        return;
    }
    
    setLoading(true);
    hideError();
    hideResult();
    
    try {
        const response = await fetch('/api/extract', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('El servidor no respondio correctamente');
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Error del servidor');
        }
        
        currentVideo = data.data;
        showResult(data);
        
    } catch (error) {
        console.error('Error:', error);
        showError(error.message || 'Error de conexion');
    } finally {
        setLoading(false);
    }
}

function showResult(data) {
    const resultDiv = document.getElementById('result');
    const player = document.getElementById('player');
    const titleEl = document.getElementById('videoTitle');
    const typeEl = document.getElementById('videoType');
    
    titleEl.textContent = data.data.title || 'Video';
    typeEl.textContent = data.data.type.toUpperCase();
    player.src = data.embedUrl;
    
    resultDiv.classList.remove('hidden');
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function copyEmbed() {
    if (!currentVideo) return;
    
    const embedUrl = document.getElementById('player').src;
    
    try {
        await navigator.clipboard.writeText(embedUrl);
        const btn = event.target;
        btn.textContent = 'Copiado!';
        setTimeout(() => btn.textContent = 'Copiar Link Embed', 2000);
    } catch (err) {
        showError('No se pudo copiar');
    }
}

function openDirect() {
    if (!currentVideo || !currentVideo.url) return;
    window.open(currentVideo.url, '_blank');
}

function setLoading(loading) {
    document.getElementById('loading').classList.toggle('hidden', !loading);
    document.getElementById('extractBtn').disabled = loading;
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

function hideError() {
    document.getElementById('error').classList.add('hidden');
}

function hideResult() {
    document.getElementById('result').classList.add('hidden');
}

document.getElementById('videoUrl').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') extractVideo();
});
