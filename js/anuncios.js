// ============================================================
// anuncios.js — Gestión de anuncios (publicación y listado)
// ============================================================

/**
 * Inicializa la página pública de anuncios
 */
async function initPaginaAnuncios() {
  await inicializarSupabase();
  const sb = getSupabase();

  await cargarCategoriasFiltros();
  await cargarAnuncios();

  // Buscador
  const buscador = document.getElementById('buscador-anuncios');
  if (buscador) {
    let timeout;
    buscador.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => cargarAnuncios(), 400);
    });
  }
}

/**
 * Carga los filtros de categorías
 */
async function cargarCategoriasFiltros() {
  const sb = getSupabase();
  const { data: categorias } = await sb
    .from('categorias_anuncio')
    .select('*')
    .eq('activa', true)
    .order('nombre');

  const contenedor = document.getElementById('filtros-categorias');
  if (!contenedor || !categorias) return;

  // Botón "Todos"
  contenedor.innerHTML = `
    <button class="filtro-btn activo" data-cat="todos" onclick="filtrarCategoria('todos', this)">
      Todos
    </button>
  `;

  categorias.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filtro-btn';
    btn.setAttribute('data-cat', cat.id);
    btn.onclick = function() { filtrarCategoria(cat.id, this); };
    btn.innerHTML = `${cat.icono || ''} ${cat.nombre}`;
    contenedor.appendChild(btn);
  });
}

let categoriaActual = 'todos';

function filtrarCategoria(catId, btn) {
  categoriaActual = catId;
  document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('activo'));
  btn.classList.add('activo');
  cargarAnuncios();
}

/**
 * Carga los anuncios activos con filtros opcionales
 */
async function cargarAnuncios() {
  const sb = getSupabase();
  const contenedor = document.getElementById('anuncios-grid');
  if (!contenedor) return;

  contenedor.innerHTML = '<div class="loading-spinner" style="margin:2rem auto;"></div>';

  const buscador = document.getElementById('buscador-anuncios');
  const busqueda = buscador ? sanitizar(buscador.value) : '';

  let query = sb
    .from('anuncios')
    .select(`
      *,
      categorias_anuncio(nombre, icono),
      perfiles(nombre)
    `)
    .eq('estado', 'activo')
    .order('creado_en', { ascending: false });

  if (categoriaActual !== 'todos') {
    query = query.eq('categoria_id', categoriaActual);
  }

  if (busqueda) {
    query = query.or(`titulo.ilike.%${busqueda}%,descripcion.ilike.%${busqueda}%`);
  }

  const { data: anuncios, error } = await query;

  if (error) {
    contenedor.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⚠️</div>
        <h3>Error al cargar anuncios</h3>
        <p>Intentá recargar la página</p>
      </div>
    `;
    return;
  }

  if (!anuncios || anuncios.length === 0) {
    contenedor.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📋</div>
        <h3>No hay anuncios</h3>
        <p>${busqueda ? 'No se encontraron resultados para tu búsqueda.' : 'Sé el primero en publicar un anuncio.'}</p>
        <a href="/pages/dashboard.html" class="btn btn--primario">Publicar anuncio</a>
      </div>
    `;
    return;
  }

  contenedor.innerHTML = anuncios.map(a => renderAnuncioCard(a)).join('');
}

/**
 * Renderiza un card de anuncio
 */
function renderAnuncioCard(anuncio) {
  const cat = anuncio.categorias_anuncio;
  const contactos = [];

  if (anuncio.whatsapp) {
    const num = anuncio.whatsapp.replace(/\D/g, '');
    contactos.push(`<a href="https://wa.me/${num}" target="_blank" rel="noopener">💬 WhatsApp</a>`);
  }
  if (anuncio.telefono) {
    contactos.push(`<a href="tel:${anuncio.telefono}">📞 ${anuncio.telefono}</a>`);
  }
  if (anuncio.email) {
    contactos.push(`<a href="mailto:${anuncio.email}">✉️ Email</a>`);
  }

  const imagen = anuncio.imagen_url
    ? `<img src="${anuncio.imagen_url}" class="anuncio-card__img" alt="${anuncio.titulo}" loading="lazy">`
    : `<div class="anuncio-card__img">${cat?.icono || '📋'}</div>`;

  return `
    <div class="anuncio-card">
      ${imagen}
      <div class="anuncio-card__body">
        <div class="anuncio-card__categoria">${cat?.icono || ''} ${cat?.nombre || 'Servicio'}</div>
        <h3 class="anuncio-card__titulo">${escaparHTML(anuncio.titulo)}</h3>
        <p class="anuncio-card__desc">${escaparHTML(anuncio.descripcion)}</p>
        <div class="anuncio-card__contacto">
          ${contactos.join('')}
        </div>
      </div>
    </div>
  `;
}

