// Initialize Icons
lucide.createIcons();

// --- Configuration ---
const MODEL = "gemini-2.5-flash";

function getApiKey() {
    return localStorage.getItem('gemini-api-key') || '';
}

function getApiUrl() {
    const key = getApiKey();
    return `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
}

function promptApiKey() {
    const currentKey = getApiKey();
    const msg = currentKey 
        ? 'APIキーを変更します。新しいGoogle Gemini APIキーを入力してください：'
        : 'Google Gemini APIキーを入力してください。\n（Google AI Studio: https://aistudio.google.com/apikey で取得できます）';
    const newKey = prompt(msg, currentKey);
    if (newKey && newKey.trim()) {
        localStorage.setItem('gemini-api-key', newKey.trim());
        return true;
    }
    return false;
}

// Guest emails (for Google Calendar invites)
function getGuests() {
    return localStorage.getItem('gcal-guests') || '';
}

function promptGuests() {
    const current = getGuests();
    const newVal = prompt(
        'Googleカレンダーの招待先メールアドレスを入力してください。\n（複数ある場合はカンマ区切り）\n\n例: user1@gmail.com,user2@gmail.com',
        current
    );
    if (newVal !== null) {
        localStorage.setItem('gcal-guests', newVal.trim());
    }
}

function openSettings() {
    promptApiKey();
    promptGuests();
}

// --- State ---
let localEvents = JSON.parse(localStorage.getItem('gyouji-events')) || [];
let currentDate = new Date();

// --- Settings Button ---
document.getElementById('settingsBtn').addEventListener('click', () => {
    openSettings();
});

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
        // Check API key
        if (!getApiKey()) {
            if (!promptApiKey()) {
                showError('APIキーが設定されていません。設定してから再度お試しください。');
                return;
            }
        }

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
                <span>カレンダーに保存</span>
            </button>
            <button class="primary-btn submit-btn gcal-direct-btn" style="background: linear-gradient(135deg, #4285f4 0%, #34a853 50%, #fbbc05 75%, #ea4335 100%);">
                <i data-lucide="calendar-plus"></i>
                <span>Googleカレンダーに追加</span>
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

    // Helper to get form data from card
    const getCardEventData = () => ({
        title: card.querySelector('.event-title').value.trim(),
        start_time: card.querySelector('.event-start').value,
        end_time: card.querySelector('.event-end').value,
        location: card.querySelector('.event-location').value.trim(),
        description: card.querySelector('.event-desc').value.trim()
    });

    // Save to App Calendar
    const saveBtn = card.querySelector('.save-btn');
    saveBtn.addEventListener('click', () => {
        const data = getCardEventData();

        if (!data.title || !data.start_time) {
            showError('タイトルと開始日時は必須です。');
            return;
        }

        const newEvent = {
            id: Date.now().toString(),
            ...data
        };

        localEvents.push(newEvent);
        localStorage.setItem('gyouji-events', JSON.stringify(localEvents));
        
        showSuccess(saveBtn, '保存しました！');
        
        // Return to calendar shortly
        setTimeout(() => {
            document.querySelector('[data-target="calendarView"]').click();
        }, 1000);
    });

    // Google Calendar direct add
    const gcalDirectBtn = card.querySelector('.gcal-direct-btn');
    gcalDirectBtn.addEventListener('click', () => {
        const data = getCardEventData();
        if (!data.title || !data.start_time) {
            showError('タイトルと開始日時は必須です。');
            return;
        }
        openGoogleCalendar(data);
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
            
            // Desktop: click to open modal
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                openEventModal(ev);
            });

            // Mobile: long-press to open modal
            let pressTimer = null;
            chip.addEventListener('touchstart', (e) => {
                chip.classList.add('pressing');
                pressTimer = setTimeout(() => {
                    e.preventDefault();
                    chip.classList.remove('pressing');
                    openEventModal(ev);
                }, 500);
            }, { passive: false });
            chip.addEventListener('touchend', () => {
                clearTimeout(pressTimer);
                chip.classList.remove('pressing');
            });
            chip.addEventListener('touchmove', () => {
                clearTimeout(pressTimer);
                chip.classList.remove('pressing');
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

// Adjust past dates to future: if a date has already passed, bump year until it's in the future
function adjustPastDates(events) {
    const now = new Date();
    // Set to start of today for comparison
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    function bumpDateString(dtStr) {
        if (!dtStr) return dtStr;
        const parts = dtStr.split('T');
        const dateParts = parts[0].split('-');
        if (dateParts.length < 3) return dtStr;

        let year = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]) - 1; // 0-indexed
        const day = parseInt(dateParts[2]);

        // Keep adding years until the date is today or in the future
        while (new Date(year, month, day) < today) {
            year += 1;
        }

        dateParts[0] = String(year);
        return dateParts.join('-') + (parts[1] ? 'T' + parts[1] : '');
    }

    return events.map(ev => ({
        ...ev,
        start_time: bumpDateString(ev.start_time),
        end_time: bumpDateString(ev.end_time)
    }));
}

async function processImageWithGemini(base64Data, mimeType) {
    const now = new Date();
    const currentDateStr = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日`;

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

・本日は${currentDateStr}です。
・年が書かれていない場合は、その月日が未来になる最も近い年を使ってください。例えば本日が2026年3月で、画像に2月の予定があれば2027年2月としてください。
・時間が不明な場合は開始時刻を08:00としてください。
・終了時刻が不明な場合は、開始時刻の1〜2時間後に設定するか、日付のみしかわからない場合は当日の17:00としてください。
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

    const response = await fetch(getApiUrl(), {
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

        // Adjust past dates to future
        resultJSON = adjustPastDates(resultJSON);

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

// ===================================
// Event Detail Modal Logic
// ===================================
const eventModal = document.getElementById('eventModal');
const modalViewMode = document.getElementById('modalViewMode');
const modalEditMode = document.getElementById('modalEditMode');
const modalTitle = document.getElementById('modalTitle');
let currentModalEventId = null;
let deleteConfirmPending = false;

function formatDateTime(dtStr) {
    if (!dtStr) return '指定なし';
    // "2026-04-07T08:00" → "2026年4月7日 08:00"
    const parts = dtStr.split('T');
    if (parts.length < 2) return dtStr;
    const [y, m, d] = parts[0].split('-');
    return `${y}年${parseInt(m)}月${parseInt(d)}日 ${parts[1]}`;
}

function openEventModal(ev) {
    currentModalEventId = ev.id;
    deleteConfirmPending = false;

    // Reset to view mode
    modalViewMode.classList.remove('hidden');
    modalEditMode.classList.add('hidden');
    modalTitle.textContent = '予定の詳細';

    // Populate view fields
    document.getElementById('viewTitle').textContent = ev.title || '（未設定）';
    document.getElementById('viewStart').textContent = formatDateTime(ev.start_time);
    document.getElementById('viewEnd').textContent = formatDateTime(ev.end_time);
    document.getElementById('viewLocation').textContent = ev.location || '（未設定）';
    document.getElementById('viewDesc').textContent = ev.description || '（未設定）';

    // Reset delete button
    const deleteBtn = document.getElementById('modalDeleteBtn');
    deleteBtn.classList.remove('confirm-delete');
    deleteBtn.querySelector('span').textContent = '削除';

    // Show modal
    eventModal.classList.remove('hidden');
    lucide.createIcons();
}

function closeEventModal() {
    eventModal.classList.add('hidden');
    currentModalEventId = null;
    deleteConfirmPending = false;
}

function switchToEditMode() {
    const ev = localEvents.find(e => e.id === currentModalEventId);
    if (!ev) return;

    modalTitle.textContent = '予定を編集';
    modalViewMode.classList.add('hidden');
    modalEditMode.classList.remove('hidden');

    document.getElementById('editTitle').value = ev.title || '';
    document.getElementById('editStart').value = ev.start_time || '';
    document.getElementById('editEnd').value = ev.end_time || '';
    document.getElementById('editLocation').value = ev.location || '';
    document.getElementById('editDesc').value = ev.description || '';
}

function saveEditedEvent() {
    const idx = localEvents.findIndex(e => e.id === currentModalEventId);
    if (idx === -1) return;

    const title = document.getElementById('editTitle').value.trim();
    const start = document.getElementById('editStart').value;

    if (!title || !start) {
        showError('タイトルと開始日時は必須です。');
        return;
    }

    localEvents[idx] = {
        ...localEvents[idx],
        title: title,
        start_time: start,
        end_time: document.getElementById('editEnd').value,
        location: document.getElementById('editLocation').value.trim(),
        description: document.getElementById('editDesc').value.trim()
    };

    localStorage.setItem('gyouji-events', JSON.stringify(localEvents));
    closeEventModal();
    renderCalendar();
}

function deleteEvent() {
    if (!deleteConfirmPending) {
        // First tap: ask for confirmation
        deleteConfirmPending = true;
        const deleteBtn = document.getElementById('modalDeleteBtn');
        deleteBtn.classList.add('confirm-delete');
        deleteBtn.querySelector('span').textContent = '本当に削除？';
        // Auto-reset after 3 seconds
        setTimeout(() => {
            if (deleteConfirmPending) {
                deleteConfirmPending = false;
                deleteBtn.classList.remove('confirm-delete');
                deleteBtn.querySelector('span').textContent = '削除';
            }
        }, 3000);
        return;
    }

    // Second tap: confirm delete
    localEvents = localEvents.filter(e => e.id !== currentModalEventId);
    localStorage.setItem('gyouji-events', JSON.stringify(localEvents));
    closeEventModal();
    renderCalendar();
}

// ===================================
// Google Calendar Integration
// ===================================
function toGCalDateFormat(dtStr) {
    // "2026-04-07T08:00" → "20260407T080000"
    if (!dtStr) return '';
    return dtStr.replace(/[-:]/g, '').replace(/T/, 'T') + '00';
}

function openGoogleCalendar(ev) {
    const startDt = toGCalDateFormat(ev.start_time);
    let endDt = toGCalDateFormat(ev.end_time);

    // If no end time, default to 1 hour after start
    if (!endDt && startDt) {
        const startDate = new Date(ev.start_time);
        startDate.setHours(startDate.getHours() + 1);
        const pad = (n) => String(n).padStart(2, '0');
        endDt = `${startDate.getFullYear()}${pad(startDate.getMonth()+1)}${pad(startDate.getDate())}T${pad(startDate.getHours())}${pad(startDate.getMinutes())}00`;
    }

    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: ev.title || '',
        dates: `${startDt}/${endDt}`,
        location: ev.location || '',
        details: ev.description || '',
    });

    // Add guests from settings
    const guests = getGuests();
    if (guests) {
        params.set('add', guests);
    }

    const url = `https://calendar.google.com/calendar/render?${params.toString()}`;
    window.open(url, '_blank');
}

// Modal Event Listeners
document.getElementById('modalCloseBtn').addEventListener('click', closeEventModal);
document.getElementById('modalEditBtn').addEventListener('click', switchToEditMode);
document.getElementById('modalDeleteBtn').addEventListener('click', deleteEvent);
document.getElementById('modalSaveBtn').addEventListener('click', saveEditedEvent);
document.getElementById('modalGcalBtn').addEventListener('click', () => {
    const ev = localEvents.find(e => e.id === currentModalEventId);
    if (ev) openGoogleCalendar(ev);
});
document.getElementById('modalCancelBtn').addEventListener('click', () => {
    // Back to view mode
    modalTitle.textContent = '予定の詳細';
    modalViewMode.classList.remove('hidden');
    modalEditMode.classList.add('hidden');
});

// Close modal by tapping overlay background
eventModal.addEventListener('click', (e) => {
    if (e.target === eventModal) {
        closeEventModal();
    }
});
