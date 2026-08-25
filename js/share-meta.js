(() => {
  const share = window.DNJ_CONFIG?.share || {};
  const configured = String(share.siteUrl || "").trim().replace(/\/$/, "");
  const origin = configured || `${location.protocol}//${location.host}${location.pathname.replace(/[^/]*$/, "")}`.replace(/\/$/, "");
  const page = `${origin}/`;
  const imagePath = String(share.image || "assets/dnj-2026-oficial.jpg").replace(/^\//, "");
  const image = `${origin}/${imagePath}`;

  const map = {
    "og:url": page,
    "og:image": image,
    "og:image:secure_url": image,
    "twitter:image": image,
  };

  Object.entries(map).forEach(([key, value]) => {
    const sel = key.startsWith("twitter")
      ? `meta[name="${key}"]`
      : `meta[property="${key}"]`;
    const el = document.querySelector(sel);
    if (el) el.setAttribute("content", value);
  });

  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute("href", page);
})();
