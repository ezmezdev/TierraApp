// ============================================================
// admin.js — Panel de administración global
// IMPORTANTE: Este módulo solo funciona si el usuario tiene rol 'admin'
// La verificación ocurre TANTO en frontend como en RLS de Supabase
// ============================================================

let adminSB = null;

/**
 * Inicializa el panel de administración
 */
async function initAdmin() {
  await inicializarSupabase();
  adminSB = getSupabase();

  // requireAdmin() verifica sesión Y rol en la base de datos
  const session = await requireAdmin();
  if (!session) return; // redirige automáticamente si no es admin

  // Actualizar nombre en header
  const perfil = await obtenerPerfilActual();
  const headerNombre = document.getElementById('admin-nombre');
  if (headerNombre && perfil) {
    headerNombre.textContent = perfil.nombre;
  }

  // Cargar stats del dashboard
  await cargarEstadisticasAdmin();

  // Inicializar tabs
  initTabsAdmin();

  // Cargar sección inicial
  await mostrarTabAdmin('usuarios');
}

/**
 * Inicializa la navegación por tabs del admin
 */
function initTabsAdmin() {
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const seccion = tab.getAttribute('data-seccion');
      mostrarTabAdmin(seccion);
    });
  });
}

/**
 * Muestra una sección del admin y carga sus datos
 */
async function mostrarTabAdmin(seccion) {
  // Actualizar tabs UI
  document.querySelectorAll('.admin-tab').forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-seccion') === seccion);
  });

  document.querySelectorAll('.admin-section').forEach(s => {
    s.classList.toggle('active', s.id === `admin-${seccion}`);
  });

  // Cargar datos de la sección
  switch (seccion) {
    case 'usuarios': await cargarUsuariosAdmin(); break;
    case 'anuncios': await cargarAnunciosAdmin(); break;
    case 'pagos': await cargarPagosAdmin(); break;
    case 'noticias': await cargarNoticiasAdmin(); break;
    case 'telefonos': await cargarTelefonosAdmin(); break;
    case 'promociones': await cargarPromocionesAdmin(); break;
  }
}

/**
 * Carga estadísticas generales para el dashboard admin
 */
async function cargarEstadisticasAdmin() {
  const [usuarios, anuncios, pagos, noticias] = await Promise.all([
    adminSB.from('perfiles').select('id', { count: 'exact', head: true }),
    adminSB.from('anuncios').select('id', { count: 'exact', head: true }).eq('estado', 'activo'),
    adminSB.from('pagos').select('monto').eq('estado', 'aprobado'),
    adminSB.from('noticias').select('id', { count: 'exact', head: true }).eq('publicada', true)
  ]);

  const totalRecaudado = pagos.data?.reduce((sum, p) => sum + (p.monto || 0), 0) || 0;

  actualizarStat('stat-usuarios', usuarios.count || 0);
  actualizarStat('stat-anuncios', anuncios.count || 0);
  actualizarStat('stat-recaudado', formatearPrecio(totalRecaudado));
  actualizarStat('stat-noticias', noticias.count || 0);
}

function actualizarStat(id, valor) {
  const el = document.getElementById(id);
  if (el) el.textContent = valor;
}

// ============================================================
// GESTIÓN DE USUARIOS
// ============================================================

