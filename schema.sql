-- ============================================================
-- ESQUEMA SQL - Plataforma Barrio Semi Cerrado
-- Ejecutar completo en Supabase SQL Editor
-- ============================================================

-- ============================================================
-- TABLA: perfiles (extiende auth.users de Supabase)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.perfiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nombre TEXT NOT NULL,
  numero_lote TEXT NOT NULL UNIQUE,
  rol TEXT NOT NULL DEFAULT 'usuario' CHECK (rol IN ('usuario', 'admin')),
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para perfiles
CREATE POLICY "usuarios_ven_su_perfil" ON public.perfiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "admin_ve_todos_perfiles" ON public.perfiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

CREATE POLICY "usuario_inserta_su_perfil" ON public.perfiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "usuario_actualiza_su_perfil" ON public.perfiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    -- usuarios normales no pueden cambiar su propio rol
    rol = (SELECT rol FROM public.perfiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

CREATE POLICY "admin_actualiza_cualquier_perfil" ON public.perfiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

CREATE POLICY "admin_elimina_perfil" ON public.perfiles
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

-- ============================================================
-- TABLA: planes_publicacion
-- ============================================================
CREATE TABLE IF NOT EXISTS public.planes_publicacion (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('dia', 'semana', 'mes')),
  precio NUMERIC(10,2) NOT NULL,
  duracion_dias INTEGER NOT NULL,
  descripcion TEXT,
  activo BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.planes_publicacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "todos_ven_planes_activos" ON public.planes_publicacion
  FOR SELECT USING (activo = TRUE);

CREATE POLICY "admin_gestiona_planes" ON public.planes_publicacion
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

-- ============================================================
-- TABLA: categorias_anuncio
-- ============================================================
CREATE TABLE IF NOT EXISTS public.categorias_anuncio (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  icono TEXT,
  activa BOOLEAN DEFAULT TRUE
);

ALTER TABLE public.categorias_anuncio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "todos_ven_categorias" ON public.categorias_anuncio
  FOR SELECT USING (TRUE);

CREATE POLICY "admin_gestiona_categorias" ON public.categorias_anuncio
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

-- ============================================================
-- TABLA: anuncios
-- ============================================================
CREATE TABLE IF NOT EXISTS public.anuncios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  categoria_id INTEGER REFERENCES public.categorias_anuncio(id),
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  telefono TEXT,
  whatsapp TEXT,
  email TEXT,
  imagen_url TEXT,
  plan_id INTEGER REFERENCES public.planes_publicacion(id),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'activo', 'vencido', 'pausado')),
  fecha_inicio TIMESTAMPTZ,
  fecha_vencimiento TIMESTAMPTZ,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.anuncios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "todos_ven_anuncios_activos" ON public.anuncios
  FOR SELECT USING (estado = 'activo');

CREATE POLICY "usuario_ve_sus_anuncios" ON public.anuncios
  FOR SELECT USING (auth.uid() = usuario_id);

CREATE POLICY "admin_ve_todos_anuncios" ON public.anuncios
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

