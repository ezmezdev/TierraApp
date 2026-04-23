// ============================================================
// pagos.js — Integración con MercadoPago
// ============================================================

/**
 * Inicia el proceso de pago para un anuncio
 * IMPORTANTE: La creación de la preference de MP debe hacerse
 * desde un backend/edge function por seguridad. Aquí se muestra
 * la integración frontend con MP Checkout Bricks.
 *
 * Para producción: crear una Supabase Edge Function que genere
 * la preference en el servidor y retorne el preference_id.
 * Nunca exponer el Access Token de MP en el frontend.
 *
 * @param {Object} anuncio - Datos del anuncio creado
 * @param {number} planId - ID del plan seleccionado
 */
async function iniciarPagoAnuncio(anuncio, planId) {
  const sb = getSupabase();

  // Obtener datos del plan
  const { data: plan } = await sb
    .from('planes_publicacion')
    .select('*')
    .eq('id', planId)
    .single();

  if (!plan) {
    mostrarToast('Error al obtener datos del plan', 'error');
    return;
  }

  // Verificar si hay promoción activa
  const precio = await calcularPrecioConPromocion(plan);

  // Mostrar modal de pago
  mostrarModalPago(anuncio, plan, precio);
}

/**
 * Calcula el precio con descuento si hay promoción activa
 */
