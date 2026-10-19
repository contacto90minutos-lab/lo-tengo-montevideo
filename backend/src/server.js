const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Bases de datos en memoria centralizadas y sincronizadas
let pedidosGlobales = [];
let usuariosRegistrados = []; // Clientes, Cadetes y Admin

// Base de datos de empresas unificada (Comercio, Perfil, Catálogo de Productos y Pedidos)
let baseEmpresas = [
  {
    rut: '219999990012',
    nombre: 'Lo Tengo Chivitería Central',
    giro: 'Gastronomía',
    logo: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80',
    telefono: '099000000',
    direccion: 'Av. 18 de Julio 1300',
    password: '123',
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
    productos: [
      { id: 301, nombre: "Protector Solar SPF 50+", precio: 750, imagen: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=400&q=80", outlet: false, destacado: true },
      { id: 302, nombre: "Kit Primeros Auxilios Completo", precio: 450, imagen: "https://images.unsplash.com/photo-1603398938378-e54eab446dde?auto=format&fit=crop&w=400&q=80", outlet: true, destacado: false }
    ],
    pedidos: []
  }
];

// Ubicación exacta de la carpeta raíz desde backend/src/
const rootDir = path.resolve(__dirname, '../../');

// Servir archivos estáticos
app.use(express.static(path.join(rootDir, 'cliente/public')));
app.use('/empresa', express.static(path.join(rootDir, 'empresa')));
app.use('/cadete', express.static(path.join(rootDir, 'cadete')));
app.use('/admin', express.static(path.join(rootDir, 'admin')));

// Enviar explícitamente el index.html de cada app
app.get('/empresa', (req, res) => {
  res.sendFile(path.join(rootDir, 'empresa/index.html'));
});

app.get('/cadete', (req, res) => {
  res.sendFile(path.join(rootDir, 'cadete/index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(rootDir, 'admin/index.html'));
});

// ==========================================
// ENDPOINTS REST API - EMPRESAS Y CATÁLOGOS
// ==========================================

// Obtener todas las empresas con sus catálogos y pedidos
app.get('/api/empresas', (req, res) => {
  res.json(baseEmpresas);
});

// Registrar o actualizar una empresa (Perfil y datos desde el panel móvil/web)
app.post('/api/empresas/registro', (req, res) => {
  const nuevaEmpresa = req.body; 
  const rutEmpresa = nuevaEmpresa.rut || nuevaEmpresa.id;
  
  if (!rutEmpresa) {
    return res.status(400).json({ success: false, message: "RUT de empresa obligatorio" });
  }

  let index = baseEmpresas.findIndex(e => String(e.rut).trim() === String(rutEmpresa).trim());
  if (index !== -1) {
    baseEmpresas[index] = { ...baseEmpresas[index], ...nuevaEmpresa, rut: rutEmpresa };
    console.log(`🏢 Empresa actualizada en servidor: ${baseEmpresas[index].nombre} (RUT: ${rutEmpresa})`);
    return res.json({ success: true, empresa: baseEmpresas[index] });
  }

  const empresaCompleta = {
    ...nuevaEmpresa,
    rut: rutEmpresa,
    productos: nuevaEmpresa.productos || [],
    pedidos: nuevaEmpresa.pedidos || []
  };

  baseEmpresas.push(empresaCompleta);
  console.log(`🏢 Nueva empresa registrada en servidor: ${empresaCompleta.nombre} (RUT: ${rutEmpresa})`);
  
  io.emit('empresa_registrada', empresaCompleta);
  res.status(201).json({ success: true, empresa: empresaCompleta });
});

// Guardar o actualizar productos del catálogo de una empresa específica por RUT
app.post('/api/empresas/:rut/catalogo', (req, res) => {
  const { rut } = req.params;
  const { productos } = req.body; // Array de productos

  let emp = baseEmpresas.find(e => String(e.rut).trim() === String(rut).trim());
  if (emp) {
    emp.productos = productos || [];
    console.log(`📦 Catálogo actualizado para empresa RUT: ${rut} (${emp.productos.length} productos)`);
    
    io.emit('catalogo_actualizado', { rut, productos: emp.productos });
    return res.json({ success: true, message: "Catálogo guardado correctamente", productos: emp.productos });
  }

  res.status(404).json({ success: false, message: "Empresa no encontrada por RUT" });
});

// Obtener el catálogo de una empresa específica por RUT
app.get('/api/empresas/:rut/catalogo', (req, res) => {
  const { rut } = req.params;
  let emp = baseEmpresas.find(e => String(e.rut).trim() === String(rut).trim());
  res.json(emp ? emp.productos : []);
});

// Compatibilidad por ID genérico (por si alguna vista lo solicita)
app.post('/api/empresas/:id/catalogo', (req, res) => {
  const { id } = req.params;
  const { productos } = req.body;

  let emp = baseEmpresas.find(e => String(e.rut).trim() === String(id).trim() || String(e.id).trim() === String(id).trim());
  if (emp) {
    emp.productos = productos || [];
    console.log(`📦 Catálogo actualizado para empresa ID/RUT: ${id} (${emp.productos.length} productos)`);
    io.emit('catalogo_actualizado', { rut: emp.rut || id, productos: emp.productos });
    return res.json({ success: true, message: "Catálogo guardado correctamente", productos: emp.productos });
  }

  res.status(404).json({ success: false, message: "Empresa no encontrada" });
});

app.get('/api/empresas/:id/catalogo', (req, res) => {
  const { id } = req.params;
  let emp = baseEmpresas.find(e => String(e.rut).trim() === String(id).trim() || String(e.id).trim() === String(id).trim());
  res.json(emp ? emp.productos : []);
});

// ==========================================
// ENDPOINTS REST API - USUARIOS Y REGISTROS
// ==========================================

app.post('/api/usuarios/registro', (req, res) => {
  const { rol, nombre, identificador, giroComercial } = req.body; 

  let usuarioExistente = usuariosRegistrados.find(u => u.identificador === identificador);
  if (usuarioExistente) {
    return res.json({ success: true, message: "Sesión iniciada con éxito", usuario: usuarioExistente });
  }

  const nuevoUsuario = {
    id: Date.now().toString(),
    rol,
    nombre,
    identificador,
    giroComercial: giroComercial || 'gastronomia',
    etiquetaPanel: (giroComercial && giroComercial !== 'gastronomia') ? 'Preparación / Expedición' : 'Cocina'
  };

  usuariosRegistrados.push(nuevoUsuario);
  console.log(`👤 Nuevo usuario registrado [${rol}]: ${nombre}`);
  res.status(201).json({ success: true, message: "Usuario registrado correctamente", usuario: nuevoUsuario });
});

// ==========================================
// ENDPOINTS REST API - PEDIDOS Y KILL SWITCH
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
  pedidosGlobales.push(nuevoPedido);
  
  // Ubicar empresa destino
  let empresaDestino = baseEmpresas[0];
  if (nuevoPedido.rutComercio) {
    let encontrada = baseEmpresas.find(e => String(e.rut).trim() === String(nuevoPedido.rutComercio).trim());
    if (encontrada) empresaDestino = encontrada;
  }

  if (!empresaDestino.pedidos) empresaDestino.pedidos = [];
  empresaDestino.pedidos.push(nuevoPedido);

  console.log(`📦 Nuevo pedido recibido en servidor ID: ${nuevoPedido.id}`);
  io.emit('nuevo_pedido_servidor', nuevoPedido);

  res.status(201).json({ success: true, message: "Pedido registrado en el servidor", pedido: nuevoPedido });
});

app.delete('/api/pedidos/:id', (req, res) => {
  const { id } = req.params;
  const index = pedidosGlobales.findIndex(p => p.id == id);

  if (index !== -1) {
    const pedidoEliminado = pedidosGlobales.splice(index, 1)[0];
    console.log(`🚨 KILL SWITCH ACTIVADO: Pedido ID ${id} eliminado por administración.`);
    io.emit('pedido_cancelado_admin', { id });
    return res.json({ success: true, message: "Pedido eliminado correctamente", pedido: pedidoEliminado });
  }

  res.status(404).json({ success: false, message: "Pedido no encontrado" });
});

// Configuración de WebSockets (Socket.io)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log(`Usuario conectado: ${socket.id}`);

  socket.on('cambiar_estado_pedido', (data) => {
    io.emit('actualizacion_pedido', data);
  });

  socket.on('actualizar_ubicacion', (data) => {
    io.emit('ubicacion_cadete', data);
  });

  socket.on('disconnect', () => {
    console.log(`Usuario desconectado: ${socket.id}`);
  });
});

// Diagnóstico
app.get('/api/status', (req, res) => {
  res.json({ 
    status: "API de Lo Tengo funcionando correctamente 🚀", 
    totalEmpresas: baseEmpresas.length,
    totalPedidos: pedidosGlobales.length,
    totalUsuarios: usuariosRegistrados.length 
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});