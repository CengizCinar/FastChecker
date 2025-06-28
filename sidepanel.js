// NIHAI SÜRÜM 7.3: "GLOBAL DİL DESTEĞİ"
// Dil değiştirme fonksiyonu, sonuçlar dışındaki statik metinleri
// (başlıklar, butonlar, etiketler) de güncelleyecek şekilde düzeltildi.

const locales = {
    en: {
        apiSettingsHeader: "SP-API Settings", refreshTokenLabel: "Refresh Token: *", clientIdLabel: "Client ID: *",
        clientSecretLabel: "Client Secret: *", sellerIdLabel: "Seller ID: *", marketplaceLabel: "Marketplace:",
        asinCheckHeader: "ASIN Control", asinsLabel: "ASINs (comma separated):",
        enterRefreshToken: "Enter Refresh Token", enterLwaAppId: "Enter LWA App ID", enterLwaClientSecret: "Enter LWA Client Secret",
        enterSellerId: "Enter Seller ID", asinsPlaceholder: "B0C31QBVQ1, B0DRW7WRX3, B0052EBJF4",
        saveSettingsBtn: "Save Settings", checkAsinsBtn: "Check", downloadCsvBtn: "Download Results as CSV",
        statusEligible: "SELLABLE", statusNotEligible: "NOT ELIGIBLE", statusApprovalRequired: "APPROVAL REQUIRED",
        statusManualCheckPending: "CHECKING...", statusManualApprovalRequired: "INVOICE REQUIRED", statusManualDoesNotQualify: "DOES NOT QUALIFY",
        statusError: "ERROR", fillRequiredFields: "Please fill all required fields!", settingsSaved: "API settings saved successfully!",
        errorSavingSettings: "Error saving settings!", enterAsins: "Please enter ASINs to check!", noValidAsins: "No valid ASINs found!",
        settingsFirst: "Save API settings first!", checkComplete: "All ASIN checks are complete!",
        allManualChecksComplete: "All manual checks are complete! You can now download the results.", areaCleaned: "Area cleaned for new check.",
        csvBrand: "BRAND", csvTitle: "TITLE", csvAsin: "ASIN", csvStatus: "STATUS"
    },
    tr: {
        apiSettingsHeader: "SP-API Ayarları", refreshTokenLabel: "Refresh Token: *", clientIdLabel: "Client ID: *",
        clientSecretLabel: "Client Secret: *", sellerIdLabel: "Satıcı ID: *", marketplaceLabel: "Pazaryeri:",
        asinCheckHeader: "ASIN Kontrol", asinsLabel: "ASIN'ler (virgülle ayırın):",
        enterRefreshToken: "Refresh Token girin", enterLwaAppId: "LWA App ID girin", enterLwaClientSecret: "LWA Client Secret girin",
        enterSellerId: "Satıcı ID girin", asinsPlaceholder: "B0C31QBVQ1, B0DRW7WRX3, B0052EBJF4",
        saveSettingsBtn: "Ayarları Kaydet", checkAsinsBtn: "Kontrol Et", downloadCsvBtn: "Sonuçları CSV Olarak İndir",
        statusEligible: "SATILABİLİR", statusNotEligible: "UYGUN DEĞİL", statusApprovalRequired: "ONAY GEREKLİ",
        statusManualCheckPending: "KONTROL EDİLİYOR...", statusManualApprovalRequired: "FATURA GEREKLİ", statusManualDoesNotQualify: "UYGUN DEĞİL",
        statusError: "HATA", fillRequiredFields: "Lütfen tüm zorunlu alanları doldurun!", settingsSaved: "API ayarları başarıyla kaydedildi!",
        errorSavingSettings: "Ayarlar kaydedilirken hata oluştu!", enterAsins: "Lütfen kontrol edilecek ASIN'leri girin!", noValidAsins: "Geçerli ASIN bulunamadı!",
        settingsFirst: "Önce API ayarlarını kaydedin!", checkComplete: "Tüm ASIN sorguları tamamlandı!",
        allManualChecksComplete: "Tüm manuel kontroller tamamlandı! Şimdi sonuçları indirebilirsiniz.", areaCleaned: "Yeni kontrol için alan temizlendi.",
        csvBrand: "MARKA", csvTitle: "BAŞLIK", csvAsin: "ASIN", csvStatus: "DURUM"
    }
};

class FastChecker {
    constructor() {
        // Değişkenleri burada başlat
        this.currentLang = 'en';
        this.results = [];
        this.lastAsinInputOrder = [];
        this.manualResultsStore = {};
        this.pendingManualChecks = 0;
        this.isApiCheckDone = false;
        
        // init fonksiyonunu çağır
        this.init();
    }

