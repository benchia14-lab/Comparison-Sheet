/* Shows the app only to a signed-in Axis Microsoft account; anyone else is sent to /login.html.
   Loaded in <head> after msal-browser.min.js and app-config.js. */
(() => {
  const root = document.documentElement;
  const style = document.createElement('style');
  style.textContent = 'html.auth-pending body{visibility:hidden}';
  document.head.appendChild(style);
  root.classList.add('auth-pending');

  // MSAL returns sign-in results to this page inside its popup or hidden iframe.
  // Leave those alone so the opening page can read the response.
  const authResponse = /(^|[#&?])(code|error)=/.test(location.hash.slice(1) + '&' + location.search.slice(1));
  if (authResponse || window.opener || window.parent !== window) return;

  const toLogin = () => location.replace('/login.html?signin=required');
  let msalApp;
  try { msalApp = new msal.PublicClientApplication(MSAL_CONFIG); } catch (err) { toLogin(); return; }
  const account = msalApp.getAllAccounts()[0];
  if (!account) { toLogin(); return; }

  window.quoteLineSignOut = async () => {
    // Clears this app's session without signing the user out of Microsoft everywhere.
    await msalApp.logoutRedirect({ account, onRedirectNavigate: () => false });
    location.replace('/login.html?signin=required');
  };

  msalApp.acquireTokenSilent({ scopes: LOGIN_SCOPES, account }).then(() => {
    const show = () => {
      const user = document.querySelector('.side-user');
      const avatar = document.querySelector('.avatar');
      if (user) {
        user.textContent = account.name || account.username;
        const detail = document.createElement('small');
        detail.textContent = account.username;
        user.appendChild(detail);
      }
      if (avatar) avatar.textContent = (account.name || account.username).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const bottom = document.querySelector('.side-bottom');
      if (bottom && !document.getElementById('signOutBtn')) {
        const button = document.createElement('button');
        button.id = 'signOutBtn';
        button.type = 'button';
        button.className = 'sign-out';
        button.textContent = 'Sign out';
        button.addEventListener('click', () => window.quoteLineSignOut());
        bottom.appendChild(button);
      }
      root.classList.remove('auth-pending');
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
  }).catch(toLogin);
})();
