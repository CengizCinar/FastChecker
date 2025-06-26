// Background script for FastChecker extension

// Import SP API helper
importScripts('sp-api-helper.js');

chrome.runtime.onInstalled.addListener(() => {
    console.log('FastChecker extension installed');
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    // Open side panel
    chrome.sidePanel.open({ tabId: tab.id });
});

// Listen for messages from content script or side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkAsin') {
        handleAsinCheck(request.data, sendResponse);
        return true; // Keep message channel open for async response
    }
});

async function handleAsinCheck(data, sendResponse) {
    try {
        const { asins, credentials, sellerId, marketplace } = data;
        const results = [];
        const spApiHelper = new SPAPIHelper();

        // Glitch sunucumuzun "mektup atma" adresi
        const postaKutusuAdresi = "https://fastcheckerwebsocket.glitch.me/mektup-at";

        for (let i = 0; i < asins.length; i++) {
            const asin = asins[i];
            let result;
            try {
                result = await spApiHelper.checkASINSellability(asin, credentials, sellerId, marketplace);
            } catch (error) {
                result = {
                    asin: asin,
                    status: 'error',
                    sellable: false,
                    message: error.message,
                    details: null
                };
            }
            results.push(result);

            // Sonucun "APPROVAL_REQUIRED" olup olmadığını kontrol et
            const isApprovalRequired = result.details?.reasons?.some(r => r.reasonCode === 'APPROVAL_REQUIRED');

            if (isApprovalRequired) {
                // Eğer onay gerekiyorsa, eski sendMessage yerine sunucuya fetch ile istek gönderiyoruz.
                fetch(postaKutusuAdresi, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ asin: result.asin })
                }).catch(error => console.error('Sunucuya gönderirken hata:', error));
            }

            // Her sonucu anında sidepanel'a gönder (Bu kısım aynı kalıyor)
            chrome.runtime.sendMessage({ action: 'asinResult', result });
            
            // Her ASIN sorgusu arasında bekleme
            if (i < asins.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        // Tüm ASIN'ler bittiğinde bitti mesajı gönder
        chrome.runtime.sendMessage({ action: 'asinCheckDone' });
        sendResponse({ success: true }); // Sadece işlemin bittiğini bildir
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}