async function cargarUsuariosAdmin() {
  const contenedor = document.getElementById('tabla-usuarios-body');
  if (!contenedor) return;

  const busqueda = sanitizar(document.getElementById('buscar-usuario')?.value || '');

  let query = adminSB
    .from('perfiles')
    .select('*')
    .order('creado_en', { ascending: false });

  if (busqueda) {
    query = query.or(`nombre.ilike.%${busqueda}%,email.ilike.%${busqueda}%,numero_lote.ilike.%${busqueda}%`);
  }

  const { data: usuarios, error } = await query;

  if (error || !usuarios) {
    contenedor.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--gris-400);">Error al cargar usuarios</td></tr>`;
    return;
  }

  if (usuarios.length === 0) {
    contenedor.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--gris-400);">No se encontraron usuarios</td></tr>`;
    return;
  }

  contenedor.innerHTML = usuarios.map(u => `
    <tr>
      <td>
        <strong>${escaparHTML(u.nombre)}</strong><br>
        <small style="color:var(--gris-400);">${escaparHTML(u.email)}</small>
      </td>
      <td>Lote ${escaparHTML(u.numero_lote)}</td>
      <td>${formatearFecha(u.creado_en)}</td>
      <td>
        ${u.rol === 'admin'
          ? '<span class="badge badge--admin">Admin</span>'
          : '<span class="badge badge--pausado">Usuario</span>'}
      </td>
      <td>
        <div class="acciones-cell">
          <button class="btn btn--sm btn--ghost" onclick="abrirEditarLote('${u.id}', '${escaparHTML(u.numero_lote)}', '${escaparHTML(u.nombre)}')">
            ✏️ Editar lote
          </button>
          ${u.rol !== 'admin'
            ? `<button class="btn btn--sm btn--secundario" onclick="cambiarRol('${u.id}', 'admin', '${escaparHTML(u.nombre)}')">
                👑 Hacer admin
               </button>`
            : `<button class="btn btn--sm btn--ghost" onclick="cambiarRol('${u.id}', 'usuario', '${escaparHTML(u.nombre)}')">
                👤 Quitar admin
               </button>`
          }
        </div>
      </td>
    </tr>
  `).join('');

  // Buscador en tiempo real
  const buscadorInput = document.getElementById('buscar-usuario');
  if (buscadorInput && !buscadorInput._bound) {
    buscadorInput._bound = true;
    let timeout;
    buscadorInput.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(cargarUsuariosAdmin, 350);
    });
  }
}

/**
 * Abre el modal para editar el número de lote de un usuario
 */
function abrirEditarLote(usuarioId, loteActual, nombre) {
  const modal = document.getElementById('modal-editar-lote');
  if (!modal) return;

  document.getElementById('edit-lote-usuario-id').value = usuarioId;
  document.getElementById('edit-lote-nombre').textContent = nombre;
  document.getElementById('edit-lote-valor').value = loteActual;
  modal.classList.add('visible');
}

/**
 * Guarda el nuevo número de lote
 */
async function guardarEditarLote() {
  const usuarioId = document.getElementById('edit-lote-usuario-id').value;
  const nuevoLote = sanitizar(document.getElementById('edit-lote-valor').value);

  if (!nuevoLote || nuevoLote.trim() === '') {
    mostrarToast('El número de lote no puede estar vacío', 'error');
    return;
  }

  // Verificar que el lote no esté en uso por otro usuario
  const { data: existente } = await adminSB
    .from('perfiles')
    .select('id')
    .eq('numero_lote', nuevoLote)
    .neq('id', usuarioId)
    .maybeSingle();

  if (existente) {
    mostrarToast('Ese número de lote ya está asignado a otro usuario', 'error');
    return;
  }

  const { error } = await adminSB
    .from('perfiles')
    .update({ numero_lote: nuevoLote })
    .eq('id', usuarioId);

  if (error) {
    mostrarToast('Error al actualizar el lote', 'error');
    return;
  }

  cerrarModal('modal-editar-lote');
  mostrarToast('Número de lote actualizado', 'exito');
  await cargarUsuariosAdmin();
}

/**
 * Cambia el rol de un usuario
 */
async function cambiarRol(usuarioId, nuevoRol, nombre) {
  const accion = nuevoRol === 'admin' ? 'dar rol de administrador' : 'quitar rol de administrador';
  if (!confirm(`¿Seguro que querés ${accion} a ${nombre}?`)) return;

  const { error } = await adminSB
    .from('perfiles')
    .update({ rol: nuevoRol })
    .eq('id', usuarioId);

  if (error) {
    mostrarToast('Error al cambiar el rol', 'error');
    return;
  }

  mostrarToast(`Rol actualizado correctamente`, 'exito');
  await cargarUsuariosAdmin();
}

// ============================================================
// GESTIÓN DE ANUNCIOS (admin)
// ============================================================