    async init() {
        // Önce olay dinleyicilerini bağla, böylece arayüz hazır olur.
        this.bindEvents();
        this.listenForMessages();

        // Kalıcı hafızadan verileri asenkron olarak yükle
        await this.loadPersistentData();
        
        console.log('FastChecker initialized');
    }

    async loadPersistentData() {
        // Manuel sonuçları ve dil tercihini yükle
        const { manualResultsStore = {}, language = 'en' } = await chrome.storage.local.get(['manualResultsStore', 'language']);
        this.manualResultsStore = manualResultsStore;
        
        // Ayarları yükle ve arayüz dilini ayarla
        await this.loadSettings();
        this.setLanguage(language, false); // Arayüzü yeniden çizmeye gerek yok, çünkü daha sonuç yok.
    }

    setLanguage(lang, reloadUI = true) {
        this.currentLang = lang;
        document.documentElement.lang = lang;

        // Statik metinleri güncelle
        document.querySelectorAll('[data-i18n-key]').forEach(el => {
            const key = el.getAttribute('data-i18n-key');
            if (locales[lang][key]) el.textContent = locales[lang][key];
        });

        // Placeholder metinlerini güncelle
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (locales[lang][key]) el.placeholder = locales[lang][key];
        });

        // Bayrak ikonunu güncelle
        document.getElementById('langBtn').textContent = lang === 'en' ? '🇹🇷' : '🇬🇧';
        
        // Dil tercihini kaydet
        chrome.storage.local.set({ language: lang });

        // Eğer sonuçlar ekrandaysa, onları da yeni dilde yeniden çiz
        if (reloadUI && this.results.length > 0) {
            this.renderAllResults();
        }
    }
    
    listenForMessages() {
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.action === 'asinResult') this.addResultRow(msg.result);
            if (msg.action === 'asinCheckDone') {
                this.isApiCheckDone = true;
                this.hideLoading();
                this.showNotification(locales[this.currentLang].checkComplete, 'success');
                this.checkIfAllDone();
            }
            if (msg.action === 'manualResult') {
                this.manualResultsStore[msg.result.asin] = msg.result.manual_status;
                this.updateRowWithManualResult(msg.result);
                if (this.pendingManualChecks > 0) this.pendingManualChecks--;
                this.checkIfAllDone();
            }
        });
    }

    bindEvents() {
        document.querySelectorAll('.section-header').forEach(header => {
            header.addEventListener('click', () => this.toggleSection(header));
        });
        document.getElementById('saveApiSettings').addEventListener('click', () => this.saveApiSettings());
        document.getElementById('checkAsins').addEventListener('click', () => this.checkAsins());
        document.getElementById('langBtn').addEventListener('click', () => {
            const newLang = this.currentLang === 'en' ? 'tr' : 'en';
            this.setLanguage(newLang);
        });
        // Diğer butonlar burada bağlanabilir
    }

    checkIfAllDone() {
        if (this.isApiCheckDone && this.pendingManualChecks === 0 && this.results.length > 0) {
            const downloadBtn = document.getElementById('downloadCsvBtn');
            downloadBtn.style.display = 'block';
            downloadBtn.onclick = () => this.downloadResultsAsCsv();
            this.showNotification(locales[this.currentLang].allManualChecksComplete, 'success');
        }
    }

    updateRowWithManualResult(manualResult) {
        const rowElement = document.getElementById(`result-row-${manualResult.asin}`);
        if (!rowElement) return;

        const statusElement = rowElement.querySelector('.status');
        rowElement.classList.remove('approval-required', 'not-eligible', 'eligible', 'checking');
        
        let newStatusText = '';
        let newStatusClass = '';

        if (manualResult.manual_status === 'approval_required') {
            newStatusText = locales[this.currentLang].statusManualApprovalRequired;
            newStatusClass = 'approval-required';
        } else if (manualResult.manual_status === 'does_not_qualify') {
            newStatusText = locales[this.currentLang].statusManualDoesNotQualify;
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
                statusText = locales[this.currentLang].statusManualApprovalRequired;
                statusClass = 'approval-required';
            } else if (manualStatus === 'does_not_qualify') {
                statusText = locales[this.currentLang].statusManualDoesNotQualify;
                statusClass = 'not-eligible';
            }
        } else {
            if (result.status === 'error') {
                statusText = locales[this.currentLang].statusError;
                statusClass = 'error';
            } else if (result.sellable) {
                statusText = locales[this.currentLang].statusEligible;
                statusClass = 'eligible';
            } else if (result.manual_check_pending) {
                statusText = locales[this.currentLang].statusManualCheckPending;
                statusClass = 'checking';
            } else {
                statusText = locales[this.currentLang].statusNotEligible;
                statusClass = 'not-eligible';
            }
        }

        div.classList.add(statusClass);
        div.innerHTML = `<span class="asin">${result.asin}</span><span class="status">${statusText}</span>`;
        return div;
    }
    
    addResultRow(result) {
        if (this.results.some(r => r.asin === result.asin)) return;
        if (result.manual_check_pending) this.pendingManualChecks++;
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
        const lang = this.currentLang;
        const headers = [locales[lang].csvBrand, locales[lang].csvTitle, locales[lang].csvAsin, locales[lang].csvStatus];
        
        const rows = this.lastAsinInputOrder.map(asin => {
            const result = this.results.find(r => r.asin === asin);
            if (!result) return null;
            
            const manualStatus = this.manualResultsStore[result.asin];
            let status = '';
            if (manualStatus) {
                status = manualStatus === 'approval_required' ? locales[lang].statusManualApprovalRequired : locales[lang].statusManualDoesNotQualify;
            } else {
                if (result.status === 'error') status = locales[lang].statusError;
                else if (result.sellable) status = locales[lang].statusEligible;
                else if (result.manual_check_pending) status = locales[lang].statusManualCheckPending;
                else status = locales[lang].statusNotEligible;
            }

            return [
                result.details?.brand || '',
                result.details?.title || '',
                result.asin,
                status
            ];
        }).filter(Boolean);

        let csvContent = '\uFEFF' + headers.join(',') + '\n';
        csvContent += rows.map(row => row.map(field => `"${(field || '').replace(/"/g, '""')}"`).join(',')).join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'fastchecker_results.csv');
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
            this.pendingManualChecks = 0;
            this.isApiCheckDone = false;
            document.getElementById('results').innerHTML = '';
            document.getElementById('downloadCsvBtn').style.display = 'none';
            this.showNotification(locales[this.currentLang].areaCleaned, 'info');
        } catch (error) {
            this.showNotification('Error during cleanup!', 'error');
            return;
        }
        
        const asinInput = document.getElementById('asinInput').value.trim();
        if (!asinInput) {
            this.showNotification(locales[this.currentLang].enterAsins, 'error');
            return;
        }
        const asins = asinInput.split(/[\s,]+/).map(asin => asin.trim()).filter(asin => asin);
        if (asins.length === 0) {
            this.showNotification(locales[this.currentLang].noValidAsins, 'error');
            return;
        }
        
        this.lastAsinInputOrder = asins;
        
        const result = await chrome.storage.local.get(['apiSettings']);
        if (!result.apiSettings?.refreshToken || !result.apiSettings?.clientId) {
            this.showNotification(locales[this.currentLang].settingsFirst, 'error');
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
            this.showNotification('Error during ASIN check!', 'error');
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
            this.showNotification(locales[this.currentLang].fillRequiredFields, 'error');
            return;
        }
        try {
            await chrome.storage.local.set({ apiSettings: settings });
            this.showNotification(locales[this.currentLang].settingsSaved, 'success');
        } catch (error) {
            this.showNotification(locales[this.currentLang].errorSavingSettings, 'error');
        }
    }
    
    async loadSettings() {
        try {
            const result = await chrome.storage.local.get(['apiSettings']);
            const header = document.getElementById('apiSettingsHeader');
            const content = header.nextElementSibling;
            const arrow = header.querySelector('.arrow');

            if (result.apiSettings && result.apiSettings.refreshToken && result.apiSettings.clientId) {
                const settings = result.apiSettings;
                document.getElementById('refreshToken').value = settings.refreshToken || '';
                document.getElementById('clientId').value = settings.clientId || '';
                document.getElementById('clientSecret').value = settings.clientSecret || '';
                document.getElementById('sellerId').value = settings.sellerId || '';
                document.getElementById('marketplace').value = settings.marketplace || 'US';
                
                content.style.display = 'none';
                arrow.classList.add('collapsed');
            } else {
                content.style.display = 'block';
                arrow.classList.remove('collapsed');
            }
        } catch (error) { console.error('Settings load error:', error); }
    }
    
    showLoading() {
        const resultsContainer = document.getElementById('results');
        const loadingText = locales[this.currentLang].checkAsinsBtn;
        resultsContainer.innerHTML = `<div class="loading"><div class="spinner"></div><span>${loadingText}...</span></div>`;
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

    // Dummy functions
    toggleTheme() { this.showNotification('Theme switcher coming soon!', 'info'); }
    openSettings() { this.showNotification('Settings panel coming soon!', 'info'); }
    expandPanel() { this.showNotification('Expand panel feature coming soon!', 'info'); }
}

document.addEventListener('DOMContentLoaded', () => { new FastChecker(); });

function togglePasswordVisibility(id) {
    const input = document.getElementById(id);
    input.type = input.type === 'password' ? 'text' : 'password';
}