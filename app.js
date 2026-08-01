let currentVideo = null;

async function extractVideo() {
    const input = document.getElementById('videoUrl');
    const url = input.value.trim();
    if (!url) return showError('Ingresa URL');
    
    setLoading(true);
    hideError();
    hideResult();
    
    try {
        const res = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        currentVideo = data.data;
        console.log('Video:', currentVideo); // Para debug
        
        // Mostrar tipo real
        document.getElementById('videoType').textContent = currentVideo.type.toUpperCase();
        document.getElementById('videoTitle').textContent = currentVideo.title;
        document.getElementById('player').src = data.embedUrl;
        
        document.getElementById('result').classList.remove('hidden');
        
    } catch (e) {
        showError(e.message);
    } finally {
        setLoading(false);
    }
}

async function copyEmbed() {
    if (!currentVideo) return;
    const url = document.getElementById('player').src;
    try {
        await navigator.clipboard.writeText(url);
        const btn = event.target;
        const orig = btn.textContent;
        btn.textContent = '✅ Copiado!';
        setTimeout(() => btn.textContent = orig, 2000);
    } catch (e) {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showError('Copiado (fallback)');
    }
}

function openDirect() {
    if (!currentVideo?.url) return;
    window.open(currentVideo.url, '_blank');
}

function setLoading(v) {
    document.getElementById('loading').classList.toggle('hidden', !v);
    document.getElementById('extractBtn').disabled = v;
}

function showError(m) {
    const e = document.getElementById('error');
    e.textContent = m;
    e.classList.remove('hidden');
}

function hideError() {
    document.getElementById('error').classList.add('hidden');
}

function hideResult() {
    document.getElementById('result').classList.add('hidden');
}

document.getElementById('videoUrl').addEventListener('keypress', e => {
    if (e.key === 'Enter') extractVideo();
});
