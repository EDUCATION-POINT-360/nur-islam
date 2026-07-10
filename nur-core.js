/**
 * NUR ISLAMIC PLATFORM - GLOBAL STATE, SUPABASE, REALTIME SYNC & AUDIO ENGINE (FINAL PRODUCTION)
 * Centralized State Machine for Synchronization, Multi-Tab Harmony, Offline Consistency, and Prayer Monitoring
 */

// Dynamically inject Supabase CDN dependencies safely prior to core initiation
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
    let realtimeChannel = null; // Holds the active real-time WebSocket stream
    let adhanAudio = null;
    let alarmCheckingInterval = null;

    // Standard public high-fidelity Adhan stream audio sources
    const ADHAN_SOURCES = {
        standard: "https://www.islamcan.com/audio/adhan/azan1.mp3",
        fajr: "https://www.islamcan.com/audio/adhan/azan2.mp3"
    };

    // Unified Data Structure Schema
    const DEFAULT_STATE = {
        user: { id: "guest_seeker", name: "Guest User", authenticated: false, activeProfile: "Local" },
        readingHistory: { lastSurahId: null, lastSurahName: "", lastBookSlug: "", lastBookName: "", lastChapterId: null, timestamp: null },
        hadithState: { lastBookSlug: "", lastBookName: "", lastChapterId: null },
        prayerHistory: {},     // Schema: { "DateString": { Fajr: true, Dhuhr: false, ... } }
        tasbeehAnalytics: { totalCounts: 0, currentSessionGoal: 33, zikrRegistry: {} },
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
        if (!skipCloudPush && navigator.onLine) {
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

    // 🔄 CLOUD SYNCHRONIZATION ENGINES (Asynchronous background push updates)
    async function pushToCloud() {
        if (!supabaseClient || !globalState.user.authenticated || !navigator.onLine) return;
        const uid = globalState.user.id;

        try {
            // 1. Sync Reading State Upsert
            await supabaseClient.from('reading_history').upsert({
                user_id: uid,
                last_surah_id: globalState.readingHistory.lastSurahId,
                last_surah_name: globalState.readingHistory.lastSurahName,
                last_book_slug: globalState.hadithState.lastBookSlug,
                last_book_name: globalState.hadithState.lastBookName,
                last_chapter_id: globalState.hadithState.lastChapterId,
                updated_at: new Date().toISOString()
            });

            // 2. Sync Active Prayer Log Data
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

    // 📡 AUTH LISTENER LAYER
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
                initializeRealtimeSync(session.user.id); // Start live stream listener
            } else {
                globalState.user = { id: "guest_seeker", name: "Guest User", authenticated: false, activeProfile: "Local" };
                unsubscribeRealtime(); // Disconnect listener when logging out
            }
            saveState(true);
        });
    }

    // 📥 CLOUD RETRIEVAL LAYER
    async function pullFromCloud() {
        if (!supabaseClient || !globalState.user.authenticated || !navigator.onLine) return;
        const uid = globalState.user.id;

        try {
            const { data: readData } = await supabaseClient.from('reading_history').select('*').eq('user_id', uid).single();
            if (readData) {
                globalState.readingHistory = {
                    lastSurahId: readData.last_surah_id, 
                    lastSurahName: readData.last_surah_name,
                    timestamp: readData.updated_at,
                    // Map incoming realtime packet fallbacks safely
                    lastBookSlug: readData.last_book_slug || "",
                    lastBookName: readData.last_book_name || "",
                    lastChapterId: readData.last_chapter_id || null
                };
                globalState.hadithState = {
                    lastBookSlug: readData.last_book_slug || "",
                    lastBookName: readData.last_book_name || "",
                    lastChapterId: readData.last_chapter_id || null
                };
            }

            const { data: prayerData } = await supabaseClient.from('prayer_history').select('*').eq('user_id', uid);
            if (prayerData) {
                prayerData.forEach(row => {
                    globalState.prayerHistory[row.date_string] = {
                        Fajr: row.fajr, Dhuhr: row.dhuhr, Asr: row.asr, Maghrib: row.maghrib, Isha: row.isha
                    };
                });
            }
            localStorage.setItem(STATE_KEY, JSON.stringify(globalState));
        } catch (err) {
            console.error("[NUR Cloud] Historical pull failure:", err);
        }
    }

    // 📡 LIVE WEB-SOCKET REPLICATION STREAM CONTROLLER
    function initializeRealtimeSync(userId) {
        if (realtimeChannel) unsubscribeRealtime();
        if (!supabaseClient) return;

        realtimeChannel = supabaseClient
            .channel(`public-sync-room:${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reading_history', filter: `user_id=eq.${userId}` }, (payload) => {
                if (payload.new) {
                    globalState.readingHistory = {
                        lastSurahId: payload.new.last_surah_id, 
                        lastSurahName: payload.new.last_surah_name,
                        lastBookSlug: payload.new.last_book_slug || "",
                        lastBookName: payload.new.last_book_name || "",
                        lastChapterId: payload.new.last_chapter_id || null,
                        timestamp: payload.new.updated_at
                    };
                    globalState.hadithState = {
                        lastBookSlug: payload.new.last_book_slug || "",
                        lastBookName: payload.new.last_book_name || "",
                        lastChapterId: payload.new.last_chapter_id || null
                    };
                    saveState(true); // Persist update locally and broadcast across tabs without pushing back up
                }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'prayer_history', filter: `user_id=eq.${userId}` }, (payload) => {
                if (payload.new) {
                    globalState.prayerHistory[payload.new.date_string] = {
                        Fajr: payload.new.fajr, Dhuhr: payload.new.dhuhr, Asr: payload.new.asr, Maghrib: payload.new.maghrib, Isha: payload.new.isha
                    };
                    saveState(true);
                }
            })
            .subscribe((status) => {
                console.log(`[NUR Realtime] WebSocket pipeline network registration status: ${status}`);
            });
    }

    function unsubscribeRealtime() {
        if (realtimeChannel && supabaseClient) {
            supabaseClient.removeChannel(realtimeChannel);
            realtimeChannel = null;
        }
    }

    // 🔊 AUDIO & RUNTIME ALARM CONTROLLERS
    function unlockAudioEngine() {
        if (!adhanAudio) {
            adhanAudio = new Audio();
            // Pre-load a silent byte to clear the browser's hardware lock
            adhanAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";
            adhanAudio.play().then(() => {
                console.log("[NUR Audio] Audio layer successfully unlocked by user interaction.");
            }).catch(err => console.log("[NUR Audio] Waiting for explicit click gesture to clear lock."));
        }
    }

    function triggerAdhanPlayback(type = 'standard') {
        if (!adhanAudio) adhanAudio = new Audio();
        
        try {
            adhanAudio.src = ADHAN_SOURCES[type] || ADHAN_SOURCES.standard;
            adhanAudio.loop = false;
            adhanAudio.play()
                .then(() => console.log(`[NUR Audio] Adhan broadcast pipeline launched successfully: ${type}`))
                .catch(err => console.error("[NUR Audio] Hardware playback blocked. Ensure unlockAudioEngine() was called on user click:", err));
        } catch (e) {
            console.error("[NUR Audio] Stream configuration fault:", e);
        }
    }

    function startPrayerAlarmEngine(dailyTimetable) {
        if (alarmCheckingInterval) clearInterval(alarmCheckingInterval);
        console.log("[NUR Alarms] Active tracking clock running.");

        alarmCheckingInterval = setInterval(() => {
            const now = new Date();
            const currentHours = String(now.getHours()).padStart(2, '0');
            const currentMinutes = String(now.getMinutes()).padStart(2, '0');
            const currentTimeStr = `${currentHours}:${currentMinutes}`;

            // Check match parameters across each prayer timing element
            for (const [prayerName, alertTime] of Object.entries(dailyTimetable)) {
                if (currentTimeStr === alertTime && now.getSeconds() === 0) {
                    console.log(`[NUR Alarms] Alert target reached for: ${prayerName}! Triggering adhan.`);
                    triggerAdhanPlayback(prayerName.toLowerCase() === 'fajr' ? 'fajr' : 'standard');
                    
                    // Fire global event notification to update visual components
                    window.dispatchEvent(new CustomEvent('nurAdhanTrigger', { detail: { name: prayerName } }));
                }
            }
        }, 1000); // Step tick matches every second boundary precisely
    }

    // Listen for connection status changes to automatically execute background syncs
    window.addEventListener('online', () => { if (globalState.user.authenticated) pushToCloud(); });

    // 4. Exposed Core Operations API
    return {
        getSnapshot: () => JSON.parse(JSON.stringify(globalState)),
        getClientInstance: () => supabaseClient,
        
        // Dynamic Authentication Triggers
        triggerLogin: async (email, password) => {
            if (!supabaseClient) return;
            return await supabaseClient.auth.signInWithPassword({ email, password });
        },
        triggerLogout: async () => {
            unsubscribeRealtime();
            if (!supabaseClient) return;
            await supabaseClient.auth.signOut();
            localStorage.clear();
            window.location.reload();
        },

        // Quran Sync Actions
        saveSurahProgress: (surahId, surahName) => {
            globalState.readingHistory.lastSurahId = parseInt(surahId);
            globalState.readingHistory.lastSurahName = surahName;
            globalState.readingHistory.timestamp = new Date().toISOString();
            
            // Backwards compatibility fallbacks
            localStorage.setItem('lastReadId', surahId);
            localStorage.setItem('lastReadName', surahName);
            saveState();
        },

        // Hadith State Tracking
        saveHadithProgress: (bookSlug, bookName, chapterId) => {
            globalState.hadithState = { lastBookSlug: bookSlug, lastBookName: bookName, lastChapterId: chapterId };
            // Populate fallback properties for shared schema synchronization parity
            globalState.readingHistory.lastBookSlug = bookSlug;
            globalState.readingHistory.lastBookName = bookName;
            globalState.readingHistory.lastChapterId = chapterId;
            saveState();
        },

        // Prayer Completion Sync Engine
        setPrayerStatus: (dateStr, prayerId, isCompleted) => {
            if (!globalState.prayerHistory[dateStr]) {
                globalState.prayerHistory[dateStr] = { Fajr: false, Dhuhr: false, Asr: false, Maghrib: false, Isha: false };
            }
            globalState.prayerHistory[dateStr][prayerId] = isCompleted;

            // Maintain legacy tracking percentages/dashboards intact
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

        // Global Bookmark System Module
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
        },

        // Phase 6 Audio Interfaces
        unlockAudio: unlockAudioEngine,
        playManualAdhan: triggerAdhanPlayback,
        stopAdhan: () => { if (adhanAudio) adhanAudio.pause(); },
        initializeAlarms: startPrayerAlarmEngine
    };
})();
