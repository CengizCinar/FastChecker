// NIHAI SÜRÜM 5.0: "GÜVENİLİR BAĞLANTI"
// Bu versiyon, her işlem öncesi WebSocket bağlantısını kontrol eder ve
// gerekirse yeniden kurarak mesajların her zaman alınmasını garantiler.

importScripts('sp-api-helper.js');

let ws; // WebSocket nesnesini global olarak tanımla

// --- WEBSOCKET BAĞLANTI YÖNETİMİ ---
function connectWebSocket() {
    // Eğer bağlantı zaten varsa veya kuruluyorsa, tekrar deneme.
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        console.log("BACKGROUND: WebSocket bağlantısı zaten aktif.");
        return;
    }

    const wsUrl = "wss://fastcheckerwebsocket.glitch.me";
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log("BACKGROUND: WebSocket bağlantısı başarıyla kuruldu.");
    };

    ws.onmessage = async (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'manual-result' && msg.asin && msg.manual_status) {
                console.log("BACKGROUND: Manuel sonuç alındı:", msg);
                
                // Gelen sonucu kalıcı hafızaya kaydet
                const { manualResultsStore = {} } = await chrome.storage.local.get('manualResultsStore');
                manualResultsStore[msg.asin] = msg.manual_status;
                await chrome.storage.local.set({ manualResultsStore });
                console.log(`BACKGROUND: ${msg.asin} durumu (${msg.manual_status}) kalıcı hafızaya kaydedildi.`);

                // Canlı güncelleme için sonucu sidepanel'e ilet
                chrome.runtime.sendMessage({ action: 'manualResult', result: msg });
            }
        } catch (e) {
            console.error('BACKGROUND: WebSocket mesajı işlenemedi:', e);
        }
    };

    ws.onclose = () => {
        console.warn("BACKGROUND: WebSocket bağlantısı koptu, 10 sn sonra tekrar denenecek.");
        ws = null; // Bağlantı nesnesini temizle
        setTimeout(connectWebSocket, 10000);
    };

    ws.onerror = (err) => {
        console.error("BACKGROUND: WebSocket hatası:", err);
        ws.close(); // Hata durumunda bağlantıyı kapat, onclose yeniden bağlanmayı tetikler.
    };
}

// --- ANA İŞLEVLER ---
chrome.runtime.onInstalled.addListener(connectWebSocket);
chrome.runtime.onStartup.addListener(connectWebSocket); // Tarayıcı açıldığında da bağlan

chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkAsin') {
        // Her yeni kontrol talebinde, WebSocket bağlantısını garantile!
        console.log("BACKGROUND: 'checkAsin' talebi alındı, WebSocket bağlantısı kontrol ediliyor...");
        connectWebSocket(); // Bu fonksiyon, bağlantı yoksa yeniden kurar.
        
        handleAsinCheck(request.data, sendResponse);
        return true; // Asenkron yanıt için
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
                result.manual_check_pending = true;
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