/* ==========================================================================
   physbox.io - Shared browser-side session helpers
   --------------------------------------------------------------------------
   Mirrors src/utils/apiClient.ts and src/utils/googleAuth.ts as they exist in
   the Etch, Volt/Circuit and Mesh/Physics apps, so a session established in any
   of them (or here) is the same session everywhere on *.physbox.io: the same
   API base, the same localStorage keys, and the same Google client id.
   ========================================================================== */

(function (global) {
  'use strict';

  var AUTH_TOKEN_KEY = 'physbox_auth_token';
  var USER_KEY = 'physbox_user_profile';
  var GSI_SRC = 'https://accounts.google.com/gsi/client';

  /**
   * The OAuth Web client id for the PhysBox suite. Public by construction — it
   * identifies the application rather than authenticating it — and it must stay
   * identical to the GOOGLE_CLIENT_ID the API verifies against, or every
   * sign-in fails as a wrong-audience error.
   */
  var GOOGLE_CLIENT_ID = '454740079598-5kjau5ikk21c0touvj83qpunnonao4vp.apps.googleusercontent.com';

  var LOCAL_API = 'http://localhost:3000';
  var REMOTE_API = 'https://api.physbox.io';

  function getApiBaseUrl() {
    if (global.PHYSBOX_API_URL) return global.PHYSBOX_API_URL;

    var host = global.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') return REMOTE_API;

    // The app repos assume the API owns port 3000 while their dev server sits
    // on 5173. This static site has no such separation — served on 3000 it
    // would resolve the API to itself, and every POST would come back as the
    // file server's "Unsupported method ('POST')". If the local API port is
    // this page's own origin, it cannot be the API, so use the deployed one.
    if (global.location.origin === LOCAL_API) return REMOTE_API;
    return LOCAL_API;
  }

  function getStoredAuthToken() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY); } catch (e) { return null; }
  }

  function getStoredUser() {
    try {
      var raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setStoredAuth(token, user) {
    try {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      if (user && user.email) localStorage.setItem('physbox_user_email', user.email);
    } catch (e) { console.error('Failed to store auth session', e); }
  }

  function clearStoredAuth() {
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem('physbox_user_email');
    } catch (e) { console.error('Failed to clear auth session', e); }
  }

  function request(endpoint, options) {
    options = options || {};
    var headers = { 'Content-Type': 'application/json' };
    var token = getStoredAuthToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    Object.keys(options.headers || {}).forEach(function (k) { headers[k] = options.headers[k]; });

    return fetch(getApiBaseUrl() + endpoint, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body
    }).then(function (response) {
      if (!response.ok) {
        return response.json().catch(function () { return { error: response.statusText }; })
          .then(function (data) { throw new Error(data.error || 'HTTP error ' + response.status); });
      }
      return response.json();
    });
  }

  /**
   * Exchanges a Google ID token for a PhysBox session. There is deliberately no
   * offline fallback: a failed sign-in is just a failed sign-in, and the caller
   * shows the error rather than fabricating a token no server would accept.
   */
  function loginWithGoogle(credential) {
    return request('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential: credential })
    }).then(function (data) {
      if (!data.token || !data.user) throw new Error('Sign-in did not return a session.');
      setStoredAuth(data.token, data.user);
      return data;
    });
  }

  /** Resolves to the verified user, or null if there is no usable session. */
  function fetchCurrentUser() {
    if (!getStoredAuthToken()) return Promise.resolve(null);
    return request('/api/auth/me').then(function (res) {
      if (res && res.user) {
        setStoredAuth(getStoredAuthToken(), res.user);
        return res.user;
      }
      return null;
    }).catch(function () {
      clearStoredAuth();
      return null;
    });
  }

  var scriptPromise = null;

  /** Injects the Google Identity Services script once, resolving when usable. */
  function loadGoogleIdentity() {
    if (global.google && global.google.accounts && global.google.accounts.id) return Promise.resolve();
    if (scriptPromise) return scriptPromise;

    scriptPromise = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + GSI_SRC + '"]');
      var script = existing || document.createElement('script');

      function settle() {
        if (global.google && global.google.accounts && global.google.accounts.id) resolve();
        else reject(new Error('Google sign-in loaded but did not initialise.'));
      }

      script.addEventListener('load', settle);
      script.addEventListener('error', function () {
        // Let a later attempt retry rather than caching the failure forever —
        // this is usually a blocked script or a dropped connection.
        scriptPromise = null;
        reject(new Error('Could not reach Google sign-in. Check your connection or any script blocker.'));
      });

      if (!existing) {
        script.src = GSI_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      } else if (global.google && global.google.accounts && global.google.accounts.id) {
        settle();
      }
    });

    return scriptPromise;
  }

  /**
   * Draws Google's own sign-in button into `container` and reports the
   * credential it produces. Google's rendered button is used rather than One
   * Tap's prompt() because it degrades predictably — a suppressed or dismissed
   * One Tap can't leave the page looking broken with nothing in it.
   */
  function renderGoogleSignInButton(container, onCredential, onError, options) {
    options = options || {};
    return loadGoogleIdentity().then(function () {
      var id = global.google && global.google.accounts && global.google.accounts.id;
      if (!id) { onError('Google sign-in is unavailable.'); return; }

      id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: function (response) {
          if (response && response.credential) onCredential(response.credential);
          else onError('Google did not return a credential. Please try again.');
        },
        auto_select: false,
        cancel_on_tap_outside: true
      });

      container.replaceChildren();
      id.renderButton(container, {
        type: 'standard',
        theme: 'filled_blue',
        size: 'large',
        text: options.text || 'signin_with',
        shape: 'pill',
        logo_alignment: 'left',
        width: options.width || 320
      });
    }).catch(function (err) {
      onError(err.message || 'Google sign-in is unavailable.');
    });
  }

  /** Stops Google silently re-authenticating after an explicit sign-out. */
  function disableGoogleAutoSelect() {
    try {
      if (global.google && global.google.accounts && global.google.accounts.id) {
        global.google.accounts.id.disableAutoSelect();
      }
    } catch (e) { /* nothing to disable if the script never loaded */ }
  }

  function signOut() {
    disableGoogleAutoSelect();
    clearStoredAuth();
  }

  /* ==========================================================================
     Shared nav account control
     --------------------------------------------------------------------------
     Rendered into `#nav-account` on every page that has a header, so the icon
     does not vanish when navigating between them. It paints the signed-out
     state immediately, upgrades optimistically from the stored profile, then
     reconciles against the API — the control is always present, never a gap
     that appears once a request settles.
     ========================================================================== */

  /** The current page as a `next=` target login.html will accept. */
  function currentPageTarget() {
    var file = global.location.pathname.split('/').pop() || 'index.html';
    if (!/\.html$/i.test(file)) file = 'index.html';
    return file + global.location.hash;
  }

  function buildSignedOut() {
    var a = document.createElement('a');
    a.className = 'nav-cta nav-account-btn';
    a.id = 'nav-btn-signin';
    a.href = 'login.html?next=' + encodeURIComponent(currentPageTarget());
    a.title = 'Sign in';
    a.setAttribute('aria-label', 'Sign in');
    a.innerHTML = '<i class="fa-solid fa-user"></i>';
    return a;
  }

  function buildSignedIn(user) {
    var wrap = document.createElement('div');
    wrap.className = 'nav-account';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-account-btn nav-account-avatar';
    btn.id = 'nav-btn-account';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.title = user.email || 'Account';
    btn.setAttribute('aria-label', 'Account menu');

    if (user.picture) {
      var img = document.createElement('img');
      img.src = user.picture;
      img.alt = '';
      btn.appendChild(img);
    } else {
      btn.textContent = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
    }

    var menu = document.createElement('div');
    menu.className = 'nav-account-menu';
    menu.innerHTML =
      '<div class="nav-account-head">' +
        '<div class="nav-account-name"></div>' +
        '<div class="nav-account-email"></div>' +
        '<span class="nav-account-tier"></span>' +
      '</div>' +
      '<a href="pro.html"><i class="fa-solid fa-star"></i> PhysBox Pro</a>' +
      '<a href="download.html"><i class="fa-solid fa-download"></i> Downloads</a>' +
      '<button type="button" class="nav-account-signout"><i class="fa-solid fa-arrow-right-from-bracket"></i> Sign out</button>';

    // textContent rather than interpolation: name and email are server data,
    // but they are still user-controlled strings and have no business being
    // parsed as HTML.
    menu.querySelector('.nav-account-name').textContent = user.name || 'PhysBox account';
    menu.querySelector('.nav-account-email').textContent = user.email || '';
    menu.querySelector('.nav-account-tier').textContent =
      user.subscription_tier === 'active' ? 'Pro' : 'Early Access';

    function close() {
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = wrap.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    menu.querySelector('.nav-account-signout').addEventListener('click', function () {
      signOut();
      global.location.reload();
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    return wrap;
  }

  function mountAccountMenu() {
    var slot = document.getElementById('nav-account');
    if (!slot) return;

    function paint(user) {
      slot.replaceChildren(user ? buildSignedIn(user) : buildSignedOut());
    }

    paint(getStoredUser());
    if (!getStoredAuthToken()) return;
    // Reconcile: a revoked or expired token drops back to the signed-out icon.
    fetchCurrentUser().then(paint).catch(function () { paint(null); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAccountMenu);
  } else {
    mountAccountMenu();
  }

  global.PhysBoxAuth = {
    GOOGLE_CLIENT_ID: GOOGLE_CLIENT_ID,
    getApiBaseUrl: getApiBaseUrl,
    getStoredAuthToken: getStoredAuthToken,
    getStoredUser: getStoredUser,
    setStoredAuth: setStoredAuth,
    clearStoredAuth: clearStoredAuth,
    loginWithGoogle: loginWithGoogle,
    fetchCurrentUser: fetchCurrentUser,
    loadGoogleIdentity: loadGoogleIdentity,
    renderGoogleSignInButton: renderGoogleSignInButton,
    disableGoogleAutoSelect: disableGoogleAutoSelect,
    signOut: signOut,
    mountAccountMenu: mountAccountMenu,
    currentPageTarget: currentPageTarget
  };
})(window);
