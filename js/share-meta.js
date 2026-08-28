(() => {
  const share = window.DNJ_CONFIG?.share || {};
  const configured = String(share.siteUrl || "").trim().replace(/\/$/, "");
  const origin = configured || `${location.protocol}//${location.host}${location.pathname.replace(/[^/]*$/, "")}`.replace(/\/$/, "");
  const page = `${origin}/`;
  const imagePath = String(share.image || "assets/dnj-2026-oficial.jpg").replace(/^\//, "");
  const image = `${origin}/${imagePath}`;
  const title = share.title || "Caravana Geração Eucarística ao DNJ 2026";
  const description = share.description || "18 de outubro de 2026 · Saída às 7h · Orla do Marine — Maricá. Inscreva-se na caravana da Geração Eucarística.";
  const imageAlt = share.imageAlt || "DNJ 2026 — Caravana Geração Eucarística ao DNJ";

  const propertyTags = {
    "og:type": "website",
    "og:locale": "pt_BR",
    "og:site_name": "Caravana Geração Eucarística ao DNJ",
    "og:url": page,
    "og:title": title,
    "og:description": description,
    "og:image": image,
    "og:image:secure_url": image,
    "og:image:type": "image/jpeg",
    "og:image:alt": imageAlt,
  };

  const nameTags = {
    description,
    "twitter:card": "summary_large_image",
    "twitter:title": title,
    "twitter:description": description,
    "twitter:image": image,
    "twitter:image:alt": imageAlt,
  };

  Object.entries(propertyTags).forEach(([key, value]) => {
    const el = document.querySelector(`meta[property="${key}"]`);
    if (el) el.setAttribute("content", value);
  });

  Object.entries(nameTags).forEach(([key, value]) => {
    const el = document.querySelector(`meta[name="${key}"]`);
    if (el) el.setAttribute("content", value);
  });

  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute("href", page);
})();
