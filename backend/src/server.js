// backend/src/server.js
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

// Archivos estáticos de los portales
const rootDir = path.resolve(__dirname, '../../');
app.use(express.static(path.join(rootDir, 'cliente/public')));
app.use('/empresa', express.static(path.join(rootDir, 'empresa')));
app.use('/cadete', express.static(path.join(rootDir, 'cadete')));
app.use('/admin', express.static(path.join(rootDir, 'admin')));

app.get('/empresa', (req, res) => res.sendFile(path.join(rootDir, 'empresa/index.html')));
app.get('/cadete', (req, res) => res.sendFile(path.join(rootDir, 'cadete/index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(rootDir, 'admin/index.html')));

// WebSockets
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
app.set('io', io);

const { configurarSockets } = require('./sockets/socketHandler');
configurarSockets(io);

// Rutas modularizadas
app.use('/api/pedidos', require('./routes/pedidos'));

// Diagnóstico
app.get('/api/status', (req, res) => {
  res.json({ status: "API modular de Lo Tengo 100% activa 🚀" });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor modular corriendo en el puerto ${PORT}`);
});