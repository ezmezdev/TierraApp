// ============================================================
// auth.js — Lógica de autenticación (registro, login, logout)
// ============================================================

/**
 * Inicializa el formulario de LOGIN
 */
async function initLogin() {
  await inicializarSupabase();
  const sb = getSupabase();

  // Si ya tiene sesión, redirigir al dashboard
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    window.location.href = '/pages/dashboard.html';
    return;
  }

  const form = document.getElementById('form-login');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(form);

    const email = sanitizar(document.getElementById('email').value);
    const password = document.getElementById('password').value;

    // Validaciones básicas
    if (!email || !validarEmail(email)) {
      mostrarErrorCampo('email', 'Ingresá un email válido');
      return;
    }
    if (!password || password.length < 6) {
      mostrarErrorCampo('password', 'La contraseña debe tener al menos 6 caracteres');
      return;
    }

    const btn = form.querySelector('[type="submit"]');
    setBtnLoading(btn, true);

    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    setBtnLoading(btn, false);

    if (error) {
      const msg = traducirErrorAuth(error.message);
      mostrarAlerta('alerta-login', msg, 'error');
      return;
    }

    // Login exitoso
    mostrarToast('¡Bienvenido!', 'exito');
    window.location.href = '/pages/dashboard.html';
  });
}

/**
 * Inicializa el formulario de REGISTRO
 */
async function initRegistro() {
  await inicializarSupabase();
  const sb = getSupabase();

  // Si ya tiene sesión, redirigir
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    window.location.href = '/pages/dashboard.html';
    return;
  }

  const form = document.getElementById('form-registro');
  if (!form) return;

  // Toggle visibilidad de contraseña
  initTogglePassword();

  // Indicador de fortaleza de contraseña
  const passwordInput = document.getElementById('password');
  if (passwordInput) {
    passwordInput.addEventListener('input', () => {
      actualizarFortalezaPassword(passwordInput.value);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(form);

    const nombre = sanitizar(document.getElementById('nombre').value);
    const email = sanitizar(document.getElementById('email').value);
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const numeroLote = sanitizar(document.getElementById('numero-lote').value);

    // Validaciones
    let valido = true;

    if (!nombre || nombre.length < 2) {
      mostrarErrorCampo('nombre', 'Ingresá tu nombre completo');
      valido = false;
    }
    if (!email || !validarEmail(email)) {
      mostrarErrorCampo('email', 'Ingresá un email válido');
      valido = false;
    }
    if (!password || password.length < 8) {
      mostrarErrorCampo('password', 'La contraseña debe tener al menos 8 caracteres');
      valido = false;
    }
    if (password !== confirmPassword) {
      mostrarErrorCampo('confirm-password', 'Las contraseñas no coinciden');
      valido = false;
    }
    if (!numeroLote || numeroLote.trim() === '') {
      mostrarErrorCampo('numero-lote', 'Ingresá tu número de lote');
      valido = false;
    }

    if (!valido) return;

    const btn = form.querySelector('[type="submit"]');
    setBtnLoading(btn, true);

    // Verificar si el lote ya existe (antes de registrar)
    const { data: loteExistente } = await sb
      .from('perfiles')
      .select('id')
      .eq('numero_lote', numeroLote)
      .maybeSingle();

    if (loteExistente) {
      setBtnLoading(btn, false);
      mostrarErrorCampo('numero-lote', 'Este número de lote ya está registrado. Si creés que es un error, contactá al administrador.');
      return;
    }

    // Registrar usuario en Supabase Auth
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          nombre,
          numero_lote: numeroLote
        }
      }
    });

    setBtnLoading(btn, false);

    if (error) {
      const msg = traducirErrorAuth(error.message);
      mostrarAlerta('alerta-registro', msg, 'error');
      return;
    }

    // Registro exitoso
    if (data.session) {
      // Si no requiere confirmación de email
      mostrarToast('¡Cuenta creada!', 'exito');
      window.location.href = '/pages/dashboard.html';
    } else {
      // Si requiere confirmación de email
      mostrarAlerta(
        'alerta-registro',
        '¡Cuenta creada! Revisá tu email para confirmar tu cuenta antes de ingresar.',
        'exito'
      );
      form.reset();
    }
  });
}