async function calcularPrecioConPromocion(plan) {
  const sb = getSupabase();
  const ahora = new Date().toISOString();

  const { data: promo } = await sb
    .from('promociones')
    .select('*')
    .eq('activa', true)
    .or(`plan_id.is.null,plan_id.eq.${plan.id}`)
    .lte('fecha_inicio', ahora)
    .gte('fecha_fin', ahora)
    .order('descuento_porcentaje', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (promo && promo.descuento_porcentaje > 0) {
    const descuento = plan.precio * (promo.descuento_porcentaje / 100);
    return {
      original: plan.precio,
      final: plan.precio - descuento,
      descuento: promo.descuento_porcentaje,
      promoTitulo: promo.titulo
    };
  }

  return { original: plan.precio, final: plan.precio, descuento: 0 };
}

/**
 * Muestra el modal de confirmación de pago
 */
function mostrarModalPago(anuncio, plan, precio) {
  const modal = document.getElementById('modal-pago');
  const contenido = document.getElementById('modal-pago-contenido');

  if (!modal || !contenido) {
    // Fallback: redirigir a una página de pago dedicada
    sessionStorage.setItem('pago_data', JSON.stringify({ anuncio, plan, precio }));
    window.location.href = '/pages/pago.html';
    return;
  }

  const tieneDescuento = precio.descuento > 0;

  contenido.innerHTML = `
    <div style="margin-bottom:1.5rem;">
      <h3 style="margin-bottom:0.5rem;color:var(--azul);">Resumen de tu publicación</h3>
      <div style="background:var(--gris-50);border-radius:var(--radio-md);padding:1.1rem;border:1px solid var(--gris-200);">
        <div style="display:flex;justify-content:space-between;margin-bottom:0.5rem;">
          <span style="color:var(--gris-600);">Anuncio</span>
          <strong>${escaparHTML(anuncio.titulo)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:0.5rem;">
          <span style="color:var(--gris-600);">Plan</span>
          <strong>${plan.nombre} (${plan.duracion_dias} días)</strong>
        </div>
        ${tieneDescuento ? `
          <div style="display:flex;justify-content:space-between;margin-bottom:0.5rem;">
            <span style="color:var(--gris-600);">Precio original</span>
            <span style="text-decoration:line-through;color:var(--gris-400);">${formatearPrecio(precio.original)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:0.5rem;">
            <span style="color:var(--verde);">Descuento (${precio.promoTitulo})</span>
            <span style="color:var(--verde);font-weight:600;">-${precio.descuento}%</span>
          </div>
        ` : ''}
        <div style="display:flex;justify-content:space-between;padding-top:0.5rem;border-top:1px solid var(--gris-200);">
          <strong>Total a pagar</strong>
          <strong style="font-size:1.2rem;color:var(--verde);">${formatearPrecio(precio.final)}</strong>
        </div>
      </div>
    </div>
    <div id="mp-checkout-container">
      <!-- MercadoPago Checkout Bricks se monta aquí -->
    </div>
  `;

  modal.classList.add('visible');

  // Inicializar MercadoPago Checkout
  setTimeout(() => inicializarMPCheckout(anuncio, plan, precio), 100);
}

/**
 * Inicializa MercadoPago Checkout Bricks
 * IMPORTANTE: En producción, la preference_id debe generarse en el servidor.
 * Esta función asume que tenés una Supabase Edge Function en:
 * /functions/v1/crear-preferencia-mp
 */
async function inicializarMPCheckout(anuncio, plan, precio) {
  // Verificar que MP_PUBLIC_KEY esté configurado
  if (typeof MP_PUBLIC_KEY === 'undefined' || MP_PUBLIC_KEY === 'TU_PUBLIC_KEY_DE_MERCADOPAGO_AQUI') {
    document.getElementById('mp-checkout-container').innerHTML = `
      <div class="alerta alerta--advertencia">
        ⚠️ <strong>MercadoPago no configurado.</strong>
        Completá tu MP_PUBLIC_KEY en js/config.js para habilitar los pagos.
      </div>
      <div style="margin-top:1rem;text-align:center;">
        <p style="font-size:0.85rem;color:var(--gris-600);margin-bottom:1rem;">
          Para desarrollo, el anuncio quedará en estado "pendiente" hasta que configures los pagos.
        </p>
        <button class="btn btn--ghost" onclick="cerrarModalPago()">Cerrar</button>
      </div>
    `;
    return;
  }

  try {
    // 1. Generar referencia única para el pago
    const externalReference = `anuncio_${anuncio.id}_${Date.now()}`;

    // 2. Registrar pago pendiente en la base de datos
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();

    await sb.from('pagos').insert({
      usuario_id: session.user.id,
      anuncio_id: anuncio.id,
      plan_id: plan.id,
      monto: precio.final,
      moneda: 'ARS',
      estado: 'pendiente',
      mp_external_reference: externalReference
    });

    // 3. Crear preference en el servidor (Supabase Edge Function)
    // IMPORTANTE: Nunca crear la preference directamente en el frontend
    // porque requiere el Access Token de MP (secreto)
    const respuesta = await fetch(`${SUPABASE_URL}/functions/v1/crear-preferencia-mp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await sb.auth.getSession()).data.session?.access_token}`
      },
      body: JSON.stringify({
        titulo: `Publicación: ${anuncio.titulo}`,
        monto: precio.final,
        external_reference: externalReference,
        anuncio_id: anuncio.id
      })
    });

    if (!respuesta.ok) {
      throw new Error('Error al crear preferencia de pago');
    }

    const { preference_id } = await respuesta.json();

    // 4. Montar MP Checkout Bricks
    const mp = new MercadoPago(MP_PUBLIC_KEY, { locale: 'es-AR' });
    const bricks = mp.bricks();

    await bricks.create('wallet', 'mp-checkout-container', {
      initialization: {
        preferenceId: preference_id,
        redirectMode: 'modal',
      },
      callbacks: {
        onReady: () => {
          console.log('MP Checkout listo');
        },
        onError: (error) => {
          console.error('Error MP:', error);
          mostrarToast('Error al cargar el checkout. Intentá nuevamente.', 'error');
        }
      }
    });

  } catch (err) {
    console.error('Error iniciando pago:', err);
    document.getElementById('mp-checkout-container').innerHTML = `
      <div class="alerta alerta--error">
        ⚠️ Error al inicializar el sistema de pagos. Intentá nuevamente o contactá al administrador.
      </div>
      <div style="margin-top:1rem;text-align:center;">
        <button class="btn btn--ghost" onclick="cerrarModalPago()">Cerrar</button>
      </div>
    `;
  }
}

/**
 * Cierra el modal de pago
 */
function cerrarModalPago() {
  const modal = document.getElementById('modal-pago');
  if (modal) modal.classList.remove('visible');
}

/**
 * Maneja el retorno de MercadoPago (URL de éxito/fallo)
 * Se llama cuando MP redirige de vuelta a la app
 */
