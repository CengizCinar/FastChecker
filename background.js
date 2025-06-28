// NIHAI SÜRÜM 8.0: "DURDURMA ÖZELLİĞİ"
// Kullanıcının işlemi iptal etmesini sağlayan "Durdur" özelliği eklendi.

importScripts('sp-api-helper.js');

let ws;
let isCheckStopped = false; // İşlemin durdurulup durdurulmadığını takip eden bayrak

// --- WEBSOCKET BAĞLANTI YÖNETİMİ ---
function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        console.log("BACKGROUND: WebSocket bağlantısı zaten aktif.");
        return;
    }
    const wsUrl = "wss://fastcheckerwebsocket.glitch.me";
    ws = new WebSocket(wsUrl);
    ws.onopen = () => console.log("BACKGROUND: WebSocket bağlantısı başarıyla kuruldu.");
    ws.onmessage = async (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'manual-result' && msg.asin && msg.manual_status) {
                console.log("BACKGROUND: Manuel sonuç alındı:", msg);
                const { manualResultsStore = {} } = await chrome.storage.local.get('manualResultsStore');
                manualResultsStore[msg.asin] = msg.manual_status;
                await chrome.storage.local.set({ manualResultsStore });
                console.log(`BACKGROUND: ${msg.asin} durumu (${msg.manual_status}) kalıcı hafızaya kaydedildi.`);
                chrome.runtime.sendMessage({ action: 'manualResult', result: msg });
            }
        } catch (e) { console.error('BACKGROUND: WebSocket mesajı işlenemedi:', e); }
    };
    ws.onclose = () => { console.warn("BACKGROUND: WebSocket koptu, 10 sn sonra tekrar denenecek."); ws = null; setTimeout(connectWebSocket, 10000); };
    ws.onerror = (err) => { console.error("BACKGROUND: WebSocket hatası:", err); ws.close(); };
}

// --- ANA İŞLEVLER ---
chrome.runtime.onInstalled.addListener(connectWebSocket);
chrome.runtime.onStartup.addListener(connectWebSocket);

chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkAsin') {
        isCheckStopped = false; // Her yeni kontrolde bayrağı sıfırla
        console.log("BACKGROUND: 'checkAsin' talebi alındı, WebSocket bağlantısı kontrol ediliyor...");
        connectWebSocket();
        handleAsinCheck(request.data, sendResponse);
        return true;
    }
    // YENİ: Durdurma mesajını dinle
    if (request.action === 'stopCheck') {
        console.log("BACKGROUND: 'stopCheck' talebi alındı. Tüm işlemler durduruluyor.");
        isCheckStopped = true;
        sendResponse({ success: true });
        return true;
    }
});

async function handleAsinCheck(data, sendResponse) {
    try {
        const { asins, credentials, sellerId, marketplace } = data;
        const spApiHelper = new SPAPIHelper();
        const postaKutusuAdresi = "https://fastcheckerwebsocket.glitch.me/mektup-at";

        for (let i = 0; i < asins.length; i++) {
            // YENİ: Her döngüde durdurma bayrağını kontrol et
            if (isCheckStopped) {
                console.log(`BACKGROUND: İşlem ${i}. ASIN'de kullanıcı tarafından durduruldu.`);
                chrome.runtime.sendMessage({ action: 'asinCheckDone', stopped: true });
                return; // Döngüden ve fonksiyondan çık
            }

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
        chrome.runtime.sendMessage({ action: 'asinCheckDone', stopped: false });
        sendResponse({ success: true });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}