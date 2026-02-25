// auth/auth-guard.js
// Loaded by every protected page AFTER supabase-config.js
// Checks session, fetches role, enforces page-level access, reveals page

(function () {
  'use strict';

  var sb = getSafetyVerseSupabase();
  if (!sb) {
    console.error('[AuthGuard] Supabase not initialized');
    redirectToLogin();
    return;
  }

  // Determine login page path based on current page depth
  var loginPath = getLoginPath();

  // Check for existing session
  sb.auth.getSession().then(function (result) {
    var session = result.data.session;
    if (!session) {
      redirectToLogin();
      return;
    }

    // Fetch user profile (role, name, department)
    sb.from('user_profiles')
      .select('id, full_name, email, role, department')
      .eq('id', session.user.id)
      .single()
      .then(function (profileResult) {
        if (profileResult.error || !profileResult.data) {
          console.error('[AuthGuard] Profile fetch failed:', profileResult.error);
          redirectToLogin();
          return;
        }

        var profile = profileResult.data;

        // Store in window for page scripts to use
        window.__svUser = {
          id: profile.id,
          fullName: profile.full_name,
          email: profile.email,
          role: profile.role,
          department: profile.department,
          session: session
        };

        // Bridge to localStorage for backward compatibility
        localStorage.setItem('safetyverse-logged-in', 'true');
        localStorage.setItem('safetyverse-username', profile.full_name);
        localStorage.setItem('safetyverse-role', capitalizeRole(profile.role));
        localStorage.setItem('safetyverse-department', profile.department || 'Unassigned');

        // Check page-level role restrictions via data attribute
        var requiredRole = document.documentElement.getAttribute('data-required-role');
        if (requiredRole && !hasAccess(profile.role, requiredRole)) {
          // User doesn't have sufficient role — send to dashboard
          var dashPath = loginPath.replace('login.html', 'user-dashboard/index.html');
          window.location.href = dashPath;
          return;
        }

        // Dispatch event so page scripts know auth is ready
        document.dispatchEvent(new CustomEvent('svAuthReady', { detail: profile }));

        // Reveal the page
        document.body.style.visibility = 'visible';
        document.body.style.opacity = '1';
      });
  }).catch(function (err) {
    console.error('[AuthGuard] Session check failed:', err);
    redirectToLogin();
  });

  // Listen for auth state changes (e.g. session expired)
  sb.auth.onAuthStateChange(function (event, session) {
    if (event === 'SIGNED_OUT') {
      clearLocalStorage();
      redirectToLogin();
    }
  });

  // ── Helpers ──────────────────────────────────────────

  function hasAccess(userRole, requiredRole) {
    var hierarchy = { admin: 3, manager: 2, user: 1 };
    return (hierarchy[userRole] || 0) >= (hierarchy[requiredRole] || 0);
  }

  function capitalizeRole(role) {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  function getLoginPath() {
    var path = window.location.pathname;
    // Depth 2: /lessons/module-name/ or /games/safety-clue/
    if (path.match(/\/lessons\/[^/]+\//) || path.match(/\/games\/[^/]+\//)) {
      return '../../login.html';
    }
    // Depth 1: /user-dashboard/, /admin-dashboard/, /settings/, etc.
    if (path.match(/\/(user-dashboard|admin-dashboard|settings|incident-report|hazard-observation|incident-protocol|weather-alerts|lessons|osha-forms)\//)) {
      return '../login.html';
    }
    // Depth 0: root
    return 'login.html';
  }

  function redirectToLogin() {
    var lp = getLoginPath();
    window.location.href = lp;
  }

  function clearLocalStorage() {
    localStorage.removeItem('safetyverse-logged-in');
    localStorage.removeItem('safetyverse-username');
    localStorage.removeItem('safetyverse-role');
    localStorage.removeItem('safetyverse-department');
  }
})();