/**
 * Inicializa el formulario de publicar anuncio (desde dashboard)
 */
async function initFormPublicarAnuncio() {
  await inicializarSupabase();
  const sb = getSupabase();
  const session = await requireAuth();
  if (!session) return;

  await cargarCategoriasSelect();
  await cargarPlanesSelect();
  await cargarPromocionActiva();

  const form = document.getElementById('form-anuncio');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const titulo = sanitizar(document.getElementById('anuncio-titulo').value);
    const descripcion = sanitizar(document.getElementById('anuncio-desc').value);
    const telefono = sanitizar(document.getElementById('anuncio-telefono').value);
    const whatsapp = sanitizar(document.getElementById('anuncio-whatsapp').value);
    const email = sanitizar(document.getElementById('anuncio-email').value);
    const categoriaId = document.getElementById('anuncio-categoria').value;
    const planId = document.querySelector('input[name="plan"]:checked')?.value;

    // Validaciones
    if (!titulo || titulo.length < 5) {
      mostrarToast('El título debe tener al menos 5 caracteres', 'error');
      return;
    }
    if (!descripcion || descripcion.length < 20) {
      mostrarToast('La descripción debe tener al menos 20 caracteres', 'error');
      return;
    }
    if (!categoriaId) {
      mostrarToast('Seleccioná una categoría', 'error');
      return;
    }
    if (!planId) {
      mostrarToast('Seleccioná un plan de publicación', 'error');
      return;
    }
    if (!telefono && !whatsapp && !email) {
      mostrarToast('Ingresá al menos un dato de contacto', 'error');
      return;
    }

    // Verificar email si está completo
    if (email && !validarEmail(email)) {
      mostrarToast('El email de contacto no es válido', 'error');
      return;
    }

    const btn = form.querySelector('[type="submit"]');
    setBtnLoading(btn, true);

    // Crear anuncio en estado pendiente (se activa tras el pago)
    const { data: anuncio, error } = await sb
      .from('anuncios')
      .insert({
        usuario_id: session.user.id,
        titulo,
        descripcion,
        telefono: telefono || null,
        whatsapp: whatsapp || null,
        email: email || null,
        categoria_id: categoriaId ? parseInt(categoriaId) : null,
        plan_id: planId ? parseInt(planId) : null,
        estado: 'pendiente'
      })
      .select()
      .single();

    if (error) {
      setBtnLoading(btn, false);
      mostrarToast('Error al crear el anuncio. Intentá nuevamente.', 'error');
      console.error(error);
      return;
    }

    // Iniciar pago con MercadoPago
    await iniciarPagoAnuncio(anuncio, parseInt(planId));
    setBtnLoading(btn, false);
  });
}

/**
 * Carga las categorías en el select del formulario
 */
async function cargarCategoriasSelect() {
  const sb = getSupabase();
  const { data: categorias } = await sb
    .from('categorias_anuncio')
    .select('*')
    .eq('activa', true)
    .order('nombre');

  const select = document.getElementById('anuncio-categoria');
  if (!select || !categorias) return;

  select.innerHTML = '<option value="">Seleccioná una categoría</option>';
  categorias.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = `${cat.icono || ''} ${cat.nombre}`;
    select.appendChild(opt);
  });
}

/**
 * Carga los planes en el formulario
 */
