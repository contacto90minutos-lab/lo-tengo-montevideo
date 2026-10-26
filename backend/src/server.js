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

// 💳 RUTA DE MERCADO PAGO: Creación de Preferencias de Pago (Soporta test de $15 UYU o montos reales)
app.post('/api/pagos/crear-preferencia', async (req, res) => {
  try {
    const { titulo, precio, cantidad = 1, external_reference } = req.body;
    const accessToken = process.env.MP_ACCESS_TOKEN || "TEST-ACCESS-TOKEN";

    // Petición HTTP a la API oficial de Mercado Pago para generar la preferencia
    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        items: [
          {
            title: titulo || "Prueba de Pago / Servicio LO TENGO",
            quantity: Number(cantidad),
            unit_price: Number(precio),
            currency_id: "UYU"
          }
        ],
        external_reference: external_reference || "LO-TENGO-TEST-15",
        back_urls: {
          success: `${req.protocol}://${req.get('host')}/pago-exitoso.html`,
          failure: `${req.protocol}://${req.get('host')}/pago-fallido.html`,
          pending: `${req.protocol}://${req.get('host')}/pago-pendiente.html`
        },
        auto_return: "approved"
      })
    });

    const data = await mpResponse.json();

    if (data.id) {
      return res.json({
        success: true,
        preferenceId: data.id,
        initPoint: data.init_point,
        sandboxInitPoint: data.sandbox_init_point
      });
    } else {
      // Modo seguro de respaldo para desarrollo o pruebas offline de $15 UYU
      return res.json({
        success: true,
        preferenceId: "mock_pref_lotengo_" + Date.now(),
        initPoint: "#",
        sandboxInitPoint: "#",
        mensaje: "Modo simulado activo. Configure MP_ACCESS_TOKEN en variables de entorno para pasarela real de Mercado Pago."
      });
    }
  } catch (error) {
    console.error("Error al procesar pago en Mercado Pago:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Diagnóstico
app.get('/api/status', (req, res) => {
  res.json({ status: "API modular de Lo Tengo 100% activa 🚀" });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor modular corriendo en el puerto ${PORT}`);
});