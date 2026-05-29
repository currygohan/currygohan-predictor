import { GA_MEASUREMENT_ID } from "./site-config.js";

/**
 * Load Google Analytics 4 (gtag.js) when GA_MEASUREMENT_ID is set in site-config.js.
 */
function initGoogleAnalytics() {
  const id = String(GA_MEASUREMENT_ID ?? "").trim();
  if (!id || !/^G-[A-Z0-9]+$/i.test(id)) return;

  window.dataLayer = window.dataLayer || [];
  function gtag(...args) {
    window.dataLayer.push(args);
  }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", id, { anonymize_ip: true });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

initGoogleAnalytics();
