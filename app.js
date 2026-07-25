// Estado global
let currentVideo = null;

async function extractVideo() {
    const urlInput = document.getElementById('videoUrl');
    const url = urlInput.value.trim();
    
    if (!url) {
        showError('Por favor ingresa un URL válido');
        return;
    }
    
    setLoading(true);
    hideError();
    hideResult();
    
    try {
        const response = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Error desconocido');
        }
        
        currentVideo = data.data;
        showResult(data);
        
    } catch (error) {
        showError(error.message);
    } finally {
        setLoading(false);
    }
}

function showResult(data) {
    const resultDiv = document.getElementById('result');
    const player = document.getElementById('player');
    const titleEl = document.getElementById('videoTitle');
    const typeEl = document.getElementById('videoType');
    
    titleEl.textContent = data.data.title;
    typeEl.textContent = data.data.type.toUpperCase();
    player.src = data.embedUrl;
    
    resultDiv.classList.remove('hidden');
}

async function copyEmbed() {
    if (!currentVideo) return;
    
    const embedUrl = document.getElementById('player').src;
    
    try {
        await navigator.clipboard.writeText(embedUrl);
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '✅ Copiado!';
        setTimeout(() => btn.textContent = originalText, 2000);
    } catch (err) {
        showError('No se pudo copiar al portapapeles');
    }
}

function openDirect() {
    if (!currentVideo) return;
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
