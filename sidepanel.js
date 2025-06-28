// NIHAI SÜRÜM 5.0: GÜVENİLİR BAĞLANTI UYUMLU
// "Kontrol Et" tıklamasında temizlik yapar ve yeni, güvenilir arka plan
// script'i ile sorunsuz bir şekilde çalışır.

class FastChecker {
    constructor() {
        this.init();
    }

    async init() {
        try {
            const { manualResultsStore = {} } = await chrome.storage.local.get('manualResultsStore');
            this.manualResultsStore = manualResultsStore;
        } catch (e) {
            console.error("Kalıcı sonuçlar yüklenemedi:", e);
        }

        this.results = [];
        this.lastAsinInputOrder = [];

        this.loadSettings();
        this.bindEvents();
        
        const header = document.getElementById('apiSettingsHeader');
        const content = document.getElementById('apiSettingsContent');
        const arrow = header?.querySelector('.arrow');
        if (content && arrow) {
            content.style.display = 'none';
            arrow.classList.add('collapsed');
        }
        
        this.listenForMessages();
        console.log('FastChecker initialized');
    }

    listenForMessages() {
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.action === 'asinResult') {
                this.addResultRow(msg.result);
            }
            if (msg.action === 'asinCheckDone') {
                this.hideLoading();
                this.showNotification('Tüm ASIN sorguları tamamlandı!', 'success');
                const downloadBtn = document.getElementById('downloadCsvBtn');
                if (this.results.length > 0) {
                    downloadBtn.style.display = 'block';
                    downloadBtn.onclick = () => this.downloadResultsAsCsv();
                }
            }
            if (msg.action === 'manualResult') {
                this.manualResultsStore[msg.result.asin] = msg.result.manual_status;
                this.updateRowWithManualResult(msg.result);
            }
        });
    }

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

    updateRowWithManualResult(manualResult) {
        const asinToUpdate = manualResult.asin;
        const rowElement = document.getElementById(`result-row-${asinToUpdate}`);
        if (!rowElement) return;

        const statusElement = rowElement.querySelector('.status');
        rowElement.classList.remove('approval-required', 'not-eligible', 'eligible');
        
        let newStatusText = '';
        let newStatusClass = '';

        if (manualResult.manual_status === 'approval_required') {
            newStatusText = 'ONAY GEREKLİ (MANUAL)';
            newStatusClass = 'approval-required';
        } else if (manualResult.manual_status === 'does_not_qualify') {
            newStatusText = 'UYGUN DEĞİL (MANUAL)';
            newStatusClass = 'not-eligible';
        }
        
        if (statusElement && newStatusText) {
            rowElement.classList.add(newStatusClass);
            statusElement.textContent = newStatusText;
        }
    }

    createResultRow(result) {
        const div = document.createElement('div');
        div.classList.add('result-row');
        div.id = `result-row-${result.asin}`;

        let statusText = '';
        let statusClass = '';

        const manualStatus = this.manualResultsStore[result.asin];
        if (manualStatus) {
            if (manualStatus === 'approval_required') {
                statusText = 'ONAY GEREKLİ (MANUAL)';
                statusClass = 'approval-required';
            } else if (manualStatus === 'does_not_qualify') {
                statusText = 'UYGUN DEĞİL (MANUAL)';
                statusClass = 'not-eligible';
            }
        } else {
            if (result.status === 'error') {
                statusClass = 'error';
                statusText = 'HATA';
            } else if (result.sellable) {
                statusClass = 'eligible';
                statusText = 'ELIGIBLE';
            } else if (result.manual_check_pending) {
                statusClass = 'approval-required';
                statusText = 'ONAY BEKLENİYOR...';
            } else {
                statusClass = 'not-eligible';
                statusText = 'NOT_ELIGIBLE';
            }
        }

        div.classList.add(statusClass);
        div.innerHTML = `<span class="asin">${result.asin}</span><span class="status">${statusText}</span>`;
        return div;
    }
    
    addResultRow(result) {
        if (this.results.some(r => r.asin === result.asin)) return;
        this.results.push(result);
        this.renderAllResults();
    }

    renderAllResults() {
        const resultsContainer = document.getElementById('results');
        const loadingDiv = document.querySelector('#results .loading');
        if (loadingDiv) loadingDiv.remove();

        const sortedResults = this.lastAsinInputOrder
            .map(asin => this.results.find(r => r.asin === asin))
            .filter(Boolean);
        
        resultsContainer.innerHTML = '';
        sortedResults.forEach(res => {
            const row = this.createResultRow(res);
            resultsContainer.appendChild(row);
        });
    }

    downloadResultsAsCsv() {
        const headers = ['BRAND', 'TITLE', 'ASIN', 'STATUS'];
        const rows = this.lastAsinInputOrder.map(asin => {
            const result = this.results.find(r => r.asin === asin);
            if (!result) return null;
            
            const manualStatus = this.manualResultsStore[result.asin];
            let status = '';
            if (manualStatus) {
                status = manualStatus === 'approval_required' ? 'INVOICE REQUIRED' : 'DOES NOT QUALIFY';
            } else {
                if (result.status === 'error') status = 'ERROR';
                else if (result.sellable) status = 'ELIGIBLE';
                else if (result.manual_check_pending) status = 'MANUAL CHECK PENDING';
                else status = 'NOT_ELIGIBLE';
            }

            return [
                result.details?.brand || '',
                result.details?.title || '',
                result.asin,
                status
            ];
        }).filter(Boolean);

        let csvContent = headers.join(',') + '\n';
        csvContent += rows.map(row => row.map(field => `"${(field || '').replace(/"/g, '""')}"`).join(',')).join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'fastchecker_sonuclari.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    async checkAsins() {
        try {
            await chrome.storage.local.remove('manualResultsStore');
            this.manualResultsStore = {};
            this.results = [];
            this.lastAsinInputOrder = [];
            document.getElementById('results').innerHTML = '';
            document.getElementById('downloadCsvBtn').style.display = 'none';
            this.showNotification('Yeni kontrol için alan temizlendi.', 'info');
        } catch (error) {
            this.showNotification('Başlamadan önce bir hata oluştu!', 'error');
            return;
        }
        
        const asinInput = document.getElementById('asinInput').value.trim();
        if (!asinInput) {
            this.showNotification("Lütfen kontrol edilecek ASIN'leri girin!", 'error');
            return;
        }
        const asins = asinInput.split(/[\s,]+/).map(asin => asin.trim()).filter(asin => asin);
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
        }, 4000);
    }
    
    toggleTheme() {
        this.showNotification('Tema değiştirme özelliği yakında!', 'info');
    }
    
    openSettings() {
        this.showNotification('Ayarlar menüsü yakında!', 'info');
    }
    
    expandPanel() {
        this.showNotification('Panel genişletme özelliği yakında!', 'info');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new FastChecker();
});

function togglePasswordVisibility(id) {
    const input = document.getElementById(id);
    input.type = input.type === 'password' ? 'text' : 'password';
}