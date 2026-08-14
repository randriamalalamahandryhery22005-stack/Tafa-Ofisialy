
(() => {
  "use strict";
  // UI helpers only. No Supabase calls, schemas, realtime channels or data logic are changed.
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".btn-close,.btn-cancel,.btn-fermer,.btn-annuler");
    if (!b) return;
    const target = b.dataset.closeTarget;
    if (target) document.querySelector(target)?.classList.remove("open","active","show");
  });

  // Keep a single visible menu when multiple legacy menu nodes exist.
  const menus = [...document.querySelectorAll(".duplicate-menu,.page-menu-secondary")];
  menus.forEach(m => m.setAttribute("aria-hidden","true"));

  // Page identity: type below name, never above.
  document.querySelectorAll("[data-account-type]").forEach(el => {
    el.classList.add("page-name-below");
  });
})();