async function manejarRetornoMP() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('collection_status') || params.get('status');
  const externalRef = params.get('external_reference');
  const paymentId = params.get('collection_id') || params.get('payment_id');

  if (!status || !externalRef) return;

  await inicializarSupabase();
  const sb = getSupabase();

  // Actualizar estado del pago
  const estadoMap = {
    approved: 'aprobado',
    rejected: 'rechazado',
    pending: 'en_proceso',
    in_process: 'en_proceso'
  };

  const estadoPago = estadoMap[status] || 'pendiente';

  const { data: pago } = await sb
    .from('pagos')
    .update({
      estado: estadoPago,
      mp_payment_id: paymentId || null
    })
    .eq('mp_external_reference', externalRef)
    .select()
    .single();

  // Si el pago fue aprobado, activar el anuncio
  if (estadoPago === 'aprobado' && pago?.anuncio_id) {
    // Obtener duración del plan
    const { data: plan } = await sb
      .from('planes_publicacion')
      .select('duracion_dias')
      .eq('id', pago.plan_id)
      .single();

    const fechaInicio = new Date();
    const fechaVencimiento = new Date();
    if (plan) {
      fechaVencimiento.setDate(fechaVencimiento.getDate() + plan.duracion_dias);
    }

    await sb
      .from('anuncios')
      .update({
        estado: 'activo',
        fecha_inicio: fechaInicio.toISOString(),
        fecha_vencimiento: fechaVencimiento.toISOString()
      })
      .eq('id', pago.anuncio_id);

    mostrarToast('¡Pago aprobado! Tu anuncio ya está activo.', 'exito', 6000);
  } else if (estadoPago === 'rechazado') {
    mostrarToast('El pago fue rechazado. Por favor intentá nuevamente.', 'error', 6000);
  } else if (estadoPago === 'en_proceso') {
    mostrarToast('Tu pago está siendo procesado. Te avisaremos cuando se confirme.', 'advertencia', 6000);
  }

  // Limpiar params de URL
  window.history.replaceState({}, '', window.location.pathname);
}

/**
 * Carga el historial de pagos del usuario (para dashboard)
 */
async function cargarMisPagos() {
  await inicializarSupabase();
  const sb = getSupabase();
  const session = await requireAuth();
  if (!session) return;

  const contenedor = document.getElementById('mis-pagos-lista');
  if (!contenedor) return;

  const { data: pagos, error } = await sb
    .from('pagos')
    .select('*, planes_publicacion(nombre), anuncios(titulo)')
    .eq('usuario_id', session.user.id)
    .order('creado_en', { ascending: false });

  if (error || !pagos || pagos.length === 0) {
    contenedor.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">💳</div>
        <h3>Sin historial de pagos</h3>
        <p>Tus pagos aparecerán aquí.</p>
      </div>
    `;
    return;
  }

  contenedor.innerHTML = `
    <div class="tabla-wrapper">
      <table class="tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Anuncio</th>
            <th>Plan</th>
            <th>Monto</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${pagos.map(p => `
            <tr>
              <td>${formatearFecha(p.creado_en)}</td>
              <td>${escaparHTML(p.anuncios?.titulo || '-')}</td>
              <td>${escaparHTML(p.planes_publicacion?.nombre || '-')}</td>
              <td><strong>${formatearPrecio(p.monto)}</strong></td>
              <td>${renderBadgeEstadoPago(p.estado)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderBadgeEstadoPago(estado) {
  const map = {
    aprobado: 'activo',
    pendiente: 'pendiente',
    rechazado: 'vencido',
    en_proceso: 'pausado',
    devuelto: 'pausado'
  };
  const etiquetas = {
    aprobado: 'Aprobado', pendiente: 'Pendiente',
    rechazado: 'Rechazado', en_proceso: 'En proceso', devuelto: 'Devuelto'
  };
  return `<span class="badge badge--${map[estado] || 'pausado'}">${etiquetas[estado] || estado}</span>`;
}

// ============================================================
// SUPABASE EDGE FUNCTION (referencia para implementar en servidor)
// ============================================================
/*
  Crear en: supabase/functions/crear-preferencia-mp/index.ts

  import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

  serve(async (req) => {
    const { titulo, monto, external_reference, anuncio_id } = await req.json()

    // Verificar auth del usuario
    const authHeader = req.headers.get('Authorization')
    // ... verificar token

    // Crear preference de MP en servidor (con Access Token secreto)
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('MP_ACCESS_TOKEN')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: [{ title: titulo, unit_price: monto, quantity: 1, currency_id: 'ARS' }],
        external_reference,
        back_urls: {
          success: `${Deno.env.get('SITE_URL')}/pages/dashboard.html`,
          failure: `${Deno.env.get('SITE_URL')}/pages/dashboard.html`,
          pending: `${Deno.env.get('SITE_URL')}/pages/dashboard.html`
        },
        auto_return: 'approved'
      })
    })

    const data = await response.json()
    return new Response(JSON.stringify({ preference_id: data.id }), {
      headers: { 'Content-Type': 'application/json' }
    })
  })
*/
