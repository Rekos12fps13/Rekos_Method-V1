(function () {
  var STORAGE_KEY = 'Rekos 12fps_lang';
  var DEFAULT_LANG = 'en';

  var dict = {
    en: {
      notif_checking: 'Checking...',
      notif_wait: 'Please wait',
      notif_active_title: 'System Active',
      notif_active_sub: 'Ready to Upload ↗',
      notif_ready_title: 'System Ready',
      notif_ready_sub: 'Open TikTok Upload Page ↗',
      subtitle: 'Tools For High Quality TikTok Upload',
      features: 'System Features',
      f1: 'High Quality Upload Tiktok',
      f2: 'Full Quality Video Resolution',
      f3: 'Lossless Upload 0 Compression',
      f4: 'Promote/Tag Song & Music Support',
      f5: 'Support Mobile & PC',
      bypass_sub: 'Full High Quality Uploads',
      watermark_title: 'Watermark',
      watermark_sub: 'Add watermark in Caption',
      upload_page: 'Tiktok Upload Page',
      more_info: 'More Information'
    },
    id: {
      notif_checking: 'Checking...',
      notif_wait: 'Please wait',
      notif_active_title: 'System Active',
      notif_active_sub: 'Ready to Upload ↗',
      notif_ready_title: 'System Ready',
      notif_ready_sub: 'Open TikTok Upload Page ↗',
      subtitle: 'High-Quality TikTok Upload Tool',
      features: 'System Features',
      f1: 'High-Quality TikTok Uploads',
      f2: 'Full-Quality Video Resolution',
      f3: 'Lossless Uploads, No Compression',
      f4: 'Song & Music Tagging/Promotion Support',
      f5: 'Mobile & PC Support',
      bypass_sub: 'Full High-Quality Upload',
      watermark_title: 'Watermark',
      watermark_sub: 'Add watermark to caption',
      upload_page: 'TikTok Upload Page',
      more_info: 'More Information'
    }
  };

  var lang = DEFAULT_LANG;
  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved && dict[saved]) lang = saved;
  } catch (e) {}

  function t(key) {
    return (dict[lang] && dict[lang][key]) || dict[DEFAULT_LANG][key] || key;
  }

  function apply() {
    document.documentElement.lang = lang;
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    }
    var label = document.getElementById('langBtnLabel');
    if (label) label.textContent = lang.toUpperCase();
    document.dispatchEvent(new CustomEvent('languagechange', { detail: { lang: lang } }));
  }

  function setLang(next) {
    if (!dict[next]) return;
    lang = next;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    apply();
  }

  window.i18n = {
    t: t,
    getLang: function () { return lang; },
    setLang: setLang
  };

  document.addEventListener('DOMContentLoaded', function () {
    apply();
    var btn = document.getElementById('langBtn');
    if (btn) btn.addEventListener('click', function () {
      setLang(lang === 'en' ? 'id' : 'en');
    });
  });
})();