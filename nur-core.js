/**
 * NUR ISLAMIC PLATFORM - GLOBAL STATE, SUPABASE & EXTENDED ANALYTICS ENGINE
 */
if (!window.supabase) {
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    document.head.appendChild(script);
}

window.NurCore = (function () {
    const STATE_KEY = 'nur_global_state';
    const SUPABASE_URL = "https://njcnfxzwuzmfywvrdgub.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_Wd5JwhQnUL8fV8-wqGjrxw_5U0Oe3YQ";
    
    let supabaseClient = null;
    let realtimeChannel = null;

    // تفصیلی اسلامی ڈیٹا اور اینالیٹکس کا بنیادی ڈھانچہ
    const DEFAULT_STATE = {
        user: { id: "guest_seeker", name: "Guest User", authenticated: false },
        readingHistory: { lastSurahId: null, lastSurahName: "", totalAyahsRead: 0, readingStreak: 0, completedSurahs: [], lastReadTimestamp: null },
        hadithState: { lastBookSlug: "", lastBookName: "", lastChapterId: null, totalHadithRead: 0 },
        prayerHistory: {}, // Schema: { "DateString": { Fajr: false, Dhuhr: false... } }
        tasbeehAnalytics: { totalCounts: 0, zikrRegistry: {}, dailyGoalsCompleted: 0 },
        appUsage: { totalTimeSpent: 0, lastLogin: null, dailyStreak: 0 },
        bookmarks: { quran: [], hadith: [], adkhar: [] },
        settings: { notificationsEnabled: true, hapticFeedback: true }
    };

    let globalState = JSON.parse(localStorage.getItem(STATE_KEY)) || DEFAULT_STATE;

    const initInterval = setInterval(() => {
        if (window.supabase) {
            clearInterval(initInterval);
            try {
                supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                bindAuthListener();
            } catch (err) { console.error("[NUR Core] Init Error:", err); }
        }
    }, 100);

    function saveState(skipCloudPush = false) {
        localStorage.setItem(STATE_KEY, JSON.stringify(globalState));
        window.dispatchEvent(new CustomEvent('nurStateSync', { detail: globalState }));
        if (!skipCloudPush && navigator.onLine && globalState.user.authenticated) {
            pushToCloud();
        }
    }

    async function pushToCloud() {
        if (!supabaseClient || !globalState.user.authenticated) return;
        const uid = globalState.user.id;
        try {
            await supabaseClient.from('user_analytics').upsert({
                user_id: uid,
                full_state: globalState,
                updated_at: new Date().toISOString()
            });
        } catch (err) { console.warn("[NUR Cloud] Sync deferred:", err); }
    }

    function bindAuthListener() {
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                globalState.user = { id: session.user.id, name: session.user.user_metadata?.full_name || "Faith Seeker", authenticated: true };
                await pullFromCloud();
                initializeRealtimeSync(session.user.id);
            }
            saveState(true);
        });
    }

    async function pullFromCloud() {
        if (!supabaseClient || !globalState.user.authenticated) return;
        try {
            const { data } = await supabaseClient.from('user_analytics').select('full_state').eq('user_id', globalState.user.id).single();
            if (data && data.full_state) {
                globalState = data.full_state;
                localStorage.setItem(STATE_KEY, JSON.stringify(globalState));
            }
        } catch (err) { console.error("[NUR Cloud] Pull failure:", err); }
    }

    function initializeRealtimeSync(userId) {
        if (realtimeChannel) { supabaseClient.removeChannel(realtimeChannel); }
        realtimeChannel = supabaseClient
            .channel(`realtime-analytics:${userId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_analytics', filter: `user_id=eq.${userId}` }, (payload) => {
                if (payload.new && payload.new.full_state) {
                    globalState = payload.new.full_state;
                    saveState(true);
                }
            })
            .subscribe();
    }

    // اینالیٹکس کو ٹریک کرنے کے اضافی میٹرکس فنکشنز
    return {
        getSnapshot: () => JSON.parse(JSON.stringify(globalState)),
        getClientInstance: () => supabaseClient,
        
        saveSurahProgress: (surahId, surahName, ayahsCount = 1) => {
            globalState.readingHistory.lastSurahId = parseInt(surahId);
            globalState.readingHistory.lastSurahName = surahName;
            globalState.readingHistory.totalAyahsRead += ayahsCount;
            globalState.readingHistory.lastReadTimestamp = new Date().toISOString();
            saveState();
        },

        saveHadithProgress: (bookSlug, bookName, chapterId) => {
            globalState.hadithState.lastBookSlug = bookSlug;
            globalState.hadithState.lastBookName = bookName;
            globalState.hadithState.lastChapterId = chapterId;
            globalState.hadithState.totalHadithRead += 1;
            saveState();
        },

        setPrayerStatus: (dateStr, prayerId, isCompleted) => {
            if (!globalState.prayerHistory[dateStr]) {
                globalState.prayerHistory[dateStr] = { Fajr: false, Dhuhr: false, Asr: false, Maghrib: false, Isha: false };
            }
            globalState.prayerHistory[dateStr][prayerId] = isCompleted;
            saveState();
        },

        recordTasbeehMetric: (increment, zikrName, targetedGoal) => {
            globalState.tasbeehAnalytics.totalCounts += increment;
            if (!globalState.tasbeehAnalytics.zikrRegistry[zikrName]) {
                globalState.tasbeehAnalytics.zikrRegistry[zikrName] = 0;
            }
            globalState.tasbeehAnalytics.zikrRegistry[zikrName] += increment;
            if (globalState.tasbeehAnalytics.zikrRegistry[zikrName] >= targetedGoal) {
                globalState.tasbeehAnalytics.dailyGoalsCompleted += 1;
            }
            saveState();
        },

        trackTime: (minutes) => {
            globalState.appUsage.totalTimeSpent += minutes;
            saveState();
        }
    };
})();
