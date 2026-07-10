/**
 * NUR ISLAMIC PLATFORM - GLOBAL STATE ENGINE (PHASE 2)
 * Centralized State Machine for Synchronization & Offline Consistency
 */

window.NurCore = (function () {
    const STATE_KEY = 'nur_global_state';

    // 1. Unified Application Data Structure
    const DEFAULT_STATE = {
        user: { id: "guest_seeker", name: "Guest User", activeProfile: "Local" },
        readingHistory: { lastSurahId: null, lastSurahName: "", timestamp: null },
        hadithState: { lastBookSlug: "", lastBookName: "", lastChapterId: null },
        prayerHistory: {},     // Schema: { "DateString": { Fajr: true, Dhuhr: false, ... } }
        tasbeehAnalytics: { totalCounts: 0, currentSessionGoal: 33, zikrRegistry: {} },
        bookmarks: { quran: [], hadith: [], adkhar: [] },
        settings: { notificationsEnabled: true, hapticFeedback: true, currentTheme: "default" }
    };

    // 2. Load Existing State & Auto-Migrate Legacy LocalStorage
    let globalState = JSON.parse(localStorage.getItem(STATE_KEY));

    if (!globalState) {
        globalState = DEFAULT_STATE;
        
        // Safety Migration Pipeline for Legacy Quran variables
        const legacySurahId = localStorage.getItem('lastReadId');
        const legacySurahName = localStorage.getItem('lastReadName');
        if (legacySurahId) {
            globalState.readingHistory.lastSurahId = legacySurahId;
            globalState.readingHistory.lastSurahName = legacySurahName || `Surah ${legacySurahId}`;
        }

        // Safety Migration Pipeline for Legacy Prayer Metrics
        const legacyStats = localStorage.getItem('nur_growth_stats');
        if (legacyStats) {
            try {
                const parsedStats = JSON.parse(legacyStats);
                Object.keys(parsedStats).forEach(dateKey => {
                    globalState.prayerHistory[dateKey] = globalState.prayerHistory[dateKey] || {};
                    // Store marker data to keep historical scores intact
                    globalState.prayerHistory[dateKey]._migratedScore = parsedStats[dateKey];
                });
            } catch (e) { console.warn("Legacy prayer log migration skipped:", e); }
        }
        
        saveState();
    }

    // 3. Central Persistence and Broadcaster Engine
    function saveState() {
        localStorage.setItem(STATE_KEY, JSON.stringify(globalState));
        // Cross-Tab Instant Sync Event
        window.dispatchEvent(new CustomEvent('nurStateSync', { detail: globalState }));
    }

    // Listen for updates from other open browser tabs
    window.addEventListener('storage', (e) => {
        if (e.key === STATE_KEY) {
            globalState = JSON.parse(e.newValue);
            window.dispatchEvent(new CustomEvent('nurStateSync', { detail: globalState }));
        }
    });

    // 4. Exposed Core Operations API
    return {
        getSnapshot: () => JSON.parse(JSON.stringify(globalState)),

        // Quran Sync Actions
        saveSurahProgress: (surahId, surahName) => {
            globalState.readingHistory = {
                lastSurahId: parseInt(surahId),
                lastSurahName: surahName,
                timestamp: new Date().toISOString()
            };
            // Maintain old parameters so legacy checks don't break
            localStorage.setItem('lastReadId', surahId);
            localStorage.setItem('lastReadName', surahName);
            saveState();
        },

        // Hadith State Tracking
        saveHadithProgress: (bookSlug, bookName, chapterId) => {
            globalState.hadithState = { lastBookSlug: bookSlug, lastBookName: bookName, lastChapterId: chapterId };
            saveState();
        },

        // Prayer Completion Sync Engine
        setPrayerStatus: (dateStr, prayerId, isCompleted) => {
            if (!globalState.prayerHistory[dateStr]) {
                globalState.prayerHistory[dateStr] = { Fajr: false, Dhuhr: false, Asr: false, Maghrib: false, Isha: false };
            }
            globalState.prayerHistory[dateStr][prayerId] = isCompleted;

            // Recalculate percentages to feed your legacy dashboard metrics
            const dailyMap = globalState.prayerHistory[dateStr];
            const completedCount = Object.keys(dailyMap).filter(k => k !== '_migratedScore' && dailyMap[k] === true).length;
            const updatedScore = (completedCount / 5) * 100;

            let legacyGrowthMap = JSON.parse(localStorage.getItem('nur_growth_stats') || '{}');
            legacyGrowthMap[dateStr] = updatedScore;
            localStorage.setItem('nur_growth_stats', JSON.stringify(legacyGrowthMap));

            saveState();
        },

        // Tasbeeh Analytics Operations
        recordTasbeehMetric: (increment, zikrName, targetedGoal) => {
            globalState.tasbeehAnalytics.totalCounts += increment;
            globalState.tasbeehAnalytics.currentSessionGoal = targetedGoal;
            
            if (!globalState.tasbeehAnalytics.zikrRegistry[zikrName]) {
                globalState.tasbeehAnalytics.zikrRegistry[zikrName] = 0;
            }
            globalState.tasbeehAnalytics.zikrRegistry[zikrName] += increment;
            saveState();
        },

        // Global Bookmark System
        toggleGlobalBookmark: (moduleContext, itemKey) => {
            const registry = globalState.bookmarks[moduleContext] || [];
            const elementIndex = registry.indexOf(itemKey);
            let stateFlag = false;

            if (elementIndex > -1) {
                registry.splice(elementIndex, 1);
            } else {
                registry.push(itemKey);
                stateFlag = true;
            }
            globalState.bookmarks[moduleContext] = registry;
            saveState();
            return stateFlag; // true = added, false = removed
        }
    };
})();