async function cargarAnunciosAdmin() {
  const contenedor = document.getElementById('tabla-anuncios-body');
  if (!contenedor) return;

  const filtroEstado = document.getElementById('filtro-estado-anuncio')?.value || '';

  let query = adminSB
    .from('anuncios')
    .select('*, perfiles(nombre, email), categorias_anuncio(nombre), planes_publicacion(nombre)')
    .order('creado_en', { ascending: false });

  if (filtroEstado) query = query.eq('estado', filtroEstado);

  const { data: anuncios, error } = await query;

  if (error || !anuncios) {
    contenedor.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--gris-400);">Error al cargar anuncios</td></tr>`;
    return;
  }

  if (anuncios.length === 0) {
    contenedor.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--gris-400);">No hay anuncios</td></tr>`;
    return;
  }

  contenedor.innerHTML = anuncios.map(a => `
    <tr>
      <td>
        <strong>${escaparHTML(a.titulo)}</strong><br>
        <small style="color:var(--gris-400);">${escaparHTML(a.categorias_anuncio?.nombre || '-')}</small>
      </td>
      <td>
        ${escaparHTML(a.perfiles?.nombre || '-')}<br>
        <small style="color:var(--gris-400);">${escaparHTML(a.perfiles?.email || '-')}</small>
      </td>
      <td>${escaparHTML(a.planes_publicacion?.nombre || '-')}</td>
      <td>${renderBadgeEstado(a.estado)}</td>
      <td>${a.fecha_vencimiento ? formatearFecha(a.fecha_vencimiento) : '-'}</td>
      <td>
        <div class="acciones-cell">
          ${a.estado !== 'activo'
            ? `<button class="btn btn--sm btn--primario" onclick="activarAnuncioAdmin('${a.id}')">✓ Activar</button>`
            : `<button class="btn btn--sm btn--ghost" onclick="cambiarEstadoAnuncioAdmin('${a.id}', 'pausado')">⏸ Pausar</button>`
          }
          <button class="btn btn--sm btn--peligro" onclick="eliminarAnuncioAdmin('${a.id}')">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');

  // Filtro select
  const filtroSelect = document.getElementById('filtro-estado-anuncio');
  if (filtroSelect && !filtroSelect._bound) {
    filtroSelect._bound = true;
    filtroSelect.addEventListener('change', cargarAnunciosAdmin);
  }
}

async function activarAnuncioAdmin(anuncioId) {
  // Activar anuncio sin pago (manual por admin)
  const { data: anuncio } = await adminSB
    .from('anuncios')
    .select('*, planes_publicacion(duracion_dias)')
    .eq('id', anuncioId)
    .single();

  const dias = anuncio?.planes_publicacion?.duracion_dias || 30;
  const ahora = new Date();
  const vencimiento = new Date(ahora);
  vencimiento.setDate(vencimiento.getDate() + dias);

  const { error } = await adminSB
    .from('anuncios')
    .update({
      estado: 'activo',
      fecha_inicio: ahora.toISOString(),
      fecha_vencimiento: vencimiento.toISOString()
    })
    .eq('id', anuncioId);

  if (error) {
    mostrarToast('Error al activar el anuncio', 'error');
    return;
  }

  mostrarToast('Anuncio activado', 'exito');
  await cargarAnunciosAdmin();
}

async function cambiarEstadoAnuncioAdmin(anuncioId, estado) {
  const { error } = await adminSB
    .from('anuncios')
    .update({ estado })
    .eq('id', anuncioId);

  if (error) {
    mostrarToast('Error al cambiar estado', 'error');
    return;
  }
  mostrarToast('Estado actualizado', 'exito');
  await cargarAnunciosAdmin();
}

async function eliminarAnuncioAdmin(anuncioId) {
  if (!confirm('¿Seguro que querés eliminar este anuncio?')) return;

  const { error } = await adminSB.from('anuncios').delete().eq('id', anuncioId);
  if (error) {
    mostrarToast('Error al eliminar', 'error');
    return;
  }
  mostrarToast('Anuncio eliminado', 'exito');
  await cargarAnunciosAdmin();
}

// ============================================================
// GESTIÓN DE PAGOS (admin)
// ============================================================

async function cargarPagosAdmin() {
  const contenedor = document.getElementById('tabla-pagos-body');
  if (!contenedor) return;

  const { data: pagos, error } = await adminSB
    .from('pagos')
    .select('*, perfiles(nombre, email), planes_publicacion(nombre), anuncios(titulo)')
    .order('creado_en', { ascending: false })
    .limit(100);

  if (error || !pagos) {
    contenedor.innerHTML = `<tr><td colspan="6">Error al cargar pagos</td></tr>`;
    return;
  }

  if (pagos.length === 0) {
    contenedor.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--gris-400);">Sin pagos registrados</td></tr>`;
    return;
  }

  contenedor.innerHTML = pagos.map(p => `
    <tr>
      <td>${formatearFecha(p.creado_en)}</td>
      <td>
        ${escaparHTML(p.perfiles?.nombre || '-')}<br>
        <small style="color:var(--gris-400);">${escaparHTML(p.perfiles?.email || '-')}</small>
      </td>
      <td>${escaparHTML(p.anuncios?.titulo || '-')}</td>
      <td>${escaparHTML(p.planes_publicacion?.nombre || '-')}</td>
      <td><strong>${formatearPrecio(p.monto)}</strong></td>
      <td>${renderBadgeEstadoPago(p.estado)}</td>
    </tr>
  `).join('');
}

