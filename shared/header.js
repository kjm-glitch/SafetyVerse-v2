// shared/header.js
// Unified site header for all logged-in pages.
// Loaded in <head> after auth-guard.js. Injects header on DOMContentLoaded.

(function () {
  'use strict';

  // ── Path helpers ──────────────────────────────────────
  var path = window.location.pathname;

  // Normalize: ensure trailing slash or /index.html is handled
  // e.g. "/weather-alerts" → matches same as "/weather-alerts/"
  function pathContains(segment) {
    return path.indexOf('/' + segment) !== -1;
  }

  function getDepth() {
    // Depth 2: /lessons/module-name or /games/safety-clue (two folders deep from root)
    if (path.match(/\/lessons\/[^/]+/) && !path.match(/\/lessons\/(index\.html)?$/)) return 2;
    if (path.match(/\/games\/[^/]+/)) return 2;
    // Depth 1: top-level app folders
    if (path.match(/\/(user-dashboard|admin-dashboard|settings|incident-report|hazard-observation|incident-protocol|weather-alerts|lessons|osha-forms)(\/|$)/)) return 1;
    return 0;
  }

  var depth = getDepth();
  var prefix = depth === 2 ? '../../' : depth === 1 ? '../' : '';

  function getActiveSection() {
    if (pathContains('admin-dashboard')) return 'admin';
    if (pathContains('lessons')) return 'lessons';
    if (pathContains('games')) return 'games';
    return 'home';
  }

  var activeSection = getActiveSection();
  var isAdminPage = pathContains('admin-dashboard');

  // ── Build header HTML ─────────────────────────────────
  function buildHeader() {
    var dashboardHref = prefix + 'user-dashboard/index.html';
    var lessonsHref = prefix + 'lessons/index.html';
    var gamesHref = prefix + 'games/safety-clue/index.html';
    var adminHref = prefix + 'admin-dashboard/index.html';

    var html = '' +
      '<div class="sv-site-header-inner">' +
        '<div class="sv-site-header-left">' +
          '<a href="' + dashboardHref + '" class="sv-logo" aria-label="TheSafetyVerse Home">' +
            '<img src="logo.png?v=2" alt="TheSafetyVerse Logo" class="sv-logo-img">' +
            '<span class="sv-logo-text"><em>The</em>Safety<em>Verse</em></span>' +
          '</a>' +
          '<span class="sv-admin-badge">Admin</span>' +
        '</div>' +
        '<nav aria-label="Main navigation">' +
          '<ul class="sv-site-nav">' +
            '<li><a href="' + dashboardHref + '"' + (activeSection === 'home' ? ' class="active"' : '') + '>Home</a></li>' +
            '<li><a href="' + lessonsHref + '"' + (activeSection === 'lessons' ? ' class="active"' : '') + '>Lessons</a></li>' +
            '<li><a href="' + gamesHref + '"' + (activeSection === 'games' ? ' class="active"' : '') + '>Games</a></li>' +
            '<li class="sv-nav-admin"><a href="' + adminHref + '"' + (activeSection === 'admin' ? ' class="active"' : '') + '>Admin</a></li>' +
          '</ul>' +
        '</nav>' +
        '<div class="sv-site-header-right">' +
          '<span class="sv-site-greeting" id="svSiteGreeting">Welcome back!</span>' +
          '<a href="#" class="sv-site-logout" id="svSiteLogout">Logout</a>' +
        '</div>' +
        '<button class="sv-site-hamburger" id="svSiteHamburger" aria-label="Toggle menu">' +
          '<span></span><span></span><span></span>' +
        '</button>' +
      '</div>' +
      '<div class="sv-site-mobile-menu" id="svSiteMobileMenu">' +
        '<a href="' + dashboardHref + '">Home</a>' +
        '<a href="' + lessonsHref + '">Lessons</a>' +
        '<a href="' + gamesHref + '">Games</a>' +
        '<a href="' + adminHref + '" class="sv-nav-admin">Admin</a>' +
        '<a href="#" id="svSiteMobileLogout">Logout</a>' +
      '</div>';

    return html;
  }

  // ── Inject header ─────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    var header = document.createElement('header');
    header.className = 'sv-site-header';
    header.setAttribute('role', 'banner');
    if (isAdminPage) header.classList.add('is-admin-page');

    header.innerHTML = buildHeader();
    document.body.insertBefore(header, document.body.firstChild);

    // Hamburger toggle
    var hamburger = document.getElementById('svSiteHamburger');
    var mobileMenu = document.getElementById('svSiteMobileMenu');
    if (hamburger && mobileMenu) {
      hamburger.addEventListener('click', function () {
        mobileMenu.classList.toggle('open');
      });
    }

    // Logout handlers
    var logoutLink = document.getElementById('svSiteLogout');
    var mobileLogout = document.getElementById('svSiteMobileLogout');
    function doLogout(e) {
      e.preventDefault();
      if (typeof getSafetyVerseSupabase === 'function') {
        getSafetyVerseSupabase().auth.signOut().then(function () {
          localStorage.clear();
          window.location.href = prefix + 'login.html';
        });
      } else {
        localStorage.clear();
        window.location.href = prefix + 'login.html';
      }
    }
    if (logoutLink) logoutLink.addEventListener('click', doLogout);
    if (mobileLogout) mobileLogout.addEventListener('click', doLogout);
  });

  // ── Auth integration ──────────────────────────────────
  document.addEventListener('svAuthReady', function (e) {
    var user = e.detail; // { id, full_name, email, role, department }

    // Personalize greeting
    var greetEl = document.getElementById('svSiteGreeting');
    if (greetEl && user.full_name) {
      var firstName = user.full_name.split(' ')[0];
      greetEl.textContent = 'Welcome, ' + firstName + '!';
    }

    // Show admin nav if user is admin
    if (user.role === 'admin') {
      var adminItems = document.querySelectorAll('.sv-nav-admin');
      for (var i = 0; i < adminItems.length; i++) {
        adminItems[i].style.display = '';
      }
    }
  });

})();
