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

// Base de datos en memoria para sincronizar pedidos entre celular y PC en tiempo real
let pedidosGlobales = [];

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
// ENDPOINTS REST API (FALTABAN ESTOS)
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

  // Notificar en tiempo real a todas las pantallas conectadas (Empresa, Cadete, etc.)
  io.emit('nuevo_pedido_servidor', nuevoPedido);

  res.status(201).json({ success: true, message: "Pedido registrado en el servidor", pedido: nuevoPedido });
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
  res.json({ status: "API de Lo Tengo funcionando correctamente 🚀", totalPedidos: pedidosGlobales.length });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});