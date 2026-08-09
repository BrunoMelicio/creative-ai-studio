(() => {
  const config = window.STUDIO_SUPABASE_CONFIG;
  const api = window.supabase;
  if (!config?.url || !config?.publishableKey || !api?.createClient) {
    document.querySelector('[data-auth-status]')?.replaceChildren(document.createTextNode('Authentication could not be loaded. Please refresh the page.'));
    return;
  }

  const client = api.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.studioAuth = client;
  window.BraidsAuth = {
    client,
    config,
    async getVerifiedUser() {
      const { data, error } = await client.auth.getUser();
      return { user: data?.user || null, error };
    }
  };

  const params = new URLSearchParams(location.search);
  const localPreview = ['localhost', '127.0.0.1'].includes(location.hostname) && params.get('preview') === '1';
  const requestedNext = params.get('next');
  const safeNext = requestedNext && /^[a-z0-9_-]+\.html(?:[?#].*)?$/i.test(requestedNext) ? requestedNext : 'create.html';
  const status = document.querySelector('[data-auth-status]');

  const showStatus = (message, type = 'info') => {
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
    status.hidden = false;
  };
  const setBusy = (form, busy) => {
    const button = form?.querySelector('[type="submit"]');
    if (!button) return;
    button.disabled = busy;
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.textContent = busy ? 'Please wait…' : button.dataset.label;
  };
  const redirectTo = (page) => { location.href = page; };
  const isAdmin = (user) => user?.app_metadata?.role === 'admin';
  const updateAccountUI = (user, profile = null) => {
    const signedIn = Boolean(user?.email);
    document.querySelectorAll('[data-auth-link]').forEach((link) => {
      link.textContent = signedIn ? 'Account' : 'Log in';
      link.href = signedIn ? 'profile.html' : 'login.html';
    });
    const label = profile?.display_name || user?.user_metadata?.display_name || user?.email || 'Account';
    document.querySelectorAll('[data-account-email]').forEach((node) => { node.textContent = label; });
    document.querySelectorAll('[data-account-button]').forEach((node) => { node.textContent = signedIn ? 'Account' : 'Log in'; });
    document.querySelectorAll('[data-admin-link]').forEach((node) => { node.hidden = !isAdmin(user); });
  };

  document.querySelectorAll('[data-auth-tab]').forEach((tab) => tab.addEventListener('click', () => {
    const signup = tab.dataset.authTab === 'signup';
    document.querySelector('[data-login-form]').hidden = signup;
    document.querySelector('[data-signup-form]').hidden = !signup;
    document.querySelector('[data-forgot-form]').hidden = true;
    document.querySelectorAll('[data-auth-tab]').forEach((item) => item.classList.toggle('is-active', item === tab));
    if (status) status.hidden = true;
  }));

  document.querySelector('[data-forgot-password]')?.addEventListener('click', () => {
    document.querySelector('[data-login-form]').hidden = true;
    document.querySelector('[data-signup-form]').hidden = true;
    document.querySelector('[data-forgot-form]').hidden = false;
    if (status) status.hidden = true;
  });
  document.querySelector('[data-back-login]')?.addEventListener('click', () => document.querySelector('[data-auth-tab="login"]')?.click());

  document.querySelector('[data-login-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(form, true);
    const { error } = await client.auth.signInWithPassword({ email: String(data.get('email')).trim(), password: String(data.get('password')) });
    setBusy(form, false);
    if (error) return showStatus(error.message, 'error');
    showStatus('Login successful. Opening Braids…', 'success');
    window.setTimeout(() => redirectTo(safeNext), 350);
  });

  document.querySelector('[data-signup-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email')).trim();
    const password = String(data.get('password'));
    if (password !== String(data.get('confirm'))) return showStatus('The passwords do not match.', 'error');
    setBusy(form, true);
    const { data: result, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: String(data.get('name')).trim() },
        emailRedirectTo: new URL(`login.html?confirmed=1&next=${encodeURIComponent(safeNext)}`, location.href).href
      }
    });
    setBusy(form, false);
    if (error) return showStatus(error.message, 'error');
    if (result.session) {
      showStatus('Account created. Opening Braids…', 'success');
      return window.setTimeout(() => redirectTo(safeNext), 350);
    }
    showStatus(`Check ${email} for the confirmation link, then log in.`, 'success');
  });

  document.querySelector('[data-forgot-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(form, true);
    const { error } = await client.auth.resetPasswordForEmail(String(data.get('email')).trim(), { redirectTo: new URL('reset-password.html', location.href).href });
    setBusy(form, false);
    if (error) return showStatus(error.message, 'error');
    showStatus('Password reset link sent. Check your email.', 'success');
  });

  document.querySelector('[data-reset-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get('password') !== data.get('confirm')) return showStatus('The passwords do not match.', 'error');
    setBusy(form, true);
    const { error } = await client.auth.updateUser({ password: String(data.get('password')) });
    setBusy(form, false);
    if (error) return showStatus(error.message, 'error');
    showStatus('Password updated. Returning to your profile…', 'success');
    window.setTimeout(() => redirectTo('profile.html'), 650);
  });

  document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    await client.auth.signOut({ scope: 'local' });
    redirectTo('index.html');
  }));

  const initialize = async () => {
    const { user, error } = await window.BraidsAuth.getVerifiedUser();
    let profile = null;
    if (user) {
      const result = await client.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
      profile = result.data;
    }
    updateAccountUI(user, profile);

    if (document.body.dataset.authRequired === 'true' && (!user || error) && !localPreview) {
      redirectTo(`login.html?next=${encodeURIComponent(location.pathname.split('/').pop() || 'create.html')}`);
      return;
    }
    if (document.body.dataset.adminRequired === 'true' && user && !isAdmin(user) && !localPreview) {
      redirectTo('profile.html?notice=admin');
      return;
    }
    if (document.body.dataset.page === 'login' && user && !params.has('confirmed')) redirectTo(safeNext);
    if (params.has('confirmed')) showStatus('Email confirmed. You can now log in.', 'success');
  };

  client.auth.onAuthStateChange((_event, session) => updateAccountUI(session?.user || null));
  initialize();
})();