// ============================================================
// GESTIÓN DE NOTICIAS (admin)
// ============================================================

let noticiaEditandoId = null;

async function cargarNoticiasAdmin() {
  const contenedor = document.getElementById('noticias-admin-lista');
  if (!contenedor) return;

  const { data: noticias, error } = await adminSB
    .from('noticias')
    .select('*, perfiles(nombre)')
    .order('creado_en', { ascending: false });

  if (error || !noticias || noticias.length === 0) {
    contenedor.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📰</div>
        <h3>Sin noticias</h3>
        <p>Creá la primera noticia del barrio</p>
      </div>
    `;
    return;
  }

  contenedor.innerHTML = noticias.map(n => `
    <div class="noticia-admin-card">
      <div class="noticia-admin-card__content">
        <div class="noticia-admin-card__titulo">${escaparHTML(n.titulo)}</div>
        <div class="noticia-admin-card__meta">
          ${formatearFecha(n.creado_en)} — ${n.publicada
            ? '<span style="color:var(--verde);">✓ Publicada</span>'
            : '<span style="color:var(--gris-400);">Borrador</span>'}
        </div>
      </div>
      <div class="noticia-admin-card__actions">
        <button class="btn btn--sm btn--ghost" onclick="editarNoticia('${n.id}')">✏️</button>
        <button class="btn btn--sm ${n.publicada ? 'btn--ghost' : 'btn--primario'}"
          onclick="togglePublicarNoticia('${n.id}', ${n.publicada})">
          ${n.publicada ? '📤 Ocultar' : '📢 Publicar'}
        </button>
        <button class="btn btn--sm btn--peligro" onclick="eliminarNoticia('${n.id}')">🗑</button>
      </div>
    </div>
  `).join('');
}

async function guardarNoticia() {
  const titulo = sanitizar(document.getElementById('noticia-titulo').value);
  const contenido = sanitizar(document.getElementById('noticia-contenido').value);
  const imagenUrl = sanitizar(document.getElementById('noticia-imagen').value);
  const publicada = document.getElementById('noticia-publicada')?.checked || false;

  if (!titulo || titulo.length < 3) {
    mostrarToast('El título debe tener al menos 3 caracteres', 'error');
    return;
  }
  if (!contenido || contenido.length < 20) {
    mostrarToast('El contenido debe tener al menos 20 caracteres', 'error');
    return;
  }

  const sb = adminSB;
  const { data: { session } } = await sb.auth.getSession();
  const payload = {
    titulo,
    contenido,
    imagen_url: imagenUrl || null,
    publicada,
    autor_id: session.user.id
  };

  let error;
  if (noticiaEditandoId) {
    ({ error } = await sb.from('noticias').update(payload).eq('id', noticiaEditandoId));
  } else {
    ({ error } = await sb.from('noticias').insert(payload));
  }

  if (error) {
    mostrarToast('Error al guardar la noticia', 'error');
    return;
  }

  mostrarToast(noticiaEditandoId ? 'Noticia actualizada' : 'Noticia creada', 'exito');
  noticiaEditandoId = null;
  limpiarFormNoticia();
  await cargarNoticiasAdmin();
}

async function editarNoticia(noticiaId) {
  const { data: noticia } = await adminSB
    .from('noticias').select('*').eq('id', noticiaId).single();

  if (!noticia) return;

  noticiaEditandoId = noticiaId;
  document.getElementById('noticia-titulo').value = noticia.titulo;
  document.getElementById('noticia-contenido').value = noticia.contenido;
  document.getElementById('noticia-imagen').value = noticia.imagen_url || '';
  if (document.getElementById('noticia-publicada')) {
    document.getElementById('noticia-publicada').checked = noticia.publicada;
  }

  document.getElementById('btn-guardar-noticia').textContent = '✓ Actualizar noticia';
  document.getElementById('noticia-titulo').scrollIntoView({ behavior: 'smooth' });
}

async function togglePublicarNoticia(noticiaId, publicadaActual) {
  const { error } = await adminSB
    .from('noticias')
    .update({ publicada: !publicadaActual })
    .eq('id', noticiaId);

  if (error) {
    mostrarToast('Error al cambiar estado', 'error');
    return;
  }
  mostrarToast(!publicadaActual ? 'Noticia publicada' : 'Noticia ocultada', 'exito');
  await cargarNoticiasAdmin();
}

async function eliminarNoticia(noticiaId) {
  if (!confirm('¿Eliminar esta noticia? Esta acción no se puede deshacer.')) return;

  const { error } = await adminSB.from('noticias').delete().eq('id', noticiaId);
  if (error) {
    mostrarToast('Error al eliminar', 'error');
    return;
  }
  mostrarToast('Noticia eliminada', 'exito');
  await cargarNoticiasAdmin();
}

function limpiarFormNoticia() {
  noticiaEditandoId = null;
  const form = document.getElementById('form-noticia');
  if (form) form.reset();
  const btn = document.getElementById('btn-guardar-noticia');
  if (btn) btn.textContent = '+ Crear noticia';
}

// ============================================================
// GESTIÓN DE TELÉFONOS ÚTILES (admin)
// ============================================================

async function cargarTelefonosAdmin() {
  const contenedor = document.getElementById('telefonos-admin-lista');
  if (!contenedor) return;

  const { data: telefonos } = await adminSB
    .from('telefonos_utiles')
    .select('*')
    .order('orden');

  if (!telefonos || telefonos.length === 0) {
    contenedor.innerHTML = `<p style="color:var(--gris-400);">Sin teléfonos cargados</p>`;
    return;
  }

  contenedor.innerHTML = telefonos.map(t => `
    <div class="telefono-admin-card">
      <div class="telefono-admin-card__info">
        <div class="telefono-admin-card__nombre">${escaparHTML(t.nombre)}</div>
        <div class="telefono-admin-card__tel">📞 ${escaparHTML(t.telefono)}</div>
        <div class="telefono-admin-card__cat">${escaparHTML(t.categoria)}</div>
      </div>
      <div class="acciones-cell">
        <button class="btn btn--sm btn--ghost" onclick="editarTelefono(${t.id})">✏️</button>
        <button class="btn btn--sm btn--peligro" onclick="eliminarTelefono(${t.id})">🗑</button>
      </div>
    </div>
  `).join('');
}

async function guardarTelefono() {
  const id = document.getElementById('tel-id').value;
  const nombre = sanitizar(document.getElementById('tel-nombre').value);
  const telefono = sanitizar(document.getElementById('tel-numero').value);
  const categoria = sanitizar(document.getElementById('tel-categoria').value);
  const descripcion = sanitizar(document.getElementById('tel-desc').value);

  if (!nombre || !telefono || !categoria) {
    mostrarToast('Nombre, teléfono y categoría son obligatorios', 'error');
    return;
  }

  const payload = { nombre, telefono, categoria, descripcion: descripcion || null };
  let error;

  if (id) {
    ({ error } = await adminSB.from('telefonos_utiles').update(payload).eq('id', parseInt(id)));
  } else {
    ({ error } = await adminSB.from('telefonos_utiles').insert(payload));
  }

  if (error) {
    mostrarToast('Error al guardar', 'error');
    return;
  }

  mostrarToast('Teléfono guardado', 'exito');
  limpiarFormTelefono();
  await cargarTelefonosAdmin();
}

async function editarTelefono(id) {
  const { data: tel } = await adminSB.from('telefonos_utiles').select('*').eq('id', id).single();
  if (!tel) return;

  document.getElementById('tel-id').value = tel.id;
  document.getElementById('tel-nombre').value = tel.nombre;
  document.getElementById('tel-numero').value = tel.telefono;
  document.getElementById('tel-categoria').value = tel.categoria;
  document.getElementById('tel-desc').value = tel.descripcion || '';
}

async function eliminarTelefono(id) {
  if (!confirm('¿Eliminar este teléfono?')) return;
  const { error } = await adminSB.from('telefonos_utiles').delete().eq('id', id);
  if (error) {
    mostrarToast('Error al eliminar', 'error');
    return;
  }
  mostrarToast('Teléfono eliminado', 'exito');
  await cargarTelefonosAdmin();
}

function limpiarFormTelefono() {
  ['tel-id','tel-nombre','tel-numero','tel-categoria','tel-desc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

// ============================================================
// GESTIÓN DE PROMOCIONES (admin)
// ============================================================

async function cargarPromocionesAdmin() {
  const contenedor = document.getElementById('promociones-lista');
  if (!contenedor) return;

  const { data: promos } = await adminSB
    .from('promociones')
    .select('*, planes_publicacion(nombre)')
    .order('fecha_inicio', { ascending: false });

  if (!promos || promos.length === 0) {
    contenedor.innerHTML = `<p style="color:var(--gris-400);">Sin promociones creadas</p>`;
    return;
  }

  const ahora = new Date();

  contenedor.innerHTML = promos.map(p => {
    const vigente = p.activa && new Date(p.fecha_inicio) <= ahora && new Date(p.fecha_fin) >= ahora;
    return `
      <div class="promo-card" style="${!vigente ? 'opacity:0.5;' : ''}">
        <div class="promo-card__descuento">${p.descuento_porcentaje}% OFF</div>
        <div class="promo-card__titulo">${escaparHTML(p.titulo)}</div>
        <div class="promo-card__vigencia">
          ${formatearFecha(p.fecha_inicio)} al ${formatearFecha(p.fecha_fin)}
          ${vigente ? ' — <strong style="color:var(--verde);">Activa</strong>' : ''}
          ${p.planes_publicacion ? ` — Solo plan ${p.planes_publicacion.nombre}` : ''}
        </div>
        <div style="margin-top:0.75rem;display:flex;gap:0.5rem;">
          <button class="btn btn--sm ${p.activa ? 'btn--ghost' : 'btn--primario'}"
            onclick="togglePromocion(${p.id}, ${p.activa})">
            ${p.activa ? '⏸ Desactivar' : '▶ Activar'}
          </button>
          <button class="btn btn--sm btn--peligro" onclick="eliminarPromocion(${p.id})">🗑</button>
        </div>
      </div>
    `;
  }).join('');
}

async function guardarPromocion() {
  const titulo = sanitizar(document.getElementById('promo-titulo').value);
  const descuento = parseInt(document.getElementById('promo-descuento').value);
  const fechaInicio = document.getElementById('promo-inicio').value;
  const fechaFin = document.getElementById('promo-fin').value;
  const planId = document.getElementById('promo-plan').value;

  if (!titulo || !descuento || !fechaInicio || !fechaFin) {
    mostrarToast('Completá todos los campos requeridos', 'error');
    return;
  }

  if (descuento < 1 || descuento > 100) {
    mostrarToast('El descuento debe ser entre 1% y 100%', 'error');
    return;
  }

  const { error } = await adminSB.from('promociones').insert({
    titulo,
    descuento_porcentaje: descuento,
    fecha_inicio: new Date(fechaInicio).toISOString(),
    fecha_fin: new Date(fechaFin).toISOString(),
    plan_id: planId ? parseInt(planId) : null,
    activa: true
  });

  if (error) {
    mostrarToast('Error al crear promoción', 'error');
    return;
  }

  mostrarToast('Promoción creada', 'exito');
  document.getElementById('form-promocion')?.reset();
  await cargarPromocionesAdmin();
}

async function togglePromocion(id, activa) {
  await adminSB.from('promociones').update({ activa: !activa }).eq('id', id);
  mostrarToast(!activa ? 'Promoción activada' : 'Promoción desactivada', 'exito');
  await cargarPromocionesAdmin();
}

async function eliminarPromocion(id) {
  if (!confirm('¿Eliminar esta promoción?')) return;
  await adminSB.from('promociones').delete().eq('id', id);
  mostrarToast('Promoción eliminada', 'exito');
  await cargarPromocionesAdmin();
}

// ============================================================
// Helpers
// ============================================================

function cerrarModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('visible');
}

// Cerrar modales al hacer click fuera
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('visible');
  }
});
