class FastChecker {
    constructor() {
        this.init();
        this.loadSettings();
        this.bindEvents();
        this.results = []; // Otomatik kontrol sonuçları
        this.manualResults = []; // Manuel otomasyon sonuçları
        this.lastAsinInputOrder = [];
        // this.connectWebSocketForManualResults(); // WebSocket şimdilik devre dışı
    }

    init() {
        const header = document.getElementById('apiSettingsHeader');
        const content = document.getElementById('apiSettingsContent');
        const arrow = header?.querySelector('.arrow');
        if (content && arrow) {
            content.style.display = 'none';
            arrow.classList.add('collapsed');
        }
        // Tüm mesajları tek bir yerden dinle
        this.listenForMessages();
        console.log('FastChecker initialized');
    }

    // --- Mesaj Dinleyici (Birleştirilmiş) ---
    listenForMessages() {
        chrome.runtime.onMessage.addListener((msg) => {
            // Otomatik (SP-API) sonuçları
            if (msg.action === 'asinResult') {
                this.addResultRow(msg.result);
            }
            // Otomatik kontrol bitti mesajı
            if (msg.action === 'asinCheckDone') {
                this.hideLoading();
                this.showNotification('Tüm ASIN sorguları tamamlandı!', 'success');
                // CSV butonunu görünür ve aktif yap
                const downloadBtn = document.getElementById('downloadCsvBtn');
                downloadBtn.style.display = 'block';
                downloadBtn.onclick = () => this.downloadResultsAsCsv();
            }
            // Manuel otomasyon sonuçları (background'dan gelen)
            if (msg.action === 'manualResult') {
                this.addManualResultRow(msg.result);
            }
        });
    }
    
    // --- Diğer Fonksiyonlar (Değişiklik yok, sadece connectWebSocket kaldırıldı) ---

    bindEvents() {
        document.querySelectorAll('.section-header').forEach(header => {
            header.addEventListener('click', () => this.toggleSection(header));
        });
        document.getElementById('saveApiSettings').addEventListener('click', () => this.saveApiSettings());
        document.getElementById('checkAsins').addEventListener('click', () => this.checkAsins());
        document.getElementById('themeBtn').addEventListener('click', () => this.toggleTheme());
        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
        document.getElementById('expandBtn').addEventListener('click', () => this.expandPanel());
    }

    toggleSection(header) {
        const content = header.nextElementSibling;
        const arrow = header.querySelector('.arrow');
        if (content.style.display === 'none') {
            content.style.display = 'block';
            arrow.classList.remove('collapsed');
        } else {
            content.style.display = 'none';
            arrow.classList.add('collapsed');
        }
    }

