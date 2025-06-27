// Import SP API helper
importScripts('sp-api-helper.js');

// --- ANA İŞLEVLER ---

chrome.runtime.onInstalled.addListener(() => {
    console.log('FastChecker extension installed');
    // WebSocket bağlantısı şimdilik devre dışı
    // connectWebSocket();
});

chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkAsin') {
        handleAsinCheck(request.data, sendResponse);
        return true;
    }
});

async function handleAsinCheck(data, sendResponse) {
    try {
        const { asins, credentials, sellerId, marketplace } = data;
        const spApiHelper = new SPAPIHelper();
        const postaKutusuAdresi = "https://fastcheckerwebsocket.glitch.me/mektup-at";

        for (let i = 0; i < asins.length; i++) {
            const asin = asins[i];
            let result = await spApiHelper.checkASINSellability(asin, credentials, sellerId, marketplace);

            const isApprovalRequired = result.details?.reasons?.some(r => r.reasonCode === 'APPROVAL_REQUIRED');

            if (isApprovalRequired) {
                fetch(postaKutusuAdresi, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ asin: result.asin })
                }).catch(error => console.error('Sunucuya gönderirken hata:', error));
            }

            chrome.runtime.sendMessage({ action: 'asinResult', result: result });

            if (i < asins.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        chrome.runtime.sendMessage({ action: 'asinCheckDone' });
        sendResponse({ success: true });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

// --- YENİ WEBSOCKET DİNLEYİCİSİ BÖLÜMÜ ---

// function connectWebSocket() {
//     const wsUrl = "wss://fastcheckerwebsocket.glitch.me";
//     let ws = new WebSocket(wsUrl);
//
//     ws.onopen = () => {
//         console.log("BACKGROUND: WebSocket bağlantısı kuruldu (manual sonuçlar için)");
//     };
//
//     ws.onmessage = (event) => {
//         try {
//             const msg = JSON.parse(event.data);
//             // Gelen mesajın formatını kontrol et
//             if (msg.type === 'manual-result' && msg.asin && msg.manual_status) {
//                 console.log("BACKGROUND: Manuel sonuç alındı, sidepanel'e gönderiliyor:", msg);
//                 // Sonucu sidepanel'e ilet
//                 chrome.runtime.sendMessage({ action: 'manualResult', result: msg });
//             }
//         } catch (e) {
//             console.error('BACKGROUND: WebSocket mesajı işlenemedi:', e);
//         }
//     };
//
//     ws.onclose = () => {
//         console.warn("BACKGROUND: WebSocket bağlantısı koptu, 10 sn sonra tekrar denenecek.");
//         setTimeout(connectWebSocket, 10000);
//     };
//
//     ws.onerror = (err) => {
//         console.error("BACKGROUND: WebSocket hatası:", err);
//         ws.close(); // Hata durumunda bağlantıyı kapatır, onclose yeniden bağlanmayı tetikler.
//     };
// }