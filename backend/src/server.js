const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode'); // Asegurate de tenerlo instalado o lo generamos nativo
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Bases de datos en memoria centralizadas y sincronizadas
let pedidosGlobales = [];
let usuariosRegistrados = []; // Clientes, Cadetes, Admin
let cajaCadetes = {}; // { idCadete: { gananciasEnvios: 0, propinas: 0, historial: [] } }

// Base de datos de empresas unificada (Comercio, Perfil, Catálogo, QR y Pedidos)
let baseEmpresas = [
  {
    rut: '219999990012',
    nombre: 'Lo Tengo Chivitería Central',
    giro: 'Gastronomía',
    logo: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80',
    telefono: '099000000',
    direccion: 'Av. 18 de Julio 1300',
    password: '123',
    qrCodeUrl: '', // Se genera dinámicamente
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
    password: '123',
    qrCodeUrl: '',
    productos: [
      { id: 201, nombre: "Canasta Básica de Alimentos", precio: 890, imagen: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80", outlet: false, destacado: true },
      { id: 202, nombre: "Pack Leche Descremada x6", precio: 290, imagen: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80", outlet: true, destacado: false }
    ],
    pedidos: []
  },
  {
    rut: '217777770016',
    nombre: 'Farmacia San Roque 24hs',
    giro: 'Farmacia',
    logo: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80',
    telefono: '099222222',
    direccion: 'Av. 21 de Setiembre 2400',
    password: '123',
    qrCodeUrl: '',
    productos: [
      { id: 301, nombre: "Protector Solar SPF 50+", precio: 750, imagen: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=400&q=80", outlet: false, destacado: true },
      { id: 302, nombre: "Kit Primeros Auxilios Completo", precio: 450, imagen: "https://images.unsplash.com/photo-1603398938378-e54eab446dde?auto=format&fit=crop&w=400&q=80", outlet: true, destacado: false }
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
// MÓDULO DE CÁLCULO DE TARIFAS Y FINANZAS
// ==========================================

// Cálculo dinámico de envío según tipo de vehículo y distancia (con opción de retorno)
function calcularCostoEnvio(tipoVehiculo, distanciaKm, retornoOrigen = false) {
  let distanciaEfectiva = retornoOrigen ? distanciaKm * 2 : distanciaKm;
  let costoEnvio = 0;

  if (tipoVehiculo === 'moto') {
    const baseKm = 5;
    const precioBase = 190;
    const costoKmExtra = 10;
    if (distanciaEfectiva <= baseKm) {
      costoEnvio = precioBase;
    } else {
      costoEnvio = precioBase + (Math.ceil(distanciaEfectiva - baseKm) * costoKmExtra);
    }
  } else if (tipoVehiculo === 'camioneta') {
    const baseKm = 8;
    const precioBase = 390;
    const costoKmExtra = 20;
    if (distanciaEfectiva <= baseKm) {
      costoEnvio = precioBase;
    } else {
      costoEnvio = precioBase + (Math.ceil(distanciaEfectiva - baseKm) * costoKmExtra);
    }
  }
  return costoEnvio;
}

// Endpoint para cotizar envío dinámicamente desde el cliente
app.post('/api/envios/cotizar', (req, res) => {
  const { tipoVehiculo, distanciaKm, retornoOrigen } = req.body;
  if (!tipoVehiculo || distanciaKm === undefined) {
    return res.status(400).json({ success: false, message: "Datos incompletos para cotizar" });
  }

  const costoEnvio = calcularCostoEnvio(tipoVehiculo, parseFloat(distanciaKm), Boolean(retornoOrigen));
  // El cliente solo recibe el costo final total del envío (sin desglosar fórmula)
  res.json({ success: true, costoTotalEnvio: costoEnvio });
});

// ==========================================
// ENDPOINTS REST API - EMPRESAS Y QR
// ==========================================

app.get('/api/empresas', async (req, res) => {
  // Asegurar que todas tengan su QR generado
  for (let emp of baseEmpresas) {
    if (!emp.qrCodeUrl) {
      const urlDestino = `https://lotengo.uy/empresa?rut=${emp.rut}`;
      try {
        emp.qrCodeUrl = await QRCode.toDataURL(urlDestino);
      } catch (err) {
        emp.qrCodeUrl = '';
      }
    }
  }
  res.json(baseEmpresas);
});

app.post('/api/empresas/registro', async (req, res) => {
  const nuevaEmpresa = req.body; 
  const rutEmpresa = nuevaEmpresa.rut || nuevaEmpresa.id;
  
  if (!rutEmpresa) {
    return res.status(400).json({ success: false, message: "RUT obligatorio" });
  }

  const urlDestino = `https://lotengo.uy/empresa?rut=${rutEmpresa}`;
  let qrGenerado = '';
  try {
    qrGenerado = await QRCode.toDataURL(urlDestino);
  } catch (e) {
    qrGenerado = '';
  }

  let index = baseEmpresas.findIndex(e => String(e.rut).trim() === String(rutEmpresa).trim());
  if (index !== -1) {
    baseEmpresas[index] = { ...baseEmpresas[index], ...nuevaEmpresa, rut: rutEmpresa, qrCodeUrl: qrGenerado };
    return res.json({ success: true, empresa: baseEmpresas[index] });
  }

  const empresaCompleta = {
    ...nuevaEmpresa,
    rut: rutEmpresa,
    qrCodeUrl: qrGenerado,
    productos: nuevaEmpresa.productos || [],
    pedidos: []
  };

  baseEmpresas.push(empresaCompleta);
  io.emit('empresa_registrada', empresaCompleta);
  res.status(201).json({ success: true, empresa: empresaCompleta });
});

// Catálogos
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
// ENDPOINTS REST API - USUARIOS Y PERFILES SEGUROS
// ==========================================

app.post('/api/usuarios/registro', (req, res) => {
  const { rol, nombre, identificador, telefono, direccion } = req.body; 
  let usuarioExistente = usuariosRegistrados.find(u => u.identificador === identificador);
  if (usuarioExistente) {
    return res.json({ success: true, usuario: usuarioExistente });
  }

  const nuevoUsuario = {
    id: Date.now().toString(),
    rol: rol || 'cliente',
    nombre: nombre || 'Usuario',
    identificador: identificador || '',
    telefono: telefono || '',
    direccion: direccion || '',
    tarjetas: [], // Almacena tarjetas con formato enmascarado
    password: ''
  };

  usuariosRegistrados.push(nuevoUsuario);
  res.status(201).json({ success: true, usuario: nuevoUsuario });
});

// Actualización de Perfil (Seguridad, Tarjetas enmascaradas, Datos personales)
app.put('/api/usuarios/:id/perfil', (req, res) => {
  const { id } = req.params;
  const { telefono, direccion, password, nuevaTarjeta } = req.body;

  let usuario = usuariosRegistrados.find(u => u.id === id);
  if (!usuario) return res.status(404).json({ success: false, message: "Usuario no encontrado" });

  if (telefono) usuario.telefono = telefono;
  if (direccion) usuario.direccion = direccion;
  if (password) usuario.password = password; // En producción usar hash

  if (nuevaTarjeta) {
    // Enmascaramiento: guardamos solo banco y últimos 4 dígitos
    const ultimos4 = nuevaTarjeta.numero ? nuevaTarjeta.numero.slice(-4) : '0000';
    usuario.tarjetas.push({
      id: Date.now(),
      banco: nuevaTarjeta.banco || 'Banco Genérico',
      enmascarada: `•••• •••• •••• ${ultimos4}`
    });
  }

  res.json({ success: true, message: "Perfil actualizado correctamente", usuario });
});

// ==========================================
// CAJA DIARIA DEL CADETE Y GANANCIAS
// ==========================================

app.get('/api/cadetes/:id/caja-diaria', (req, res) => {
  const { id } = req.params;
  if (!cajaCadetes[id]) {
    cajaCadetes[id] = { gananciasEnvios: 0, propinas: 0, historial: [] };
  }
  res.json({ success: true, caja: cajaCadetes[id] });
});

// ==========================================
// ENDPOINTS REST API - PEDIDOS Y CHECKOUT FINANCIERO
// ==========================================

app.get('/api/pedidos', (req, res) => {
  let todosLosPedidos = [];
  baseEmpresas.forEach(emp => {
    if (emp.pedidos) todosLosPedidos.push(...emp.pedidos);
  });
  res.json([...pedidosGlobales, ...todosLosPedidos]);
});

app.post('/api/pedidos', (req, res) => {
  const nuevoPedido = req.body; 
  // nuevoPedido incluye: tipo ('comercio' o 'cadeteria'), valorProducto, valorEnvio, costoMP, tipoVehiculo, distanciaKm, retornoOrigen, etc.

  // Calcular comisiones de Lo Tengo
  let comisionComercio = nuevoPedido.valorProducto ? (nuevoPedido.valorProducto * 0.10) : 0; // 10%
  let comisionEnvio = nuevoPedido.valorEnvio ? (nuevoPedido.valorEnvio * 0.30) : 0; // 30%
  let gananciaCadete = nuevoPedido.valorEnvio ? (nuevoPedido.valorEnvio - comisionEnvio) : 0;

  nuevoPedido.comisionesLoTengo = {
    comercio: comisionComercio,
    envio: comisionEnvio,
    totalPlataforma: comisionComercio + comisionEnvio
  };
  nuevoPedido.gananciaCadete = gananciaCadete;

  // Registrar en caja del cadete si se le asigna uno
  if (nuevoPedido.idCadete) {
    if (!cajaCadetes[nuevoPedido.idCadete]) {
      cajaCadetes[nuevoPedido.idCadete] = { gananciasEnvios: 0, propinas: 0, historial: [] };
    }
    cajaCadetes[nuevoPedido.idCadete].gananciasEnvios += gananciaCadete;
    if (nuevoPedido.propina) {
      cajaCadetes[nuevoPedido.idCadete].propinas += Number(nuevoPedido.propina);
    }
    cajaCadetes[nuevoPedido.idCadete].historial.push(nuevoPedido);
  }

  pedidosGlobales.push(nuevoPedido);

  // Ubicar empresa destino si aplica
  let empresaDestino = baseEmpresas[0];
  if (nuevoPedido.rutComercio) {
    let encontrada = baseEmpresas.find(e => String(e.rut).trim() === String(nuevoPedido.rutComercio).trim());
    if (encontrada) empresaDestino = encontrada;
  }

  if (!empresaDestino.pedidos) empresaDestino.pedidos = [];
  empresaDestino.pedidos.push(nuevoPedido);

  io.emit('nuevo_pedido_servidor', nuevoPedido);
  res.status(201).json({ success: true, pedido: nuevoPedido });
});

// Kill Switch Admin
app.delete('/api/pedidos/:id', (req, res) => {
  const { id } = req.params;
  const index = pedidosGlobales.findIndex(p => p.id == id);

  if (index !== -1) {
    const pedidoEliminado = pedidosGlobales.splice(index, 1)[0];
    io.emit('pedido_cancelado_admin', { id });
    return res.json({ success: true, pedido: pedidoEliminado });
  }

  res.status(404).json({ success: false, message: "Pedido no encontrado" });
});

// ==========================================
// CONFIGURACIÓN WEBSOCKETS (SOCKET.IO)
// ==========================================

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on('connection', (socket) => {
  console.log(`Usuario conectado: ${socket.id}`);

  socket.on('cambiar_estado_pedido', (data) => {
    io.emit('actualizacion_pedido', data);
  });

  socket.on('actualizar_ubicacion', (data) => {
    io.emit('ubicacion_cadete', data);
  });

  // Evento para enviar comprobante con foto (ej. Tres Cruces / Agencias)
  socket.on('comprobante_entrega', (data) => {
    io.emit('nuevo_comprobante_cliente', data);
  });

  socket.on('disconnect', () => {
    console.log(`Usuario desconectado: ${socket.id}`);
  });
});

// Diagnóstico
app.get('/api/status', (req, res) => {
  res.json({ 
    status: "API de Lo Tengo 100% operativa 🚀", 
    totalEmpresas: baseEmpresas.length,
    totalPedidos: pedidosGlobales.length,
    totalUsuarios: usuariosRegistrados.length 
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});