    async saveApiSettings() {
        const settings = {
            refreshToken: document.getElementById('refreshToken').value,
            clientId: document.getElementById('clientId').value,
            clientSecret: document.getElementById('clientSecret').value,
            sellerId: document.getElementById('sellerId').value,
            marketplace: document.getElementById('marketplace').value
        };
        if (!settings.refreshToken || !settings.clientId || !settings.clientSecret || !settings.sellerId) {
            this.showNotification('Lütfen tüm zorunlu alanları doldurun!', 'error');
            return;
        }
        try {
            await chrome.storage.local.set({ apiSettings: settings });
            this.showNotification('API ayarları başarıyla kaydedildi!', 'success');
            const header = document.getElementById('apiSettingsHeader');
            header.nextElementSibling.style.display = 'none';
            header.querySelector('.arrow').classList.add('collapsed');
        } catch (error) {
            this.showNotification('Ayarlar kaydedilirken hata oluştu!', 'error');
        }
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.local.get(['apiSettings']);
            if (result.apiSettings) {
                const settings = result.apiSettings;
                document.getElementById('refreshToken').value = settings.refreshToken || '';
                document.getElementById('clientId').value = settings.clientId || '';
                document.getElementById('clientSecret').value = settings.clientSecret || '';
                document.getElementById('sellerId').value = settings.sellerId || '';
                document.getElementById('marketplace').value = settings.marketplace || 'US';
            }
        } catch (error) {
            console.error('Settings load error:', error);
        }
    }

    async checkAsins() {
        const asinInput = document.getElementById('asinInput').value.trim();
        if (!asinInput) {
            this.showNotification("Lütfen kontrol edilecek ASIN'leri girin!", 'error');
            return;
        }
        // Parse ASINs
        const asins = asinInput.split(',').map(asin => asin.trim()).filter(asin => asin);
        if (asins.length === 0) {
            this.showNotification('Geçerli ASIN bulunamadı!', 'error');
            return;
        }
        this.lastAsinInputOrder = asins;
        const result = await chrome.storage.local.get(['apiSettings']);
        if (!result.apiSettings) {
            this.showNotification('Önce API ayarlarını kaydedin!', 'error');
            return;
        }
        this.showLoading();
        try {
            await chrome.runtime.sendMessage({
                action: 'checkAsin',
                data: {
                    asins: asins,
                    credentials: {
                        refresh_token: result.apiSettings.refreshToken,
                        lwa_app_id: result.apiSettings.clientId,
                        lwa_client_secret: result.apiSettings.clientSecret
                    },
                    sellerId: result.apiSettings.sellerId,
                    marketplace: result.apiSettings.marketplace
                }
            });
        } catch (error) {
            this.showNotification('ASIN kontrolü sırasında hata oluştu!', 'error');
            this.hideLoading();
        }
    }

    createResultRow(result) {
        const div = document.createElement('div');
        div.classList.add('result-row');
        let statusText = '';
        if (result.status === 'error') {
            div.classList.add('error');
            statusText = 'HATA';
        } else if (result.sellable) {
            div.classList.add('eligible');
            statusText = 'ELIGIBLE';
        } else if (result.details?.reasons?.some(r => r.reasonCode === 'APPROVAL_REQUIRED')) {
            div.classList.add('approval-required');
            statusText = 'APPROVAL_REQUIRED';
        } else {
            div.classList.add('not-eligible');
            statusText = 'NOT_ELIGIBLE';
        }
        div.innerHTML = `<span class="asin">${result.asin}</span><span class="status">${statusText}</span>`;
        return div;
    }
    
    addResultRow(result) {
        if (!this.results.find(r => r.asin === result.asin)) {
            this.results.unshift(result);
        }
        this.updateResultDisplay(result, this.createResultRow);
    }

    createManualResultRow(result) {
        const div = document.createElement('div');
        div.classList.add('result-row');
        let statusText = '';
        if (result.manual_status === 'approval_required') {
            div.classList.add('approval-required');
            statusText = 'ONAY GEREKLİ (MANUAL)';
        } else if (result.manual_status === 'does_not_qualify') {
            div.classList.add('not-eligible');
            statusText = 'UYGUN DEĞİL (MANUAL)';
        }
        div.innerHTML = `<span class="asin">${result.asin}</span><span class="status">${statusText}</span>`;
        return div;
    }

    addManualResultRow(result) {
        // Eski otomatik sonucu bul ve yenisiyle değiştir
        const existingRow = document.querySelector(`.result-row .asin:contains('${result.asin}')`);
        if (existingRow) {
            existingRow.parentElement.replaceWith(this.createManualResultRow(result));
        } else {
            this.updateResultDisplay(result, this.createManualResultRow);
        }
    }

    updateResultDisplay(result, createRowFunction) {
        const resultsContainer = document.getElementById('results');
        const row = createRowFunction.call(this, result);
        if (resultsContainer.firstChild && resultsContainer.firstChild.className.includes('loading')) {
            resultsContainer.innerHTML = '';
        }
        resultsContainer.prepend(row);
    }
    
    showLoading() {
        const resultsContainer = document.getElementById('results');
        resultsContainer.innerHTML = `<div class="loading"><div class="spinner"></div><span>ASIN'ler kontrol ediliyor...</span></div>`;
        document.getElementById('checkAsins').disabled = true;
    }

    hideLoading() {
        document.getElementById('checkAsins').disabled = false;
        const loadingDiv = document.querySelector('#results .loading');
        if (loadingDiv) loadingDiv.remove();
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    toggleTheme() { this.showNotification('Tema değiştirme özelliği yakında!', 'info'); }
    openSettings() { this.showNotification('Ayarlar menüsü yakında!', 'info'); }
    expandPanel() { this.showNotification('Panel genişletme özelliği yakında!', 'info'); }

    downloadResultsAsCsv() {
        // Otomatik ve manuel sonuçları birleştir
        const asinMap = new Map();
        this.results.forEach(r => {
            asinMap.set(r.asin, {
                brand: r.details?.brand || '',
                title: r.details?.title || '',
                asin: r.asin,
                status: r.sellable ? 'ELIGIBLE' : (r.status === 'error' ? 'ERROR' : (r.details?.reasons?.some(x=>x.reasonCode==='APPROVAL_REQUIRED') ? 'APPROVAL_REQUIRED' : 'NOT_ELIGIBLE'))
            });
        });
        this.manualResults.forEach(r => {
            if (asinMap.has(r.asin)) {
                const prev = asinMap.get(r.asin);
                asinMap.set(r.asin, {
                    ...prev,
                    status: (r.manual_status ? r.manual_status.toUpperCase().replace('_', ' ') + ' (MANUAL)' : prev.status)
                });
            } else {
                asinMap.set(r.asin, {
                    brand: '',
                    title: '',
                    asin: r.asin,
                    status: (r.manual_status ? r.manual_status.toUpperCase().replace('_', ' ') + ' (MANUAL)' : '')
                });
            }
        });
        // CSV başlıkları
        const headers = ['BRAND', 'TITLE', 'ASIN', 'ELIGIBLE'];
        // Sıralı satırları oluştur
        const rows = (this.lastAsinInputOrder.length > 0
            ? this.lastAsinInputOrder.map(asin => asinMap.get(asin)).filter(Boolean)
            : Array.from(asinMap.values())
        ).map(r => [r.brand, r.title, r.asin, r.status]);
        // CSV stringini oluştur
        let csvContent = headers.join(',') + '\n';
        csvContent += rows.map(row => row.map(field => '"' + (field || '') + '"').join(',')).join('\n');
        // Blob ve indirme
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'asin_sonuclari.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new FastChecker();
});

// Helper for finding elements by text content
// (add this if it's not already globally available)
// Example usage: document.querySelector("span:contains('Some Text')")
// Note: This is a jQuery feature, so for vanilla JS we need a workaround.
// The addManualResultRow logic was updated to avoid this.