/**
 * NUR ISLAMIC PLATFORM - CORE ENGINE (Phase 2)
 * Centralized Application State Management Machine
 */

window.NurCore = (function () {
    // 1. Unified Schema Initialization
    const DEFAULT_STATE = {
        user: { id: "guest_user", name: "Guest Seeker", joined: new Date().toISOString() },
        readingHistory: { lastSurahId: null, lastSurahName: "", timestamp: null },
        prayerHistory: {}, // Format: { "YYYY-MM-DD": { Fajar: true, Zuhar: false, ... } }
        tasbeehAnalytics: { totalCounts: 0, dailyGoal: 33, history: {} },
        bookmarks: { quran: [], hadith: [], adkhar: [] },
        settings: { theme: "dark", notificationsEnabled: true, audioAutoPlay: false }
    };

    // Initialize local registry
    let state = JSON.parse(localStorage.getItem('nur_global_state')) || null;
    
    if (!state) {
        state = DEFAULT_STATE;
        // Backward-compatibility fallback layer: Migrate your old storage parameters safely
        if (localStorage.getItem('lastReadId')) {
            state.readingHistory.lastSurahId = localStorage.getItem('lastReadId');
            state.readingHistory.lastSurahName = localStorage.getItem('lastReadName') || "";
        }
        if (localStorage.getItem('nur_growth_stats')) {
            try {
                state.prayerHistory = JSON.parse(localStorage.getItem('nur_growth_stats'));
            } catch(e) { console.error("Error migrating stats:", e); }
        }
        saveState();
    }

    function saveState() {
        localStorage.setItem('nur_global_state', JSON.stringify(state));
        // Disseminate local events to notify open browser windows/tabs instantly
        window.dispatchEvent(new CustomEvent('nurStateUpdated', { detail: state }));
    }

    return {
        getState: () => ({ ...state }),
        
        // Quran Tracking
        updateReadingHistory: (surahId, surahName) => {
            state.readingHistory = { surahId, surahName, timestamp: new Date().toISOString() };
            // Keep your old legacy variables intact so your existing scripts don't break
            localStorage.setItem('lastReadId', surahId);
            localStorage.setItem('lastReadName', surahName);
            saveState();
        },

        // Prayer Matrix
        logPrayerCompletion: (dateString, prayerName, completed) => {
            if (!state.prayerHistory[dateString]) state.prayerHistory[dateString] = {};
            state.prayerHistory[dateString][prayerName] = completed;
            
            // Retrofit old growth engine metric calculation formulas
            const dayPrayers = state.prayerHistory[dateString];
            const completedCount = Object.values(dayPrayers).filter(Boolean).length;
            const percentage = Math.round((completedCount / 5) * 100);
            
            let legacyStats = JSON.parse(localStorage.getItem('nur_growth_stats') || '{}');
            legacyStats[dateString] = percentage;
            localStorage.setItem('nur_growth_stats', JSON.stringify(legacyStats));
            
            saveState();
        },

        // Tasbeeh Counter Sync
        addTasbeehCount: (countIncrement, currentDhikr) => {
            state.tasbeehAnalytics.totalCounts += countIncrement;
            const today = new Date().toDateString();
            if (!state.tasbeehAnalytics.history[today]) state.tasbeehAnalytics.history[today] = 0;
            state.tasbeehAnalytics.history[today] += countIncrement;
            saveState();
        },

        // Dynamic Bookmark Management
        toggleBookmark: (category, itemKey) => {
            const list = state.bookmarks[category] || [];
            const idx = list.indexOf(itemKey);
            if (idx > -1) list.splice(idx, 1);
            else list.push(itemKey);
            state.bookmarks[category] = list;
            saveState();
            return idx === -1; // returns true if added, false if removed
        }
    };
})();
