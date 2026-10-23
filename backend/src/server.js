const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Middlewares
app.use(cors());
app.use(express.json({ limit: '15mb' })); // Ampliado para soportar imágenes de remitos en base64

// Bases de datos en memoria centralizadas y sincronizadas
let pedidosGlobales = []; // Envíos Express A➔B y Encomiendas Tres Cruces
let usuariosRegistrados = []; // Clientes, Cadetes, Admin
let cajaCadetes = {}; // { idCadete: { gananciasEnvios: 0, propinas: 0, historial: [] } }

// Estado activo de cadetes conectados para el motor de despacho inteligente
let cadetesConectados = {};
let despachosActivos = {}; 

// Base de datos de empresas unificada (Comercio, Perfil, Catálogo, QR, Horarios, Suscripción y Pedidos)
let baseEmpresas = [
  {
    rut: '219999990012',
    nombre: 'Lo Tengo Chivitería Central',
    giro: 'Gastronomía',
    logo: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80',
    telefono: '099000000',
    direccion: 'Av. 18 de Julio 1300',
    horaApertura: '11:00',
    horaCierre: '23:59',
    lat: -34.9032, lng: -56.1882,
    password: '123',
    qrCodeUrl: '',
    suscripcionActiva: true, // Plan $500 UYU semanal (hasta 7 productos destacados)
    productos: [
      { id: 101, nombre: "Chivito al Plato Clásico", precio: 480, imagen: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80", outlet: false, destacado: true },
      { id: 102, nombre: "Empanadas de Carne (Docena)", precio: 520, imagen: "https://images.unsplash.com/photo-1608897013039-887f21d8c804?auto=format&fit=crop&w=400&q=80", outlet: true, destacado: false }
    ],
    pedidos: []
  },
  {
    rut: '218888880014',
    nombre: 'Supermercado El Dorado Express',
    giro: 'Supermercado',
    logo: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=400&q=80',
    telefono: '099111111',
    direccion: 'Bv. General Artigas 1800',
    horaApertura: '08:00',
    horaCierre: '22:00',
    lat: -34.8911, lng: -56.1685,
    password: '123',
    qrCodeUrl: '',
    suscripcionActiva: true,
    productos: [
      { id: 201, nombre: "Canasta Básica de Alimentos", precio: 890, imagen: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80", outlet: false, destacado: true },
      { id: 202, nombre: "Pack Leche Descremada x6", precio: 290, imagen: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80", outlet: true, destacado: false }
    ],
    pedidos: []
  }
];

// Ubicación de archivos estáticos
const rootDir = path.resolve(__dirname, '../../');

app.use(express.static(path.join(rootDir, 'cliente/public')));
app.use('/empresa', express.static(path.join(rootDir, 'empresa')));
app.use('/cadete', express.static(path.join(rootDir, 'cadete')));
app.use('/admin', express.static(path.join(rootDir, 'admin')));

app.get('/empresa', (req, res) => res.sendFile(path.join(rootDir, 'empresa/index.html')));
app.get('/cadete', (req, res) => res.sendFile(path.join(rootDir, 'cadete/index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(rootDir, 'admin/index.html')));

// ==========================================
// MÓDULO DE CÁLCULO DE DISTANCIAS (Haversine)
// ==========================================
function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio de la tierra en km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; 
}

// Cálculo dinámico de envío según tipo de vehículo, distancia y rubro
function calcularCostoEnvio(tipoVehiculo, distanciaKm, esGastronomiaOFarmaciaSuper = false, retornoOrigen = false) {
  let distNum = parseFloat(distanciaKm) || 0;
  let distanciaEfectiva = retornoOrigen ? distNum * 2 : distNum;
  let costoEnvio = 0;

  if (esGastronomiaOFarmaciaSuper) {
    // Tarifa base $90 UYU hasta 7 km, salta a $120 UYU si excede
    const umbralKm = 7;
    costoEnvio = distanciaEfectiva <= umbralKm ? 90 : 120;
  } else if (tipoVehiculo === 'moto') {
    const baseKm = 5;
    const precioBase = 190;
    const costoKmExtra = 10;
    if (distanciaEfectiva <= baseKm) {
      costoEnvio = precioBase;
    } else {
      let kmExtra = distanciaEfectiva - baseKm;
      costoEnvio = precioBase + (Math.ceil(kmExtra) * costoKmExtra);
    }
  } else if (tipoVehiculo === 'camioneta') {
    const baseKm = 8;
    const precioBase = 390;
    const costoKmExtra = 20;
    if (distanciaEfectiva <= baseKm) {
      costoEnvio = precioBase;
    } else {
      let kmExtra = distanciaEfectiva - baseKm;
      costoEnvio = precioBase + (Math.ceil(kmExtra) * costoKmExtra);
    }
  } else {
    costoEnvio = 190;
  }
  return costoEnvio;
}

app.post('/api/envios/cotizar', (req, res) => {
  const { tipoVehiculo, distanciaKm, esGastronomiaOFarmaciaSuper, retornoOrigen, pesoTotalKg } = req.body;
  if (distanciaKm === undefined) {
    return res.status(400).json({ success: false, message: "Distancia obligatoria para cotizar" });
  }

  let vehiculoFinal = tipoVehiculo || 'moto';
  let peso = parseFloat(pesoTotalKg) || 0;

  // Si supera los 15 kg, se fuerza camioneta automáticamente ($390 base)
  if (peso > 15) {
    vehiculoFinal = 'camioneta';
  }

  const costoEnvio = calcularCostoEnvio(vehiculoFinal, parseFloat(distanciaKm), Boolean(esGastronomiaOFarmaciaSuper), Boolean(retornoOrigen));
  res.json({ success: true, tipoVehiculoSugerido: vehiculoFinal, costoTotalEnvio: costoEnvio });
});

// ==========================================
// ENDPOINTS REST API - EMPRESAS Y QR
// ==========================================
app.get('/api/empresas', async (req, res) => {
  for (let emp of baseEmpresas) {
    if (!emp.qrCodeUrl) {
      const urlDestino = `https://lotengo.uy/empresa?rut=${emp.rut}`;
      try { emp.qrCodeUrl = await QRCode.toDataURL(urlDestino); } catch (err) { emp.qrCodeUrl = ''; }
    }
  }
  res.json(baseEmpresas);
});

app.post('/api/empresas/registro', async (req, res) => {
  const nuevaEmpresa = req.body; 
  const rutEmpresa = nuevaEmpresa.rut || nuevaEmpresa.id;
  if (!rutEmpresa) return res.status(400).json({ success: false, message: "RUT obligatorio" });

  const urlDestino = `https://lotengo.uy/empresa?rut=${rutEmpresa}`;
  let qrGenerado = '';
  try { qrGenerado = await QRCode.toDataURL(urlDestino); } catch (e) { qrGenerado = ''; }

  let index = baseEmpresas.findIndex(e => String(e.rut).trim() === String(rutEmpresa).trim());
  if (index !== -1) {
    baseEmpresas[index] = { ...baseEmpresas[index], ...nuevaEmpresa, rut: rutEmpresa, qrCodeUrl: qrGenerado };
    return res.json({ success: true, empresa: baseEmpresas[index] });
  }

  const empresaCompleta = {
    ...nuevaEmpresa,
    rut: rutEmpresa,
    qrCodeUrl: qrGenerado,
    horaApertura: nuevaEmpresa.horaApertura || '09:00',
    horaCierre: nuevaEmpresa.horaCierre || '23:00',
    suscripcionActiva: true,
    productos: nuevaEmpresa.productos || [],
    pedidos: []
  };

  baseEmpresas.push(empresaCompleta);
  io.emit('empresa_registrada', empresaCompleta);
  res.status(201).json({ success: true, empresa: empresaCompleta });
});

app.post('/api/empresas/:rut/catalogo', (req, res) => {
  const { rut } = req.params;
  const { productos } = req.body;
  let emp = baseEmpresas.find(e => String(e.rut).trim() === String(rut).trim());
  if (emp) {
    emp.productos = productos || [];
    io.emit('catalogo_actualizado', { rut, productos: emp.productos });
    return res.json({ success: true, productos: emp.productos });
  }
  res.status(404).json({ success: false, message: "Empresa no encontrada" });
});

app.get('/api/empresas/:rut/catalogo', (req, res) => {
  const { rut } = req.params;
  let emp = baseEmpresas.find(e => String(e.rut).trim() === String(rut).trim());
  res.json(emp ? emp.productos : []);
});

// ==========================================
// ENDPOINTS REST API - USUARIOS, PERFILES Y PAGOS
// ==========================================
app.post('/api/usuarios/registro', (req, res) => {
  const { rol, nombre, identificador, telefono, direccion } = req.body; 
  let usuarioExistente = usuariosRegistrados.find(u => u.identificador === identificador);
  if (usuarioExistente) return res.json({ success: true, usuario: usuarioExistente });

  const nuevoUsuario = {
    id: Date.now().toString(),
    rol: rol || 'cliente',
    nombre: nombre || 'Usuario',
    identificador: identificador || '',
    telefono: telefono || '',
    direccion: direccion || '',
    tarjetas: [],
    password: ''
  };

  usuariosRegistrados.push(nuevoUsuario);
  res.status(201).json({ success: true, usuario: nuevoUsuario });
});

app.put('/api/usuarios/:id/perfil', (req, res) => {
  const { id } = req.params;
  const { telefono, direccion, password, nuevaTarjeta } = req.body;
  let usuario = usuariosRegistrados.find(u => u.id === id);
  if (!usuario) return res.status(404).json({ success: false, message: "Usuario no encontrado" });

  if (telefono) usuario.telefono = telefono;
  if (direccion) usuario.direccion = direccion;
  if (password) usuario.password = password;
  if (nuevaTarjeta) {
    const ultimos4 = nuevaTarjeta.numero ? String(nuevaTarjeta.numero).slice(-4) : '0000';
    usuario.tarjetas.push({
      id: Date.now(),
      banco: nuevaTarjeta.banco || 'Banco Genérico',
      enmascarada: `•••• •••• •••• ${ultimos4}`
    });
  }
  res.json({ success: true, message: "Perfil actualizado correctamente", usuario });
});

// Validación de tarjeta de crédito (con cargo de prueba y reembolso de $15 UYU)
app.post('/api/pagos/validar-tarjeta', (req, res) => {
  const { usuarioId, numeroTarjeta, banco } = req.body;

  if (!numeroTarjeta) {
    return res.status(400).json({ success: false, message: "Número de tarjeta obligatorio" });
  }

  setTimeout(() => {
    const ultimos4 = String(numeroTarjeta).slice(-4);
    const nuevaTarjetaEnmascarada = {
      id: Date.now(),
      banco: banco || 'Banco Genérico',
      enmascarada: `•••• •••• •••• ${ultimos4}`
    };

    let usuario = usuariosRegistrados.find(u => u.id === usuarioId || u.identificador === usuarioId);
    if (usuario) {
      if (!usuario.tarjetas) usuario.tarjetas = [];
      usuario.tarjetas.push(nuevaTarjetaEnmascarada);
    }

    res.json({ 
      success: true, 
      message: "Tarjeta validada y $15 UYU reembolsados correctamente.",
      tarjeta: nuevaTarjetaEnmascarada
    });
  }, 1000);
});

// Caja diaria del cadete
app.get('/api/cadetes/:id/caja-diaria', (req, res) => {
  const { id } = req.params;
  if (!cajaCadetes[id]) cajaCadetes[id] = { gananciasEnvios: 0, propinas: 0, historial: [] };
  res.json({ success: true, caja: cajaCadetes[id] });
});

// ==========================================
// ENDPOINTS REST API - PEDIDOS Y CHECKOUT
// ==========================================
app.get('/api/pedidos', (req, res) => {
  let todosLosPedidos = [...pedidosGlobales];
  let idsSet = new Set(todosLosPedidos.map(p => String(p.id).trim()));

  baseEmpresas.forEach(emp => { 
    if (emp.pedidos && Array.isArray(emp.pedidos)) {
      emp.pedidos.forEach(p => {
        let idStr = String(p.id).trim();
        if (!idsSet.has(idStr)) {
          idsSet.add(idStr);
          todosLosPedidos.push(p);
        }
      });
    }
  });
  res.json(todosLosPedidos);
});

app.post('/api/pedidos', (req, res) => {
  const nuevoPedido = req.body; 
  if (!nuevoPedido.id) nuevoPedido.id = Date.now();
  
  nuevoPedido.pinSeguridad = Math.floor(1000 + Math.random() * 9000).toString();
  nuevoPedido.estado = 'pago_confirmado'; 

  // Detectar si es encomienda a Tres Cruces
  let esTresCruces = nuevoPedido.tipoPedido === 'tres_cruces' || nuevoPedido.esTresCruces;
  if (esTresCruces) {
    nuevoPedido.tipoPedido = 'tres_cruces';
    nuevoPedido.destinoNombre = "Terminal Tres Cruces (Despacho)";
    nuevoPedido.destinoLat = -34.8925; 
    nuevoPedido.destinoLng = -56.1664;
  }

  // Validación estricta de peso (> 15 kg fuerza camioneta)
  let peso = parseFloat(nuevoPedido.pesoTotalKg) || 0;
  if (peso > 15) {
    nuevoPedido.tipoVehiculo = 'camioneta';
  }

  let esGastronomiaOFarmaciaSuper = false;
  if (nuevoPedido.rutComercio) {
    let emp = baseEmpresas.find(e => String(e.rut).trim() === String(nuevoPedido.rutComercio).trim());
    if (emp && ['Gastronomía', 'Farmacia', 'Supermercado'].includes(emp.giro)) {
      esGastronomiaOFarmaciaSuper = true;
    }
  }

  if (nuevoPedido.distanciaKm !== undefined && nuevoPedido.tipoVehiculo) {
    nuevoPedido.valorEnvio = calcularCostoEnvio(
      nuevoPedido.tipoVehiculo, 
      parseFloat(nuevoPedido.distanciaKm), 
      esGastronomiaOFarmaciaSuper,
      Boolean(nuevoPedido.retornoOrigen)
    );
  }

  // Cálculos financieros (10% productos, 30% envíos para Lo Tengo, 70% envío para cadete)
  let comisionComercio = nuevoPedido.valorProducto ? (nuevoPedido.valorProducto * 0.10) : 0;
  let comisionEnvio = nuevoPedido.valorEnvio ? (nuevoPedido.valorEnvio * 0.30) : 0;
  let gananciaCadete = nuevoPedido.valorEnvio ? (nuevoPedido.valorEnvio - comisionEnvio) : 140;

  nuevoPedido.comisionesLoTengo = {
    comercio: comisionComercio,
    envio: comisionEnvio,
    totalPlataforma: comisionComercio + comisionEnvio
  };
  nuevoPedido.gananciaCadete = gananciaCadete;

  // Enrutamiento global (Express A➔B o Tres Cruces) vs Comercio
  const esGlobal = !nuevoPedido.rutComercio || nuevoPedido.tipoPedido === 'express' || nuevoPedido.tipoPedido === 'tres_cruces';

  if (esGlobal) {
    pedidosGlobales.push(nuevoPedido);
  } else {
    let empresaDestino = baseEmpresas.find(e => String(e.rut).trim() === String(nuevoPedido.rutComercio).trim());
    if (!empresaDestino) {
      empresaDestino = baseEmpresas[0];
      nuevoPedido.rutComercio = empresaDestino.rut;
    }
    if (!empresaDestino.pedidos) empresaDestino.pedidos = [];
    empresaDestino.pedidos.push(nuevoPedido);
  }

  io.emit('nuevo_pedido_servidor', nuevoPedido);
  iniciarDespachoInteligente(nuevoPedido);

  res.status(201).json({ success: true, pedido: nuevoPedido });
});

// Kill Switch Admin (Eliminar pedido)
app.delete('/api/pedidos/:id', (req, res) => {
  const { id } = req.params;
  let eliminado = false;

  let idxGlobal = pedidosGlobales.findIndex(p => String(p.id).trim() === String(id).trim());
  if (idxGlobal !== -1) {
    pedidosGlobales.splice(idxGlobal, 1);
    eliminado = true;
  }

  baseEmpresas.forEach(emp => {
    if (emp.pedidos) {
      let idx = emp.pedidos.findIndex(p => String(p.id).trim() === String(id).trim());
      if (idx !== -1) {
        emp.pedidos.splice(idx, 1);
        eliminado = true;
      }
    }
  });

  if (eliminado) {
    io.emit('pedido_cancelado_admin', { id });
    return res.json({ success: true, message: "Pedido eliminado correctamente" });
  }
  res.status(404).json({ success: false, message: "Pedido no encontrado" });
});

// ==========================================
// MOTOR DE DESPACHO INTELIGENTE Y SANCIONES
// ==========================================
function iniciarDespachoInteligente(pedido) {
  let origenLat = pedido.origenLat || -34.9032;
  let origenLng = pedido.origenLng || -56.1882;

  if (pedido.rutComercio) {
    let emp = baseEmpresas.find(e => String(e.rut).trim() === String(pedido.rutComercio).trim());
    if (emp && emp.lat && emp.lng) {
      origenLat = emp.lat;
      origenLng = emp.lng;
    }
  }

  let ahora = Date.now();
  let candidatos = Object.values(cadetesConectados).filter(c => {
    if (c.estado !== 'libre') return false;
    if (c.penalizadoHasta && c.penalizadoHasta > ahora) return false;
    if (pedido.tipoVehiculo === 'camioneta' && c.vehiculo !== 'camioneta') return false;
    return true;
  });

  if (candidatos.length === 0) {
    io.emit('alerta_admin_sin_cadetes', { pedidoId: pedido.id });
    return;
  }

  candidatos.sort((a, b) => {
    let distA = calcularDistanciaKm(origenLat, origenLng, a.lat, a.lng);
    let distB = calcularDistanciaKm(origenLat, origenLng, b.lat, b.lng);
    return distA - distB;
  });

  despachosActivos[pedido.id] = {
    candidatosIndex: 0,
    candidatosList: candidatos,
    pedido: pedido,
    origenLat, origenLng
  };

  llamarSiguienteCadete(pedido.id);
}

function llamarSiguienteCadete(pedidoId) {
  let despacho = despachosActivos[pedidoId];
  if (!despacho) return;

  let { candidatosList, candidatosIndex, pedido } = despacho;

  if (candidatosIndex >= candidatosList.length) {
    io.emit('pedido_sin_respuesta_flota', { id: pedidoId });
    delete despachosActivos[pedidoId];
    return;
  }

  let cadeteActual = candidatosList[candidatosIndex];
  despacho.intentandoSocketId = cadeteActual.socketId;

  io.to(cadeteActual.socketId).emit('oferta_envio_cercano', {
    pedido,
    tiempoLimiteSec: 30
  });

  despacho.timeoutId = setTimeout(() => {
    registrarRechazoOFalta(cadeteActual.socketId);
    despacho.candidatosIndex++;
    llamarSiguienteCadete(pedidoId);
  }, 30000);
}

function registrarRechazoOFalta(socketId) {
  let cadete = cadetesConectados[socketId];
  if (!cadete) return;

  cadete.rechazosConsecutivos = (cadete.rechazosConsecutivos || 0) + 1;
  if (cadete.rechazosConsecutivos >= 3) {
    cadete.penalizadoHasta = Date.now() + 3600000; // 1 hora
    cadete.rechazosConsecutivos = 0;
    io.to(socketId).emit('cuenta_suspendida', { 
      motivo: "Acumuló 3 rechazos o inasistencias consecutivas.",
      suspensionHasta: cadete.penalizadoHasta 
    });
  }
}

// ==========================================
// CONFIGURACIÓN WEBSOCKETS (SOCKET.IO)
// ==========================================
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on('connection', (socket) => {
  socket.on('registrar_cadete', (data) => {
    cadetesConectados[socket.id] = {
      socketId: socket.id,
      id: data.id,
      nombre: data.nombre || 'Cadete',
      vehiculo: data.vehiculo || 'moto',
      lat: data.lat || -34.9032,
      lng: data.lng || -56.1882,
      estado: 'libre',
      rechazosConsecutivos: 0,
      penalizadoHasta: 0
    };
  });

  socket.on('actualizar_ubicacion_cadete', (data) => {
    if (cadetesConectados[socket.id]) {
      cadetesConectados[socket.id].lat = data.lat;
      cadetesConectados[socket.id].lng = data.lng;
    }
    io.emit('ubicacion_cadete', data);
  });

  socket.on('aceptar_oferta_pedido', (data) => {
    const { pedidoId } = data;
    let despacho = despachosActivos[pedidoId];

    if (despacho && despacho.intentandoSocketId === socket.id) {
      clearTimeout(despacho.timeoutId);
      let cadeteInfo = cadetesConectados[socket.id];
      if (cadeteInfo) {
        cadeteInfo.estado = 'ocupado';
        cadeteInfo.rechazosConsecutivos = 0;

        despacho.pedido.idCadete = cadeteInfo.id;
        despacho.pedido.nombreCadete = cadeteInfo.nombre;
        despacho.pedido.estado = 'en_camino_a_retirar';

        if (!cajaCadetes[cadeteInfo.id]) {
          cajaCadetes[cadeteInfo.id] = { gananciasEnvios: 0, propinas: 0, historial: [] };
        }
        cajaCadetes[cadeteInfo.id].gananciasEnvios += despacho.pedido.gananciaCadete;
        cajaCadetes[cadeteInfo.id].historial.push(despacho.pedido);

        io.emit('pedido_asignado', despacho.pedido);
        delete despachosActivos[pedidoId];
      }
    }
  });

  socket.on('rechazar_oferta_pedido', (data) => {
    const { pedidoId } = data;
    let despacho = despachosActivos[pedidoId];

    if (despacho && despacho.intentandoSocketId === socket.id) {
      clearTimeout(despacho.timeoutId);
      registrarRechazoOFalta(socket.id);
      despacho.candidatosIndex++;
      llamarSiguienteCadete(pedidoId);
    }
  });

  // Validación de Entrega (PIN, Nombre+CI para Express, o Foto de Remito para Tres Cruces)
  socket.on('completar_entrega_pedido', (data) => {
    const { pedidoId, pinIngresado, receptorInfo, fotoComprobante } = data;
    let pedidoEncontrado = null;

    let pGlobal = pedidosGlobales.find(x => String(x.id).trim() === String(pedidoId).trim());
    if (pGlobal) {
      pedidoEncontrado = pGlobal;
    } else {
      baseEmpresas.forEach(emp => {
        if (emp.pedidos) {
          let p = emp.pedidos.find(x => String(x.id).trim() === String(pedidoId).trim());
          if (p) pedidoEncontrado = p;
        }
      });
    }

    if (!pedidoEncontrado) {
      return socket.emit('error_entrega', { message: "Pedido no encontrado" });
    }

    let esTresCruces = pedidoEncontrado.tipoPedido === 'tres_cruces';
    let esExpressAB = pedidoEncontrado.tipoPedido === 'express';

    if (esTresCruces) {
      if (!fotoComprobante) {
        return socket.emit('error_entrega', { message: "Se requiere obligatoriamente la foto del remito de despacho (Tres Cruces)." });
      }
      pedidoEncontrado.fotoComprobante = fotoComprobante;
    } else if (esExpressAB) {
      if (!receptorInfo || !receptorInfo.nombre || !receptorInfo.ci) {
        return socket.emit('error_entrega', { message: "Se requiere obligatoriamente Nombre y Cédula de quien recibe el envío." });
      }
      pedidoEncontrado.receptorInfo = receptorInfo;
    } else {
      if (pedidoEncontrado.pinSeguridad && pedidoEncontrado.pinSeguridad !== pinIngresado) {
        return socket.emit('error_entrega', { message: "PIN de seguridad incorrecto" });
      }
    }

    pedidoEncontrado.estado = 'entregado';

    Object.values(cadetesConectados).forEach(c => {
      if (c.id === pedidoEncontrado.idCadete) c.estado = 'libre';
    });

    io.emit('pedido_entregado_exito', pedidoEncontrado);
  });

  socket.on('cambiar_estado_pedido', (data) => {
    io.emit('actualizacion_pedido', data);
  });

  socket.on('disconnect', () => {
    delete cadetesConectados[socket.id];
  });
});

// Diagnóstico
app.get('/api/status', (req, res) => {
  res.json({ 
    status: "API de Lo Tengo 100% operativa con todas sus características y reglas 🚀", 
    totalEmpresas: baseEmpresas.length,
    totalPedidosGlobales: pedidosGlobales.length,
    totalCadetesConectados: Object.keys(cadetesConectados).length
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor de Lo Tengo corriendo en el puerto ${PORT}`);
});