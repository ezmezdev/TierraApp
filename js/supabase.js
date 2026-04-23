// ============================================================
// supabase.js — Inicialización del cliente Supabase
// ============================================================

// Importar credenciales desde config.js (el usuario debe crearlo desde config.example.js)
// Las variables SUPABASE_URL, SUPABASE_ANON_KEY y MP_PUBLIC_KEY se cargan desde config.js

/**
 * Verifica que las variables de configuración existan
 * Muestra error claro si el usuario no configuró config.js
 */
function verificarConfig() {
  if (
    typeof SUPABASE_URL === 'undefined' ||
    SUPABASE_URL === 'TU_URL_DE_SUPABASE_AQUI' ||
    typeof SUPABASE_ANON_KEY === 'undefined' ||
    SUPABASE_ANON_KEY === 'TU_ANON_KEY_AQUI'
  ) {
    document.body.innerHTML = `
      <div style="
        display:flex;align-items:center;justify-content:center;
        min-height:100vh;background:#f9fafb;font-family:sans-serif;padding:2rem;
      ">
        <div style="
          background:white;border-radius:16px;padding:2.5rem;
          max-width:480px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.12);
          border:1px solid #e5e7eb;
        ">
          <div style="font-size:3rem;margin-bottom:1rem;">⚙️</div>
          <h2 style="color:#1f2937;margin-bottom:0.75rem;font-size:1.4rem;">Configuración requerida</h2>
          <p style="color:#6b7280;margin-bottom:1.25rem;font-size:0.9rem;line-height:1.6;">
            Para usar la plataforma, necesitás crear el archivo <code style="background:#f3f4f6;padding:0.1rem 0.4rem;border-radius:4px;">js/config.js</code>
            copiando el archivo <code style="background:#f3f4f6;padding:0.1rem 0.4rem;border-radius:4px;">config.example.js</code>
            y completando tus credenciales de Supabase y MercadoPago.
          </p>
          <div style="background:#f3f4f6;border-radius:8px;padding:1rem;text-align:left;font-size:0.8rem;font-family:monospace;color:#374151;">
            const SUPABASE_URL = "tu-url";<br>
            const SUPABASE_ANON_KEY = "tu-key";<br>
            const MP_PUBLIC_KEY = "tu-mp-key";
          </div>
        </div>
      </div>
    `;
    throw new Error('Config no configurada. Ver instrucciones en pantalla.');
  }
}

// Inicializar cliente Supabase usando la CDN de ESM
let supabaseClient = null;

async function inicializarSupabase() {
  verificarConfig();

  // Usar el cliente global si ya fue cargado por el CDN
  if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      }
    });
    return supabaseClient;
  }

  throw new Error('Supabase no cargado. Verificá la CDN en el HTML.');
}

/**
 * Retorna el cliente Supabase inicializado
 */
function getSupabase() {
  if (!supabaseClient) {
    throw new Error('Supabase no inicializado. Llamá a inicializarSupabase() primero.');
  }
  return supabaseClient;
}

/**
 * Sanitiza un string eliminando caracteres peligrosos
 * @param {string} str
 * @returns {string}
 */
function sanitizar(str) {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .replace(/[<>]/g, '') // eliminar tags HTML básicos
    .slice(0, 10000); // límite de longitud
}

/**
 * Sanitiza un objeto recursivamente
 * @param {Object} obj
 * @returns {Object}
 */
function sanitizarObjeto(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const resultado = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      resultado[key] = sanitizar(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      resultado[key] = value;
    } else if (value === null) {
      resultado[key] = null;
    }
  }
  return resultado;
}

/**
 * Formatea una fecha para mostrar al usuario
 * @param {string} fechaStr - ISO string
 * @returns {string}
 */
function formatearFecha(fechaStr) {
  if (!fechaStr) return '-';
  const fecha = new Date(fechaStr);
  return fecha.toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

/**
 * Formatea precio en pesos argentinos
 * @param {number} monto
 * @returns {string}
 */
function formatearPrecio(monto) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0
  }).format(monto);
}

/**
 * Calcula días hasta vencimiento
 * @param {string} fechaVencimiento
 * @returns {number} días (negativo si ya venció)
 */
function diasHastaVencimiento(fechaVencimiento) {
  if (!fechaVencimiento) return Infinity;
  const ahora = new Date();
  const vence = new Date(fechaVencimiento);
  const diffMs = vence - ahora;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Muestra un toast de notificación
 * @param {string} mensaje
 * @param {'exito'|'error'|'advertencia'|'info'} tipo
 * @param {number} duracion - ms
 */
function mostrarToast(mensaje, tipo = 'info', duracion = 4000) {
  const container = document.getElementById('toast-container') || crearToastContainer();
  const iconos = { exito: '✓', error: '✕', advertencia: '⚠', info: 'ℹ' };

  const toast = document.createElement('div');
  toast.className = `toast toast--${tipo}`;
  toast.innerHTML = `<span>${iconos[tipo] || 'ℹ'}</span><span>${mensaje}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'none';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duracion);
}

function crearToastContainer() {
  const div = document.createElement('div');
  div.id = 'toast-container';
  div.className = 'toast-container';
  document.body.appendChild(div);
  return div;
}

/**
 * Muestra/oculta el loading overlay global
 * @param {boolean} mostrar
 */
function toggleLoading(mostrar) {
  let overlay = document.getElementById('loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.className = 'loading-overlay';
    overlay.innerHTML = '<div class="loading-spinner"></div>';
    document.body.appendChild(overlay);
  }
  overlay.style.display = mostrar ? 'flex' : 'none';
}

/**
 * Redirige si no hay sesión activa
 * @param {string} redirectTo - URL de redirección si no está autenticado
 */
async function requireAuth(redirectTo = '/pages/login.html') {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = redirectTo;
    return null;
  }
  return session;
}

/**
 * Redirige si no es admin
 */
async function requireAdmin() {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = '/pages/login.html';
    return null;
  }

  const { data: perfil } = await sb
    .from('perfiles')
    .select('rol')
    .eq('id', session.user.id)
    .single();

  if (!perfil || perfil.rol !== 'admin') {
    // No es admin, redirigir al dashboard
    window.location.href = '/pages/dashboard.html';
    return null;
  }

  return session;
}

/**
 * Obtiene el perfil del usuario actual
 */
async function obtenerPerfilActual() {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;

  const { data, error } = await sb
    .from('perfiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (error) {
    console.error('Error obteniendo perfil:', error);
    return null;
  }
  return data;
}

/**
 * Inicializa el menú hamburguesa
 */
function initNavbar() {
  const hamburger = document.querySelector('.navbar__hamburger');
  const menu = document.querySelector('.navbar__menu');

  if (hamburger && menu) {
    hamburger.addEventListener('click', () => {
      menu.classList.toggle('open');
    });
  }

  // Marcar enlace activo
  const currentPath = window.location.pathname;
  document.querySelectorAll('.navbar__menu a').forEach(link => {
    if (link.getAttribute('href') && currentPath.includes(link.getAttribute('href'))) {
      link.classList.add('active');
    }
  });
}
