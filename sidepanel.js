// FastChecker Side Panel JavaScript

class FastChecker {
    constructor() {
        this.init();
        this.loadSettings();
        this.bindEvents();
        this.results = [];
        this.isChecking = false;
        this.listenForResults();
    }

    init() {
        // SP-API ayarları bölümünü collapsed başlat
        const header = document.getElementById('apiSettingsHeader');
        const content = document.getElementById('apiSettingsContent');
        const arrow = header?.querySelector('.arrow');
        if (content && arrow) {
            content.style.display = 'none';
            arrow.classList.add('collapsed');
        }
        console.log('FastChecker initialized');
    }

    bindEvents() {
        // Section toggle functionality
        document.querySelectorAll('.section-header').forEach(header => {
            header.addEventListener('click', () => {
                this.toggleSection(header);
            });
        });

        // Save API settings
        document.getElementById('saveApiSettings').addEventListener('click', () => {
            this.saveApiSettings();
        });

        // Check ASINs
        document.getElementById('checkAsins').addEventListener('click', () => {
            this.checkAsins();
        });

        // Theme toggle
        document.getElementById('themeBtn').addEventListener('click', () => {
            this.toggleTheme();
        });

        // Settings button
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.openSettings();
        });

        // Expand button
        document.getElementById('expandBtn').addEventListener('click', () => {
            this.expandPanel();
        });
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

        // Validate required fields
        if (!settings.refreshToken || !settings.clientId || !settings.clientSecret || !settings.sellerId) {
            this.showNotification('Lütfen tüm zorunlu alanları doldurun!', 'error');
            return;
        }

        try {
            await chrome.storage.local.set({ apiSettings: settings });
            this.showNotification('API ayarları başarıyla kaydedildi!', 'success');
            // SP-API ayarları bölümünü collapse yap
            const header = document.getElementById('apiSettingsHeader');
            const content = document.getElementById('apiSettingsContent');
            const arrow = header.querySelector('.arrow');
            content.style.display = 'none';
            arrow.classList.add('collapsed');
        } catch (error) {
            this.showNotification('Ayarlar kaydedilirken hata oluştu!', 'error');
            console.error('Settings save error:', error);
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
            this.showNotification('Lütfen kontrol edilecek ASIN\'leri girin!', 'error');
            return;
        }

        // Parse ASINs
        const asins = asinInput.split(',').map(asin => asin.trim()).filter(asin => asin);
        if (asins.length === 0) {
            this.showNotification('Geçerli ASIN bulunamadı!', 'error');
            return;
        }

        // Get API settings
        const result = await chrome.storage.local.get(['apiSettings']);
        if (!result.apiSettings) {
            this.showNotification('Önce API ayarlarını kaydedin!', 'error');
            return;
        }

        const settings = result.apiSettings;
        if (!settings.refreshToken || !settings.clientId || !settings.clientSecret || !settings.sellerId) {
            this.showNotification('API ayarları eksik!', 'error');
            return;
        }

        // Show loading
        this.showLoading();

        try {
            // Send message to background script
            const response = await chrome.runtime.sendMessage({
                action: 'checkAsin',
                data: {
                    asins: asins,
                    credentials: {
                        refresh_token: settings.refreshToken,
                        lwa_app_id: settings.clientId,
                        lwa_client_secret: settings.clientSecret
                    },
                    sellerId: settings.sellerId,
                    marketplace: settings.marketplace
                }
            });

            if (response.success) {
                // this.displayResults(response.results); // Artık kullanılmıyor, kaldırıldı
            } else {
                this.showNotification('ASIN kontrolü sırasında hata oluştu: ' + response.error, 'error');
            }
        } catch (error) {
            this.showNotification('ASIN kontrolü sırasında hata oluştu!', 'error');
            console.error('ASIN check error:', error);
        } finally {
            this.hideLoading();
        }
    }

    async displayResults(results) {
        const resultsContainer = document.getElementById('results');
        resultsContainer.innerHTML = '';
        const downloadBtn = document.getElementById('downloadCsvBtn');
        downloadBtn.style.display = 'block';
        downloadBtn.onclick = () => this.downloadResultsAsCsv(results);

        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const row = this.createResultRow(result);
            // Animasyon için delay
            setTimeout(() => {
                if (resultsContainer.firstChild) {
                    resultsContainer.insertBefore(row, resultsContainer.firstChild);
                } else {
                    resultsContainer.appendChild(row);
                }
            }, i * 100);
        }
    }

    createResultRow(result) {
        const div = document.createElement('div');
        div.classList.add('result-row');
        // Sonuç tipine göre renk
        if (result.status === 'error') div.classList.add('error');
        else if (result.sellable) div.classList.add('eligible');
        else if (result.details?.reasons?.some(r => r.reasonCode === 'APPROVAL_REQUIRED')) div.classList.add('approval-required');
        else div.classList.add('not-eligible');

        // Sonuç metni
        let statusText = '';
        if (result.status === 'error') statusText = 'HATA';
        else if (result.sellable) statusText = 'ELIGIBLE';
        else if (result.details?.reasons?.some(r => r.reasonCode === 'APPROVAL_REQUIRED')) statusText = 'APPROVAL_REQUIRED';
        else statusText = 'NOT_ELIGIBLE';

        div.innerHTML = `
            <span class="asin">${result.asin}</span>
            <span class="status">${statusText}</span>
        `;
        return div;
    }

    showLoading() {
        const resultsContainer = document.getElementById('results');
        resultsContainer.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <span>ASIN'ler kontrol ediliyor...</span>
            </div>
        `;
        
        document.getElementById('checkAsins').disabled = true;
    }

    hideLoading() {
        document.getElementById('checkAsins').disabled = false;
        // Loading mesajını tamamen kaldır
        const resultsContainer = document.getElementById('results');
        if (resultsContainer && resultsContainer.querySelector('.loading')) {
            resultsContainer.querySelector('.loading').remove();
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 16px;
            border-radius: 6px;
            color: white;
            font-weight: 500;
            z-index: 1000;
            max-width: 300px;
            word-wrap: break-word;
            ${type === 'success' ? 'background-color: #00d4aa;' : ''}
            ${type === 'error' ? 'background-color: #ff6b6b;' : ''}
            ${type === 'info' ? 'background-color: #74b9ff;' : ''}
        `;

        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    toggleTheme() {
        // Theme toggle functionality (placeholder)
        this.showNotification('Tema değiştirme özelliği yakında!', 'info');
    }

    openSettings() {
        // Settings functionality (placeholder)
        this.showNotification('Ayarlar menüsü yakında!', 'info');
    }

    expandPanel() {
        // Expand panel functionality (placeholder)
        this.showNotification('Panel genişletme özelliği yakında!', 'info');
    }

    downloadResultsAsCsv(results) {
        // CSV başlıkları
        const headers = ['BRAND', 'TITLE', 'ASIN', 'ELIGIBLE'];
        // Satırları oluştur
        const rows = results.map(r => [
            r.details?.brand || '',
            r.details?.title || '',
            r.asin,
            r.sellable ? 'ELIGIBLE' : (r.status === 'error' ? 'ERROR' : (r.details?.reasons?.some(x=>x.reasonCode==='APPROVAL_REQUIRED') ? 'APPROVAL_REQUIRED' : 'NOT_ELIGIBLE'))
        ]);
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

    listenForResults() {
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.action === 'asinResult') {
                this.addResultRow(msg.result);
            }
            if (msg.action === 'asinCheckDone') {
                this.isChecking = false;
                this.hideLoading();
                this.showNotification('Tüm ASIN sorguları tamamlandı!', 'success');
            }
        });
    }

    addResultRow(result) {
        this.results.unshift(result); // Yeni geleni üste ekle
        const resultsContainer = document.getElementById('results');
        const row = this.createResultRow(result);
        if (resultsContainer.firstChild) {
            resultsContainer.insertBefore(row, resultsContainer.firstChild);
        } else {
            resultsContainer.appendChild(row);
        }
        // CSV butonunu güncelle
        const downloadBtn = document.getElementById('downloadCsvBtn');
        downloadBtn.style.display = 'block';
        downloadBtn.onclick = () => this.downloadResultsAsCsv(this.results);
    }
}

// Password visibility toggle function
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const button = input.nextElementSibling;
    
    if (input.type === 'password') {
        input.type = 'text';
        button.textContent = '🙈';
    } else {
        input.type = 'password';
        button.textContent = '👁️';
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FastChecker();
});

