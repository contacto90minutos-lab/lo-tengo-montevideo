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
app.use(express.json());

// Bases de datos en memoria para sincronización en tiempo real
let pedidosGlobales = [];
let usuariosRegistrados = []; // Clientes, Cadetes y Empresas
let catalogosEmpresas = {};   // Almacena los productos por ID de empresa

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
// ENDPOINTS REST API - USUARIOS Y REGISTROS
// ==========================================

// Registrar o iniciar sesión un usuario
app.post('/api/usuarios/registro', (req, res) => {
  const { rol, nombre, identificador, giroComercial } = req.body; 
  // rol: 'cliente', 'empresa', 'cadete'
  // giroComercial: 'gastronomia', 'electronica', 'indumentaria', etc.

  let usuarioExistente = usuariosRegistrados.find(u => u.identificador === identificador);
  if (usuarioExistente) {
    return res.json({ success: true, message: "Sesión iniciada con éxito", usuario: usuarioExistente });
  }

  const nuevoUsuario = {
    id: Date.now().toString(),
    rol,
    nombre,
    identificador, // Puede ser Cédula, WhatsApp o RUT
    giroComercial: giroComercial || 'gastronomia',
    etiquetaPanel: (giroComercial && giroComercial !== 'gastronomia') ? 'Preparación / Expedición' : 'Cocina'
  };

  usuariosRegistrados.push(nuevoUsuario);
  console.log(`👤 Nuevo usuario registrado [${rol}]: ${nombre}`);
  res.status(201).json({ success: true, message: "Usuario registrado correctamente", usuario: nuevoUsuario });
});

// ==========================================
// ENDPOINTS REST API - CATÁLOGOS DE EMPRESAS
// ==========================================

// Guardar o actualizar productos del catálogo de una empresa
app.post('/api/empresas/:id/catalogo', (req, res) => {
  const { id } = req.params;
  const { productos } = req.body; // Array de productos

  catalogosEmpresas[id] = productos;
  console.log(`📦 Catálogo actualizado para empresa ID: ${id} (${productos.length} productos)`);
  
  res.json({ success: true, message: "Catálogo guardado correctamente", productos });
});

// Obtener el catálogo de una empresa específica
app.get('/api/empresas/:id/catalogo', (req, res) => {
  const { id } = req.params;
  res.json(catalogosEmpresas[id] || []);
});

// ==========================================
// ENDPOINTS REST API - PEDIDOS Y KILL SWITCH
// ==========================================

// Obtener todos los pedidos
app.get('/api/pedidos', (req, res) => {
  res.json(pedidosGlobales);
});

// Recibir un nuevo pedido desde el Cliente y difundirlo
app.post('/api/pedidos', (req, res) => {
  const nuevoPedido = req.body;
  pedidosGlobales.push(nuevoPedido);
  
  console.log(`📦 Nuevo pedido recibido en servidor ID: ${nuevoPedido.id}`);
  io.emit('nuevo_pedido_servidor', nuevoPedido);

  res.status(201).json({ success: true, message: "Pedido registrado en el servidor", pedido: nuevoPedido });
});

// KILL SWITCH: Cancelar / Eliminar un pedido desde el Admin o Sistema
app.delete('/api/pedidos/:id', (req, res) => {
  const { id } = req.params;
  const index = pedidosGlobales.findIndex(p => p.id == id);

  if (index !== -1) {
    const pedidoEliminado = pedidosGlobales.splice(index, 1)[0];
    console.log(`🚨 KILL SWITCH ACTIVADO: Pedido ID ${id} eliminado por administración.`);
    
    // Notificar a todas las pantallas para que lo borren al instante
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
    totalPedidos: pedidosGlobales.length,
    totalUsuarios: usuariosRegistrados.length 
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});