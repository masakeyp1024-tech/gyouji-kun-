// Initialize Icons
lucide.createIcons();

// --- Configuration ---
let API_KEY = localStorage.getItem('gemini-api-key');
if (!API_KEY) {
    API_KEY = prompt("Google GeminiのAPIキーを入力してください\n（※一度入力すればスマホに記憶されます）", "");
    if (API_KEY) localStorage.setItem('gemini-api-key', API_KEY);
}
const MODEL = "gemini-2.5-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

// Target calendar emails
const GUESTS = "mame625mame@gmail.com,masakey.p1024@gmail.com";

// --- State ---
let localEvents = JSON.parse(localStorage.getItem('gyouji-events')) || [];
let currentDate = new Date();

// --- DOM Elements ---
const calendarView = document.getElementById('calendarView');
const scanView = document.getElementById('scanView');
const navItems = document.querySelectorAll('.nav-item');
const calendarGrid = document.getElementById('calendarGrid');
const currentMonthLabel = document.getElementById('currentMonthLabel');
const prevBtn = document.getElementById('prevMonth');
const nextBtn = document.getElementById('nextMonth');

const imageInput = document.getElementById('imageInput');
const previewContainer = document.getElementById('imagePreviewContainer');
const previewImg = document.getElementById('imagePreview');
const uploadSection = document.querySelector('.upload-section');
const loadingState = document.getElementById('loadingState');
const resultsContainer = document.getElementById('resultsContainer');

// --- Event Listeners ---
imageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImg.src = e.target.result;
        previewContainer.classList.remove('hidden');
        uploadSection.style.display = 'none'; // hide upload button
    };
    reader.readAsDataURL(file);

    // Call API
    try {
        showLoading(true);
        // Resize image to max 1600px width/height to avoid huge payloads from phone cameras
        const base64Image = await resizeImageAndGetBase64(file, 1600);
        // Remove data URI prefix (e.g., "data:image/jpeg;base64,")
        const base64Data = base64Image.split(',')[1];
        const mimeType = 'image/jpeg'; // Canvas resizing outputs jpeg

        await processImageWithGemini(base64Data, mimeType);
    } catch (err) {
        console.error('API Error:', err);
        showError(`エラー: ${err.message || '画像の解析中にエラーが発生しました。'}`);
    } finally {
        showLoading(false);
        // Show form smoothly
        resultsContainer.classList.remove('hidden');
    }
});

const errorToast = document.getElementById('errorToast');

// --- Navigation ---
navItems.forEach(item => {
    item.addEventListener('click', () => {
        const targetId = item.getAttribute('data-target');
        
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        
        if (targetId === 'calendarView') {
            calendarView.classList.remove('hidden');
            scanView.classList.add('hidden');
            renderCalendar();
        } else {
            scanView.classList.remove('hidden');
            calendarView.classList.add('hidden');
        }
    });
});

function createEventCard(eventData, index) {
    const card = document.createElement('div');
    card.className = 'card slide-up event-card';
    card.style.animationDelay = `${index * 0.1}s`; // Staggered animation
    
    card.innerHTML = `
        <h3 style="margin-bottom: 1rem; color: var(--primary); font-size: 1.1rem; border-bottom: 2px solid var(--primary); display: inline-block; padding-bottom: 0.2rem;">予定 ${index + 1}</h3>
        <div class="form-group">
            <label><i data-lucide="type"></i> タイトル</label>
            <input type="text" class="event-title" value="${eventData.title || ''}" placeholder="例: 入学式">
        </div>
        <div class="form-group-row">
            <div class="form-group">
                <label><i data-lucide="clock"></i> 開始</label>
                <input type="datetime-local" class="event-start" value="${eventData.start_time || ''}">
            </div>
            <div class="form-group">
                <label><i data-lucide="clock-4"></i> 終了</label>
                <input type="datetime-local" class="event-end" value="${eventData.end_time || ''}">
            </div>
        </div>
        <div class="form-group">
            <label><i data-lucide="map-pin"></i> 場所</label>
            <input type="text" class="event-location" value="${eventData.location || ''}" placeholder="例: 体育館">
        </div>
        <div class="form-group">
            <label><i data-lucide="align-left"></i> 詳細・持ち物</label>
            <textarea class="event-desc" rows="3" placeholder="水筒、上履きなど">${eventData.description || ''}</textarea>
        </div>
        <div class="form-actions">
            <button class="primary-btn submit-btn save-btn">
                <i data-lucide="check-circle"></i>
                <span>このアプリのカレンダーに保存</span>
            </button>
        </div>
    `;

    // Helper function to show status
    const showSuccess = (btn, text) => {
        const span = btn.querySelector('span');
        const origText = span.textContent;
        const origBg = btn.style.background;
        span.textContent = text;
        btn.style.background = '#3b82f6'; // Success blue
        setTimeout(() => {
            span.textContent = origText;
            btn.style.background = origBg;
        }, 3000);
    };

    // Save to App Calendar
    const saveBtn = card.querySelector('.save-btn');
    saveBtn.addEventListener('click', () => {
        const title = card.querySelector('.event-title').value.trim();
        const startStr = card.querySelector('.event-start').value;
        const endStr = card.querySelector('.event-end').value;
        const location = card.querySelector('.event-location').value.trim();
        const desc = card.querySelector('.event-desc').value.trim();

        if (!title || !startStr) {
            showError('タイトルと開始日時は必須です。');
            return;
        }

        const newEvent = {
            id: Date.now().toString(),
            title: title,
            start_time: startStr,
            end_time: endStr,
            location: location,
            description: desc
        };

        localEvents.push(newEvent);
        localStorage.setItem('gyouji-events', JSON.stringify(localEvents));
        
        showSuccess(saveBtn, '保存しました！');
        
        // UX 改善: 保存された予定の月にカレンダーを裏側で合わせておく（次回カレンダーを開いた際に見えるようにする）
        const eventDate = new Date(startStr);
        currentDate.setFullYear(eventDate.getFullYear());
        currentDate.setMonth(eventDate.getMonth());
        
        // 登録後も連続して別の予定を保存できるよう、画面の強制移動は行わない
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.5';
    });

    return card;
}

