(function () {
  "use strict";

  var state = { catalog: null, categoryId: null, error: null, search: "", metricsUrl: null };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function metric(type, gameId) {
    if (!state.metricsUrl || !gameId || isNaN(Number(gameId))) return;
    fetch(state.metricsUrl.replace(/\/$/, "") + "/" + type, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId: Number(gameId) })
    }).catch(function () {});
  }

  function refreshStats() {
    if (!state.metricsUrl || !state.catalog) return Promise.resolve();
    var games = state.catalog.games || [];
    var ids = games.map(function (g) { return g.id; }).filter(function (id) { return /^\d+$/.test(String(id)); });
    if (!ids.length) return Promise.resolve();
    return fetch(state.metricsUrl.replace(/\/$/, "") + "?ids=" + ids.join(","), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (map) {
        if (!map) return;
        games.forEach(function (g) {
          var s = map[String(g.id)];
          if (s) g.stats = { views: s.views, downloads: s.downloads };
        });
      })
      .catch(function () {});
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fmtBytes(n) {
    if (!n || n <= 0) return "-";
    var units = ["B", "KB", "MB", "GB"];
    var i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return n.toFixed(n >= 100 ? 0 : 1) + " " + units[i];
  }

  /* ---------- Theme ---------- */
  function initTheme() {
    var saved = localStorage.getItem("html.theme");
    var theme = saved || "";
    if (!theme && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) theme = "dark";
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    var btn = $("#themeToggle");
    if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
  }
  function toggleTheme() {
    var cur = document.documentElement.getAttribute("data-theme");
    var next = cur === "dark" ? "light" : "dark";
    if (next === "light" && (!window.matchMedia || !window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem("html.theme");
    } else {
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("html.theme", next);
    }
    var btn = $("#themeToggle");
    if (btn) btn.textContent = next === "dark" ? "☀️" : "🌙";
  }

  /* ---------- News banner ---------- */
  function fetchNews() {
    fetch("news.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
      if (!data || !data.title) return;
      var dismissed = {};
      try { dismissed = JSON.parse(localStorage.getItem("apkhtml.newsDismiss") || "{}"); } catch (e) {}
      if (dismissed[data.title]) return;
      var el = $("#newsBanner");
      var txt = $("#newsText");
      if (!el || !txt) return;
      txt.innerHTML = "<strong>" + esc(data.title) + "</strong>" + (data.body ? " — " + data.body : "");
      el.hidden = false;
    }).catch(function () {});
  }
  function dismissNews() {
    var el = $("#newsBanner");
    if (el) el.hidden = true;
    fetch("news.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
      if (!data || !data.title) return;
      var d = {};
      try { d = JSON.parse(localStorage.getItem("apkhtml.newsDismiss") || "{}"); } catch (e) {}
      d[data.title] = true;
      localStorage.setItem("apkhtml.newsDismiss", JSON.stringify(d));
    }).catch(function () {});
  }

  /* ---------- Feedback ---------- */
  function openFeedback() {
    var subject = encodeURIComponent("ApkHTML Geri Bildirim");
    var body = encodeURIComponent("Tarayıcı: " + navigator.userAgent + "\n\nMesajınız:");
    window.open("mailto:cinat3140@gmail.com?subject=" + subject + "&body=" + body, "_blank");
  }

  /* ---------- Catalog ---------- */

  function fetchCatalog() {
    return fetch("catalog.json?v=" + Date.now(), { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("Katalog alınamadı (HTTP " + r.status + ")");
        return r.json();
      })
      .then(function (data) {
        state.catalog = data;
        state.metricsUrl = data.metricsUrl || null;
        fillCategoryFilter(data.categories || []);
        return refreshStats().then(function () { return data; });
      });
  }

  function fillCategoryFilter(categories) {
    var sel = $("#catFilter");
    if (!sel) return;
    var opts = '<option value="">Tüm Kategoriler</option>';
    (categories || []).forEach(function (c) { opts += '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>"; });
    sel.innerHTML = opts;
  }

  function filteredGames() {
    var games = (state.catalog && state.catalog.games) || [];
    if (state.categoryId) games = games.filter(function (g) { return g.categoryId === state.categoryId; });
    if (state.search) {
      var q = state.search.toLowerCase();
      games = games.filter(function (g) {
        return (g.title || "").toLowerCase().indexOf(q) !== -1 ||
          (g.description || "").toLowerCase().indexOf(q) !== -1 ||
          (g.genre || "").toLowerCase().indexOf(q) !== -1 ||
          (g.developer || "").toLowerCase().indexOf(q) !== -1;
      });
    }
    return games;
  }

  function categoryName(id) {
    var cats = (state.catalog && state.catalog.categories) || [];
    for (var i = 0; i < cats.length; i++) if (cats[i].id === id) return cats[i].name;
    return null;
  }

  function apkInfo(g) {
    var a = g.apk || {};
    var file = Array.isArray(g.latestFiles) && g.latestFiles.length ? g.latestFiles[0] : null;
    return {
      url: a.url || g.apkUrl || (file && file.downloadUrl) || "",
      size: a.fileSize || (file && file.fileSize) || g.fileSize || 0,
      version: a.version || (g.latestVersion && g.latestVersion.version) || g.version || "",
      android: a.androidVersion || g.androidVersion || "",
      arch: a.arch || g.arch || "",
      packageName: a.packageName || g.packageName || "",
      permissions: a.permissions || (Array.isArray(g.permissions) ? g.permissions : null) || [],
      sha256: a.sha256 || g.sha256 || "",
      dev: g.developer || a.publisher || g.publisher || ""
    };
  }

  function coverWithFallback(g) {
    if (g.coverUrl) return '<img class="gcard-cover-img" src="' + esc(g.coverUrl) + '" alt="' + esc(g.title) + '" loading="lazy" />';
    return '<div class="placeholder">📱</div>';
  }

  function statsHtml(g) {
    var st = g.stats || {};
    var views = st.views || g.popularity || 0;
    var dl = st.downloads || 0;
    var parts = [];
    if (views > 0) parts.push('<span class="stat-views">' + views.toLocaleString("tr-TR") + " görüntülenme</span>");
    if (dl > 0) parts.push('<span class="stat-downloads">' + dl.toLocaleString("tr-TR") + " indirme</span>");
    if (g.isFeatured) parts.push('<span class="stat-views stat-popular">Popüler</span>');
    return parts.length ? '<div class="gcard-stats">' + parts.join("") + "</div>" : "";
  }

  function badges(a) {
    var out = "";
    if (a.android) out += '<span class="gcard-android">🤖 Android ' + esc(a.android) + "</span>";
    if (a.arch) out += '<span class="gcard-arch">' + esc(a.arch) + "</span>";
    if (a.sha256) out += '<span class="gcard-cert">✅ Doğrulandı</span>';
    return out;
  }

  function card(g) {
    var a = apkInfo(g);
    var cat = categoryName(g.categoryId);
    var size = fmtBytes(a.size);
    var featured = g.isFeatured ? '<span class="gcard-featured">★ Öne Çıkan</span>' : "";

    var actions;
    if (a.url) {
      actions = '<a class="btn btn-primary btn-sm" href="' + esc(a.url) + '" target="_blank" rel="noopener nofollow" data-metric="download:' + g.id + '">⬇ APK İndir</a>' +
        '<a class="btn btn-ghost btn-sm" href="#/oyun/' + g.id + '">Detay</a>';
    } else {
      actions = '<a class="btn btn-ghost btn-sm" href="#/oyun/' + g.id + '">İncele</a>' +
        '<span class="btn btn-ghost btn-sm" style="cursor:default">Yakında</span>';
    }

    return (
      '<article class="gcard">' +
        '<a class="gcard-cover" href="#/oyun/' + g.id + '" aria-label="' + esc(g.title) + '">' +
          coverWithFallback(g) +
          '<span class="gcard-overlay"></span>' +
          (cat ? '<span class="gcard-cat">' + esc(cat) + "</span>" : "") +
          featured +
          '<span class="gcard-play"><svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z"/></svg></span>' +
        "</a>" +
        '<div class="gcard-body">' +
          '<a class="gcard-title" href="#/oyun/' + g.id + '">' + esc(g.title) + "</a>" +
          (g.developer ? '<div class="gcard-dev">' + esc(g.developer) + "</div>" : "") +
          '<div class="gcard-meta">' +
            (size !== "-" ? '<span class="gcard-size">💾 ' + size + "</span>" : "") +
            (a.version ? '<span class="gcard-ver">v' + esc(a.version) + "</span>" : "") +
            badges(a) +
          "</div>" +
          statsHtml(g) +
          '<div class="gcard-actions">' + actions + "</div>" +
        "</div>" +
      "</article>"
    );
  }

  function renderCatalog() {
    var grid = $("#catalogGrid");
    var count = $("#catalogCount");
    var games = filteredGames();
    count.textContent = (state.catalog ? state.catalog.games.length : 0) + " APK listeleniyor";
    if (!games.length) {
      var totalCount = (state.catalog ? state.catalog.games.length : 0);
      grid.innerHTML = totalCount
        ? '<div class="emptystate"><div class="emptystate-icon">🔍</div><h3>Aradığın APK bulunamadı</h3><p>Filtreyi veya arama terimini değiştirerek tekrar dene.</p></div>'
        : '<div class="emptystate"><div class="emptystate-icon">📱</div><h3>APK kataloğu yakında dolu</h3><p>İlk uygulamalar ekleniyor. Birkaç gün içinde indirmeler seninle</p></div>';
      return;
    }
    grid.innerHTML = games.map(card).join("");
  }

  function renderGame(id) {
    var el = $("#gameDetail");
    metric("view", id);
    var g = state.catalog && state.catalog.games.find(function (x) { return Number(x.id) === Number(id); });
    if (!g) {
      el.innerHTML = '<div class="empty">APK bulunamadı. <a href="#/katalog" style="color:var(--accent)">Kataloğa dön</a></div>';
      return;
    }
    var a = apkInfo(g);
    var cat = categoryName(g.categoryId);
    var tags = [];
    if (cat) tags.push(cat);
    if (g.genre) tags.push(g.genre);
    if (a.version) tags.push("v" + a.version);
    if (a.android) tags.push("Android " + a.android);

    var apkPanel = "";
    if (a.url) {
      apkPanel =
        '<div class="apk-panel">' +
          '<h3>📱 APK İndir</h3>' +
          '<p>Dosya telefonunun indirilenler klasörüne iner. Kurmadan önce izin ver.</p>' +
          '<div class="apk-actions">' +
            '<a class="btn btn-primary btn-lg" href="' + esc(a.url) + '" target="_blank" rel="noopener nofollow" data-metric="download:' + g.id + '">⬇ APK İndir</a>' +
            '<button class="btn btn-ghost btn-lg" onclick="app.copyText(' + JSON.stringify(a.url) + ')">📋 Linki Kopyala</button>' +
          "</div>" +
        "</div>";
    }

    var infoRows = "";
    function infoRow(k, v) { return '<div class="info-row"><span class="k">' + esc(k) + "</span><span class='v'>" + esc(v) + "</span></div>"; }
    infoRows += g.developer ? infoRow("Geliştirici", g.developer) : "";
    infoRows += g.publisher ? infoRow("Yayıncı", g.publisher) : "";
    infoRows += infoRow("Kategori", cat || "—");
    infoRows += a.version ? infoRow("Sürüm", a.version) : "";
    infoRows += fmtBytes(a.size) !== "-" ? infoRow("Boyut", fmtBytes(a.size)) : "";
    infoRows += a.android ? infoRow("Android", a.android + "+") : "";
    infoRows += a.arch ? infoRow("Mimari", a.arch) : "";
    infoRows += a.packageName ? infoRow("Paket", a.packageName) : "";
    if (a.sha256) infoRows += infoRow("SHA-256", a.sha256.slice(0, 24) + "…");

    var permBlock = a.permissions && a.permissions.length
      ? '<div style="margin-top:18px"><div class="detail-desc-title">İzinler</div><p class="detail-desc">' + a.permissions.map(function (p) { return "• " + esc(p); }).join("<br/>") + "</p></div>"
      : "";

    var screens = Array.isArray(g.screenshots) && g.screenshots.length
      ? '<div class="screens"><div class="screens-title">Ekran Görüntüleri</div><div class="screens-grid">' +
        g.screenshots.map(function (s) { return '<img class="shot" src="' + esc(s) + '" alt="' + esc(g.title) + '" loading="lazy" />'; }).join("") + "</div></div>"
      : "";

    el.innerHTML =
      '<div class="detail-head">' +
          '<div class="detail-cover-wrap">' + coverWithFallback(g) + (g.isFeatured ? '<span class="gcard-featured">★ Öne Çıkan</span>' : "") + "</div>" +
          '<div class="detail-titleblock">' +
            '<h1>' + esc(g.title) + "</h1>" +
            (g.developer ? '<div class="detail-dev">' + esc(g.developer) + "</div>" : "") +
            '<div class="detail-tags">' + tags.map(function (t) { return '<span class="tag accent">' + esc(t) + "</span>"; }).join("") + "</div>" +
          "</div>" +
      "</div>" +
      apkPanel +
      '<div class="wrap detail-body">' +
        "<div class='detail-main'>" +
          (g.shortDescription ? '<p class="detail-short">' + esc(g.shortDescription) + "</p>" : "") +
          '<div class="detail-desc-title">Hakkında</div>' +
          '<p class="detail-desc">' + esc(g.description || "Açıklama eklenmemiş.") + "</p>" +
          permBlock +
          screens +
        "</div>" +
        '<aside class="detail-panel">' +
          '<div class="detail-panel-title">APK Bilgileri</div>' +
          '<div class="info-list">' + infoRows + "</div>" +
        "</aside>" +
      "</div>";
  }

  /* ---------- Router ---------- */

  function parseHash() {
    var h = location.hash.replace(/^#\/?/, "");
    if (!h) return { view: "home" };
    var parts = h.split("/");
    if (parts[0] === "oyun") return { view: "game", id: Number(parts[1]) };
    return { view: parts[0] };
  }

  var VIEWS = ["home", "katalog", "game", "indir", "sss"];

  function route() {
    var r = parseHash();
    if (VIEWS.indexOf(r.view) === -1) { location.hash = "#/"; return; }
    var activeView = r.view;
    $$("[data-view]").forEach(function (el) {
      el.hidden = el.getAttribute("data-view") !== activeView;
    });
    if (r.view === "katalog" || r.view === "game") {
      if (state.catalog) {
        render(r);
      } else if (!state.loading) {
        state.loading = true;
        fetchCatalog()
          .then(function () { render(r); })
          .catch(function (err) {
            state.error = err.message;
            $("#catalogGrid").innerHTML = '<div class="empty">Katalog yüklenemedi: ' + esc(err.message) + ".</div>";
            $("#catalogCount").textContent = "";
          })
          .finally(function () { state.loading = false; });
      }
    } else {
      window.scrollTo(0, 0);
    }
  }

  function render(r) {
    if (r.view === "game") renderGame(r.id);
    else renderCatalog();
    window.scrollTo(0, 0);
  }

  /* ---------- Public ---------- */

  function copyText(text) {
    function done() {
      var el = document.createElement("div");
      el.textContent = "Link kopyalandı ✅";
      el.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#10b981;color:#fff;padding:10px 20px;border-radius:10px;font-weight:700;z-index:200;box-shadow:0 10px 30px rgba(0,0,0,.2);";
      document.body.appendChild(el);
      setTimeout(function () { el.remove(); }, 1800);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      done();
    }
  }

  window.app = {
    applyFilter: function (v) {
      state.categoryId = v ? Number(v) : null;
      renderCatalog();
    },
    applySearch: function (v) {
      state.search = (v || "").trim();
      renderCatalog();
    },
    copyText: copyText
  };

  window.addEventListener("hashchange", route);
  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    fetchNews();
    route();
    var themeBtn = $("#themeToggle");
    if (themeBtn) themeBtn.addEventListener("click", toggleTheme);
    var newsClose = $("#newsClose");
    if (newsClose) newsClose.addEventListener("click", dismissNews);
    var feedbackBtn = $("#feedbackBtn");
    if (feedbackBtn) feedbackBtn.addEventListener("click", openFeedback);
  });
  if (document.readyState !== "loading") { initTheme(); route(); }

  /* Metric delegation: <a data-metric="view|download:id"> */
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest("a[data-metric]") : null;
    if (!el) return;
    var parts = el.getAttribute("data-metric").split(":");
    if (parts[0] === "download") metric("download", parts[1]);
  });

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.parentElement && t.parentElement.classList.contains("screens-grid")) {
      var src = t.src;
      var ov = document.createElement("div");
      ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;z-index:100;cursor:zoom-out;";
      var im = new Image();
      im.style.cssText = "max-width:90vw;max-height:90vh;border-radius:10px;";
      im.src = src;
      ov.appendChild(im);
      ov.addEventListener("click", function () { ov.remove(); });
      document.body.appendChild(ov);
    }
  });
})();