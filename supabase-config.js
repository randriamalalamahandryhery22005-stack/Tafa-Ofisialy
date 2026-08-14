(() => {
  "use strict";

  const SUPABASE_URL = "https://dyhwkilsxpppepxmlmif.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_p1bzkjJluvbxJbYhl1dozA_cIUw3WIv";

  try {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("Supabase JS non chargé");
    }

    // Some Android WebViews can hang on navigator.locks.
    // Supabase Auth is used serially by this app, so a simple lock
    // implementation is sufficient here.
    window.supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          lock: async (_name, _acquireTimeout, fn) => await fn()
        }
      }
    );

    window.TAFA_SUPABASE_CONFIG = { url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY };
  } catch (e) {
    console.error("Supabase config:", e);
    window.supabaseClient = null;
  }
})();