async function cargarPlanesSelect() {
  const sb = getSupabase();
  const { data: planes } = await sb
    .from('planes_publicacion')
    .select('*')
    .eq('activo', true)
    .order('duracion_dias');

  const contenedor = document.getElementById('planes-container');
  if (!contenedor || !planes) return;

  contenedor.innerHTML = planes.map((plan, idx) => `
    <label class="plan-card ${idx === 1 ? 'popular' : ''}" style="cursor:pointer;">
      ${idx === 1 ? '<span class="plan-card__badge">⭐ Popular</span>' : ''}
      <input type="radio" name="plan" value="${plan.id}" style="display:none;" ${idx === 0 ? 'checked' : ''}>
      <div class="plan-card__nombre">${plan.nombre}</div>
      <div class="plan-card__precio">${formatearPrecio(plan.precio)}</div>
      <div class="plan-card__precio-desc">por publicación</div>
      <div class="plan-card__duracion">${plan.descripcion}</div>
    </label>
  `).join('');

  // Marcar seleccionado visualmente
  contenedor.querySelectorAll('.plan-card').forEach(card => {
    const radio = card.querySelector('input[type="radio"]');
    if (radio) {
      if (radio.checked) card.classList.add('selected');
      radio.addEventListener('change', () => {
        contenedor.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
      card.addEventListener('click', () => {
        contenedor.querySelectorAll('input[type="radio"]').forEach(r => r.checked = false);
        radio.checked = true;
        radio.dispatchEvent(new Event('change'));
      });
    }
  });
}

/**
 * Carga y muestra la promoción activa si existe
 */
async function cargarPromocionActiva() {
  const sb = getSupabase();
  const ahora = new Date().toISOString();

  const { data: promo } = await sb
    .from('promociones')
    .select('*')
    .eq('activa', true)
    .lte('fecha_inicio', ahora)
    .gte('fecha_fin', ahora)
    .order('descuento_porcentaje', { ascending: false })
    .limit(1)
    .maybeSingle();

  const contenedor = document.getElementById('promo-container');
  if (!contenedor) return;

  if (promo) {
    contenedor.innerHTML = `
      <div class="alerta alerta--advertencia" style="margin-bottom:1rem;">
        🎁 <strong>Promoción activa:</strong> ${escaparHTML(promo.titulo)} —
        ${promo.descuento_porcentaje}% de descuento. Válida hasta ${formatearFecha(promo.fecha_fin)}.
      </div>
    `;
    contenedor.style.display = 'block';
  }
}

/**
 * Carga los anuncios del usuario actual (para dashboard)
 */
async function cargarMisAnuncios() {
  await inicializarSupabase();
  const sb = getSupabase();
  const session = await requireAuth();
  if (!session) return;

  const contenedor = document.getElementById('mis-anuncios-grid');
  if (!contenedor) return;

  contenedor.innerHTML = '<div class="loading-spinner" style="margin:2rem auto;"></div>';

  const { data: anuncios, error } = await sb
    .from('anuncios')
    .select('*, categorias_anuncio(nombre, icono), planes_publicacion(nombre, tipo)')
    .eq('usuario_id', session.user.id)
    .order('creado_en', { ascending: false });

  if (error || !anuncios) {
    contenedor.innerHTML = `<p style="color:var(--gris-400);">Error al cargar anuncios.</p>`;
    return;
  }

  // Mostrar alertas de vencimiento próximo
  const alerta = document.getElementById('alerta-vencimiento');
  if (alerta) {
    const proximos = anuncios.filter(a => {
      const dias = diasHastaVencimiento(a.fecha_vencimiento);
      return a.estado === 'activo' && dias >= 0 && dias <= 3;
    });

    if (proximos.length > 0) {
      alerta.innerHTML = proximos.map(a => `
        <div class="vence-pronto">
          <div class="vence-pronto__icon">⚠️</div>
          <div class="vence-pronto__content">
            <h4>Vencimiento próximo</h4>
            <p>"${escaparHTML(a.titulo)}" vence en ${diasHastaVencimiento(a.fecha_vencimiento)} días</p>
          </div>
          <button class="btn btn--sm btn--primario" onclick="renovarAnuncio('${a.id}')">Renovar</button>
        </div>
      `).join('');
      alerta.style.display = 'block';
    }
  }

  if (anuncios.length === 0) {
    contenedor.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📋</div>
        <h3>No tenés anuncios publicados</h3>
        <p>Publicá tu primer anuncio y llegá a todos los vecinos del barrio.</p>
        <button class="btn btn--primario" onclick="mostrarSeccion('publicar')">Publicar anuncio</button>
      </div>
    `;
    return;
  }

  contenedor.innerHTML = anuncios.map(a => renderMiAnuncioCard(a)).join('');
}

/**
 * Renderiza card de anuncio propio (dashboard)
 */
function renderMiAnuncioCard(anuncio) {
  const cat = anuncio.categorias_anuncio;
  const plan = anuncio.planes_publicacion;
  const dias = diasHastaVencimiento(anuncio.fecha_vencimiento);
  const estadoBadge = renderBadgeEstado(anuncio.estado);

  return `
    <div class="mis-anuncio-card">
      <div class="mis-anuncio-card__header">
        <span class="anuncio-card__categoria">${cat?.icono || ''} ${cat?.nombre || '-'}</span>
        ${estadoBadge}
      </div>
      <div class="mis-anuncio-card__body">
        <div class="mis-anuncio-card__titulo">${escaparHTML(anuncio.titulo)}</div>
        <div class="mis-anuncio-card__desc">${escaparHTML(anuncio.descripcion)}</div>
        <div class="mis-anuncio-card__meta">
          ${plan ? `<span>📦 Plan: ${plan.nombre}</span>` : ''}
          ${anuncio.fecha_inicio ? `<span>📅 Inicio: ${formatearFecha(anuncio.fecha_inicio)}</span>` : ''}
          ${anuncio.fecha_vencimiento ? `
            <span ${dias <= 3 && dias >= 0 ? 'style="color:var(--amarillo);font-weight:600;"' : ''}>
              ⏱ Vence: ${formatearFecha(anuncio.fecha_vencimiento)}
              ${dias >= 0 ? `(${dias} días)` : '<strong style="color:var(--rojo)">Vencido</strong>'}
            </span>
          ` : ''}
        </div>
      </div>
      <div class="mis-anuncio-card__actions">
        ${anuncio.estado === 'activo' || anuncio.estado === 'vencido'
          ? `<button class="btn btn--sm btn--primario" onclick="renovarAnuncio('${anuncio.id}')">🔄 Renovar</button>`
          : ''}
        <button class="btn btn--sm btn--ghost" onclick="editarAnuncio('${anuncio.id}')">✏️ Editar</button>
        <button class="btn btn--sm btn--peligro" onclick="eliminarAnuncio('${anuncio.id}')">🗑 Eliminar</button>
      </div>
    </div>
  `;
}

function renderBadgeEstado(estado) {
  const etiquetas = {
    activo: 'Activo', pendiente: 'Pendiente', vencido: 'Vencido', pausado: 'Pausado'
  };
  return `<span class="badge badge--${estado}">${etiquetas[estado] || estado}</span>`;
}

/**
 * Elimina un anuncio del usuario
 */
async function eliminarAnuncio(anuncioId) {
  if (!confirm('¿Seguro que querés eliminar este anuncio?')) return;

  const sb = getSupabase();
  const { error } = await sb
    .from('anuncios')
    .delete()
    .eq('id', anuncioId);

  if (error) {
    mostrarToast('Error al eliminar el anuncio', 'error');
    return;
  }

  mostrarToast('Anuncio eliminado', 'exito');
  await cargarMisAnuncios();
}

/**
 * Redirige al flujo de renovación (pago)
 */
async function renovarAnuncio(anuncioId) {
  // Abrir modal de renovación con selección de plan
  sessionStorage.setItem('renovar_anuncio_id', anuncioId);
  const modal = document.getElementById('modal-renovar');
  if (modal) {
    modal.classList.add('visible');
    await cargarPlanesSelect(); // Reusar la función de carga de planes
  } else {
    // Redirigir a la página de anuncios si no hay modal
    window.location.href = `/pages/anuncios.html?renovar=${anuncioId}`;
  }
}

/**
 * Escapa caracteres HTML para prevenir XSS
 */
function escaparHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Re-exportar validarEmail y setBtnLoading para usar en este módulo
// (definidas en auth.js, que se carga antes)