/**
 * Maneja el cierre de sesión
 */
async function cerrarSesion() {
  const sb = getSupabase();
  await sb.auth.signOut();
  window.location.href = '/pages/login.html';
}

/**
 * Inicializa el navbar con info del usuario
 */
async function initNavbarConUsuario() {
  await inicializarSupabase();
  initNavbar();

  const perfil = await obtenerPerfilActual();
  if (!perfil) return;

  // Mostrar nombre en navbar
  const nombreEl = document.querySelector('.navbar__user-name');
  if (nombreEl) {
    nombreEl.textContent = perfil.nombre.split(' ')[0]; // Solo primer nombre
  }

  // Mostrar enlace admin si corresponde
  const adminLink = document.querySelector('.navbar__admin-link');
  if (adminLink && perfil.rol === 'admin') {
    adminLink.style.display = 'flex';
  }

  // Botón logout
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', cerrarSesion);
  }
}

// ============================================================
// Helpers de UI para formularios
// ============================================================

function mostrarErrorCampo(campoId, mensaje) {
  const campo = document.getElementById(campoId);
  if (!campo) return;
  campo.classList.add('error');
  const errorEl = campo.parentElement.querySelector('.form-error');
  if (errorEl) {
    errorEl.textContent = mensaje;
    errorEl.classList.add('visible');
  }
}

function limpiarErrores(form) {
  form.querySelectorAll('.form-error').forEach(el => {
    el.classList.remove('visible');
    el.textContent = '';
  });
  form.querySelectorAll('.error').forEach(el => {
    el.classList.remove('error');
  });
}

function mostrarAlerta(contenedorId, mensaje, tipo) {
  const el = document.getElementById(contenedorId);
  if (!el) return;
  const iconos = { exito: '✓', error: '⚠', advertencia: '⚠', info: 'ℹ' };
  el.className = `alerta alerta--${tipo}`;
  el.innerHTML = `<span>${iconos[tipo] || 'ℹ'}</span><span>${mensaje}</span>`;
  el.style.display = 'flex';
}

function setBtnLoading(btn, loading) {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.classList.add('btn--loading');
  } else {
    btn.classList.remove('btn--loading');
  }
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function traducirErrorAuth(msg) {
  const errores = {
    'Invalid login credentials': 'Email o contraseña incorrectos.',
    'Email not confirmed': 'Debés confirmar tu email antes de ingresar.',
    'User already registered': 'Este email ya está registrado.',
    'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
    'Unable to validate email address: invalid format': 'El formato del email no es válido.',
    'signup_disabled': 'El registro está temporalmente deshabilitado.',
  };
  return errores[msg] || 'Ocurrió un error. Intentá nuevamente.';
}

function actualizarFortalezaPassword(password) {
  const strengthEl = document.querySelector('.password-strength');
  const fill = document.querySelector('.password-strength__fill');
  const label = document.querySelector('.password-strength__label');

  if (!strengthEl || !fill || !label) return;

  if (!password) {
    strengthEl.classList.remove('visible');
    return;
  }

  strengthEl.classList.add('visible');

  let strength = 0;
  if (password.length >= 8) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;

  fill.setAttribute('data-strength', strength);

  const labels = ['', 'Débil', 'Regular', 'Buena', 'Muy fuerte'];
  label.textContent = labels[strength] || '';
}

function initTogglePassword() {
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;
      const esTexto = input.type === 'text';
      input.type = esTexto ? 'password' : 'text';
      btn.textContent = esTexto ? '👁' : '🙈';
    });
  });
}
