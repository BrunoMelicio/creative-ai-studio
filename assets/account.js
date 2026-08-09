(() => {
  const auth = window.BraidsAuth;
  if (!auth?.client) return;
  const { client, config } = auth;

  const status = document.querySelector('[data-account-status]');
  const showStatus = (message, type = 'info') => {
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
    status.hidden = false;
    status.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const setBusy = (button, busy, busyLabel = 'Saving…') => {
    if (!button) return;
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? busyLabel : button.dataset.label;
  };
  const formatDate = (value) => value ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value)) : 'Never';
  const roleLabel = (user) => user?.app_metadata?.role === 'admin' ? 'Administrator' : 'Creator';

  const initializeProfile = async () => {
    const { user } = await auth.getVerifiedUser();
    if (!user) return;
    const { data: profile, error } = await client.from('profiles').select('display_name,username,bio,country,created_at').eq('id', user.id).single();
    if (error) return showStatus(error.message, 'error');

    const setValue = (name, value) => {
      const field = document.querySelector(`[name="${name}"]`);
      if (field) field.value = value || '';
    };
    setValue('display_name', profile.display_name);
    setValue('username', profile.username);
    setValue('bio', profile.bio);
    setValue('country', profile.country);
    setValue('email', user.email);
    document.querySelectorAll('[data-profile-name]').forEach((node) => { node.textContent = profile.display_name || user.email; });
    document.querySelectorAll('[data-profile-email]').forEach((node) => { node.textContent = user.email || ''; });
    document.querySelectorAll('[data-profile-role]').forEach((node) => { node.textContent = roleLabel(user); });
    document.querySelectorAll('[data-profile-created]').forEach((node) => { node.textContent = formatDate(profile.created_at || user.created_at); });

    document.querySelector('[data-profile-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('[type="submit"]');
      const data = new FormData(form);
      setBusy(button, true);
      const { error: updateError } = await client.from('profiles').update({
        display_name: String(data.get('display_name')).trim(),
        username: String(data.get('username')).trim().toLowerCase() || null,
        bio: String(data.get('bio')).trim() || null,
        country: String(data.get('country')).trim() || null
      }).eq('id', user.id);
      setBusy(button, false);
      if (updateError) return showStatus(updateError.code === '23505' ? 'That username is already in use.' : updateError.message, 'error');
      showStatus('Profile saved.', 'success');
      document.querySelectorAll('[data-profile-name]').forEach((node) => { node.textContent = String(data.get('display_name')).trim() || user.email; });
    });

    document.querySelector('[data-email-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('[type="submit"]');
      const email = String(new FormData(form).get('email')).trim();
      setBusy(button, true);
      const { error: emailError } = await client.auth.updateUser({ email }, { emailRedirectTo: new URL('profile.html?email=confirmed', location.href).href });
      setBusy(button, false);
      if (emailError) return showStatus(emailError.message, 'error');
      showStatus('Check your email to confirm the change.', 'success');
    });

    document.querySelector('[data-password-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('[type="submit"]');
      const data = new FormData(form);
      const password = String(data.get('password'));
      if (password !== String(data.get('confirm'))) return showStatus('The passwords do not match.', 'error');
      setBusy(button, true);
      const { error: passwordError } = await client.auth.updateUser({ password });
      setBusy(button, false);
      if (passwordError) return showStatus(passwordError.message, 'error');
      form.reset();
      showStatus('Password updated.', 'success');
    });

    document.querySelector('[data-logout-all]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      setBusy(button, true, 'Signing out…');
      const { error: logoutError } = await client.auth.signOut({ scope: 'global' });
      if (logoutError) {
        setBusy(button, false);
        return showStatus(logoutError.message, 'error');
      }
      location.href = 'login.html';
    });

    const deleteInput = document.querySelector('[data-delete-confirmation]');
    const deleteButton = document.querySelector('[data-delete-account]');
    deleteInput?.addEventListener('input', () => { deleteButton.disabled = deleteInput.value !== 'DELETE'; });
    deleteButton?.addEventListener('click', async () => {
      if (deleteInput.value !== 'DELETE' || !confirm('Permanently delete your Braids account and profile? This cannot be undone.')) return;
      setBusy(deleteButton, true, 'Deleting…');
      const { error: deleteError } = await client.functions.invoke('delete-account', { body: { confirmation: 'DELETE' } });
      if (deleteError) {
        setBusy(deleteButton, false);
        return showStatus(deleteError.message, 'error');
      }
      await client.auth.signOut({ scope: 'local' });
      location.href = 'index.html?account=deleted';
    });
  };

  const callAdmin = async (method = 'GET', body = null) => {
    const { data: { session } } = await client.auth.getSession();
    if (!session) throw new Error('Your session has expired. Please log in again.');
    const response = await fetch(`${config.url}/functions/v1/admin-users${method === 'GET' ? '?page=1&perPage=200' : ''}`, {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: config.publishableKey,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The request could not be completed.');
    return payload;
  };

  const initializeAdmin = async () => {
    const grid = document.querySelector('[data-user-list]');
    const search = document.querySelector('[data-user-search]');
    const filter = document.querySelector('[data-user-filter]');
    let users = [];

    const render = () => {
      const query = (search?.value || '').trim().toLowerCase();
      const mode = filter?.value || 'all';
      const visible = users.filter((user) => {
        const matchesQuery = !query || [user.email, user.display_name, user.username, user.country].some((value) => String(value || '').toLowerCase().includes(query));
        const matchesFilter = mode === 'all' || (mode === 'admin' && user.role === 'admin') || (mode === 'suspended' && user.suspended) || (mode === 'unconfirmed' && !user.confirmed);
        return matchesQuery && matchesFilter;
      });
      grid.replaceChildren();
      if (!visible.length) {
        const empty = document.createElement('p');
        empty.className = 'admin-empty';
        empty.textContent = users.length ? 'No users match this view.' : 'No accounts have been created yet.';
        grid.append(empty);
        return;
      }
      visible.forEach((user) => {
        const card = document.createElement('article');
        card.className = 'user-row';
        const identity = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = user.display_name || user.email || 'Unnamed creator';
        const email = document.createElement('span');
        email.textContent = user.email;
        identity.append(name, email);
        const joined = document.createElement('span');
        joined.textContent = formatDate(user.created_at);
        const last = document.createElement('span');
        last.textContent = formatDate(user.last_sign_in_at);
        const statusWrap = document.createElement('div');
        const statusPill = document.createElement('span');
        statusPill.className = `status-pill ${user.suspended ? 'is-suspended' : user.confirmed ? 'is-active' : 'is-pending'}`;
        statusPill.textContent = user.suspended ? 'Suspended' : user.confirmed ? 'Active' : 'Unconfirmed';
        const rolePill = document.createElement('span');
        rolePill.className = 'role-pill';
        rolePill.textContent = user.role;
        statusWrap.append(statusPill, rolePill);
        const actions = document.createElement('div');
        actions.className = 'user-actions';
        const menu = document.createElement('select');
        menu.setAttribute('aria-label', `Manage ${name.textContent}`);
        const choices = [
          ['', 'Manage…'],
          [user.suspended ? 'restore' : 'suspend', user.suspended ? 'Restore access' : 'Suspend access'],
          ['set-role', user.role === 'admin' ? 'Make creator' : 'Make admin'],
          ['delete', 'Delete account']
        ];
        choices.forEach(([value, label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; menu.append(option); });
        menu.addEventListener('change', async () => {
          const action = menu.value;
          menu.value = '';
          if (!action) return;
          const destructive = action === 'delete' || action === 'suspend';
          if (destructive && !confirm(`${action === 'delete' ? 'Permanently delete' : 'Suspend'} ${user.email}?`)) return;
          menu.disabled = true;
          try {
            await callAdmin('POST', { action, userId: user.id, ...(action === 'set-role' ? { role: user.role === 'admin' ? 'user' : 'admin' } : {}) });
            showStatus('User updated.', 'success');
            await load();
          } catch (error) {
            showStatus(error.message, 'error');
            menu.disabled = false;
          }
        });
        actions.append(menu);
        card.append(identity, joined, last, statusWrap, actions);
        grid.append(card);
      });
    };

    const updateStats = () => {
      const values = {
        total: users.length,
        active: users.filter((user) => user.confirmed && !user.suspended).length,
        pending: users.filter((user) => !user.confirmed).length,
        admin: users.filter((user) => user.role === 'admin').length
      };
      Object.entries(values).forEach(([key, value]) => { const node = document.querySelector(`[data-stat="${key}"]`); if (node) node.textContent = value; });
    };
    const load = async () => {
      grid.setAttribute('aria-busy', 'true');
      try {
        users = (await callAdmin()).users || [];
        updateStats();
        render();
      } catch (error) {
        showStatus(error.message, 'error');
      } finally {
        grid.removeAttribute('aria-busy');
      }
    };
    search?.addEventListener('input', render);
    filter?.addEventListener('change', render);
    await load();
  };

  const page = document.body.dataset.page;
  if (page === 'profile') initializeProfile();
  if (page === 'admin') initializeAdmin();
})();