// --- Calendar Logic ---
function renderCalendar() {
    calendarGrid.innerHTML = '';
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    currentMonthLabel.textContent = `${year}年 ${month + 1}月`;
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    
    // Empty cells
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day empty-day';
        calendarGrid.appendChild(emptyCell);
    }
    
    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day';
        
        if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
            dayCell.classList.add('today');
        }
        
        const dayOfWeek = new Date(year, month, day).getDay();
        if (dayOfWeek === 0) dayCell.classList.add('sun');
        if (dayOfWeek === 6) dayCell.classList.add('sat');
        
        dayCell.innerHTML = `<span class="day-number">${day}</span>`;
        
        const dayString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        const todaysEvents = localEvents.filter(ev => {
            if(!ev.start_time) return false;
            return ev.start_time.startsWith(dayString);
        });
        
        todaysEvents.forEach(ev => {
            const chip = document.createElement('div');
            chip.className = 'event-chip';
            
            const timeStr = ev.start_time.includes('T') ? ev.start_time.split('T')[1].substring(0, 5) : '';
            chip.textContent = `${timeStr} ${ev.title}`;
            
            let pressTimer;
            let isDragging = false;
            
            const startPress = (e) => {
                isDragging = false;
                pressTimer = setTimeout(() => {
                    selectedEventId = ev.id;
                    document.getElementById('actionSheetModal').classList.add('active');
                    isDragging = true; 
                    if(navigator.vibrate) navigator.vibrate(50); // Haptic feedback if available
                }, 600);
            };
            const cancelPress = () => clearTimeout(pressTimer);
            
            chip.addEventListener('touchstart', startPress, {passive: true});
            chip.addEventListener('touchend', cancelPress);
            chip.addEventListener('touchmove', () => { isDragging = true; cancelPress(); }, {passive: true});
            
            chip.addEventListener('mousedown', startPress);
            chip.addEventListener('mouseup', cancelPress);
            chip.addEventListener('mouseleave', cancelPress);
            chip.addEventListener('mousemove', () => { isDragging = true; cancelPress(); });
            
            chip.addEventListener('contextmenu', e => e.preventDefault());

            chip.addEventListener('click', (e) => {
                if(isDragging) return;
                
                document.getElementById('detailTitle').textContent = ev.title;
                const startDisp = ev.start_time ? ev.start_time.replace('T', ' ') : '指定なし';
                const endDisp = ev.end_time ? ev.end_time.replace('T', ' ') : '指定なし';
                document.getElementById('detailTime').textContent = `${startDisp} 〜 ${endDisp}`;
                document.getElementById('detailLocation').textContent = ev.location || '設定なし';
                document.getElementById('detailDesc').textContent = ev.description || 'なし';
                
                document.getElementById('detailsModal').classList.add('active');
            });
            
            dayCell.appendChild(chip);
        });
        
        calendarGrid.appendChild(dayCell);
    }
}

prevBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
});

nextBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
});

// --- Modal & Edit Logic ---
let selectedEventId = null;

function closeAllModals() {
    document.getElementById('actionSheetModal').classList.remove('active');
    document.getElementById('detailsModal').classList.remove('active');
    document.getElementById('editModal').classList.remove('active');
    selectedEventId = null;
}

document.getElementById('btnCloseDetails').addEventListener('click', closeAllModals);
document.getElementById('btnCloseEdit').addEventListener('click', closeAllModals);
document.getElementById('btnCancelAction').addEventListener('click', closeAllModals);

['actionSheetModal', 'detailsModal', 'editModal'].forEach(id => {
    const modal = document.getElementById(id);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAllModals();
    });
});