CREATE POLICY "usuario_crea_anuncio" ON public.anuncios
  FOR INSERT WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "usuario_actualiza_su_anuncio" ON public.anuncios
  FOR UPDATE USING (auth.uid() = usuario_id)
  WITH CHECK (
    -- usuarios no pueden cambiar estado a 'activo' directamente
    estado IN ('pendiente', 'pausado')
    OR EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

CREATE POLICY "admin_actualiza_cualquier_anuncio" ON public.anuncios
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

CREATE POLICY "usuario_elimina_su_anuncio" ON public.anuncios
  FOR DELETE USING (auth.uid() = usuario_id);

CREATE POLICY "admin_elimina_cualquier_anuncio" ON public.anuncios
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

-- ============================================================
-- TABLA: pagos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.perfiles(id),
  anuncio_id UUID REFERENCES public.anuncios(id),
  plan_id INTEGER REFERENCES public.planes_publicacion(id),
  monto NUMERIC(10,2) NOT NULL,
  moneda TEXT DEFAULT 'ARS',
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado', 'en_proceso', 'devuelto')),
  mp_payment_id TEXT,
  mp_preference_id TEXT,
  mp_external_reference TEXT UNIQUE,
  metadata JSONB,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuario_ve_sus_pagos" ON public.pagos
  FOR SELECT USING (auth.uid() = usuario_id);

CREATE POLICY "admin_ve_todos_pagos" ON public.pagos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

CREATE POLICY "usuario_crea_pago" ON public.pagos
  FOR INSERT WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "admin_actualiza_pago" ON public.pagos
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

-- ============================================================
-- TABLA: noticias
-- ============================================================
CREATE TABLE IF NOT EXISTS public.noticias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autor_id UUID NOT NULL REFERENCES public.perfiles(id),
  titulo TEXT NOT NULL,
  contenido TEXT NOT NULL,
  imagen_url TEXT,
  publicada BOOLEAN DEFAULT FALSE,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.noticias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "todos_ven_noticias_publicadas" ON public.noticias
  FOR SELECT USING (publicada = TRUE);

CREATE POLICY "admin_ve_todas_noticias" ON public.noticias
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

CREATE POLICY "solo_admin_crea_noticias" ON public.noticias
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

CREATE POLICY "solo_admin_actualiza_noticias" ON public.noticias
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

CREATE POLICY "solo_admin_elimina_noticias" ON public.noticias
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

-- ============================================================
-- TABLA: telefonos_utiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.telefonos_utiles (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL,
  telefono TEXT NOT NULL,
  descripcion TEXT,
  orden INTEGER DEFAULT 0,
  activo BOOLEAN DEFAULT TRUE
);

ALTER TABLE public.telefonos_utiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "todos_ven_telefonos" ON public.telefonos_utiles
  FOR SELECT USING (activo = TRUE);

CREATE POLICY "admin_gestiona_telefonos" ON public.telefonos_utiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

-- ============================================================
-- TABLA: promociones
-- ============================================================
CREATE TABLE IF NOT EXISTS public.promociones (
  id SERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  descuento_porcentaje INTEGER CHECK (descuento_porcentaje BETWEEN 0 AND 100),
  plan_id INTEGER REFERENCES public.planes_publicacion(id),
  fecha_inicio TIMESTAMPTZ NOT NULL,
  fecha_fin TIMESTAMPTZ NOT NULL,
  activa BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.promociones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "todos_ven_promociones_activas" ON public.promociones
  FOR SELECT USING (
    activa = TRUE
    AND fecha_inicio <= NOW()
    AND fecha_fin >= NOW()
  );

CREATE POLICY "admin_gestiona_promociones" ON public.promociones
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

-- ============================================================
-- FUNCIÓN: actualizar campo updated_at automáticamente
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_perfiles_updated_at
  BEFORE UPDATE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_anuncios_updated_at
  BEFORE UPDATE ON public.anuncios
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_pagos_updated_at
  BEFORE UPDATE ON public.pagos
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_noticias_updated_at
  BEFORE UPDATE ON public.noticias
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- FUNCIÓN: crear perfil al registrarse (trigger on auth.users)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfiles (id, email, nombre, numero_lote)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', ''),
    COALESCE(NEW.raw_user_meta_data->>'numero_lote', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- DATOS INICIALES
-- ============================================================

-- Categorías de anuncios
INSERT INTO public.categorias_anuncio (nombre, icono) VALUES
  ('Electricista', '⚡'),
  ('Plomero', '🔧'),
  ('Gasista', '🔥'),
  ('Albañil', '🧱'),
  ('Pintor', '🎨'),
  ('Jardinero', '🌿'),
  ('Carpintero', '🪚'),
  ('Cerrajero', '🔑'),
  ('Limpieza', '🧹'),
  ('Otros', '📋')
ON CONFLICT (nombre) DO NOTHING;

-- Planes de publicación
INSERT INTO public.planes_publicacion (nombre, tipo, precio, duracion_dias, descripcion) VALUES
  ('Diario', 'dia', 500.00, 1, 'Publicación por 1 día'),
  ('Semanal', 'semana', 2500.00, 7, 'Publicación por 7 días - ahorrás 28%'),
  ('Mensual', 'mes', 8000.00, 30, 'Publicación por 30 días - ahorrás 46%')
ON CONFLICT DO NOTHING;

-- Teléfonos útiles de ejemplo
INSERT INTO public.telefonos_utiles (nombre, categoria, telefono, descripcion, orden) VALUES
  ('Municipio', 'Municipio', '0000-000000', 'Línea general del municipio', 1),
  ('Policía Local', 'Seguridad', '911', 'Emergencias policiales', 2),
  ('Bomberos', 'Emergencias', '100', 'Cuartel de bomberos', 3),
  ('Hospital Municipal', 'Salud', '0000-111111', 'Guardia hospitalaria', 4),
  ('SAME / Ambulancia', 'Salud', '107', 'Emergencias médicas', 5),
  ('Defensa Civil', 'Emergencias', '103', 'Catástrofes y emergencias', 6)
ON CONFLICT DO NOTHING;

-- ============================================================
-- ÍNDICES para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_anuncios_usuario ON public.anuncios(usuario_id);
CREATE INDEX IF NOT EXISTS idx_anuncios_estado ON public.anuncios(estado);
CREATE INDEX IF NOT EXISTS idx_anuncios_vencimiento ON public.anuncios(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_pagos_usuario ON public.pagos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_pagos_mp_external ON public.pagos(mp_external_reference);
CREATE INDEX IF NOT EXISTS idx_noticias_publicada ON public.noticias(publicada);
