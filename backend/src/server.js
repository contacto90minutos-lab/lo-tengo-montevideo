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

// Ubicación exacta de la carpeta raíz (lo-tengo-final) desde backend/src/
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
  res.json({ status: "API de Lo Tengo funcionando correctamente 🚀" });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});