document.getElementById('btnDeleteEvent').addEventListener('click', () => {
    if(!selectedEventId) return;
    if(confirm('本当にこの予定を削除しますか？')) {
        localEvents = localEvents.filter(ev => ev.id !== selectedEventId);
        localStorage.setItem('gyouji-events', JSON.stringify(localEvents));
        renderCalendar();
        closeAllModals();
        showError('削除しました'); // Using existing error toast simply for notifying
        document.getElementById('errorToast').style.background = '#4b5563'; // make it gray not red
    }
});

document.getElementById('btnEditEvent').addEventListener('click', () => {
    if(!selectedEventId) return;
    const ev = localEvents.find(e => e.id === selectedEventId);
    if(!ev) return;
    
    document.getElementById('editTitle').value = ev.title || '';
    document.getElementById('editStart').value = ev.start_time || '';
    document.getElementById('editEnd').value = ev.end_time || '';
    document.getElementById('editLocation').value = ev.location || '';
    document.getElementById('editDesc').value = ev.description || '';
    
    document.getElementById('actionSheetModal').classList.remove('active');
    document.getElementById('editModal').classList.add('active');
});

document.getElementById('btnSaveEdit').addEventListener('click', () => {
    if(!selectedEventId) return;
    const evIndex = localEvents.findIndex(e => e.id === selectedEventId);
    if(evIndex === -1) return;
    
    const title = document.getElementById('editTitle').value.trim();
    if(!title || !document.getElementById('editStart').value) {
        document.getElementById('errorToast').style.background = '#ef4444'; // Red
        showError('タイトルと開始日時は必須です。');
        return;
    }
    
    localEvents[evIndex] = {
        ...localEvents[evIndex],
        title: title,
        start_time: document.getElementById('editStart').value,
        end_time: document.getElementById('editEnd').value,
        location: document.getElementById('editLocation').value.trim(),
        description: document.getElementById('editDesc').value.trim()
    };
    
    localStorage.setItem('gyouji-events', JSON.stringify(localEvents));
    renderCalendar();
    closeAllModals();
    document.getElementById('errorToast').style.background = '#3b82f6'; // Blue
    showError('予定を更新しました');
});

// Initial Render
renderCalendar();

// --- Helper Functions ---

function resizeImageAndGetBase64(file, maxDimension) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Calculate aspect ratio and resize
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round(height * (maxDimension / width));
                        width = maxDimension;
                    } else {
                        width = Math.round(width * (maxDimension / height));
                        height = maxDimension;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                // Export as compressed JPEG to save data size
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = error => reject(new Error('画像の読み込みに失敗しました'));
            img.src = event.target.result;
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

async function processImageWithGemini(base64Data, mimeType) {
    const promptText = `
以下の画像は学校や保育園などのスケジュールや行事のお知らせです。
画像から情報を抽出し、**必ず以下の形式のJSON配列（リスト）**で結果を返してください。複数の予定がある場合は配列内に複数含めてください。余計なマークダウンやテキストは一切不要です（純粋なJSON配列テキストのみ出力）。

[
  {
    "title": "行事の名前（運動会や保護者会など）",
    "start_time": "開始日時（YYYY-MM-DDTHH:MM）",
    "end_time": "終了日時（YYYY-MM-DDTHH:MM）",
    "location": "開催場所",
    "description": "持ち物や重要事項など詳細な内容（改行あり）"
  }
]

・時間が不明な場合は開始時刻を08:00としてください。
・終了時刻が不明な場合は、開始時刻の1〜2時間後に設定するか、日付のみしかわからない場合は当日の17:00としてください。
・今年が何年かわからない場合は現在の年（2025または2026年）を推測してください。
`;

    const payload = {
        contents: [
            {
                parts: [
                    { text: promptText },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Data
                        }
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.1, // Keep it deterministic
            topK: 32,
            topP: 1
        }
    };

    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('API request failed:', response.status, errorText);
        throw new Error(`APIエラー (${response.status})`);
    }

    const data = await response.json();
    let textResponse = data.candidates[0].content.parts[0].text;
    
    // Clean up markdown ticks if present
    textResponse = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();

    try {
        let resultJSON = JSON.parse(textResponse);
        
        // Ensure array
        if (!Array.isArray(resultJSON)) {
            resultJSON = [resultJSON];
        }

        resultsContainer.innerHTML = ''; // Clear previous

        if (resultJSON.length === 0) {
            showError('予定を読み取ることができませんでした。');
            return;
        }

        resultJSON.forEach((eventData, idx) => {
            const card = createEventCard(eventData, idx);
            resultsContainer.appendChild(card);
        });

        // Initialize icons for dynamically generated elements
        lucide.createIcons();
    } catch (e) {
        console.error("Failed to parse JSON", e, textResponse);
        showError('結果の解析に失敗しました。再度お試しください。');
    }
}

function showLoading(isLoading) {
    if (isLoading) {
        loadingState.classList.remove('hidden');
        resultsContainer.classList.add('hidden');
    } else {
        loadingState.classList.add('hidden');
    }
}

let toastTimeout;
function showError(msg) {
    errorToast.textContent = msg;
    errorToast.classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        errorToast.classList.add('hidden');
    }, 4000);
}
