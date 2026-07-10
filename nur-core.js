/**
 * NUR ISLAMIC PLATFORM - GLOBAL STATE, SUPABASE, REALTIME SYNC, AUTH & AUDIO ENGINE
 * Centralized State Machine for Synchronization, Multi-Tab Harmony, Offline Consistency, and Prayer Monitoring
 */

// Safely inject Supabase CDN dependencies prior to core initiation if missing
if (!window.supabase) {
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    document.head.appendChild(script);
}

window.NurCore = (function () {
    const STATE_KEY = 'nur_global_state';
    
    // Explicit production API credentials
    const SUPABASE_URL = "https://njcnfxzwuzmfywvrdgub.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_Wd5JwhQnUL8fV8-wqGjrxw_5U0Oe3YQ";
    
    let supabaseClient = null;
    let realtimeChannel = null; 
    let adhanAudio = null;
    let alarmCheckingInterval = null;

    // Standard public high-fidelity Adhan stream audio sources
    const ADHAN_SOURCES = {
        standard: "https://www.islamcan.com/audio/adhan/azan1.mp3",
        fajr: "https://www.islamcan.com/audio/adhan/azan2.mp3"
    };

    // Unified Data Structure Schema incorporating all required metrics
    const DEFAULT_STATE = {
        user: { id: "guest_seeker", name: "Guest User", authenticated: false, activeProfile: "Local" },
        readingHistory: { lastSurahId: null, lastSurahName: "", totalAyahsRead: 0, readingStreak: 0, completedSurahs: [], lastReadTimestamp: null, lastBookSlug: "", lastBookName: "", lastChapterId: null },
        hadithState: { lastBookSlug: "", lastBookName: "", lastChapterId: null, totalHadithRead: 0 },
        prayerHistory: {},     // Schema: { "DateString": { Fajr: true, Dhuhr: false, ... } }
        tasbeehAnalytics: { totalCounts: 0, currentSessionGoal: 33, zikrRegistry: {}, dailyGoalsCompleted: 0 },
        appUsage: { totalTimeSpent: 0, lastLogin: null, dailyStreak: 0 },
        bookmarks: { quran: [], hadith: [], adkhar: [] },
        settings: { notificationsEnabled: true, hapticFeedback: true, currentTheme: "default" }
    };

    // Load Existing State & Auto-Migrate Legacy LocalStorage structures
    let globalState = JSON.parse(localStorage.getItem(STATE_KEY));

    if (!globalState) {
        globalState = DEFAULT_STATE;
        
        // Safety Migration Pipeline for Legacy Quran variables
        const legacySurahId = localStorage.getItem('lastReadId');
        const legacySurahName = localStorage.getItem('lastReadName');
        if (legacySurahId) {
            globalState.readingHistory.lastSurahId = parseInt(legacySurahId);
            globalState.readingHistory.lastSurahName = legacySurahName || `Surah ${legacySurahId}`;
        }

        // Safety Migration Pipeline for Legacy Prayer Metrics
        const legacyStats = localStorage.getItem('nur_growth_stats');
        if (legacyStats) {
            try {
                const parsedStats = JSON.parse(legacyStats);
                Object.keys(parsedStats).forEach(dateKey => {
                    globalState.prayerHistory[dateKey] = globalState.prayerHistory[dateKey] || {};
                    globalState.prayerHistory[dateKey]._migratedScore = parsedStats[dateKey];
                });
            } catch (e) { console.warn("Legacy prayer log migration skipped:", e); }
        }
        
        localStorage.setItem(STATE_KEY, JSON.stringify(globalState));
    }

    // Initialization routine for Supabase Core Instance
    const initInterval = setInterval(() => {
        if (window.supabase) {
            clearInterval(initInterval);
            try {
                supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                bindAuthListener();
                console.log("[NUR Core] Supabase connection layer integrated smoothly.");
            } catch (err) {
                console.error("[NUR Core] Infrastructure initiation halted:", err);
            }
        }
    }, 100);

    // Central Persistence, Cross-Tab Broadcaster, and Cloud Sync Engine
    function saveState(skipCloudPush = false) {
        localStorage.setItem(STATE_KEY, JSON.stringify(globalState));
        window.dispatchEvent(new CustomEvent('nurStateSync', { detail: globalState }));
        if (!skipCloudPush && navigator.onLine && globalState.user.authenticated) {
            pushToCloud();
        }
    }

    // Listen for cross-tab updates from other open browser instances
    window.addEventListener('storage', (e) => {
        if (e.key === STATE_KEY) {
            globalState = JSON.parse(e.newValue);
            window.dispatchEvent(new CustomEvent('nurStateSync', { detail: globalState }));
        }
    });

    // CLOUD SYNCHRONIZATION ENGINES (Unified Cloud Ecosystem Push)
    async function pushToCloud() {
        if (!supabaseClient || !globalState.user.authenticated || !navigator.onLine) return;
        const uid = globalState.user.id;

        try {
            // Push full global analytic ecosystem packet to main table structure
            await supabaseClient.from('user_analytics').upsert({
                user_id: uid,
                full_state: globalState,
                updated_at: new Date().toISOString()
            });

            // Structural Backward-Compatibility Fallbacks Sync Layer
            await supabaseClient.from('reading_history').upsert({
                user_id: uid,
                last_surah_id: globalState.readingHistory.lastSurahId,
                last_surah_name: globalState.readingHistory.lastSurahName,
                last_book_slug: globalState.hadithState.lastBookSlug,
                last_book_name: globalState.hadithState.lastBookName,
                last_chapter_id: globalState.hadithState.lastChapterId,
                updated_at: new Date().toISOString()
            });

            const todayStr = new Date().toDateString();
            if (globalState.prayerHistory[todayStr]) {
                const p = globalState.prayerHistory[todayStr];
                await supabaseClient.from('prayer_history').upsert({
                    user_id: uid,
                    date_string: todayStr,
                    fajr: !!p.Fajr, dhuhr: !!p.Dhuhr, asr: !!p.Asr, maghrib: !!p.Maghrib, isha: !!p.Isha,
                    updated_at: new Date().toISOString()
                });
            }
        } catch (err) {
            console.warn("[NUR Cloud] Auto-synchronization postponed until connection is stable:", err);
        }
    }

    // AUTH LISTENER LAYER (Listens to Realtime Login, Logout, and State Changes)
    function bindAuthListener() {
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                globalState.user = { 
                    id: session.user.id, 
                    name: session.user.user_metadata?.full_name || "Faith Seeker", 
                    authenticated: true,
                    activeProfile: "Cloud"
                };
                await pullFromCloud();
                initializeRealtimeSync(session.user.id);
            } else {
                globalState.user = { id: "guest_seeker", name: "Guest User", authenticated: false, activeProfile: "Local" };
                unsubscribeRealtime();
            }
            saveState(true);
        });
    }

    // CLOUD RETRIEVAL LAYER (Pulls central user state directly down to client device)
    async function pullFromCloud() {
        if (!supabaseClient || !globalState.user.authenticated || !navigator.onLine) return;
        const uid = globalState.user.id;

        try {
            const { data } = await supabaseClient.from('user_analytics').select('full_state').eq('user_id', uid).single();
            if (data && data.full_state) {
                globalState = data.full_state;
            } else {
                // Secondary check parsing fallback database instances if full profile record is absent
                const { data: readData } = await supabaseClient.from('reading_history').select('*').eq('user_id', uid).single();
                if (readData) {
                    globalState.readingHistory.lastSurahId = readData.last_surah_id;
                    globalState.readingHistory.lastSurahName = readData.last_surah_name;
                    globalState.hadithState.lastBookSlug = readData.last_book_slug || "";
                    globalState.hadithState.lastBookName = readData.last_book_name || "";
                    globalState.hadithState.lastChapterId = readData.last_chapter_id || null;
                }
            }
            localStorage.setItem(STATE_KEY, JSON.stringify(globalState));
            window.dispatchEvent(new CustomEvent('nurStateSync', { detail: globalState }));
        } catch (err) {
            console.error("[NUR Cloud] Historical pull failure:", err);
        }
    }

    // LIVE WEB-SOCKET REPLICATION STREAM CONTROLLER
    function initializeRealtimeSync(userId) {
        if (realtimeChannel) unsubscribeRealtime();
        if (!supabaseClient) return;

        realtimeChannel = supabaseClient
            .channel(`realtime-analytics:${userId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_analytics', filter: `user_id=eq.${userId}` }, (payload) => {
                if (payload.new && payload.new.full_state) {
                    globalState = payload.new.full_state;
                    saveState(true); // Broadcast locally across active browser elements without looping back to network
                }
            })
            .subscribe((status) => {
                console.log(`[NUR Realtime] WebSocket pipeline network status: ${status}`);
            });
    }

    function unsubscribeRealtime() {
        if (realtimeChannel && supabaseClient) {
            supabaseClient.removeChannel(realtimeChannel);
            realtimeChannel = null;
        }
    }

    // AUDIO & RUNTIME ALARM CONTROLLERS
    function unlockAudioEngine() {
        if (!adhanAudio) {
            adhanAudio = new Audio();
            adhanAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";
            adhanAudio.play().then(() => {
                console.log("[NUR Audio] Audio structural layer cleared hardware lock.");
            }).catch(err => console.log("[NUR Audio] Gesture required to unlock playback pipelines."));
        }
    }

    function triggerAdhanPlayback(type = 'standard') {
        if (!adhanAudio) adhanAudio = new Audio();
        try {
            adhanAudio.src = ADHAN_SOURCES[type] || ADHAN_SOURCES.standard;
            adhanAudio.loop = false;
            adhanAudio.play()
                .then(() => console.log(`[NUR Audio] Adhan audio broadcast launched: ${type}`))
                .catch(err => console.error("[NUR Audio] Hardware block encountered:", err));
        } catch (e) {
            console.error("[NUR Audio] Configuration parameters invalid:", e);
        }
    }

    function startPrayerAlarmEngine(dailyTimetable) {
        if (alarmCheckingInterval) clearInterval(alarmCheckingInterval);
        console.log("[NUR Alarms] Processing live tracker synchronized time constraints.");

        alarmCheckingInterval = setInterval(() => {
            const now = new Date();
            const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            for (const [prayerName, alertTime] of Object.entries(dailyTimetable)) {
                if (currentTimeStr === alertTime && now.getSeconds() === 0) {
                    triggerAdhanPlayback(prayerName.toLowerCase() === 'fajr' ? 'fajr' : 'standard');
                    window.dispatchEvent(new CustomEvent('nurAdhanTrigger', { detail: { name: prayerName } }));
                }
            }
        }, 1000);
    }

    window.addEventListener('online', () => { if (globalState.user.authenticated) pushToCloud(); });

    // Public Core Operational Operations API Exposed Hooks
    return {
        getSnapshot: () => JSON.parse(JSON.stringify(globalState)),
        getClientInstance: () => supabaseClient,
        
        // Realtime Authentication Trigger Implementations
        triggerSignUp: async (email, password, fullName = "Faith Seeker") => {
            if (!supabaseClient) return { error: { message: "Supabase integration uninitialized." } };
            return await supabaseClient.auth.signUp({
                email, password, options: { data: { full_name: fullName } }
            });
        },
        triggerLogin: async (email, password) => {
            if (!supabaseClient) return { error: { message: "Supabase integration uninitialized." } };
            return await supabaseClient.auth.signInWithPassword({ email, password });
        },
        triggerLogout: async () => {
            unsubscribeRealtime();
            if (supabaseClient) await supabaseClient.auth.signOut();
            localStorage.removeItem(STATE_KEY);
            window.location.reload();
        },

        // Quran Progress Management Engine
        saveSurahProgress: (surahId, surahName, ayahsCount = 1) => {
            globalState.readingHistory.lastSurahId = parseInt(surahId);
            globalState.readingHistory.lastSurahName = surahName;
            globalState.readingHistory.totalAyahsRead += ayahsCount;
            globalState.readingHistory.lastReadTimestamp = new Date().toISOString();
            
            localStorage.setItem('lastReadId', surahId);
            localStorage.setItem('lastReadName', surahName);
            saveState();
        },

        // Hadith Metrics Logging Systems
        saveHadithProgress: (bookSlug, bookName, chapterId) => {
            globalState.hadithState.lastBookSlug = bookSlug;
            globalState.hadithState.lastBookName = bookName;
            globalState.hadithState.lastChapterId = chapterId;
            globalState.hadithState.totalHadithRead += 1;
            
            globalState.readingHistory.lastBookSlug = bookSlug;
            globalState.readingHistory.lastBookName = bookName;
            globalState.readingHistory.lastChapterId = chapterId;
            saveState();
        },

        // Prayer Status Verification Pipelines
        setPrayerStatus: (dateStr, prayerId, isCompleted) => {
            if (!globalState.prayerHistory[dateStr]) {
                globalState.prayerHistory[dateStr] = { Fajr: false, Dhuhr: false, Asr: false, Maghrib: false, Isha: false };
            }
            globalState.prayerHistory[dateStr][prayerId] = isCompleted;

            const dailyMap = globalState.prayerHistory[dateStr];
            const completedCount = Object.keys(dailyMap).filter(k => k !== '_migratedScore' && dailyMap[k] === true).length;
            const updatedScore = (completedCount / 5) * 100;
            
            let legacyGrowthMap = JSON.parse(localStorage.getItem('nur_growth_stats') || '{}');
            legacyGrowthMap[dateStr] = updatedScore;
            localStorage.setItem('nur_growth_stats', JSON.stringify(legacyGrowthMap));

            saveState();
        },

        // Realtime Tasbeeh Metrics Trackers
        recordTasbeehMetric: (increment, zikrName, targetedGoal) => {
            globalState.tasbeehAnalytics.totalCounts += increment;
            globalState.tasbeehAnalytics.currentSessionGoal = targetedGoal;
            
            if (!globalState.tasbeehAnalytics.zikrRegistry[zikrName]) {
                globalState.tasbeehAnalytics.zikrRegistry[zikrName] = 0;
            }
            globalState.tasbeehAnalytics.zikrRegistry[zikrName] += increment;
            
            if (globalState.tasbeehAnalytics.zikrRegistry[zikrName] >= targetedGoal) {
                globalState.tasbeehAnalytics.dailyGoalsCompleted += 1;
            }
            saveState();
        },

        // Active Platform Session Stopwatches
        trackTime: (minutes) => {
            globalState.appUsage.totalTimeSpent += minutes;
            saveState();
        },

        // Cross-Module Dynamic Bookmark Registry Core
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
            return stateFlag; 
        },

        // High-Fidelity Audio Controls Interfaces
        unlockAudio: unlockAudioEngine,
        playManualAdhan: triggerAdhanPlayback,
        stopAdhan: () => { if (adhanAudio) adhanAudio.pause(); },
        initializeAlarms: startPrayerAlarmEngine
    };
})();
